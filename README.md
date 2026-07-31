# 🚀 ZeroDayCops SchedulerAgent

> **Next-Generation Multi-Tenant Social Media Scheduling & Ingestion Platform**  
> **Production URL:** [https://scheduler.zerodaycops.in](https://scheduler.zerodaycops.in) (Staging: `zero-day-cops-scheduler.vercel.app`)

ZeroDayCops SchedulerAgent is a high-performance, automated social media management engine designed for agencies and creators. It combines AI-driven media analysis with Cloudflare R2 object storage and automated multi-platform distribution across LinkedIn, Pinterest, and YouTube.

---

## ✨ Key Features

- 🏢 **Multi-Tenant Agency Architecture:** Strict RBAC access control (Owner, Admin, Member) with isolated client brand workspaces.
- ⚡ **Cloudflare R2 Edge Storage:** Zero-egress cost object storage integration for fast image and video asset delivery using S3-compatible APIs.
- 🧠 **AI-Powered Media Analysis:** Automated visual processing via Gemini / OpenRouter to generate targeted captions, hashtags, and timing recommendations.
- 📅 **Automated Scheduling Engine:** Smart timezone-aware slot scheduler supporting `MANUAL`, `AUTO_SCHEDULE`, and `AUTO_PUBLISH` modes.
- 🔗 **Multi-Platform Publishing:** Direct API integrations for LinkedIn (Posts & Articles), Pinterest (Pins & Boards), and YouTube (Shorts & Videos).
- 🛡️ **Fail-Safe Resilience:** PostgreSQL concurrency locking, exponential backoff retries, and comprehensive audit logs.

---

## 🏗️ System Architecture: Decoupled Two-Process Design

ZeroDayCops SchedulerAgent uses a decoupled two-process architecture for maximum scalability and reliability:

1. **Web API Server (Vercel Serverless Express):** Pure stateless API handling auth, CRUD, OAuth connect flows, and R2 presigned upload URLs. Zero background tasks or cron timers run here.
2. **Worker Process (Always-On Engine):** Dedicated 24/7 Node process executing watch-folder ingestion, FFmpeg video frame extraction, Gemini 2.5 Flash vision analysis, and scheduled post publishing.

*Both processes share one PostgreSQL database (Supabase) and must share `TOKEN_ENCRYPTION_KEY`.* See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full details.

---

## 🛠️ Technology Stack

- **Backend:** Node.js, Express 5, Prisma ORM, PostgreSQL
- **Storage:** Cloudflare R2 Object Storage (`@aws-sdk/client-s3`)
- **Frontend:** React, TypeScript, Vite, Tailwind CSS
- **AI & Vision:** Gemini 2.5 Flash / OpenRouter Vision APIs
- **Job Scheduling:** Node-Cron & PostgreSQL queue runner

---

## ⚙️ Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/ZeroDayCops/ZeroDayCopsScheduler.git
cd ZeroDayCopsScheduler/SchedulerAgent/backend

# 2. Install dependencies
npm install

# 3. Configure environment variables (.env)
# Set DATABASE_URL, GEMINI_API_KEY, and CLOUDFLARE_R2 credentials

# 4. Push database schema
npx prisma db push

# 5. Start the development server
npm run dev
```
