# ZeroDayCopsScheduler — Production Hosting & Infrastructure Recommendation

**Date:** July 28, 2026  
**Audit Scope:** Media Storage Architecture, Process Lifecycle, Database Sizing, OAuth Environment Configuration.

---

## 1. Storage Architecture Audit (CRITICAL BLOCKER)

> [!CAUTION]
> **PRODUCTION BLOCKER:** The application currently relies on local disk storage (`uploads/{workspaceId}/...`) and a local `chokidar` directory watcher. Local disk storage will be wiped on every redeploy/restart on standard cloud hosts (Render, Railway, Fly.io, Heroku), causing immediate media loss.

### Detailed Findings:
1. **Local Disk Dependency:** Media files are written to `/uploads/{workspaceId}/` via Multer or local folder copying. `Media.filepath` stores a local file path.
2. **Chokidar Watcher Limitation:** The `chokidar` file watcher (`src/services/watcher.js`) monitors a local folder on the server machine. Remote users or clients cannot drop files into a folder on a remote server they do not own.
3. **Multer Manual Upload Alternative:** The manual upload route (`POST /api/workspaces/:id/media`) is a 100% complete, functional endpoint that does not rely on file watching.
4. **Required Action:** Media storage **must be migrated to an S3-compatible Object Storage service** (e.g. Cloudflare R2 or AWS S3) before going live.

### Codebase Scope (Files directly accessing `Media.filepath`):
- `src/routes/workspaces.js` (Multer file upload destination & initial `Media` record creation)
- `src/routes/media.js` (File streaming, `sharp` thumbnail generation, preview rendering, asset deletion)
- `src/services/watcher.js` (Local folder ingestion & `Media` record creation — disable in production)
- `src/services/openrouter.js` (FFmpeg video trimming & OpenRouter vision API upload)
- `src/services/publishers.js` (File reading for LinkedIn, Pinterest, and YouTube API publishing)

---

## 2. Process Architecture Audit

1. **Persistent Process Requirement:** The background scheduler (`src/services/scheduler.js`) uses `node-cron` running every 30 seconds (`*/30 * * * * *`). This **requires a persistent, always-running Node.js process**, NOT a serverless architecture (Vercel / AWS Lambda) which spins down between requests.
2. **Memory & CPU Spikes:**
   - **FFmpeg Video Trimming:** Video trimming (`fluent-ffmpeg`) during OpenRouter analysis spikes CPU and RAM.
   - **Sharp Thumbnail Generation:** On-the-fly thumbnail generation for high-resolution images.
   - **Resumable Video Uploads:** Uploading large MP4 assets to YouTube requires sustained memory and bandwidth buffers.
3. **Recommended Memory Base:** Minimum 512MB RAM (1GB recommended for smooth video handling).

---

## 3. Database Sizing Audit

1. **Direct Binary/Blob Data:** **0 bytea/blob columns**. All images and videos are referenced via URI/string paths in PostgreSQL.
2. **Current Row Counts:**
   - `User`: 2
   - `Workspace`: 2
   - `SocialAccount`: 6
   - `Media`: 3
   - `ScheduledPost`: 1
   - `PostLog`: 2
   - `Notification`: 1
3. **Monthly Growth Estimate:**
   - Medium usage (10 workspaces, 300 posts/month) = ~300 `Media` rows, ~600 `ScheduledPost` rows, ~1,500 `PostLog` rows/month.
   - Database storage footprint growth is **< 10 MB per month**. Small free-tier PostgreSQL limits (e.g. 500 MB) will easily last for years.

---

## 4. Environment & OAuth Audit

1. **Production Environment Variables:**
   - `DATABASE_URL` (PostgreSQL connection string with SSL)
   - `JWT_SECRET` (Cryptographically secure random string)
   - `TOKEN_ENCRYPTION_KEY` (64-char hex key for AES-256-GCM token encryption)
   - `GEMINI_API_KEY` / `OPENROUTER_API_KEY` (AI model credentials)
   - `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
   - `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`
   - `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`
   - `FRONTEND_URL` (e.g. `https://app.zerodaycops.com`)
   - `REDIRECT_URI_BASE` (e.g. `https://api.zerodaycops.com/api/oauth`)
   - `LINKEDIN_REDIRECT_URI` (e.g. `https://api.zerodaycops.com/api/oauth/linkedin/callback`)
   - `ALLOW_MOCK_OAUTH=false`

2. **Redirect URI Hardcoding Check:** **Passed**. All OAuth endpoints in `src/routes/oauth.js` construct redirect URIs dynamically using `process.env.REDIRECT_URI_BASE` and `process.env.LINKEDIN_REDIRECT_URI`. No hardcoded `localhost` URLs exist in OAuth flow handlers.

---

## 5. Production Infrastructure Recommendations

| Component | Recommended Service | Justification |
| :--- | :--- | :--- |
| **Database** | **Neon PostgreSQL** | Serverless Postgres with instant branching, connection pooling, and 0.5 GB free tier that easily supports years of text metadata. |
| **Backend & Scheduler** | **Render Web Service** | Persistent Node.js runtime supporting always-on `node-cron` scheduler, FFmpeg binary support, and background workers. |
| **Media Storage** | **Cloudflare R2** | S3-compatible object storage with **$0 egress fees**, persistent asset storage across redeploys, and high-speed global CDN delivery. |
| **Frontend SPA** | **Vercel** or **Render Static Site** | Ultra-fast global CDN hosting for Vite React SPA with automatic SSL and zero server maintenance. |

---

## 6. Concrete Migration Checklist Before Going Live

### Phase A: Pre-Deploy Code Adjustments
1. [ ] **S3 / R2 Storage Adapter Integration:**
   - Install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.
   - Update `src/routes/workspaces.js` to upload directly to S3/R2 bucket instead of local disk.
   - Update `src/routes/media.js` to serve presigned URLs or stream directly from S3/R2.
   - Update `src/services/publishers.js` and `src/services/openrouter.js` to read file streams from S3/R2.
2. [ ] **Conditional Watcher Initialization:**
   - Wrap `initWatcher()` in `src/index.js` so it only runs when `NODE_ENV === 'development'`.

### Phase B: Infrastructure Signup & Setup
1. [ ] Create PostgreSQL database instance on **Neon**.
2. [ ] Create an S3-compatible bucket on **Cloudflare R2** (e.g. `zerodaycops-media-prod`).
3. [ ] Configure production OAuth applications in developer portals:
   - **LinkedIn Developer Portal:** Add `https://api.zerodaycops.com/api/oauth/linkedin/callback`
   - **Pinterest Developer Portal:** Add `https://api.zerodaycops.com/api/oauth/pinterest/callback`
   - **Google Cloud Console (YouTube):** Add `https://api.zerodaycops.com/api/oauth/youtube/callback`

### Phase C: Deployment & Environment Configuration
1. [ ] Deploy backend Node.js app to **Render Web Service** with build command `npm install` and start command `node -r dotenv/config src/index.js`.
2. [ ] Set all production environment variables on Render dashboard (`DATABASE_URL`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, S3 credentials, OAuth IDs/Secrets).
3. [ ] Run database migration on production Postgres: `npx prisma db push`.
4. [ ] Deploy Vite frontend SPA to **Vercel** / **Render**, setting `VITE_API_BASE=https://api.zerodaycops.com/api`.

### Phase D: Immediate Post-Deploy Verification
1. [ ] Log in with `bothubey@gmail.com` on production frontend.
2. [ ] Upload an image and a video asset via the frontend UI. Confirm files land in Cloudflare R2 bucket.
3. [ ] Connect a real social account (LinkedIn/Pinterest/YouTube) via OAuth callback.
4. [ ] Schedule a campaign post and confirm execution via the background cron worker log.
