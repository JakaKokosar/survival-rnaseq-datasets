# PubMed retrieval workflow

This folder contains the literature-retrieval and LLM-filtering workflow used to
identify GEO RNA-seq datasets with patient-level survival information.

Run all commands and notebooks from this directory because paths in the
notebooks are relative to `pubmed-retrieval/`.

## Setup

The Python environment is defined by `pyproject.toml` and `uv.lock`.

```bash
uv sync --locked
```

Set the credentials used by the retrieval and classification steps:

```bash
export NCBI_EMAIL="you@example.com"
export OPENAI_API_KEY="..."
```

An NCBI key can increase the request limit. OpenRouter is only needed if you
manually enable the alternative code path in a notebook.

```bash
export NCBI_API_KEY="..."       # optional
export OPENROUTER_API_KEY="..."  # optional
```

Start Jupyter from this folder and select the Python kernel in `.venv`:

```bash
uv run jupyter lab
```

## First run

1. Open `1.0-get-rna-seq.ipynb` and run its four cells from top to bottom. The
   last cell creates
   `rna_seq_data/rna_seq_gds_with_publication_filtered.csv`.
2. Download and extract the full article text from a terminal in this folder:

   ```bash
   bash raw-data/download.sh
   uv run python 1.1-get-bioCjson-fulltext.py
   ```

3. Run notebooks 1.2 through 1.6 in order. In each notebook, run the setup,
   prompt-generation, and current-model cells from top to bottom. Cells after
   the current-model result cell that compare models or draw plots are optional
   and can be skipped on a first run.

Stages 1.2, 1.3, and 1.4 now save the small CSV needed by the next notebook as
part of their current-model result cell. Result JSONL files are append/resume
checkpoints: restarting a cell skips IDs already present in its result file.

## Workflow

The stages are intended to run in numeric order.

| Stage | Purpose | Main inputs | Main outputs |
| --- | --- | --- | --- |
| `1.0-get-rna-seq.ipynb` | Search NCBI GDS for RNA-seq GEO series, collect publications, map PMID to PMCID, and apply the cancer/publication filters. | NCBI Entrez/GDS and PMC ID Converter APIs | `PMID-to-PMCID.csv`; intermediate GSE CSVs; the main input file used by later steps: `rna_seq_data/rna_seq_gds_with_publication_filtered.csv` |
| `raw-data/download.sh` | Download the bulk NCBI BioC-PMC archives used by stage 1.1. | NCBI BioC-PMC archive server | `raw-data/*_json_unicode.tar.gz` |
| `1.1-get-bioCjson-fulltext.py` | Extract the linked PMC articles from the downloaded archives. | The downloaded archives in `raw-data/`; the CSV listing the selected GEO studies and their linked papers: `rna_seq_data/rna_seq_gds_with_publication_filtered.csv` | One compressed full-text article per PMCID in `rna_seq_data/bioCjson_raw/` |
| `1.2-source-filter-prompts.ipynb` | Retrieve concise GEO descriptions and classify datasets as clinical specimens or laboratory models. | The CSV listing the selected GEO studies and their linked papers: `rna_seq_data/rna_seq_gds_with_publication_filtered.csv`; NCBI GEO | `rna_seq_data/gse_text_summaries.csv`; `transcriptomic-source-classification-*.jsonl`; `rna_seq_data/clinical_specimen_gseids.csv` |
| `1.3-sa-filters-prompts.ipynb` | Classify the associated full-text papers by whether they perform survival analysis. | The selected-study CSV from stage 1.0; the clinical-specimen list from stage 1.2; the downloaded article texts from stage 1.1 | `survival-analysis-classification-*.jsonl`; `rna_seq_data/survival-analysis-papers.csv` |
| `1.4-cohort-match-filter.ipynb` | Determine whether each GEO cohort is the cohort used for the paper's survival/prognostic analysis. | The selected-study CSV from stage 1.0; the survival-paper list from stage 1.3; the downloaded article texts; GEO study descriptions | `survival-analysis-cohort-match-*.jsonl`; `rna_seq_data/gseids-candidates.csv` |
| `1.5-check-gse-sample-metadata.ipynb` | Check whether GEO series/sample annotations contain a usable time-to-event endpoint. | Candidate GSE list; survival-paper list; BioC full texts; GEO SOFT files | `gse_to_pmcid.json`; `geo_cache/`; `survival-endpoint-geo-metadata-*.jsonl` |
| `1.6-check-supplements.ipynb` | Check papers and supplements for another source of patient/sample-level clinical metadata. | Candidate GSE list; survival-paper list; BioC full texts; GEO metadata | `survival-endpoint-paper-supplements-*.jsonl`; optional combined review JSON files |

`helpers.py` contains the shared BioC JSON reader used by stages 1.3-1.6.

## Important saved files

The most important restart points are:

1. `rna_seq_data/rna_seq_gds_with_publication_filtered.csv`
2. `rna_seq_data/bioCjson_raw/`
3. `rna_seq_data/clinical_specimen_gseids.csv`
4. `rna_seq_data/survival-analysis-papers.csv`
5. `rna_seq_data/gseids-candidates.csv`

Prompt and result JSONL files are append/resume checkpoints for the model calls.
Keep them with the model name or snapshot, prompt version, and execution date
used to produce them.

## Reproducibility notes

- Stage 1.0 creates
  `rna_seq_data/rna_seq_gds_with_publication_filtered.csv`. This CSV lists the
  selected GEO studies and the PubMed and PMC article IDs linked to each study.
- On a first run, use the prompt-generation and current-model cells. Cells that
  compare results from several models are optional and can be skipped.
- The model-call cells print the number of pending prompts before making calls.
  A commented safety-stop line is left beside that count if you want to enable
  a manual review pause.
- GEO SOFT files downloaded by stages 1.5 and 1.6 are cached in `geo_cache/`.
- Notebook outputs record previous runs but are not substitutes for the CSV,
  BioC, SOFT, prompt, and result artifacts listed above.
