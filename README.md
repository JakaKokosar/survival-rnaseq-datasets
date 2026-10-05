[![Dataset DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22145582.svg)](https://doi.org/10.5281/zenodo.22145582)
[![Code DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21900172.svg)](https://doi.org/10.5281/zenodo.21900172)


# Survival RNA-seq data monorepo

Astro/Svelte dataset browser plus Python/Jupyter workflows for literature
retrieval, dataset curation, metadata, and downloadable CSVs.

## Packages

| Path | Docs |
|------|------|
| [apps/web](apps/web/README.md) | Astro app — dev, build, deploy |
| [datasets](datasets/README.md) | Data pipeline — GSE workspaces, assembly, workflows |
| [pubmed-retrieval](pubmed-retrieval/README.md) | Literature retrieval — discover and filter GEO RNA-seq datasets with survival data |

Published artifacts consumed by the webapp:

- `datasets/publish/metadata/` — committed JSON (build input)
- `datasets/publish/downloads/` — generated CSVs served at `/downloads/`

## Setup

```bash
pnpm install
pnpm data:setup
cp datasets/.env.example datasets/.env
```

Set `OPENAI_API_KEY` in `datasets/.env` for OpenAI-backed pipeline stages.

The PubMed retrieval workflow uses its own `uv` environment. See
[pubmed-retrieval/README.md](pubmed-retrieval/README.md) for setup and execution
instructions.

## Common commands

```bash
pnpm data:assemble   # publish and validate web-facing artifacts
pnpm dev             # Astro development mode
pnpm build           # build the web application
pnpm test            # Python and web tests
```

## Agents

See [AGENTS.md](AGENTS.md) for cross-cutting rules and pointers to package-specific documentation.
