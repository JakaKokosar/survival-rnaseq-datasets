# Survival RNA-seq data monorepo

This repository contains the Astro/Svelte dataset browser and the Python/Jupyter
pipeline that produces its metadata and downloadable CSV files.

## Repository layout

```text
apps/web/                   Astro/Svelte web application
datasets/                   canonical study workspaces and data pipeline
datasets/publish/metadata/  committed JSON consumed at web build time
datasets/publish/downloads/ generated flat CSV directory served at /downloads
```

The webapp never maintains a second copy of generated metadata. Local development
serves `datasets/publish/downloads/` at the same `/downloads/<filename>` paths used
by the production Caddy server.

## Setup

```bash
pnpm install
pnpm data:setup
cp datasets/.env.example datasets/.env
```

Set `OPENAI_API_KEY` in `datasets/.env`. The file is ignored by Git.

## Common commands

```bash
pnpm data:assemble   # publish existing per-study outputs
pnpm dev             # start Astro development mode
pnpm build           # build the Astro web application
pnpm test            # run Python and web tests
```

Regenerate canonical per-study outputs by running the four bulk notebook stages
in their documented order, reviewing failures after each stage, and then run
`pnpm data:assemble` to refresh and validate the web-facing artifacts.

Those bulk commands reprocess GSE workspaces that are already registered in the
repository. They do not fully onboard a new GSE. A new study can require source
files, a study-specific preparation notebook, publication mapping, inclusion
curation, annotation, and citation generation before it can be assembled.

See [datasets/docs/workflows.md](datasets/docs/workflows.md) for the canonical
stage order and the complete new-GSE procedure.

## Caddy deployment

Build the static application with `pnpm build` and deploy `apps/web/dist/` as the
site root. Synchronize the contents of `datasets/publish/downloads/` to the
directory Caddy exposes at `/downloads/` on the same origin.

`pnpm data:assemble` validates that every file referenced by the published
dataset catalog exists before the production downloads are updated.
