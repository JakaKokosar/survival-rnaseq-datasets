# AGENTS.md - Coding Agent Guidelines

This document provides essential information for AI coding agents working in this repository.

## Project Overview

- **Framework**: Astro 5.x (Static Site Generator)
- **Styling**: Tailwind CSS v4.x
- **Interactivity**: Svelte 5 (via `@astrojs/svelte` integration)
- **Language**: TypeScript (strict mode)
- **Package Manager**: npm

## Current Application Status

### What This App Does
A **Survival Analysis Datasets Browser** - displays a collection of GEO (Gene Expression Omnibus) datasets used for survival analysis research. Users can browse datasets in a sortable table and view detailed information about each dataset.

### Main Features (Implemented)
1. **Sortable Dataset Table** - Columns: GSE ID, Endpoints (badges), Exp Type, Reproducible, NCBI Data, Samples
2. **Detail View Panel** - Shows selected dataset's summary statistics, PMC IDs, survival endpoints, and links to NCBI GEO
3. **Resizable Split Panel** - Desktop: draggable divider between table and detail view (persisted to localStorage)
4. **Responsive Mobile View** - Tab-based navigation switching between "List" and "Details" views on screens < 1024px
5. **Auto-switch on Selection** - Clicking a row on mobile automatically switches to Details tab
6. **URL State Sync** - Selection and sort state synced to URL parameters
7. **Keyboard Navigation** - Full keyboard support for table navigation (arrow keys, Home/End, Enter, Escape)

### Key Files
- `src/pages/index.astro` - Main page shell, imports data and renders Svelte component
- `src/components/DatasetBrowser.svelte` - Main interactive component with all UI logic
- `src/lib/dataset-utils.ts` - Utility functions for formatting, sorting, URL/localStorage management
- `src/types/dataset.ts` - TypeScript type definitions
- `src/data/data_summary.json` - Dataset source (imported at build time)
- `src/components/AppHeader.astro` - Header component
- `src/layouts/Layout.astro` - Base layout

### Data Structure
Each dataset in `data_summary.json` contains:
```typescript
interface Dataset {
  data_id: string;                    // e.g., "GSE96058"
  data_url: string;                   // NCBI GEO URL
  pmcids: string[];                   // Related PMC article IDs
  'survival-endpoints': SurvivalEndpoint[];
  data_summary: {
    samples: number;
    clinical_features: number;
    genes: number;
  };
  'Experiment type': string;          // Full description
  Reproducible: string;               // "YES" | "NO" | "PARTIALLY"
  'NCBI-generated data': string;      // "Available" | other
  Notes?: string;                     // Optional dataset notes
  iframe_urls?: {                     // Optional embedded data viewers
    table: string;
    plot: string;
  };
}
```

### UI Layout Structure
```
Desktop (≥1024px):                    Mobile (<1024px):
┌─────────────────────────────┐       ┌─────────────────────────┐
│  Header                     │       │  Header                 │
├───────────────┬─┬───────────┤       ├─────────────────────────┤
│               │║│           │       │  [List]  [Details]      │  ← Tab bar
│  Table        │║│  Details  │       ├─────────────────────────┤
│  (sortable)   │║│  Panel    │       │                         │
│               │║│           │       │  Active tab content     │
│               │║│           │       │                         │
└───────────────┴─┴───────────┘       └─────────────────────────┘
                 ↑
            Draggable divider
```

## Build, Test & Development Commands

### Core Commands
```bash
npm install              # Install dependencies
npm run dev              # Start dev server at localhost:4321
npm run build            # Build production site to ./dist/
npm run preview          # Preview production build locally
npm run astro            # Run Astro CLI commands
npm run deploy           # Build and deploy to Cloudflare Pages
```

### Astro CLI Commands
```bash
npm run astro check      # Type-check Astro files
npm run astro add        # Add integrations
npm run astro -- --help  # Show all CLI options
```

### Testing
**Note**: No test framework is currently configured. If adding tests:
- Consider using Vitest for unit tests
- Use Playwright or Cypress for E2E tests
- Add test scripts to package.json

## Project Structure

```
/
├── public/              # Static assets (served as-is)
│   └── favicon.svg
├── src/
│   ├── assets/         # Images, SVGs (processed by Astro)
│   ├── components/     # Reusable components (Astro + Svelte)
│   ├── data/           # JSON data files (imported at build time)
│   ├── layouts/        # Page layouts
│   ├── lib/            # Utility functions and helpers
│   ├── pages/          # File-based routing (each file = route)
│   ├── styles/         # Global CSS files
│   └── types/          # TypeScript type definitions
├── astro.config.mjs    # Astro configuration
├── tsconfig.json       # TypeScript configuration
└── package.json        # Dependencies and scripts
```

## Code Style Guidelines

### TypeScript Configuration
- **Strict Mode**: Enabled via `astro/tsconfigs/strict`
- All code must pass TypeScript strict checks
- No implicit `any` types allowed
- Explicitly type function parameters and return values

### Import Conventions

**Astro Components**:
```astro
---
// Framework imports first
import { defineConfig } from 'astro/config';

// Local component imports (relative paths)
import Layout from '../layouts/Layout.astro';
import AppHeader from '../components/AppHeader.astro';
import DatasetBrowser from '../components/DatasetBrowser.svelte';

// Data imports (JSON files)
import rawData from '../data/data_summary.json';
import type { Dataset } from '../types/dataset';

// Asset imports
import astroLogo from '../assets/astro.svg';

// CSS imports
import '../styles/global.css';
---
```

**Svelte Components**:
```svelte
<script lang="ts">
  // Svelte imports
  import { onMount } from 'svelte';
  
  // Type imports
  import type { Dataset } from '../types/dataset';
  
  // Utility imports
  import { sortDatasets } from '../lib/dataset-utils';
</script>
```

**Import Order**:
1. Third-party packages (astro, svelte, etc.)
2. Type imports
3. Local component imports (layouts, then components)
4. Utility imports (from `src/lib/`)
5. Data imports (JSON files from `src/data/`)
6. Assets (images, SVGs)
7. Stylesheets

**Path Style**: Use relative imports with explicit extensions for local files.

### Naming Conventions

**Files & Components**:
- Astro components: `PascalCase.astro` (e.g., `AppHeader.astro`, `Layout.astro`)
- Svelte components: `PascalCase.svelte` (e.g., `DatasetBrowser.svelte`)
- TypeScript files: `camelCase.ts` (utilities) or `PascalCase.ts` (types)
- Pages: `kebab-case.astro` or `index.astro`
- CSS files: `kebab-case.css` (e.g., `global.css`)

**Variables & Functions**:
- Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE` or `camelCase`
- Functions: `camelCase`
- Components: `PascalCase`
- Types/Interfaces: `PascalCase`

### Styling Approach

**Tailwind CSS v4**:
- Primary styling method via `@tailwindcss/vite` plugin
- Import with `@import "tailwindcss";` in CSS files
- Use Tailwind utility classes in components

**Styling Philosophy**:
- **Prefer Tailwind utilities over custom CSS** for consistency
- Use scoped `<style>` blocks only when Tailwind is insufficient
- Global styles in `src/styles/global.css` (Tailwind import only)

**CSS Conventions**:
- Use modern CSS (flexbox, grid)
- Mobile-first responsive design
- Tailwind-first approach for all new components

### HTML & Accessibility
- Use semantic HTML elements
- Include proper `alt` attributes for images
- Set `fetchpriority="high"` for critical images
- Maintain proper heading hierarchy (h1 → h2 → h3)
- Use `<meta name="viewport">` for responsive design
- Implement proper ARIA attributes for interactive components
- Ensure keyboard navigation support

### Error Handling
- Type-check all code before committing
- Handle async operations properly
- Validate props with TypeScript interfaces
- Provide sensible defaults for optional props

### Comments
- Use JSDoc-style comments for public APIs
- Inline comments for complex logic only
- Component purpose should be clear from structure/naming
- Link to external docs when relevant

## Svelte 5 Patterns

This project uses **Svelte 5** with the new **Runes API** for reactivity.

### Component Definition (Svelte 5)
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Dataset } from '../types/dataset';

  // Props - use $props() rune
  interface Props {
    datasets: Dataset[];
  }
  let { datasets }: Props = $props();

  // State - use $state() rune
  let selectedId: string | null = $state(null);
  let sortColumn: string | null = $state('samples');
  let isDragging = $state(false);

  // Derived state - use $derived() or $derived.by()
  let sortedDatasets = $derived.by(() => sortDatasets(datasets, sortColumn, sortDirection));
  let selectedDataset = $derived(
    selectedId ? datasets.find((d) => d.data_id === selectedId) ?? null : null
  );

  // Refs (plain variables for DOM elements)
  let mainEl: HTMLElement;
  let listTabEl: HTMLButtonElement;

  // Lifecycle
  onMount(() => {
    // Initialization logic
  });

  // Event handlers
  function selectDataset(id: string) {
    selectedId = id;
  }
</script>
```

### Key Svelte 5 Runes
- `$props()` - Declare component props (replaces `export let`)
- `$state()` - Create reactive state (replaces top-level `let` declarations)
- `$derived()` / `$derived.by()` - Create derived/computed values
- `$effect()` - Run side effects when dependencies change
- `$effect.pre()` - Run before DOM updates
- `$effect.root()` - Create a non-tracked effect scope

### Event Handling in Svelte
```svelte
<!-- Click events -->
<button onclick={() => selectDataset(dataset.data_id)}>
  Select
</button>

<!-- Keyboard events -->
<div 
  role="listbox"
  onkeydown={(e) => handleKeydown(e)}
  onfocus={() => handleFocus()}
>
  <!-- items -->
</div>

<!-- Prevent default -->
<button onclick={(e) => { e.preventDefault(); doSomething(); }}>
  Click
</button>

<!-- Window events -->
<svelte:window onresize={() => (isDesktop = window.innerWidth >= 1024)} />
```

### Conditional Rendering
```svelte
{#if selectedDataset}
  <div>Details for {selectedDataset.data_id}</div>
{:else}
  <div>Select a dataset</div>
{/if}

{#each sortedDatasets as dataset, index (dataset.data_id)}
  <tr id="row-{dataset.data_id}">
    <!-- row content -->
  </tr>
{/each}
```

### Binding to DOM Elements
```svelte
<script lang="ts">
  let mainEl: HTMLElement;
  let inputEl: HTMLInputElement;
</script>

<main bind:this={mainEl}>
  <input bind:this={inputEl} />
</main>
```

### Astro + Svelte Integration

**Using Svelte Components in Astro**:
```astro
---
import DatasetBrowser from '../components/DatasetBrowser.svelte';
import data from '../data/data_summary.json';
---

<!-- Client-side only hydration -->
<DatasetBrowser datasets={data} client:only="svelte" />

<!-- Or with visible hydration -->
<DatasetBrowser datasets={data} client:load />
```

**Client Directives**:
- `client:only="svelte"` - Only render on client, no server rendering
- `client:load` - Hydrate immediately when page loads
- `client:idle` - Hydrate when browser is idle
- `client:visible` - Hydrate when component becomes visible
- `client:media="(min-width: 768px)"` - Hydrate based on media query

### localStorage for User Preferences
Persist user preferences across sessions:
```typescript
// In lib/dataset-utils.ts
const SPLIT_RATIO_KEY = 'datasetBrowserSplitRatio';
const SPLIT_RATIO_DEFAULT = 45;

export function readSplitRatio(): number {
  const stored = parseFloat(localStorage.getItem(SPLIT_RATIO_KEY) ?? '');
  return Number.isFinite(stored) ? stored : SPLIT_RATIO_DEFAULT;
}

export function saveSplitRatio(ratio: number): void {
  localStorage.setItem(SPLIT_RATIO_KEY, String(ratio));
}
```

### URL State Management
Sync state to URL for shareable links:
```typescript
// Reading URL params
export function readUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    selected: params.get('selected'),
    sort: params.get('sort'),
    direction: params.get('dir'),
  };
}

// Updating URL params
export function updateUrlParams(selectedId, sortColumn, sortDirection) {
  const params = new URLSearchParams();
  if (selectedId) params.set('selected', selectedId);
  if (sortColumn) params.set('sort', sortColumn);
  if (sortDirection) params.set('dir', sortDirection);
  history.replaceState(null, '', `${window.location.pathname}?${params}`);
}
```

## Best Practices

1. **Type Safety**: Always use TypeScript strict mode features
2. **Component Props**: Define interfaces for all component props
3. **Asset Optimization**: Use Astro's asset pipeline for images
4. **Performance**: Use appropriate client directives for Svelte components
5. **Routing**: Use file-based routing in `src/pages/`
6. **Layouts**: Extract common page structure to `src/layouts/`
7. **Reusability**: Create small, focused components in `src/components/`
8. **Utilities**: Extract shared logic to `src/lib/`
9. **Types**: Define shared types in `src/types/`

## Development Workflow

1. **Starting Development**:
   ```bash
   npm install
   npm run dev
   ```

2. **Before Committing**:
   ```bash
   npm run build        # Ensure build succeeds
   npm run astro check  # Type-check all files
   ```

3. **Adding Features**:
   - **Pages**: Add `.astro` files to `src/pages/`
   - **Interactive Components**: Add `.svelte` files to `src/components/`
   - **Static Components**: Add `.astro` files to `src/components/`
   - **Utilities**: Add to `src/lib/`
   - **Types**: Add to `src/types/`
   - **Data files**: Add JSON to `src/data/`
   - **Styles**: Use Tailwind or add to `src/styles/`
   - **Static assets**: Add to `public/`

4. **Configuration Changes**:
   - Astro config: `astro.config.mjs`
   - TypeScript config: `tsconfig.json`
   - Tailwind: Configure via Vite plugin in astro.config
   - Svelte: Configure via `@astrojs/svelte` integration

## Common Pitfalls

- **Assets vs Public**: Use `src/assets/` for processed images, `public/` for static files
- **Svelte Hydration**: Use appropriate `client:*` directive for Svelte components
- **Props in Svelte 5**: Use `$props()` rune, not `export let`
- **State in Svelte 5**: Use `$state()` rune for reactive values
- **Derived in Svelte 5**: Use `$derived()` or `$derived.by()` for computed values
- **Imports**: Astro components need `.astro` extension, Svelte need `.svelte`
- **CSS Scope**: Astro `<style>` is scoped; Svelte styles are scoped by default

## Resources

- [Astro Documentation](https://docs.astro.build)
- [Svelte 5 Documentation](https://svelte.dev/docs/svelte)
- [Svelte 5 Runes](https://svelte.dev/docs/svelte/what-are-runes)
- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
