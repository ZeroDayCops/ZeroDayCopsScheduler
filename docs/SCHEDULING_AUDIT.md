# Scheduling Pipeline End-to-End Audit Report

**Date & Time:** July 28, 2026 @ 09:12 IST  
**Environment:** Linux (PostgreSQL 17 on Port 5555, Express Backend on Port 3001, Vite Frontend on Port 5173)  
**Target File:** `docs/SCHEDULING_AUDIT.md`  

---

## Executive Summary

The campaign scheduling pipeline (**Planner & Queue $\rightarrow$ Schedule Campaign Post**) was investigated end-to-end across frontend state management, API request/response payloads, backend database queries, background cron workers, and social account token configurations.

### Key Breakpoints Identified:

1. **Primary Frontend Root Cause (UI Stalling):** `selectedMedia` defaults to `null` on initial view load. No media is auto-selected by default. Unless the user explicitly clicks a media item in "1. Select Media", Live Preview remains unrendered and "+ Schedule Campaign Post" remains disabled.
2. **Primary Backend Root Cause (API 400 Error):** The permanent master workspace (`ZeroDayCops Scheduler`, ID: `2cf48a06-9ac4-449f-8661-4832bb784308`) has **0 `SocialAccount` rows** in PostgreSQL. When the post creation endpoint `POST /api/workspaces/:workspaceId/scheduled-posts` executes, it checks for a connected/placeholder `SocialAccount` row. Failing to find one, it returns HTTP 400 (`SocialAccount connection for LINKEDIN not initialized`).
3. **Missing Business Rule Enforcement:** IMAGE media can currently be toggled for YOUTUBE without any frontend restriction or backend validation error.

---

## Section-by-Section Investigation Findings

---

### Step 1: Media Selection State (Frontend)

* **Finding:** Clicking a media card in "1. Select Media" **does set** the `selectedMedia` state variable.
* **Component Trace (`PlannerView.tsx`):**
  - **State declaration (Line 31):**
    ```typescript
    const [selectedMedia, setSelectedMedia] = useState<any>(null);
    ```
  - **Click handler binding (Lines 110–112):**
    ```tsx
    analyzedMedia.map(m => (
      <div key={m.id} role="button" tabIndex={0} 
        onClick={() => setSelectedMedia(m)} 
        onKeyDown={e => { if (e.key === 'Enter') setSelectedMedia(m); }}
        className={`border p-3 rounded-xl transition cursor-pointer flex gap-3 items-center ${
          selectedMedia?.id === m.id ? 'border-indigo-500 bg-indigo-500/5' : 'border-white/5 bg-[#080d16]/40'
        }`}>
    ```
  - **Live Preview Trigger (Lines 53–62):**
    ```typescript
    useEffect(() => {
      if (!selectedMedia || !currentWorkspace || !platforms.length) { 
        setPreview(null); 
        return; 
      }
      let cancelled = false;
      setPreviewLoading(true); setPreviewError(null);
      fetchApi<any>(`/media/${selectedMedia.id}/preview?platform=${platforms[0]}`)
        .then(d => { if (!cancelled) setPreview(d.rendered); })
        .catch(e => { if (!cancelled) { setPreviewError(e.message); setPreview(null); } })
        .finally(() => { if (!cancelled) setPreviewLoading(false); });
      return () => { cancelled = true; };
    }, [selectedMedia?.id, platforms[0], currentWorkspace?.id]);
    ```

* **Expected Behavior vs Bug:**
  - The Live Preview panel displaying **"Select media to preview"** while media items are visible in column 1 is **expected initial state behavior** when no item has been clicked yet.
  - However, because no item is auto-selected upon page load (e.g. `analyzedMedia[0]`), the user interface appears unselected and "stuck" until manual interaction occurs.

---

### Step 2: Platform Toggle Logic (Frontend)

* **Finding:** Platform selection is **100% manual** right now. Selecting an `IMAGE`-type media asset and toggling `YOUTUBE` silently allows an invalid combination without any disabled state or warning.
* **Component Trace (`PlannerView.tsx`):**
  - **Toggle handler (Line 78):**
    ```typescript
    const togglePlatform = (p: string) => 
      setPlatforms(prev => prev.includes(p) ? (prev.length === 1 ? prev : prev.filter(x => x !== p)) : [...prev, p]);
    ```
  - **Platform rendering (Lines 131–138):**
    ```tsx
    {(['LINKEDIN', 'PINTEREST', 'YOUTUBE'] as const).map(p => (
      <button key={p} type="button" onClick={() => togglePlatform(p)} aria-pressed={platforms.includes(p)}
        className={`py-2 px-3 border rounded-xl text-xs font-bold transition cursor-pointer text-center uppercase tracking-wide ${
          platforms.includes(p) ? 'border-indigo-500 bg-indigo-500/5 text-indigo-400' : 'border-white/5 bg-[#080d16] text-slate-400'
        }`}>
        {PLATFORM_NAMES[p]}
      </button>
    ))}
    ```
* **Media-Type Auto-Selection / Filtering:** None. There is zero conditional logic referencing `selectedMedia?.mediaType` in the platform selection buttons.

---

### Step 3: Schedule Button State (Frontend)

* **Finding:** The "+ Schedule Campaign Post" button state is controlled by an explicit conditional expression.
* **Code Conditional (`PlannerView.tsx`, Line 146):**
  ```tsx
  <Button 
    variant="primary" 
    size="lg" 
    className="w-full" 
    onClick={handleSchedule} 
    isLoading={createPost.isPending} 
    disabled={!selectedMedia || previewLoading} 
    icon={<Plus className="w-5 h-5" />}
  >
    Schedule Campaign Post
  </Button>
  ```
* **Evaluation:**
  - **When disabled:** Enabled state requires `selectedMedia !== null` AND `previewLoading === false`.
  - In the initial page view (as shown in user screenshot), `selectedMedia` is `null`, making `!selectedMedia` evaluate to `true`, which forces `disabled = true`.

---

### Step 4: Submit Handler (Frontend $\rightarrow$ Backend)

* **Finding:** When enabled and clicked, `handleSchedule` iterates over all active `platforms` and invokes `createPost.mutateAsync`.
* **Frontend Handler Trace (`PlannerView.tsx`, Lines 64–76):**
  ```typescript
  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMedia || !scheduledFor || !platforms.length) return;
    try {
      await Promise.all(platforms.map(p =>
        createPost.mutateAsync({ 
          mediaId: selectedMedia.id, 
          platform: p, 
          scheduledFor: new Date(scheduledFor).toISOString() 
        })
      ));
      setToast({ type: 'success', message: 'Post scheduled successfully!' });
      setSelectedMedia(null); setPreview(null);
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to schedule' });
    }
  };
  ```
* **Exact Network Request Payload:**
  - **HTTP Method:** `POST`
  - **URL:** `/api/workspaces/2cf48a06-9ac4-449f-8661-4832bb784308/scheduled-posts`
  - **Body Payload:**
    ```json
    {
      "mediaId": "be8ab3a1-b477-4b54-a21c-f6ff12bd3818",
      "platform": "LINKEDIN",
      "scheduledFor": "2026-07-28T03:48:00.000Z"
    }
    ```
* **Exact API Response Received (HTTP 400 Error):**
  ```json
  {
    "error": "Social account connection for LINKEDIN not initialized"
  }
  ```

---

### Step 5: Backend Endpoint Analysis

* **Finding:** The endpoint `POST /api/workspaces/:workspaceId/scheduled-posts` in [`src/routes/posts.js`](file:///home/b1t3x0p/ZeroDayCops/ZeroDayCopsScheduler/SchedulerAgent/backend/src/routes/posts.js#L37-L126) fails during the `SocialAccount` lookup phase before insertion.
* **Backend Endpoint Code Trace (`src/routes/posts.js`, Lines 96–106):**
  ```javascript
  // Find connected SocialAccount for this platform and workspace
  const socialAccount = await prisma.socialAccount.findFirst({
    where: {
      workspaceId,
      platform: upperPlatform,
    },
  });

  if (!socialAccount) {
    return res.status(400).json({ error: `Social account connection for ${upperPlatform} not initialized` });
  }
  ```
* **Database Direct SQL Query Evidence:**
  ```sql
  SELECT id, "workspaceId", platform, status, "scheduledFor" FROM "ScheduledPost";
  ```
* **Query Output:**
  ```text
                    id                  |             workspaceId              | platform |  status   |      scheduledFor       
  --------------------------------------+--------------------------------------+----------+-----------+-------------------------
   53e22008-4887-42aa-a521-fae4e0c86f83 | e0dbb545-2317-471e-b594-44097767c631 | LINKEDIN | PUBLISHED | 2026-07-28 02:15:55.202
  (1 row)
  ```
* **Conclusion:** **0 `ScheduledPost` rows** exist for workspace `2cf48a06-9ac4-449f-8661-4832bb784308` (`ZeroDayCops Scheduler`). No rows are being created because the endpoint rejects the request at line 105.

---

### Step 6: Cron Worker Verification

* **Finding:** The background `node-cron` worker is active and running every 30 seconds.
* **Process Log Verification (`task-273.log`):**
  ```text
  [SCHEDULER] Starting scheduled post cron worker (every 30 seconds)...
  ```
* **Atomic Claim Query Test (`src/services/scheduler.js`, Lines 8–24):**
  ```javascript
  const duePosts = await prisma.scheduledPost.findMany({
    where: {
      status: 'PENDING',
      scheduledFor: { lte: now }
    }
  });
  ```
* **Query Verification Output:**
  - Running `SELECT * FROM "ScheduledPost" WHERE status='PENDING';` returns **0 rows**.
  - During earlier Phase 10 verification, when a `PENDING` post in the past was inserted into PostgreSQL, the claim query `UPDATE "ScheduledPost" SET status='PROCESSING' WHERE id=$1 AND status='PENDING'` successfully claimed 1 row and published it.

---

### Step 7: SocialAccount & OAuth Token Audit

* **Finding:** The primary master workspace (`ZeroDayCops Scheduler`, ID `2cf48a06-9ac4-449f-8661-4832bb784308`) has **0 `SocialAccount` rows** initialized in the database.
* **Database Direct SQL Query Evidence:**
  ```sql
  SELECT id, "workspaceId", platform, status, "accountName" FROM "SocialAccount";
  ```
* **Query Output:**
  ```text
                    id                  |             workspaceId              | platform  |    status     | accountName 
  --------------------------------------+--------------------------------------+-----------+---------------+-------------
   109cb8a9-387c-428c-9012-4175c11be38b | e0dbb545-2317-471e-b594-44097767c631 | LINKEDIN  | NOT_CONNECTED | 
   beebcccc-b00b-4eca-bbf4-57f6f753df42 | e0dbb545-2317-471e-b594-44097767c631 | PINTEREST | NOT_CONNECTED | 
   f0325785-1cb6-42b8-840f-0942e49204c0 | e0dbb545-2317-471e-b594-44097767c631 | YOUTUBE   | NOT_CONNECTED | 
  (3 rows)
  ```
* **Backend Execution Log Evidence (`task-273.log`):**
  ```text
  [AUTOMATION] Processing media 424a1ba3-1ed7-494f-84ef-31a536e9ec14 (28july0907.mp4). Date pattern match: 28 July @ 09:07
  [AUTOMATION] No connected social accounts in workspace "ZeroDayCops Scheduler". Skipping.
  ```

---

### Step 8: Business Rule Enforcement Check

* **Intended Rule:**
  - `IMAGE` media $\rightarrow$ Schedulable to **LINKEDIN** and **PINTEREST** only.
  - `VIDEO` media $\rightarrow$ Schedulable to **LINKEDIN**, **PINTEREST**, and **YOUTUBE**.
* **Audit Evaluation:**
  - **Frontend:** **NOT ENFORCED**. `PlannerView.tsx` allows toggling YOUTUBE regardless of whether `selectedMedia.mediaType` is `IMAGE` or `VIDEO`.
  - **Backend API:** **NOT ENFORCED**. `POST /api/workspaces/:workspaceId/scheduled-posts` does not check `media.mediaType` against `platform`.
  - **Renderer Engine:** **NOT ENFORCED**. `renderPost` in `src/services/renderer.js` renders templates without validating media compatibility.

---

## Audit Summary Table

| Step | Component | Status | Empirical Finding / Reason |
| :--- | :--- | :--- | :--- |
| **1** | Media Selection | `BEHAVIOR CONFIRMED` | `selectedMedia` starts `null`. Must click card to select. No auto-selection on page load. |
| **2** | Platform Toggle | `NOT ENFORCED` | Manual toggle without media-type restrictions. Image + YouTube allowed. |
| **3** | Schedule Button | `WORKING AS CODED` | Disabled conditional `!selectedMedia \|\| previewLoading` evaluates to true initially. |
| **4** | Submit Handler | `FAILING (HTTP 400)` | API call fails due to missing `SocialAccount` DB rows. |
| **5** | Backend Endpoint | `BLOCKING INSERTS` | Returns 400 `Social account connection for LINKEDIN not initialized`. 0 rows created. |
| **6** | Cron Worker | `ACTIVE` | Worker is running every 30s; 0 PENDING rows in DB to claim. |
| **7** | OAuth / Accounts | `MISSING DB ROWS` | `SocialAccount` rows for `ZeroDayCops Scheduler` are missing in PostgreSQL. |
| **8** | Business Rules | `NOT IMPLEMENTED` | Platform vs Media-type matrix (IMAGE vs VIDEO) is unvalidated across stack. |
