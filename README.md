# Survival Analysis Datasets Browser

An Astro + Svelte 5 application for exploring GEO datasets used in survival analysis research.

## Current state

- Svelte 5 runes-based UI with decomposed dataset-browser components
- Strict TypeScript + runtime schema validation (Zod)
- URL-synced dataset selection/sort (`selected`, `sort`, `dir` query params)
- Accessible keyboard patterns for table navigation, mobile tabs, and panel toggles
- Local Kaplan-Meier plotting from the tracked sample CSV fixture

## Stack

- Astro 5
- Svelte 5 (Runes API)
- TypeScript (strict mode)
- Tailwind CSS 4

## What the app does

- Displays survival-analysis datasets in a sortable table
- Shows dataset details, endpoints, publications, and file downloads
- Synchronizes selection/sort state to URL parameters
- Includes a local Kaplan-Meier panel with endpoint, grouping, confidence interval, median, and censoring controls

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

Run tests:

```bash
npm test
```

## Testing

The project uses `vitest` with a `jsdom` environment for component tests. The config lives in `vitest.config.ts` and currently discovers:

- colocated component/unit tests under `src/**/*.test.ts`
- top-level integration/e2e/supporting tests under `tests/**/*.test.ts`

### Test structure

Use this convention for future work:

- Component and unit tests live next to the component or module they verify.
- Shared test helpers, fixtures, global setup, and broader integration tests live under `tests/`.

Examples:

```text
src/components/dataset-browser/KmPlotPanel.svelte
src/components/dataset-browser/KmPlotPanel.test.ts

src/lib/dataset-selection.ts
src/lib/dataset-selection.test.ts

tests/setup.ts
tests/helpers/
tests/fixtures/
tests/integration/
```

### Guidance for future agents

- Prefer small colocated tests when verifying a single component or utility.
- Put reusable render helpers, fixtures, and mock setup in `tests/` instead of duplicating them beside components.
- Keep integration-style tests out of `src/` when they span multiple components or app flows.
- When adding global test setup later, register `tests/setup.ts` from `vitest.config.ts` rather than repeating setup inside each test file.

## Environment variables

No environment variables are required for local development or production builds.

**Dev vs production:** Vite loads env files by mode:
- `astro dev` → `.env.development`
- `astro build` → `.env.production`

Copy `.env.example` only if future local-only variables are added.

## Data validation

- Source data is loaded from `src/data/data_summary.json`.
- The local Kaplan-Meier panel currently renders from the tracked `test-sample.csv` fixture.
- Runtime schema validation is performed in `src/lib/dataset-schema.ts`.
- Dataset enum-like fields are constrained (`Reproducible`, `NCBI-generated data`).
- `src/pages/index.astro` parses JSON through `parseDatasets(...)` before rendering.

## Security assumptions

- External links open in a new tab with `rel="noopener noreferrer"`.
- Download URLs point to `/downloads/<filename>` on the app origin.

## Key paths

- `src/pages/index.astro` - page entry and data load boundary
- `src/components/DatasetBrowser.svelte` - top-level UI state and event handling
- `src/components/dataset-browser/` - decomposed UI components
- `src/lib/km.ts` - CSV parsing and Kaplan-Meier estimate helpers
- `src/lib/dataset-selection.ts` - endpoint selection and normalization helpers
- `src/lib/dataset-utils.ts` - formatting/sort/url/localStorage helpers
- `src/lib/dataset-schema.ts` - runtime data validation schema
- `src/types/dataset.ts` - shared type definitions
