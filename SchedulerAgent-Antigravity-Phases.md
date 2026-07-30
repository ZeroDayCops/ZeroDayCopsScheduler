# SchedulerAgent — Phased Antigravity Build Prompts

How to use this doc: paste one phase's prompt into a fresh Antigravity conversation, let the agent finish and produce its Implementation Plan / Artifacts, review them, then move to the next phase. Don't paste two phases at once — Antigravity works best with one well-scoped task per run.

**Before Phase 0:** create your project folder, then add these two files (provided separately) at:
- `.agents/skills/content-pipeline/SKILL.md`
- `.agents/skills/platform-publishing/SKILL.md`

Antigravity auto-discovers skills placed there, so Phases 3, 4, 6, and 7 below will pick them up automatically when they're relevant. In Antigravity's setup, use **Agent-Assisted Development** mode so it can run terminal commands but checks in with you on bigger changes.

Scope note baked into this plan: all three platforms (LinkedIn, Pinterest, YouTube) get real publishing, and the app is multi-tenant agency-style — Organizations contain Users (with roles) and Workspaces (one per client), and OAuth connections, media, and scheduled posts all live under a Workspace.

---

## Phase 0 — Project Scaffold & Environment

```
Create a new full-stack project called SchedulerAgent: a multi-tenant social media content scheduling tool for an agency managing multiple clients.

Structure:
- backend/ — Node.js + Express + Prisma + PostgreSQL
- frontend/ — React + Vite + TypeScript + Tailwind CSS
- uploads/ — watch-folder root, one subfolder per workspace (created dynamically, don't hardcode client names)
- templates/ — platform template definitions
- logs/
- docs/

Initialize backend with npm and install: express, prisma, @prisma/client, pg, dotenv, multer, chokidar, axios, node-cron, cors, sharp, bcrypt, jsonwebtoken, googleapis, and Node's built-in crypto for token encryption.

Initialize frontend with Vite + React + TypeScript + Tailwind.

Create a root README.md describing the project, and a .env.example listing: DATABASE_URL, JWT_SECRET, TOKEN_ENCRYPTION_KEY, GEMINI_API_KEY, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET, YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET.

This phase is scaffolding only — no business logic. Verify the backend boots with a GET /api/health route returning 200, and the frontend dev server boots with a placeholder home page.
```

**Check before continuing:** both servers start cleanly, `.env.example` has every variable you'll need later.

---

## Phase 1 — Database & Multi-Tenant Auth

```
Using the backend scaffolded in Phase 0, design and migrate a Prisma schema for SchedulerAgent's auth and tenancy layer:

- Organization (the agency): id, name, createdAt
- User: id, email (unique), passwordHash, name, createdAt
- Membership: links User to Organization with a role enum (OWNER, ADMIN, MEMBER)
- Workspace (a client): id, organizationId, brandName, website, cta, defaultHashtags (string array), brandVoice, emojiStyle, createdAt
- WorkspaceAccess: userId, workspaceId, grants a Membership-holding user explicit access to a specific client workspace (so not every org member automatically sees every client)

Build auth endpoints: POST /api/auth/register (creates an Organization + first User as OWNER), POST /api/auth/login (bcrypt compare, issues a JWT in an httpOnly cookie), GET /api/auth/me.

Build middleware: requireAuth, requireOrgRole(role), requireWorkspaceAccess. Apply requireWorkspaceAccess to any future workspace-scoped route.

Verify: register an org + owner, log in, hit a protected route successfully. Create a second user with MEMBER role and no WorkspaceAccess grant, confirm they get 403 on a workspace-scoped route, then grant access and confirm it now succeeds.
```

**Check before continuing:** the 403/granted-access test actually passes — this is the foundation for every other phase's access control.

---

## Phase 2 — Workspaces & Brand Settings

```
Build CRUD endpoints for Workspaces within an Organization (brand name, website, CTA, default hashtags, brand voice, emoji style), respecting the auth/role middleware from Phase 1.

Add a SocialAccount model to the schema (no OAuth logic yet, just structure): id, workspaceId, platform enum (LINKEDIN, PINTEREST, YOUTUBE), accountName (nullable), status enum (NOT_CONNECTED, CONNECTED, EXPIRED), accessTokenEncrypted (nullable), refreshTokenEncrypted (nullable), expiresAt (nullable), externalAccountId (nullable). Auto-create three NOT_CONNECTED SocialAccount rows (one per platform) whenever a new Workspace is created.

Build endpoints to invite/add team members to an Organization with a role, and to grant/revoke WorkspaceAccess for them.

Verify via API calls: create a workspace, confirm three NOT_CONNECTED SocialAccount rows exist for it, add a second team member and grant them access to just that one workspace.
```

**Check before continuing:** workspace creation auto-creates the three platform placeholder rows correctly.

---

## Phase 3 — Media Ingestion + Gemini Content Pipeline

```
Load and follow the content-pipeline skill for this phase.

Build a Media model: id, workspaceId, filename, filepath, mediaType enum (IMAGE, VIDEO — detected from file extension), status enum (NEW, ANALYZING, ANALYZED, FAILED), aiMasterJson (jsonb, nullable), createdAt.

Build a chokidar watcher on uploads/{workspaceSlug}/ that creates a Media row (status NEW) whenever a new image or video file appears. Also build a manual upload endpoint (multer) as an alternative entry point that does the same thing.

Build an async job (triggered after Media creation) that calls the Gemini API per the content-pipeline skill's exact rules — image analysis via inline vision, video analysis via Gemini's native video understanding — passing the workspace's brand voice and emoji style as context, and stores the result in aiMasterJson, transitioning status to ANALYZED or FAILED.

Build GET /api/workspaces/:id/media with optional status filter.

Verify by dropping a real test image into a workspace's upload folder and confirming: a Media row appears with status NEW within seconds, then transitions to ANALYZED with a populated, schema-correct aiMasterJson shortly after.
```

**Check before continuing:** the master JSON actually matches the skill's schema exactly (no extra/missing fields), and a deliberately bad/corrupt file fails gracefully into FAILED rather than crashing the watcher.

---

## Phase 4 — Template Engine

```
Load and follow the content-pipeline skill for this phase.

Build a Template model: id, workspaceId (nullable — null means global default), platform enum, name, templateBody (string with {{headline}}, {{description}}, {{hashtags}}, {{cta}} placeholders), isDefault boolean. Seed one global default template per platform (LinkedIn, Pinterest, YouTube).

Build a pure rendering function (no AI calls) that takes a Media row's aiMasterJson + the workspace's brand settings + the applicable Template (workspace-specific if it exists, else the global default), substitutes placeholders, appends the workspace's default hashtags after the AI-generated ones (deduplicated), and runs the platform-constraint validation described in the content-pipeline skill.

Build GET /api/media/:id/preview?platform=X that returns the rendered content and any validation warnings, without persisting anything yet.

Verify: render one ANALYZED media item across LinkedIn, Pinterest, and YouTube templates, and confirm requesting YouTube for an IMAGE-type media item returns a clear error rather than a rendered draft. Also test with a deliberately long description to confirm the Pinterest 500-char validation flags it.
```

**Check before continuing:** YouTube + image-only correctly refuses, and validation warnings are human-readable, not just error codes.

---

## Phase 5 — Calendar & Scheduling Core

```
Build a ScheduledPost model: id, workspaceId, mediaId, socialAccountId, platform, renderedContent (jsonb snapshot from the Phase 4 renderer), scheduledFor (datetime), status enum (PENDING, PROCESSING, PUBLISHED, FAILED), publishedAt (nullable), externalPostId (nullable), retryCount (default 0).

Build endpoints: create/update/delete a scheduled post (taking a mediaId + platform + scheduledFor, rendering via Phase 4's function and storing the snapshot), and GET /api/workspaces/:id/calendar?from=&to= returning posts grouped by date for a calendar view.

Build a node-cron job running every minute that atomically claims due PENDING posts (UPDATE ... SET status='PROCESSING' WHERE status='PENDING' AND scheduledFor<=now() RETURNING *, per the platform-publishing skill's claim pattern), and for now just logs "would publish to {platform}" and sets status to PUBLISHED with a fake externalPostId — real platform calls come in Phase 7.

Verify: schedule a post 2 minutes out, confirm the cron job claims and "publishes" it on schedule, and confirm manually triggering the job twice in quick succession never double-claims the same post.
```

**Check before continuing:** the double-claim test actually passes — this matters once real API calls are wired in.

---

## Phase 6 — OAuth Connections (LinkedIn, Pinterest, YouTube)

```
Load and follow the platform-publishing skill for this phase.

Build OAuth2 connect flows for LinkedIn, Pinterest, and YouTube (Google), each workspace-scoped: GET /api/oauth/:platform/connect?workspaceId= redirects to the provider, GET /api/oauth/:platform/callback verifies the authenticated user has access to that workspaceId, exchanges the code for tokens, encrypts them (AES-256-GCM using TOKEN_ENCRYPTION_KEY), and updates the matching SocialAccount row to CONNECTED with accountName and externalAccountId populated.

Implement proactive token refresh per the skill: before any future use of a token, check expiresAt against a 5-minute buffer and refresh if needed, flipping status to EXPIRED if the refresh token itself is invalid.

Add the frontend hook points later (Phase 8) — for now just confirm via API/Postman-style testing that the full connect → callback → encrypted-token-stored flow works for each platform using sandbox/test app credentials, and that you can manually expire a token in the database and watch a refresh attempt occur (or correctly flip to EXPIRED if invalid).
```

**Check before continuing:** you have one real, working connected SocialAccount per platform before moving to Phase 7.

---

## Phase 7 — Real Publishing Engine

```
Load and follow the platform-publishing skill for this phase.

Replace the Phase 5 simulated publish step in the cron worker with real per-platform publish handlers, each implementing publish(scheduledPost, socialAccount, renderedContent) → { success, externalPostId, error }:

- LinkedIn: UGC Posts API — register upload, upload binary, post with the returned asset URN.
- Pinterest: Pins API — use the connected board for that workspace+platform.
- YouTube: videos.insert via googleapis, resumable upload — and explicitly reject (fail fast, log clearly) any ScheduledPost targeting YouTube where the underlying Media is IMAGE type rather than VIDEO.

Add a PostLog model (id, scheduledPostId, event enum [ATTEMPT, SUCCESS, FAILURE, RETRY], message, createdAt) and write a log row before and after every attempt.

Implement retry with exponential backoff (2min, 10min, 30min) up to 3 attempts before permanent FAILED status.

Verify end to end with sandbox or real test accounts: schedule one post per platform, confirm it actually publishes, externalPostId gets stored, and PostLog shows the full ATTEMPT → SUCCESS trail. Also test a forced failure (e.g. revoke a token mid-flow) and confirm it retries then lands on FAILED with a clear PostLog message rather than hanging.
```

**Check before continuing:** all three platforms have at least one real successful publish before building the UI around them.

---

## Phase 8 — Frontend Dashboard

```
Build the full frontend using the backend APIs from Phases 1–7:

- Login / Register
- Org/Workspace switcher (sidebar dropdown, since this is multi-client agency use)
- Dashboard: today's scheduled posts, quick counts (published/pending/failed)
- Workspace Settings: brand fields (name, website, CTA, default hashtags, brand voice, emoji style), and a Connect button per platform showing CONNECTED / NOT_CONNECTED / EXPIRED status
- Media Library: grid of ingested media with thumbnail, AI-generated headline/keywords, status badge, manual upload button
- Calendar: month view showing scheduled posts per day with platform + status icons (✔ published, ✖ failed, ⟳ retrying)
- Post detail/edit: template preview per platform, validation warnings, reschedule control

Use Tailwind, keep the design clean and built for someone switching between multiple client workspaces all day.

After building, use the browser subagent to click through each page, confirm there are no console errors, and walk through the full flow: connect a platform, upload media, wait for AI analysis, preview a rendered post, schedule it, and see it reflected on the calendar.
```

**Check before continuing:** the browser-subagent walkthrough actually completes without console errors — don't skip this verification step.

---

## Phase 9 — Notifications & Analytics

```
Build an in-app notification feed sourced from PostLog events (publish success, failure, retry), shown as a toast/list in the dashboard.

Build an analytics summary endpoint and dashboard widget per workspace: counts of Published / Pending / Failed / Today's Posts, plus a simple chart of published posts over the last 7/30 days.

Verify the counts against the underlying ScheduledPost/PostLog data for a workspace you've seeded with a mix of statuses — they should match exactly, not be approximations.
```

---

## Phase 10 — Hardening & Handoff

```
Polish pass across the whole app:

- Rate-limit awareness for each platform's publish handler (back off on 429s rather than burning retries)
- Input validation on all API endpoints
- Frontend error boundaries so one broken widget doesn't blank the whole dashboard
- A complete README.md: environment setup, running Postgres, running the watch folder, running the cron worker, how OAuth app credentials are obtained per platform
- docs/ARCHITECTURE.md summarizing the data model and the content pipeline (media → Gemini → master JSON → template → schedule → publish)

Finish by running through the entire flow once end to end — drop an image in a watch folder, confirm AI analysis, preview templates, connect accounts, schedule, publish, and see it land correctly in analytics — and fix anything broken along the way.
```
