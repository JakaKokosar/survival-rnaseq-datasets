# Survival Analysis Datasets Browser

An Astro + Svelte 5 application for exploring GEO datasets used in survival analysis research.

## Current state

- Svelte 5 runes-based UI with decomposed dataset-browser components
- Strict TypeScript + runtime schema validation (Zod)
- URL-synced dataset selection/sort (`selected`, `sort`, `dir` query params)
- Widget session init + fire-and-forget PATCH synchronization via a single controller
- Accessible keyboard patterns for table navigation, mobile tabs, and panel toggles
- Iframe loading/error states for KM plot and sample data viewer

## Stack

- Astro 5
- Svelte 5 (Runes API)
- TypeScript (strict mode)
- Tailwind CSS 4

## What the app does

- Displays survival-analysis datasets in a sortable table
- Shows dataset details, endpoints, publications, and file downloads
- Synchronizes selection/sort state to URL parameters
- Includes embedded widgets for Kaplan-Meier and table views
- Lets users choose survival endpoints and candidate genes to drive widget sync

## Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build and preview:

```bash
npm run build
npm run preview
```

Type checks:

```bash
npm run astro check
```

Deploy (Cloudflare Pages):

```bash
npm run deploy
```

## Environment variables

The app reads the following public env vars:

- `PUBLIC_WIDGET_FRONTEND_ORIGIN`
  - Widget frontend base URL used for iframe embed src values.
  - Example: `https://widgets.example.com`
- `PUBLIC_WIDGET_BACKEND_ORIGIN`
  - Widget API backend origin used for session/fork/patch calls.
  - Example: `https://api.widgets.example.com`
- `PUBLIC_DATA_FILES_ORIGIN`
  - Base origin for dataset file download links.
  - Falls back to `PUBLIC_WIDGET_BACKEND_ORIGIN` when not set.

## Widget backend API

The app integrates with a widget backend to embed Kaplan-Meier and data table widgets. All requests use `credentials: 'include'` for cookies.

### Flow

1. **Init:** On mount, create an embed session and fork master widgets (dataset + KM) into a work session.
2. **Sync:** When the user selects a dataset, endpoint, or candidate gene, PATCH the backend so embedded iframes display the right data.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/workflows/embed_session` | Create embed session; returns `session_id` |
| GET | `/api/workflows/embed/{masterWs}/{masterWidget}/{sessionId}` | Fork master to work session; returns `workSessionId`, `widgetId` |
| PATCH | `/api/widget-properties/workflow-settings/{wsId}` | Set full workflow (dataset URL + KM time/event variables) |
| PATCH | `/api/widget-properties/settings/{wsId}/{widgetId}` | Set single widget (e.g. `groupVariable` for candidate gene) |

### Request flow

```mermaid
flowchart TD
    subgraph Init [Init on mount]
        A1[fetchEmbedSession] --> A2[session_id]
        A2 --> A3[resolveMasterToFork dataset]
        A2 --> A4[resolveMasterToFork KM]
        A3 --> A5[workSessionId, datasetWidgetId]
        A4 --> A6[kmWidgetId]
    end

    subgraph Sync [Debounced sync on selection change]
        B1[User selects dataset/endpoint/gene] --> B2[Effect runs]
        B2 --> B3[setTimeout 150ms]
        B3 --> B4[clearTimeout if deps change again]
        B4 --> B5[After 150ms: patchWorkflow or patchWidgetSettings]
    end
```

### Debouncing

PATCH calls are debounced by 150ms. When the user scrolls rapidly through the dataset list, only the last selection triggers an API call. This avoids rapid-fire requests and ensures the backend receives the final state.

### Key files

- `src/lib/widget-api.ts` — HTTP functions (`fetchEmbedSession`, `resolveMasterToFork`, `patchWorkflowSettings`, `patchWidgetSettings`)
- `src/lib/dataset-browser-sync.ts` — `DatasetBrowserSyncController` orchestrates init and PATCH, with deduplication
- `src/components/DatasetBrowser.svelte` — Creates controller on mount, triggers sync from `$effect` when `selectedDataset`, `activeKMPlotEndpointKey`, or `activeCandidateGene` changes

## Data validation

- Source data is loaded from `src/data/data_summary.json`.
- Runtime schema validation is performed in `src/lib/dataset-schema.ts`.
- Dataset enum-like fields are constrained (`Reproducible`, `NCBI-generated data`).
- `src/pages/index.astro` parses JSON through `parseDatasets(...)` before rendering.

## Security assumptions

- External links open in a new tab with `rel="noopener noreferrer"`.
- Embedded iframes are restricted with:
  - `sandbox="allow-scripts allow-same-origin allow-forms"`
  - `referrerpolicy="strict-origin-when-cross-origin"`
- Download URLs are composed via `new URL(...)` using configured origins.

## Key paths

- `src/pages/index.astro` - page entry and data load boundary
- `src/components/DatasetBrowser.svelte` - top-level UI state and event handling
- `src/components/dataset-browser/` - decomposed UI components
- `src/lib/dataset-browser-sync.ts` - widget session init and PATCH synchronization (workflow + per-widget)
- `src/lib/widget-api.ts` - low-level HTTP functions for widget backend
- `src/lib/dataset-selection.ts` - endpoint selection and normalization helpers
- `src/lib/dataset-utils.ts` - formatting/sort/url/localStorage helpers
- `src/lib/dataset-schema.ts` - runtime data validation schema
- `src/types/dataset.ts` - shared type definitions
