# Web application

Astro/Svelte dataset browser for survival RNA-seq metadata and downloads.

## Data sources

At build time the app imports committed JSON from `datasets/publish/metadata/`.
In development, `astro.config.mjs` serves `datasets/publish/downloads/` at `/downloads/`.
Do not copy metadata or downloads into `apps/web/src/`.

## Commands

Run from the monorepo root:

```bash
pnpm dev             # Astro dev server
pnpm build           # production build → apps/web/dist/
pnpm test:web        # Vitest
```

## Documentation

- [Deploy to Caddy](docs/deploy.md) — upload built site and published downloads

## Environment

No environment variables are required for local development or production builds.
See `.env.example` if local-only variables are added later.

Deploy credentials live in `apps/web/.env.deploy`; see [docs/deploy.md](docs/deploy.md).
