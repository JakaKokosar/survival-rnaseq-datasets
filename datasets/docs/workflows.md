# Dataset workflows

Unless noted otherwise, run commands from the top-level `datasets/` directory.
Use `uv run` for Python scripts. The nbconvert commands below execute each
notebook with its notebook directory as the kernel working directory, which is
required because the notebooks use relative paths.

Run each bulk notebook stage separately in the canonical sequence below and
review its failure summary before continuing. After the canonical per-GSE
outputs are complete, run `pnpm data:assemble` from the monorepo root to refresh
and validate the web-facing publish directory.
Before running preparation, copy `.env.example` to `.env` and set
`OPENAI_API_KEY`; `uv run --env-file .env` passes it to child notebooks.

## Rebuild all generated assets

For a full rebuild, including canonical per-GSE inputs that are not stored in a
fresh checkout, run these commands in order:

```bash
uv run --env-file .env geo/scripts/bulk_execute_geo_notebooks.py -n prepare_data.ipynb
uv run geo/scripts/bulk_execute_geo_notebooks.py -n preprocess_data.ipynb
uv run geo/scripts/bulk_execute_geo_notebooks.py -n ssgsea_analysis.ipynb
uv run geo/scripts/bulk_execute_geo_notebooks.py -n sa_endpoints_stats.ipynb

uv run geo/scripts/combine_summaries_and_progress.py

uv run --env-file .env python -m nbconvert --execute --to notebook --inplace \
  geo/scripts/gse_annotations/gse_annotation_prompts.ipynb

uv run --env-file .env python -m nbconvert --execute --to notebook --inplace \
  geo/scripts/gse_citations/pmcid_to_citation.ipynb

uv run geo/scripts/prepare-download-files.py
```

This sequence reprocesses GSE workspaces that are already present and correctly
registered in the repository. It is not, by itself, a procedure for adding a
new GSE: the bulk runner only discovers notebooks that already exist.

A new GSE may need study-specific source files and preparation logic. It must
also be connected to its publication metadata, reviewed for sample joins and
survival endpoint encoding, added to the inclusion list, and given the required
web annotations and citations. Follow the
[end-to-end publication workflow](#end-to-end-publication-workflow) for that
work. Only use the bulk sequence above after the new workspace and its metadata
have been prepared.

This rebuilds the canonical per-GSE inputs, derived CSVs, committed metadata,
citations, and `publish/downloads/*.csv`. The preparation stage runs every
study-specific `prepare_data.ipynb`; review failures carefully because these
notebooks have different downloads, joins, local-input requirements, and
overwrite behavior.

Check the bulk runner's failure summary before using the outputs. Annotation
and citation generation requires network access and `OPENAI_API_KEY`.

From the monorepo root, `pnpm data:assemble` replaces the catalog and download
assembly commands above when annotation and citation metadata are already
current. It validates the complete published artifact set before returning.

## End-to-end publication workflow

Use this detailed workflow when adding a new GSE. The four bulk commands alone
are insufficient because they cannot create or curate a study workspace,
publication mapping, inclusion status, annotations, or citations. Later steps
depend on files produced by earlier steps.

### 1. Set up the Python environment

Create or update the locked local environment:

```bash
uv sync
```

From the monorepo root, the equivalent command is `pnpm data:setup`.

Notebook execution also requires a usable Jupyter kernel. Description,
annotation, citation, and download steps require network access; OpenAI-backed
steps require `OPENAI_API_KEY` in the environment.

### 2. Register the GSE-to-publication relationship

Before generating a new description, ensure the GSE is associated with its
linked PubMed Central article IDs in the canonical mapping:

- `geo/scripts/data/gse_to_pmcids.json`.

Use `geo/scripts/01-parse-geo-metadata.ipynb` only when rebuilding the broader
discovery data from its upstream source table. For an individual selected GSE,
add or verify its mapping before running description generation. The discovery
notebook preserves existing canonical entries when it adds newly discovered
GSEs.

### 3. Prepare the individual GSE

Create or update `geo/GSE<ID>/`, place required author supplements there, and
run its preparation notebook:

```bash
GSE_ID=GSE100797
uv run --env-file .env python -m nbconvert --execute --to notebook --inplace \
  "geo/$GSE_ID/prepare_data.ipynb"
```

Required results before continuing:

- a canonical expression-and-clinical CSV, such as
  `GSE<ID>_raw_counts_NCBI.csv` or `GSE<ID>_original.csv`;
- `description.json` naming that file and recording dataset dimensions and
  survival endpoints.

The preparation notebook may create the description through
`geo/scripts/generate_descriptions.py`. Review the generated metadata and the
study-specific sample joins before continuing.

### 4. Produce the standardized preprocessed table

Run the preprocessing notebook:

```bash
uv run python -m nbconvert --execute --to notebook --inplace \
  "geo/$GSE_ID/preprocess_data.ipynb"
```

It must produce `GSE<ID>_preprocessed.csv` and add that filename to
`description.json`.

Confirm that clinical columns precede gene columns and that declared survival
time/event variables are numeric and use the intended event encoding.

### 5. Produce the ssGSEA table

Run the ssGSEA notebook:

```bash
uv run python -m nbconvert --execute --to notebook --inplace \
  "geo/$GSE_ID/ssgsea_analysis.ipynb"
```

It reads the preprocessed CSV, description, and the shared Hallmark gene-set
JSON at `resources/h.all.v2026.1.Hs.json` and writes:

```text
GSE<ID>_preprocessed_ssgsea.csv
```

Check the dataset-specific sample identifier configured in the notebook.

### 6. Add endpoint statistics to the description

Run the endpoint-statistics notebook:

```bash
uv run python -m nbconvert --execute --to notebook --inplace \
  "geo/$GSE_ID/sa_endpoints_stats.ipynb"
```

It updates the survival endpoints inside `description.json` with completeness,
event, and censoring statistics.

At this point, the per-GSE source metadata, canonical table, preprocessed table,
ssGSEA table, and endpoint statistics should all be complete.

### 7. Curate inclusion status

Add or update the GSE entry in `geo/progress/rnaseq.md`. Set `Include: YES`
only after its description and expected data files are ready. The catalog
builder excludes datasets without a normal `description.json`, datasets absent
from the progress file, and entries not marked for inclusion.

### 8. Build the main webapp catalog

From `datasets/`, run:

```bash
uv run geo/scripts/combine_summaries_and_progress.py
```

This writes the authoritative included-dataset catalog:

```text
publish/metadata/data_summary.json
```

Build this before annotations and citations because those notebooks obtain
their GSE and PMCID work lists from `publish/metadata/data_summary.json`.

### 9. Build dataset annotation JSON files

Execute the annotation notebook:

```bash
uv run python -m nbconvert --execute --to notebook --inplace \
  geo/scripts/gse_annotations/gse_annotation_prompts.ipynb
```

Complete both notebook sections so it updates:

```text
publish/metadata/geo_series_summaries.json
publish/metadata/sample_origin.json
```

The notebook skips GSE IDs already present and writes after each new result.
Review the generated descriptions, cancer labels, and cohort countries.

### 10. Build the citation JSON file

Execute the citation notebook:

```bash
uv run python -m nbconvert --execute --to notebook --inplace \
  geo/scripts/gse_citations/pmcid_to_citation.ipynb
```

It reads unique PMCIDs from `publish/metadata/data_summary.json` and updates:

```text
publish/metadata/pmcid_to_citation.json
```

It skips existing PMCIDs and writes after each new citation.

### 11. Assemble downloadable webapp files

From the monorepo root, `pnpm data:assemble` performs the catalog, download
assembly, and validation steps.

From `datasets/`, run:

```bash
uv run geo/scripts/prepare-download-files.py
```

This copies the canonical and preprocessed files declared by each GSE together
with the required ssGSEA derivative into `publish/downloads/`.

### 12. Verify the final webapp asset set

The current pipeline is complete when these outputs are present and current:

```text
publish/metadata/data_summary.json
publish/downloads/*.csv
publish/metadata/geo_series_summaries.json
publish/metadata/sample_origin.json
publish/metadata/pmcid_to_citation.json
```

Verify that every included GSE appears in the main catalog and both annotation
files, that every referenced PMCID has a citation, and that every expected base,
preprocessed, and ssGSEA file has been copied into `publish/downloads/`.

For a bulk rebuild, steps 3–6 can be run across all GSE directories with the
bulk runner described below. Keep the stage order unchanged. Review preparation
failures and outputs carefully because those notebooks are not uniform.

## Process or update one GSE

### 1. Inspect the study inputs

Open the target `geo/GSE<ID>/prepare_data.ipynb` and identify:

- GEO metadata and expression URLs;
- local author supplements;
- the identifier used to join expression and clinical data;
- survival time and event variables;
- the canonical CSV filename written by the notebook.

Preparation notebooks are bespoke. Re-running one may download large files and
overwrite its canonical CSV or `description.json`.

### 2. Run `prepare_data.ipynb`

Execute it with the command from the end-to-end workflow above. Its normal
responsibilities are:

1. load GEO Series/sample metadata;
2. load raw or author-processed expression data;
3. construct the study-specific clinical table;
4. align samples and genes;
5. write a canonical combined CSV;
6. create or update `description.json` with file names and dataset dimensions.

After execution, check the number of matched samples, duplicate identifiers,
missing survival fields, gene identifier type, and the files named in the
description.

### 3. Run `preprocess_data.ipynb`

This notebook expects the preparation output and `description.json`. The exact
transformations vary, but completed notebooks generally:

- separate clinical and gene columns using the recorded clinical-column count;
- remove unsuitable or low-information genes;
- keep active protein-coding genes where applicable;
- apply any dataset-specific expression transformation;
- convert survival time and event variables to numeric values;
- order survival variables before the remaining clinical and gene columns;
- write `GSE<ID>_preprocessed.csv` and register it in the description.

Confirm that event values have the intended `0 = censored`, `1 = event`
meaning before calculating endpoint statistics.

### 4. Run `ssgsea_analysis.ipynb`

Inputs:

- `GSE<ID>_preprocessed.csv`;
- `description.json`;
- `resources/h.all.v2026.1.Hs.json`, shared by every GSE notebook.

The notebook selects the gene-expression columns, computes single-sample GSEA
for the 50 Hallmark gene sets, joins the scores to the clinical columns, and
writes `GSE<ID>_preprocessed_ssgsea.csv`.

Check the notebook's `sample_id_column` before running it. Some cohorts use a
different sample identifier and therefore have a slightly different notebook
variant.

### 5. Run `sa_endpoints_stats.ipynb`

The notebook reads the preprocessed table and updates each usable endpoint in
`description.json` with counts of complete records, incomplete records,
censored cases, observed events, and the censoring ratio. An endpoint is
skipped when its named columns are not present.

## Execute one notebook stage in bulk

Use `geo/scripts/bulk_execute_geo_notebooks.py` with an exact notebook
basename:

```bash
uv run geo/scripts/bulk_execute_geo_notebooks.py -n prepare_data.ipynb
uv run geo/scripts/bulk_execute_geo_notebooks.py -n preprocess_data.ipynb
uv run geo/scripts/bulk_execute_geo_notebooks.py -n ssgsea_analysis.ipynb
uv run geo/scripts/bulk_execute_geo_notebooks.py -n sa_endpoints_stats.ipynb
```

The runner:

1. discovers matching notebooks below `geo/`;
2. executes each with nbconvert;
3. writes execution counts and outputs back into the notebook;
4. continues when a notebook fails;
5. prints all failed notebook paths at the end;
6. exits non-zero if any execution failed.

Run one stage per command so dependencies remain clear. The normal order is
preparation, preprocessing, ssGSEA, then endpoint statistics. Review the
preparation results carefully because every preparation notebook has different
downloads, joins, local-input requirements, and overwrite behavior.

The runner accepts only a filename such as `ssgsea_analysis.ipynb`, not a path.
Passing `-n` more than once executes multiple notebook types in one process,
but separate commands make failures easier to isolate.

## Rebuild the webapp dataset catalog

First ensure that each publishable GSE has an up-to-date `description.json` and
the intended entry in `geo/progress/rnaseq.md`. Then run:

```bash
uv run geo/scripts/combine_summaries_and_progress.py
```

The script:

- finds GSE directories containing `description.json`;
- reads the curation entries from `geo/progress/rnaseq.md`;
- keeps entries marked `Include: YES`;
- adds candidate gene names derived from the preprocessed table header;
- writes the combined catalog to `publish/metadata/data_summary.json`.

The output path is resolved from the script location, so it is not dependent on
the current working directory.

## Assemble the published CSV files

Run:

```bash
uv run geo/scripts/prepare-download-files.py
```

For every dataset included in `publish/metadata/data_summary.json`, the script
copies each declared data file into `publish/downloads/`. When it finds a
declared `_preprocessed.csv`, it also requires and copies the corresponding
ssGSEA file used by the frontend analysis.

The destination is flat: all files are placed directly in
`publish/downloads/`. GEO IDs in the filenames prevent collisions. The script
removes stale files and avoids recopying unchanged files.

## Generate webapp annotations and citations

### Cancer and geographic annotations

Execute `geo/scripts/gse_annotations/gse_annotation_prompts.ipynb` with the
nbconvert command above. It reads the GSE IDs in `publish/metadata/data_summary.json`, skips IDs
already saved, and incrementally updates:

- `publish/metadata/geo_series_summaries.json`;
- `publish/metadata/sample_origin.json`.

It uses the description-generation helpers, linked PMC articles, GEO metadata,
OpenAI, and network access. Review generated biomedical annotations before
publishing them.

### Short publication citations

Execute `geo/scripts/gse_citations/pmcid_to_citation.ipynb` with the nbconvert
command above. It collects unique PMCIDs from `publish/metadata/data_summary.json`, fetches RIS
references from NCBI, skips existing entries, and incrementally updates
`publish/metadata/pmcid_to_citation.json`. This also requires network access
and OpenAI.

## Dataset discovery workflow

`geo/scripts/01-parse-geo-metadata.ipynb` is an upstream discovery notebook,
not part of a routine rebuild. It reads an external cleaned dataset table,
extracts GSE-to-PMCID relationships, queries GEO pages for experiment type and
series design, and writes intermediate mapping and metadata files under
`geo/scripts/data/`.

Use it when expanding the candidate GSE collection, not when reprocessing an
already selected cohort.

## Verification after a run

1. Review every failed notebook reported by the bulk runner.
2. Confirm expected per-GSE CSV files exist and have plausible dimensions.
3. Confirm updated descriptions and the combined catalog are valid JSON.
4. Run `pnpm data:assemble` from the monorepo root to refresh the catalog and
   downloads and validate the complete published artifact set.
5. Review `git diff` carefully. Executed notebooks store outputs and can create
   large diffs even when their source code did not change.
6. Avoid committing cache directories, virtual environments, or regenerated
   files that were not part of the intended update.
