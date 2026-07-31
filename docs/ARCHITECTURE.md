# System Architecture: Decoupled Two-Process Design

ZeroDayCops SchedulerAgent is built using a clean, decoupled two-process architecture to ensure stateless web API scaling on serverless platforms while maintaining reliable 24/7 background media processing and post distribution.

```
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│       Process 1: Web API Server      │     │      Process 2: Worker Process       │
│      (Vercel Serverless Express)     │     │        (Always-On Process)          │
├──────────────────────────────────────┤     ├──────────────────────────────────────┤
│ • Authentication & User Management   │     │ • Watch-folder File Ingestion        │
│ • Workspace & Social Account CRUD    │     │ • Asset Discovery Poller (NEW Rows) │
│ • OAuth Connect & Callback Flows     │     │ • Gemini Vision AI Analysis Engine    │
│ • R2 Presigned Upload URL Generation │     │ • FFmpeg Video Processing & Trimming │
│ • Queue & Media Read Operations      │     │ • Timezone-Aware Scheduled Publisher │
└──────────────────┬───────────────────┘     └──────────────────┬───────────────────┘
                   │                                            │
                   │           Shared Infrastructure            │
                   └───────────────────┬────────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                │             PostgreSQL Database             │
                │        (Supabase Transaction Pooler)        │
                │                     &                       │
                │            Cloudflare R2 Bucket             │
                └─────────────────────────────────────────────┘
```

---

## 1. Web API Server (Process 1 — Vercel Serverless)

- **Role:** Pure stateless HTTP API layer.
- **Responsibilities:**
  - User authentication, JWT sessions, and workspace RBAC.
  - Workspace management, social account OAuth connection callbacks.
  - Generating Cloudflare R2 presigned upload URLs (`/media/upload-url`).
  - Creating `Media` rows with `status = 'NEW'` upon upload completion.
  - Serving data queries for the React frontend dashboard.
- **Key Constraint:** Express contains **zero** background timers, cron jobs, watcher loops, or inline AI analysis handlers. It receives requests, performs database CRUD, and returns immediately.

---

## 2. Worker Process (Process 2 — Always-On Node Daemon)

- **Role:** Autonomous 24/7 background processing engine.
- **Responsibilities:**
  - **Asset Ingestion:** Watches configured local `uploads/` directories using Chokidar.
  - **Media Poller & AI Vision:** Scans for `NEW` Media records in PostgreSQL, downloads R2 binaries if required, executes FFmpeg frame extraction, and generates AI captions using Gemini Vision.
  - **Scheduled Post Distribution:** Runs a background cron loop claiming due `PENDING` posts atomically from PostgreSQL and publishing them directly to social platforms (LinkedIn, Pinterest, YouTube).
- **Environment Requirements:**
  - Must run in an environment with FFmpeg installed on PATH (`ffmpeg`).
  - Must share the exact same `DATABASE_URL` (Supabase Postgres) and `TOKEN_ENCRYPTION_KEY` as the Web API Server.

---

## 3. Shared Environment & Data Layer

Both processes communicate exclusively through:
1. **Shared Database:** PostgreSQL (Prisma ORM via Supabase PgBouncer pooler).
2. **Shared Encryption Key:** `TOKEN_ENCRYPTION_KEY` must match across both processes to allow the Web API to encrypt OAuth tokens and the Worker Process to decrypt them during publication.
3. **Shared Object Storage:** Cloudflare R2 bucket (`zerodaycops-scheduler`).
