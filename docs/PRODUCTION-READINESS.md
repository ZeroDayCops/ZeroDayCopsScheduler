# Production Hosting Readiness Document

This document provides a grounded, concrete technical assessment for deploying **SchedulerAgent** to a hosted production environment. Answers are derived directly from the current codebase architecture (Node.js/Express backend, Prisma ORM, PostgreSQL database, React/Vite frontend, Chokidar file watcher, and platform publisher integrations for LinkedIn, Pinterest, and YouTube).

---

## 1. Database Architecture & Migration

### Current State
The backend codebase uses **PostgreSQL** via Prisma (`@prisma/client` v7.8.0 and `@prisma/adapter-pg` v8.22.0) with local connection string `postgresql://b1t3x0p@127.0.0.1:5555/scheduler_agent`.

### SQLite vs PostgreSQL Viability
SQLite is **unviable** for a hosted multi-user production deployment of SchedulerAgent for two technical reasons:
1. **Write Concurrency & Table Locking**: SQLite uses database-level write locking. In SchedulerAgent, the background cron worker (`scheduler.js`) queries and claims pending posts every 30 seconds while simultaneously writing `PostLog` rows and `Notification` entries. Concurrently, user API requests (media upload, prompt template generation, manual post scheduling, OAuth account link updates) execute write transactions. Under multi-tenant loads, SQLite produces `SQLITE_BUSY: database is locked` errors.
2. **Native Data Types**: The Prisma schema leverages PostgreSQL-native array types (`defaultHashtags String[]`, `hashtags String[]`) and PostgreSQL Enum types (`OrgRole`, `Platform`, `PostStatus`, `AutomationMode`, `ScheduleSource`). Porting to SQLite would require JSON string serialization/deserialization logic across every query layer in `routes/posts.js`, `routes/workspaces.js`, and `services/automation.js`.

### Schema & Production Migration Requirements
Moving from local PostgreSQL to a hosted database (e.g. AWS RDS PostgreSQL, Supabase, Neon, or GCP Cloud SQL) requires **zero schema refactoring** because `schema.prisma` is already fully parameterized for PostgreSQL.

**Production Deployment Steps**:
1. Provision PostgreSQL 15+ instance with SSL enabled (`sslmode=require`).
2. Set `DATABASE_URL` environment variable:
   ```env
   DATABASE_URL="postgresql://user:password@pg-host.region.rds.amazonaws.com:5432/scheduler_agent?sslmode=require"
   ```
3. Execute production Prisma migration in CI/CD pipeline:
   ```bash
   npx prisma migrate deploy
   ```

---

## 2. Object Storage vs. Local Filesystem

### In-Flight Media on Server Restart / Redeploy
Currently, media files uploaded manually or detected via `watcher.js` are written to local disk under `uploads/:workspaceId/filename`.
In a hosted cloud environment (e.g. AWS ECS, Heroku, Render, Kubernetes):
- Containers operate on ephemeral filesystems. Redeploys or auto-scaling restarts wipe the local `/uploads` directory.
- Scheduled posts referencing local disk paths (`media.filepath`) will throw `ENOENT: no such file or directory` when the cron worker triggers execution on scheduled dates.

### Platform Publishing Constraints
- **Pinterest API v5**: Video pins use `POST /v5/media` which issues a presigned S3 upload URL. The backend reads the video binary (`fs.createReadStream(media.filepath)`) and posts a `multipart/form-data` payload. While static image pins use base64 data payloads (`preparePinterestMediaSource`), video processing requires raw binary access to the media file at execution time.
- **LinkedIn & YouTube**: Both platform APIs require streaming access to the binary file at execution time (`fs.readFileSync(media.filepath)` / `fs.createReadStream`).

### Hosted Storage Architecture
**Object Storage (AWS S3, Cloudflare R2, or GCP Cloud Storage) is mandatory.**

**Changes Required**:
1. Replace Multer local disk storage engine in `routes/workspaces.js` with `@aws-sdk/client-s3` presigned uploads or Multer-S3 middleware.
2. Store S3 Object Keys / Public URLs in `Media.filepath` / `Media.url`.
3. In `publishers.js`, stream directly from S3 (`s3Client.getObject()`) or stream via HTTP URL rather than calling local `fs.readFileSync`.

### Watch-Folder Adaptation in Cloud
The local directory watcher (`chokidar` in `services/watcher.js`) monitors a local folder path on the user's desktop machine. In a hosted SaaS scenario, desktop local watch folders cannot be watched directly by the server.

**Hosted Alternatives**:
- **S3 Bucket Watcher**: Users drop files into a designated S3 bucket path (`s3://my-agency-bucket/workspace-id/inbox/`). An S3 Event Notification triggers an AWS Lambda / Cloud Function that POSTs the object metadata to `/api/workspaces/:id/media` to start ingestion.
- **Dropbox / Google Drive Webhooks**: Integrate Dropbox/Google Drive API webhooks to monitor cloud folders.

---

## 3. Architecture Shift: Local App vs. Hosted Multi-Tenant SaaS

> [!IMPORTANT]
> **Product Decision Required**: Is the production target a **Hosted Multi-Tenant SaaS** (shared cloud infrastructure hosting all agencies and clients) or **Distributed Single-Tenant Installs** (each client runs their own hosted backend)?

### Option A: Hosted Multi-Tenant SaaS (Recommended)
- **Frontend**: React + Vite frontend built and hosted on a CDN (Vercel, Cloudflare Pages, AWS CloudFront).
- **Backend**: Node.js/Express API deployed to a container container host (AWS ECS Fargate, GCP Cloud Run, or Render).
- **Database**: Single managed PostgreSQL instance with row-level tenant isolation enforced by `organizationId` and `workspaceId` checks (`requireOrgRole`, `requireWorkspaceAccess` middlewares already in place).
- **Cron Worker**: Separate dedicated worker container executing `startScheduler()` to avoid competing with HTTP web request threads.

### Option B: Single-Tenant Hosted Instance
- Each client deploys their own Docker container stack (`docker-compose` with Node.js + Postgres).
- Simplifies data isolation but requires managing deployment updates across N separate instances.

---

## 4. Secrets & Configuration Management

### Secrets Management
In production, sensitive environment variables must be injected via a Secrets Manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault, or platform environment secrets) rather than committed `.env` files.

Key secrets to protect:
- `TOKEN_ENCRYPTION_KEY`: 256-bit AES-256-GCM master key used to encrypt social account access and refresh tokens.
- `JWT_SECRET`: Secret key used for signing user session cookies.
- Platform OAuth Client Secrets: `LINKEDIN_CLIENT_SECRET`, `PINTEREST_CLIENT_SECRET`, `YOUTUBE_CLIENT_SECRET`.

### Encryption Key Rotation Strategy
Token encryption in `utils/crypto.js` uses `aes-256-gcm` returning format `iv_hex:authTag_hex:ciphertext_hex`.

If `TOKEN_ENCRYPTION_KEY` needs to be rotated:
1. Support dual-key decryption in `utils/crypto.js` (`TOKEN_ENCRYPTION_KEY_CURRENT` and `TOKEN_ENCRYPTION_KEY_PREVIOUS`).
2. Run an automated CLI re-encryption script:
   - Read all `SocialAccount` records with `accessTokenEncrypted` or `refreshTokenEncrypted`.
   - Decrypt using `TOKEN_ENCRYPTION_KEY_PREVIOUS`.
   - Re-encrypt using `TOKEN_ENCRYPTION_KEY_CURRENT`.
   - Update database records in a single transaction.

---

## 5. OAuth Redirect URIs Configuration

Every social platform's Developer Console must be updated with production HTTPS redirect URIs:

| Platform | Developer Console | Dev Redirect URI | Production Redirect URI |
| :--- | :--- | :--- | :--- |
| **LinkedIn** | LinkedIn Developer Portal → Auth → Redirect URLs | `http://localhost:3001/api/oauth/linkedin/callback` | `https://app.zerodaycops.com/api/oauth/linkedin/callback` |
| **Pinterest** | Pinterest Developer Portal → Apps → Redirect URIs | `http://localhost:3001/api/oauth/pinterest/callback` | `https://app.zerodaycops.com/api/oauth/pinterest/callback` |
| **YouTube (Google)** | Google Cloud Console → Credentials → Authorized Redirect URIs | `http://localhost:3001/api/oauth/youtube/callback` | `https://app.zerodaycops.com/api/oauth/youtube/callback` |

In production `.env`:
```env
FRONTEND_URL=https://app.zerodaycops.com
REDIRECT_URI_BASE=https://app.zerodaycops.com/api/oauth
LINKEDIN_REDIRECT_URI=https://app.zerodaycops.com/api/oauth/linkedin/callback
```

---

## 6. Multi-Instance Concurrency & Cron Worker Safety

### Current Claim Implementation
In `services/scheduler.js`, the cron worker runs every 30 seconds and claims due posts using two sequential queries:
```js
// 1. Fetch due posts
const duePosts = await prisma.scheduledPost.findMany({
  where: { status: 'PENDING', scheduledFor: { lte: now } },
  take: 10,
});

// 2. Mark PROCESSING
await prisma.scheduledPost.updateMany({
  where: { id: { in: duePosts.map((p) => p.id) }, status: 'PENDING' },
  data: { status: 'PROCESSING' },
});
```

### Multi-Instance Risk Analysis
If multiple backend instances (or horizontal container replicas) run concurrently, there is a **race condition** between step 1 (`findMany`) and step 2 (`updateMany`). Two worker instances could read the same `PENDING` posts simultaneously, resulting in double-publishing the same content to LinkedIn, Pinterest, or YouTube.

### Recommended Fix for Multi-Instance Production
To ensure 100% safety across concurrent instances, replace the two-step claim query with an **atomic PostgreSQL statement using `FOR UPDATE SKIP LOCKED`**:

```sql
UPDATE "ScheduledPost"
SET status = 'PROCESSING'
WHERE id IN (
  SELECT id
  FROM "ScheduledPost"
  WHERE status = 'PENDING' AND "scheduledFor" <= NOW()
  ORDER BY "scheduledFor" ASC
  LIMIT 10
  FOR UPDATE SKIP LOCKED
)
RETURNING *;
```
Or use a distributed lock library such as `redlock` (Redis) around `processDuePosts()`.

---

## 7. Production Operations & Security Checklist

- [ ] **TLS / HTTPS Termination**: Enforce HTTPS via Cloudflare or AWS ALB / NGINX reverse proxy. Set `secure: true` on JWT cookies in production (`NODE_ENV=production`).
- [ ] **API Gateway Rate Limiting**: Implement rate limiting (`express-rate-limit`) on sensitive endpoints (`POST /api/auth/login`, `POST /api/workspaces/:id/media`, `GET /api/oauth/*`) to prevent brute-force attacks and API abuse.
- [ ] **Database & Storage Backups**: Configure automated daily backups with 30-day Point-In-Time Recovery (PITR) for PostgreSQL and S3 Versioning / Cross-Region Replication for media assets.
- [ ] **Monitoring & Health Checks**:
  - `/api/health` endpoint already returns status and uptime. Wire `/api/health` into container health checks.
  - Integrate Sentry for backend exception tracking and frontend crash reporting.
- [ ] **GDPR & Data Retention**:
  - Implement workspace deletion cascade (already defined in `schema.prisma` with `onDelete: Cascade` on relations).
  - Add an automated data retention policy for `PostLog` and `Notification` rows (e.g. prune logs older than 90 days).
