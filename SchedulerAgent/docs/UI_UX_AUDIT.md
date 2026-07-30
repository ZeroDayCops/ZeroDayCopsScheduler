# SchedulerAgent — UI/UX Audit

> **Date:** 2026-07-27
> **Auditor:** ENI (Antigravity)
> **Scope:** Every Phase 8 screen — Login/Register, Org/Workspace switcher, Dashboard, Settings, Media Library, Planner & Calendar
> **Methodology:** Static code review of all 5 component files, AppContext, backend routes, and Prisma schema

---

## Legend

| Severity | Meaning |
|----------|---------|
| 🔴 **Critical** | Blocks a core workflow or causes data issues |
| 🟠 **Major** | Visible bug a user will hit immediately |
| 🟡 **Minor** | Polish issue, a professional user would notice |
| 🔵 **Enhancement** | Not broken, but missing expected table-stakes UX |

---

## 1. Login / Register (`AuthView.tsx`)

### Visual / Layout
| # | Severity | Issue |
|---|----------|-------|
| A1 | 🟡 | `animate-fade-in` class is used but never defined in CSS or Tailwind config — card may appear without any animation |
| A2 | 🟡 | Background gradient blobs use absolute positioning with negative percentages; on narrow viewports (< 400px, possible in side-panel mode) they push the wrapper wider and trigger horizontal scroll |
| A3 | 🟡 | `max-w-md` card does not gracefully narrow below ~380px — inputs maintain `pl-11` icon spacing that compresses text area on very small viewports |

### Missing States
| # | Severity | Issue |
|---|----------|-------|
| A4 | 🟠 | **No disabled state on form inputs during submission.** `isLoading` disables the button but inputs remain editable, so users can change values mid-flight causing a UX mismatch |
| A5 | 🟡 | No rate-limit feedback — if the backend returns 429, the generic `err.message` may be unhelpful |

### Inconsistent Components
| # | Severity | Issue |
|---|----------|-------|
| A6 | 🟠 | **Input styles duplicated 4× as raw className strings** (`w-full pl-11 pr-4 py-3 bg-[#0c1220] border border-white/5 rounded-xl text-slate-200 placeholder-slate-500 ...`). Not extracted to a shared component. Every future change requires editing all 4 |
| A7 | 🟠 | **Button (submit) styled ad hoc** — gradient, padding, shadow, disabled state all inline. Same gradient button appears in Settings, Planner, but with slightly different padding/shadow values |
| A8 | 🟡 | Error banner styled ad hoc. Different from the error banner in Settings (which uses `bg-rose-500/15` vs `bg-rose-500/10`) |

### Accessibility
| # | Severity | Issue |
|---|----------|-------|
| A9 | 🔴 | **No visible focus ring on toggle buttons** ("Sign In" / "Create Agency Account" text buttons). `focus:outline-none` is set without a replacement — keyboard users cannot see which element is focused |
| A10 | 🟠 | Submit button and toggle buttons lack `cursor-pointer` explicitly on hover *when disabled* — `disabled:opacity-50` but no `disabled:cursor-not-allowed` |
| A11 | 🟡 | Labels use `for`/`htmlFor`-less design (no `id` on inputs → `<label>` not semantically linked) |

### Performance
| # | Severity | Issue |
|---|----------|-------|
| A12 | 🟡 | Minor: After registration, fires two sequential fetch requests (register → login). Could be collapsed into one if the register endpoint returns a session cookie |

---

## 2. Sidebar / Org+Workspace Switcher / Navigation (`MainLayout.tsx`)

### Visual / Layout
| # | Severity | Issue |
|---|----------|-------|
| B1 | 🟠 | **Sidebar fixed at `w-72` (288px)** with no responsive breakpoint. At 1024px viewport, 288px sidebar + content = cramped. At viewports below 1024px it's unusable. No hamburger/collapse mechanism |
| B2 | 🟡 | Active nav tab uses `border-l-2 border-indigo-500 pl-3.5` but the non-active state uses `px-4` — the 1.5px difference causes a visual "jump" when switching tabs as content shifts |
| B3 | 🟡 | Dropdown menus (`showOrgDropdown`, `showWsDropdown`) open inline with `absolute` positioning but don't close when clicking outside — they only close when clicking another dropdown button or a nav tab |
| B4 | 🟡 | Header breadcrumb (`currentOrg?.name / currentWorkspace?.brandName`) renders `undefined / undefined` momentarily during load or if no workspace selected |

### Missing States
| # | Severity | Issue |
|---|----------|-------|
| B5 | 🔴 | **No loading state after switching workspaces.** `setCurrentWorkspace` swaps immediately but downstream views (Media Library, Planner) still show *previous workspace data* until their `useEffect` re-fires and the fetch completes. This is the "stale previous-workspace data flash" |
| B6 | 🟠 | **No empty state for organizations list.** If `organizations` is empty (edge case: user created via direct DB insert without an org), the org dropdown silently renders nothing |
| B7 | 🟠 | **No error state if `fetchWorkspaces` fails.** Errors are `console.error`'d but the UI shows nothing — the workspace dropdown just stays empty |

### Inconsistent Components
| # | Severity | Issue |
|---|----------|-------|
| B8 | 🟠 | Dropdown items styled as raw inline classes. Same dropdown pattern exists in Settings (`<select>`) but rendered differently — one is a custom dropdown, the other is a native `<select>` |
| B9 | 🟡 | Nav buttons all share identical 4-line className logic, duplicated 4×. Should be a `<NavItem>` component |

### Accessibility
| # | Severity | Issue |
|---|----------|-------|
| B10 | 🔴 | **Dropdown menus not keyboard-operable.** No `aria-expanded`, no `aria-haspopup`, no `Escape` key to close, no arrow-key navigation between items |
| B11 | 🟠 | No `role="navigation"` or `aria-label` on the `<nav>` element |
| B12 | 🟡 | User avatar initials area has no `alt` text or `aria-label` |

### Performance
| # | Severity | Issue |
|---|----------|-------|
| B13 | 🟡 | `renderActiveContent()` switch statement eagerly renders whichever view is active but doesn't lazy-load — Calendar, Media Library, and Settings are bundled into the main chunk |

---

## 3. Dashboard (inline in `MainLayout.tsx`)

### Visual / Layout
| # | Severity | Issue |
|---|----------|-------|
| C1 | 🟠 | **Stats grid `grid-cols-5` on large screens** pushes cards too narrow (< 160px each at 1280px minus 288px sidebar). Text truncates aggressively. The "Default Hashtags" and platform status cards fight for space |
| C2 | 🟡 | `bg-white/2` on Quick Setup Checklist items is a non-standard opacity value — Tailwind v4 may not generate this utility; results in transparent fallback |
| C3 | 🟡 | Quick Setup checklist items have no completion state — they always show regardless of whether the workspace is fully configured |

### Missing States
| # | Severity | Issue |
|---|----------|-------|
| C4 | 🔴 | **No loading/skeleton state for Dashboard.** When workspace changes, the dashboard instantly re-renders with the new `currentWorkspace` object from memory, but social account data comes from `currentWorkspace.socialAccounts` which may be stale. No fetch is triggered for fresh data |
| C5 | 🟡 | No error handling if `socialAccounts` is undefined — the `.find()` call on undefined would crash (currently guarded by `?.` but shows nothing useful) |

### Inconsistent Components
| # | Severity | Issue |
|---|----------|-------|
| C6 | 🟠 | **Platform status badge** in Dashboard uses a different inline implementation than the badge in Settings (`renderStatusBadge`) and the badge in Planner (`renderStatusBadge`). Three separate implementations of the same badge |
| C7 | 🟡 | Stat cards styled ad hoc — same dark card pattern (`bg-[#0d1220] border border-white/5 rounded-2xl p-6 shadow-xl`) appears 15+ times across all views but is never abstracted |

### Accessibility
| # | Severity | Issue |
|---|----------|-------|
| C8 | 🟡 | Checklist arrow buttons have no `aria-label` — screen reader would announce "button" with no context |
| C9 | 🟡 | Status badge colors alone convey meaning (green = connected, amber = expired, gray = not connected) — no text alternative for colorblind users *(text IS present, so this is partially mitigated)* |

---

## 4. Media Library (`MediaLibraryView.tsx`)

### Visual / Layout
| # | Severity | Issue |
|---|----------|-------|
| D1 | 🟠 | **Slide-out drawer uses `h-screen sticky top-0`** but the parent uses `flex` layout. In many viewport configurations the drawer extends below the visible area. The `sticky` positioning doesn't work correctly inside a flex container without explicit height constraints |
| D2 | 🟡 | `animate-slide-in` class referenced but never defined — drawer appears without animation |
| D3 | 🟡 | Grid uses `grid-cols-4` at `md` breakpoint but with the sidebar (288px) plus drawer (384px), content area can be as narrow as ~350px at 1280px viewport — the 4-col grid becomes unusable |
| D4 | 🟡 | Image thumbnail `onError` handler hides the element (`display: 'none'`) but leaves a blank card with no fallback placeholder |

### Missing States
| # | Severity | Issue |
|---|----------|-------|
| D5 | 🔴 | **No skeleton/loading state on initial fetch.** The component starts with empty `mediaList` and shows the "No media assets" empty state briefly before data arrives, causing a flash |
| D6 | 🟠 | **No error state if `fetchMedia` fails.** Error is `console.error`'d but the UI shows nothing — user sees empty state with no retry option |
| D7 | 🟡 | Upload button in the drop zone is not disabled during upload, allowing double-upload of the same file |
| D8 | 🟡 | `uploadError` persists until next upload — no dismiss/close button on the error message |

### Inconsistent Components
| # | Severity | Issue |
|---|----------|-------|
| D9 | 🟠 | Delete button uses `window.confirm()` — a native browser dialog that breaks the dark theme aesthetic. Should be a custom modal/dialog |
| D10 | 🟡 | Status rendering in Media Library (`renderStatus`) is a different implementation than `renderStatusBadge` in Planner/Settings, even though they represent similar concept (status → color + icon) |

### Accessibility
| # | Severity | Issue |
|---|----------|-------|
| D11 | 🟠 | **File input has no visible label.** The `<input type="file">` is `hidden` — the click target is the drop zone div, which has no `role="button"` or `aria-label` |
| D12 | 🟡 | Media grid items are `<div>` with `onClick` but no `role="button"`, `tabIndex`, or keyboard event handlers |
| D13 | 🟡 | Drawer close button (ChevronRight icon) has no `aria-label` |

### Performance
| # | Severity | Issue |
|---|----------|-------|
| D14 | 🔴 | **3-second polling interval fetches ALL media every 3 seconds.** `fetchMedia` is called via `setInterval(fetchMedia, 3000)`. The `useCallback` dependency on `selectedMedia` means the callback reference changes whenever `selectedMedia` changes, causing the `useEffect` to re-register the interval — creating a new interval each time a media item is selected. **This is an interval leak bug** |
| D15 | 🟠 | **No pagination.** `GET /api/workspaces/:id/media` returns the full result set. A workspace with 500+ media items would transfer all 500 on every 3-second poll |
| D16 | 🟠 | **Thumbnails generated on-the-fly by sharp** on every request. No caching — the same 300px resize runs every time the grid renders (and re-runs every 3 seconds during polling as browser requests images) |
| D17 | 🟡 | Grid renders all media items in the DOM — no virtualization. 200+ items with thumbnails = hundreds of image elements |

---

## 5. Planner & Queue (`PlannerView.tsx`)

### Visual / Layout
| # | Severity | Issue |
|---|----------|-------|
| E1 | 🟠 | **Builder panel fixed at `h-[560px]`** — content is clipped at smaller viewports. At 1024px viewport height minus header (80px) and padding, the 560px panel extends beyond the viewport with no scroll indicator |
| E2 | 🟡 | Post queue cards use `flex-col sm:flex-row` but the action buttons (Publish Now, Logs, Delete) stack awkwardly at the `sm` breakpoint — they need more horizontal space than the breakpoint provides |
| E3 | 🟡 | Platform toggle buttons show raw uppercase names (`LINKEDIN`, `PINTEREST`, `YOUTUBE`) in the queue cards' summary bar instead of the friendly names used in the toggle buttons |

### Missing States
| # | Severity | Issue |
|---|----------|-------|
| E4 | 🔴 | **No skeleton/loading state for initial data fetch.** `fetchMedia` and `fetchScheduledPosts` both fire on mount but there's no loading indicator — user sees empty content that then pops in |
| E5 | 🟠 | **No error state if either fetch fails.** Both catch blocks only `console.error` |
| E6 | 🟠 | **No disabled state on "Schedule Campaign Post" button during preview loading.** User can submit while preview is still loading, potentially scheduling with stale/no content |
| E7 | 🟡 | `scheduleSuccess` toast auto-dismisses after 3 seconds but cannot be manually dismissed. `scheduleError` has no auto-dismiss and no close button |
| E8 | 🟡 | "Publish Now" and "Delete" use `window.confirm()` — same native dialog issue as Media Library |

### Inconsistent Components
| # | Severity | Issue |
|---|----------|-------|
| E9 | 🟠 | **Status badge rendered 3 different ways across the app:** Dashboard inline classes, Settings `renderStatusBadge()`, Planner `renderStatusBadge()` — each with slightly different class strings |
| E10 | 🟠 | Log event badges (`renderLogEvent`) are another ad hoc badge variant — same pattern as status badges but different sizes and styles |
| E11 | 🟡 | Error/warning display uses `bg-rose-500/5` in some places and `bg-rose-500/10` in others — inconsistent opacity |

### Accessibility
| # | Severity | Issue |
|---|----------|-------|
| E12 | 🟠 | Media selector items are `<div>` with `onClick` — no keyboard navigation, no `role="listbox"`/`role="option"` semantics |
| E13 | 🟡 | Platform toggle buttons don't indicate selected state to screen readers — no `aria-pressed` |
| E14 | 🟡 | `datetime-local` input has a label but no `id`/`htmlFor` connection |
| E15 | 🟡 | "Execution Logs" expand/collapse has no `aria-expanded` attribute |

### Performance
| # | Severity | Issue |
|---|----------|-------|
| E16 | 🟠 | **5-second polling** fetches ALL scheduled posts every 5 seconds — no pagination, no filtering by date range |
| E17 | 🟡 | `fetchMedia` inside PlannerView is a separate call from MediaLibraryView's `fetchMedia` — same endpoint called twice when switching between tabs |
| E18 | 🟡 | Preview re-fetches when `platforms` array changes, even if only adding a second platform (the preview only shows the first platform anyway) |

---

## 6. Settings (`SettingsView.tsx`)

### Visual / Layout
| # | Severity | Issue |
|---|----------|-------|
| F1 | 🟠 | **Grid layout `grid-cols-3`** puts Social Connections panel in the right column but Brand Identity and Automation each span `col-span-2`. At 1280px with sidebar, the right column (Social Connections) is very narrow (~250px) — Connect/Mock Connect buttons text wraps awkwardly |
| F2 | 🟡 | Automation section's `animate-[fadeIn_0.2s_ease]` uses Tailwind arbitrary animation syntax which requires `@keyframes fadeIn` to be defined somewhere — likely doesn't animate |
| F3 | 🟡 | `select` elements (`emojiStyle`, `LinkedIn company page`) use native browser styling that doesn't match the dark theme on some browsers (Windows Chrome shows white dropdown) |

### Missing States
| # | Severity | Issue |
|---|----------|-------|
| F4 | 🟠 | **No loading state after clicking "Link Account" or "Developer Mock Connect."** The `handleConnect` opens a popup with no loading indicator, and `handleMockConnect` makes a fetch with no loading/disabled state on the button — double-click risk |
| F5 | 🟡 | `configStatus` fetch on mount has no loading state — OAuth config status silently defaults to `{LINKEDIN: false, PINTEREST: false, YOUTUBE: false}` |
| F6 | 🟡 | LinkedIn author selector `onChange` fires an API call with no loading indicator or error handling beyond `console.error` |

### Inconsistent Components
| # | Severity | Issue |
|---|----------|-------|
| F7 | 🟠 | **Input fields styled 10× with same raw className string** — identical to AuthView inputs but slightly different (different `px` values, missing `placeholder-slate-500` vs `placeholder-slate-600`). Need shared Input component |
| F8 | 🟡 | Save/submit buttons use the same gradient pattern as Auth and Planner but with `px-5 py-3` vs `w-full py-3` — inconsistent sizing |
| F9 | 🟡 | Social connection card is a complex compound component but rendered inline — 75 lines per platform card |

### Accessibility
| # | Severity | Issue |
|---|----------|-------|
| F10 | 🟠 | **Automation mode buttons are `<button>` elements but function as radio buttons.** No `role="radiogroup"`, no `aria-checked`, no keyboard group navigation |
| F11 | 🟡 | Hashtag remove button (X icon) inside each tag has no `aria-label` |
| F12 | 🟡 | "Save Settings" button disabled state shows `disabled:opacity-50` but no `disabled:cursor-not-allowed` |

### Performance
| # | Severity | Issue |
|---|----------|-------|
| F13 | 🔴 | **3-second workspace polling** fires `GET /api/workspaces/:id` every 3 seconds to check for social account status changes. This is a full workspace fetch including all social accounts, and the `setCurrentWorkspace` call triggers re-renders of the entire component tree |
| F14 | 🟡 | `useEffect` on `currentWorkspace` (line 46-57) runs on every workspace change including the poll-triggered updates — re-setting all form state every 3 seconds. If user is mid-edit, their typing could be overwritten by a poll response |

---

## 7. Cross-Cutting Issues

### Design System
| # | Severity | Issue |
|---|----------|-------|
| G1 | 🔴 | **No shared component library.** Zero reusable UI components — every button, input, card, badge, modal is inline Tailwind. The codebase has 5 component files and 0 under a `/ui` directory |
| G2 | 🔴 | **No semantic color tokens.** Status colors (emerald for success, rose for error, amber for warning, indigo for processing) are hardcoded across 30+ locations with slight inconsistencies |
| G3 | 🟠 | **No platform brand colors.** LinkedIn (blue), Pinterest (red), YouTube (red) all display as generic `text-slate-300` or `text-indigo-400` — no visual distinction between platforms |
| G4 | 🟠 | **Border radius inconsistency.** Values used: `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-lg`, `rounded-full`, `rounded-md` — no clear hierarchy |
| G5 | 🟡 | **Spacing scale inconsistency.** Padding/margin values range from `p-0.5` to `p-12` with no semantic naming |

### Backend Performance
| # | Severity | Issue |
|---|----------|-------|
| H1 | 🔴 | **No pagination on `GET /workspaces/:id/media`.** Returns full result set — will degrade as media count grows |
| H2 | 🔴 | **No pagination on `GET /workspaces/:id/scheduled-posts`.** Returns all posts with full `postLogs` included |
| H3 | 🔴 | **No indexes on `ScheduledPost(workspaceId, scheduledFor)`, `ScheduledPost(status)`, or `Media(workspaceId, status)`.** The only indexes are the `@@unique` constraints on primary keys |
| H4 | 🟠 | **Thumbnail endpoint generates on every request.** `sharp(absolutePath).resize(300).toBuffer()` runs on every `/api/media/:id/thumbnail` call — no disk or memory cache |
| H5 | 🟠 | **N+1 potential in calendar endpoint.** `findMany` returns posts but doesn't include media or social account — frontend would need separate requests for thumbnails |
| H6 | 🟡 | Scheduler's `claimDuePosts` raw SQL lacks explicit index usage — `WHERE status = 'PENDING' AND scheduledFor <= now()` scans the full table |
| H7 | 🟡 | Video thumbnails fall back to sending the full video file as "thumbnail" — could be multi-MB |

### Frontend Architecture
| # | Severity | Issue |
|---|----------|-------|
| I1 | 🔴 | **No React Query (or equivalent).** All data fetching is manual `fetch` + `useState` + `useEffect`. No caching, no deduplication, no stale-while-revalidate, no query invalidation |
| I2 | 🟠 | **No code splitting.** All views bundled in one chunk via direct imports in MainLayout |
| I3 | 🟠 | **No virtualization.** Media grid and post queue render all items |
| I4 | 🟠 | **No debouncing** on any text input that triggers actions |
| I5 | 🟡 | **No `React.memo`** on any component — every state change in AppContext re-renders everything |

---

## Summary: Fix Priority Matrix

| Priority | Count | Key Items |
|----------|-------|-----------|
| 🔴 Critical | 16 | Interval leak (D14), no pagination (H1/H2), no indexes (H3), no design system (G1/G2), stale data flash (B5), no loading states (C4/D5/E4), no a11y focus rings (A9), keyboard-inoperable dropdowns (B10) |
| 🟠 Major | 24 | No error states, inconsistent badges ×3, `window.confirm` ×3, no code splitting, no React Query, polling overload, sidebar unresponsive |
| 🟡 Minor | 28 | Animation classes undefined, spacing inconsistencies, undefined opacity utilities, missing aria-labels |
| 🔵 Enhancement | 0 | (Rolled into minor/major based on impact) |

---

## Verification Checklist (Post-Fix)

After all fixes are applied, verify:

- [ ] Zero console errors on every screen
- [ ] Zero console warnings on every screen
- [ ] Skeleton loaders visible during initial data fetch on Dashboard, Media Library, and Planner
- [ ] Empty states with clear CTAs on Media Library and Planner when no data exists
- [ ] Error states with retry buttons on all fetch-dependent screens
- [ ] Confirmation dialogs (custom, dark-themed) before: deleting media, deleting posts, disconnecting platforms
- [ ] Layout correctness at: 1024px, 1280px, 1440px, 1920px
- [ ] Sidebar collapses or adapts at ≤1024px
- [ ] No stale data flash when switching workspaces
- [ ] All interactive elements keyboard-accessible with visible focus rings
- [ ] Polling intervals don't leak or compound
- [ ] Media Library grid virtualizes at 50+ items
- [ ] Thumbnails cached on disk, not regenerated per request
- [ ] Database indexes present on ScheduledPost and Media query columns
