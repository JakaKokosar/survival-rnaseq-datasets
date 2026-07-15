# Repository structure

## What the repository contains

The repository is both a data-processing workspace and the source of static
data for a survival-analysis webapp. GEO studies do not expose expression,
clinical, and survival data in one consistent format, so ingestion is handled
by a dedicated notebook for each GSE. Once a dataset has been prepared, the
remaining stages follow a shared output convention.

For commands and required execution order, use the
[workflow guide](workflows.md). This document explains ownership and purpose;
it is not the execution checklist.

```text
datasets/
├── README.md
├── pyproject.toml
├── uv.lock
├── publish/
│   ├── metadata/
│   └── downloads/
├── resources/
├── geo/
│   ├── GSE<ID>/
│   ├── progress/
│   └── scripts/
└── docs/
```

## Top-level files and directories

### `pyproject.toml` and `uv.lock`

Define and lock the Python and Jupyter environment used by the notebooks and
helper scripts. Run `pnpm data:setup` from the monorepo root or `uv sync` from
this directory.

### `publish/metadata/data_summary.json`

The main dataset catalog used by the webapp. It is generated from completed
per-GSE descriptions and the human-curated inclusion data in
`geo/progress/rnaseq.md`. Do not maintain it independently from those sources.

### `publish/downloads/`

The flat publishing directory for user-facing CSV files. It contains copies of
canonical and preprocessed files plus the required ssGSEA derivative for every
published preprocessed table. The source versions remain in their
`geo/GSE<ID>/` directories.

`geo/scripts/prepare-download-files.py` creates or updates this directory.

### `resources/`

Contains shared inputs used across study workspaces. The Hallmark gene-set JSON
is stored once here instead of being copied into every GSE directory.

## `geo/GSE<ID>/`: one study workspace

Most completed GSE directories contain the following files:

| File | Purpose |
| --- | --- |
| `GSE<ID>_family.soft.gz` | GEO Series and sample metadata downloaded from NCBI. |
| `prepare_data.ipynb` | Dataset-specific ingestion and integration of expression and clinical information. |
| `preprocess_data.ipynb` | Cleans the prepared table, normalizes or filters expression where required, and standardizes survival variables. |
| `ssgsea_analysis.ipynb` | Generates per-sample Hallmark pathway scores from the preprocessed expression matrix. |
| `sa_endpoints_stats.ipynb` | Calculates completeness, event, and censoring statistics for declared survival endpoints. |
| `description.json` | Dataset metadata, file inventory, dimensions, publication links, and survival endpoint information. |
| `GSE<ID>_preprocessed.csv` | Standardized table used by downstream analyses and the webapp. |
| `GSE<ID>_preprocessed_ssgsea.csv` | Clinical data joined with Hallmark ssGSEA scores. |

The exact source files vary by study. A directory may also contain raw-count
archives, author-provided expression matrices, clinical spreadsheets,
converted CSV files, or PDFs used to interpret the cohort.

### Why preparation notebooks differ

Every `prepare_data.ipynb` is study-specific. Depending on the GSE, it may:

- use NCBI-generated raw counts;
- download an author-provided processed matrix;
- read one or more supplementary spreadsheets;
- map sample titles, GSM accessions, patient identifiers, or aliquot IDs;
- convert Ensembl identifiers to gene symbols;
- combine expression with clinical and survival variables;
- manually encode study-specific outcome fields.

This is intentional: the source data are heterogeneous. Do not copy a
preparation notebook to another GSE without reviewing its sample mapping and
survival definitions.

### Completed and incomplete datasets

A normal completed dataset has `description.json` and the downstream
preprocessed files. A directory with `description-todo.json`, or without a
normal description, is still being prepared. The combined webapp catalog also
depends on the dataset being marked `Include: YES` in the progress file.

## `geo/progress/`

`geo/progress/rnaseq.md` is the human curation layer. It records whether a GSE
should be included and contains notes about reproducibility, scope, experiment
type, and NCBI-generated data. The catalog-building script joins these entries
with the per-GSE descriptions.

## `geo/scripts/`

### Routine pipeline scripts

| Script | Purpose |
| --- | --- |
| `bulk_execute_geo_notebooks.py` | Finds a requested notebook filename in all GSE directories and executes every match in place. |
| `combine_summaries_and_progress.py` | Combines included descriptions with curation status and writes `publish/metadata/data_summary.json`. |
| `prepare-download-files.py` | Copies declared base files and required ssGSEA derivatives into `publish/downloads/`. |

### Description and metadata support

| File | Purpose |
| --- | --- |
| `generate_descriptions.py` | Functions used by notebooks to derive dataset descriptions and annotations from GEO metadata, linked articles, and supplements. |
| `helpers.py` | Download/cache helpers, article parsing, GEO URL construction, and prompts used by description generation. |
| `data/gse_to_pmcids.json` | Canonical mapping between GEO Series and linked PubMed Central articles. |

### Discovery and webapp-generation notebooks

| Notebook | Purpose |
| --- | --- |
| `01-parse-geo-metadata.ipynb` | Builds GSE/PMCID mappings, collects GEO experiment metadata, and filters high-throughput expression studies during dataset discovery. |
| `gse_annotations/gse_annotation_prompts.ipynb` | Generates missing cancer descriptions and sample-origin annotations for datasets already present in `publish/metadata/data_summary.json`. |
| `gse_citations/pmcid_to_citation.ipynb` | Generates a short citation for each unique PMCID referenced by included datasets. |

The discovery notebook relies on upstream tables outside the routine per-GSE
pipeline. The annotation and citation notebooks produce the remaining webapp
JSON lookup files, call external services, and save progress after each
generated item.

## Generated versus canonical files

Use these ownership rules when editing:

- Edit or regenerate source data and metadata inside `geo/GSE<ID>/`.
- Edit inclusion and curation status in `geo/progress/rnaseq.md`.
- Regenerate `publish/metadata/data_summary.json`; do not let it diverge from those sources.
- Regenerate copies in `publish/downloads/`; do not use them as inputs for GSE notebooks.
- Review generated annotations and citations before publishing them.
