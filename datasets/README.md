# Survival RNA-seq datasets

This project prepares public GEO RNA-seq cancer datasets for survival analysis.
Each GEO Series has a study-specific workspace under `geo/GSE<ID>/`; shared
downstream processing produces the metadata and CSV files used by the webapp.

## Start here

- [Rebuild all generated assets](docs/workflows.md#rebuild-all-generated-assets)
- [Process or update one GSE](docs/workflows.md#process-or-update-one-gse)
- [Run one notebook stage in bulk](docs/workflows.md#execute-one-notebook-stage-in-bulk)
- [Understand the repository structure](docs/repository-structure.md)

`docs/workflows.md` is the canonical source for commands and execution order.

Deploying published downloads to the production server is documented in
[apps/web/docs/deploy.md](../apps/web/docs/deploy.md).

## Setup

From the monorepo root:

```bash
pnpm data:setup
cp datasets/.env.example datasets/.env
```

This runs `uv sync --project datasets` against the committed `uv.lock`. GEO
downloads require network access. Set `OPENAI_API_KEY` in `datasets/.env`
for OpenAI-backed description, annotation, and citation generation. Pass the
file with `uv run --env-file .env` when executing a stage that requires it;
notebook subprocesses inherit the variable automatically.

## Published artifacts

- `publish/metadata/data_summary.json`: combined catalog of included datasets;
- `publish/metadata/geo_series_summaries.json`: reviewed dataset annotations;
- `publish/metadata/sample_origin.json`: sample-origin annotations;
- `publish/metadata/pmcid_to_citation.json`: publication citations;
- `publish/downloads/`: flat collection of server-ready CSV files.

Canonical study data lives under `geo/GSE<ID>/`. Files in `publish/downloads/`
are generated copies and should not be edited directly.
