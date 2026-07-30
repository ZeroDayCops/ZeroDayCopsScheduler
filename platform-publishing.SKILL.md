---
name: platform-publishing
description: Use this skill whenever implementing or modifying OAuth connect flows, token storage/refresh, the cron scheduler/worker, or publish logic for LinkedIn, Pinterest, or YouTube in SchedulerAgent. Trigger for any code touching SocialAccount, ScheduledPost status transitions, or PostLog.
---

# Platform Publishing Skill

## Goal
Every platform integration follows the same shape, so adding a 4th platform later is a matter of implementing one function against a known contract, not inventing a new pattern.

## OAuth & Token Storage Rules
- `SocialAccount.accessToken` and `refreshToken` are stored ENCRYPTED at rest (AES-256-GCM, key from `TOKEN_ENCRYPTION_KEY` env var). Never store or log plaintext tokens.
- Refresh proactively: before every publish attempt, check `expiresAt` against a buffer window (e.g. 5 minutes) and refresh if needed — don't wait for a 401 to discover a token expired.
- OAuth callback routes are workspace-scoped (`/api/oauth/:platform/callback?workspaceId=...`) and must verify the authenticated user actually has access to that workspace before linking the account, per the auth rules from Phase 1/2.
- If a refresh fails because the refresh token itself was revoked, set `SocialAccount.status = EXPIRED` immediately and surface a "reconnect" action in Settings. Do not let scheduled posts fail silently — see logging rules below.

## Per-Platform Publish Contract
Each handler implements one async function with the same signature:
`publish(scheduledPost, socialAccount, renderedContent) → { success, externalPostId, error }`

- **LinkedIn**: UGC Posts API. Register the upload, upload the binary, then reference the returned asset URN in the post payload.
- **Pinterest**: Pins API. Requires a board ID per workspace+platform connection — store it on the `SocialAccount` record (or a platform-specific metadata field) at connect time.
- **YouTube**: `videos.insert` via `googleapis`, resumable upload. YouTube only accepts `VIDEO` media — if a `ScheduledPost` somehow targets YouTube with an image-only `Media` row, fail fast with a clear validation error rather than attempting an upload. This should ideally never happen because the content-pipeline skill's template layer already prevents scheduling YouTube for image assets, but the publish handler must defend against it anyway.

## Retry & Logging Rules
- Write a `PostLog` row before AND after every attempt: one `ATTEMPT` entry, then either `SUCCESS` (with `externalPostId`) or `FAILURE` (with the raw error message — don't swallow API error bodies).
- On failure, retry up to 3 times with exponential backoff (e.g. 2 min → 10 min → 30 min) by re-queuing `scheduledFor`. After the 3rd failure, mark the post permanently `FAILED` and trigger a notification — don't retry forever.
- The cron worker claims due posts atomically to avoid double-publishing if it's ever run by more than one process:
  `UPDATE "ScheduledPost" SET status='PROCESSING' WHERE status='PENDING' AND "scheduledFor" <= now() RETURNING *`
  Process the claimed batch, then transition each to its final status. Never publish a post that wasn't claimed this way.
