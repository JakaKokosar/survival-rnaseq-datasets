# Orange4 Embedded Widget API — Integration Instructions

This document describes how to integrate an external application with the Orange4 embedded widget API so that **exactly one fork** of the master workflow is created when displaying multiple embedded widgets (e.g., Data Set + Kaplan–Meier plot).

## Problem: Multiple Forks

If the integration is incorrect, multiple workflow forks can be created when:

- Each iframe derives its own `session_id` (via 3-param embed URLs)
- Two or more iframes race during initialization and both call `embed_session`
- The parent app does not pass its `session_id` to iframes
- `initSession` (or equivalent) is called repeatedly without reusing an existing session

## Solution: Single Source of Truth for `session_id`

The **parent app** must be the single owner of `session_id`. It creates one session, passes it to all iframe URLs, and uses it for all embed resolve calls.

## Required Flow

### 1. Create embed session (once)

```
GET /api/workflows/embed_session
→ Returns: { "session_id": "<uuid>" }
```

Call this **once** when the embed context initializes (e.g., on component mount or page load). Store the returned `session_id`.

### 2. Resolve master widget IDs to fork IDs (one call per widget)

```
GET /api/workflows/embed/{master_ws}/{master_widget}/{session_id}
→ Returns: { "workSessionId": "<fork_ws>", "widgetId": "<fork_widget>" }
```

- `master_ws`: The master workflow ID (e.g. `"test"`, `"GSE100797"`).
- `master_widget`: The master widget UUID for that widget type (Data Set, KM plot, etc.).
- `session_id`: The same value from step 1.

Call this once per widget you need (e.g., Data Set widget and KM widget). Both calls must use the **same** `session_id`. The backend forks once (first call) and reuses for subsequent calls.

Store the returned `workSessionId` and `widgetId` for each widget. Use these for PATCH calls later.

### 3. Load iframes with 4-param embed URLs

Build iframe `src` URLs using the **4-param** embed route:

```
/embed/{master_ws}/{master_widget}/{session_id}
```

Example:

- Data Set iframe: `/embed/test/c98a3522-27f0-4b19-a8e9-0041c1f88a65/{session_id}`
- KM iframe: `/embed/test/52cfecf4-c671-4692-9ef1-12b62ea7d297/{session_id}`

Use the **same** `session_id` from step 1 for **all** iframes. Do **not** use the 3-param route `/embed/{master_ws}/{master_widget}` — that causes each iframe to derive its own session and can create multiple forks.

### 4. Patch widget settings (optional, after fork IDs are available)

Single widget:

```
PATCH /api/widget-properties/settings/{fork_ws}/{fork_widget}
Body: JSON object of settings
```

Multiple widgets (workflow):

```
PATCH /api/widget-properties/workflow-settings/{fork_ws}
Body: { "steps": [ { "widgetId": "<fork_widget>", "settings": { ... } }, ... ] }
```

Use the `workSessionId` and `widgetId` returned in step 2 as `fork_ws` and `fork_widget`.

## Session Persistence

To avoid creating duplicate forks when the parent component remounts (e.g., route change, tab switch), persist `session_id` in `sessionStorage` and reuse it:

1. **Storage key:** Use a namespace like `orange4_embed_session_{backendOrigin}` (with `backendOrigin` encoded) so different backend origins do not collide.
2. **On mount:** Check for an existing `session_id` in storage. If found, skip `embed_session` and call the resolve endpoint with the stored ID. If not found, create a new session and store it.
3. **Stale session:** If reusing a stored session fails (e.g., backend has expired it), clear storage and create a new session.

## Implementation Checklist

- [ ] Call `embed_session` once when the embed context initializes (or reuse from `sessionStorage`).
- [ ] Store `session_id` in component state, context, or sessionStorage (to avoid duplicate forks on remount or navigation).
- [ ] Call the embed resolve endpoint once per master widget, all with the same `session_id`.
- [ ] Use the **4-param** embed route for all iframe URLs and pass `session_id` as the fourth parameter.
- [ ] Do **not** set iframe `src` until `session_id` is available (i.e., after `embed_session` has completed or was loaded from storage).
- [ ] Reuse stored `session_id` across remounts rather than calling `embed_session` again.

## Anti-Patterns (Avoid)

- **3-param embed URLs** — `/embed/{master_ws}/{master_widget}` causes iframes to derive their own session and can create multiple forks.
- **Loading iframes before `session_id` is ready** — Iframes may fall back to their own `embed_session` call and create extra forks.
- **Calling `embed_session` on every mount** — Each call returns a new UUID and creates a new fork. Persist and reuse.

## Example Order of Operations

```
1. Parent: Check sessionStorage for session_id
2. If not found: GET embed_session → session_id; store in sessionStorage
3. Parent: GET embed/{master_ws}/{master_dataset}/{session_id} → fork IDs for dataset
4. Parent: GET embed/{master_ws}/{master_km}/{session_id} → fork IDs for KM
5. Parent: Set iframe.src = /embed/{master_ws}/{master_dataset}/{session_id}
6. Parent: Set iframe.src = /embed/{master_ws}/{master_km}/{session_id}
7. Iframes load: Each uses session_id from URL, calls embed endpoint, reuses same fork
8. Parent: PATCH workflow/widget settings using fork IDs from step 3–4
```

## Reference Implementation

In this repository:

- **API functions:** `src/lib/widget-api.ts` — `fetchEmbedSession`, `resolveMasterToFork`, `patchWorkflowSettings`, `patchWidgetSettings`
- **Sync controller:** `src/lib/dataset-browser-sync.ts` — `DatasetBrowserSyncController` with `initSession` and `initWithSessionId`
- **Component usage:** `src/components/DatasetBrowser.svelte` — session persistence and iframe URL construction
