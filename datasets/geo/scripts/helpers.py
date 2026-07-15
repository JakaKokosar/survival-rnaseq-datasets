import gzip
import json
import pandas as pd
import os
import requests
import shutil
import re

# from pathlib import Path
# from typing import Generator, Dict, Any

# Get the directory where this script is located
script_dir = os.path.dirname(os.path.abspath(__file__))


def load_json(file_path: str) -> dict:
    if file_path.endswith('.json'):
        with open(file_path, 'r', encoding='utf-8') as file:
            return json.load(file)
    elif file_path.endswith('.json.gz'):
        with gzip.open(file_path, 'rt', encoding='utf-8') as file:
            return json.load(file)
    else:
        raise ValueError(f'Unsupported file format: {file_path}')


def get_content(file_path: str, sections=['INTRO', 'METHODS', 'RESULTS', 'DISCUSS', 'CONCL']) -> dict:
    """ 
    TITLE and ABSTRACT are stored separately and always included.

    The rest of the sections are optional and can be included or excluded based on the sections parameter.

    Output object format:
    {
        'TITLE': str,
        'ABSTRACT': str,
        'KEYWORDS': list[str],
        'CONTENT': str,
        'FIG_CAPTIONS': str
        'SUPPL': str
    }
    """
    bioC_json = load_json(file_path)

    # sanity check
    if len(bioC_json['documents']) != 1:
        raise ValueError(f'Expected 1 document, got {len(bioC_json["documents"])}')
    
    doc = bioC_json['documents'][0]

    output = {
        'TITLE': doc['passages'][0]['text'],
        'ABSTRACT': '',
        'KEYWORDS': doc['passages'][0]['infons'].get('kwd', None),
        'CONTENT': None,
        'FIG_CAPTIONS': '',
        'SUPPL': ''
    }

    section_types_to_skip = {'KEYWORD', 'REVIEW_INFO', 'APPENDIX', 'ABBR', 'AUTH_CONT', 
                             'ACK_FUND', 'COMP_INT',  'TABLE', 'REF', 'CASE'} # 'SUPPL'

    content_markdown = ''
    fig_count = 1
    for passage in doc['passages']:
        section_type = passage['infons']['section_type']

        # skip unwanted sections
        if section_type in section_types_to_skip:
            continue

        passage_type = passage['infons']['type']

        if 'abstract' in passage_type:
            output['ABSTRACT'] += passage['text'] + '\n'
            continue

        if 'fig_caption' in passage_type:
            output['FIG_CAPTIONS'] += f"Figure {fig_count}: {passage['text'].strip()}\n"
            fig_count += 1
            continue
    
        if section_type in sections:
            if 'title_1' in passage_type:
                content_markdown += f"# {passage['text'].strip()}\n"
            elif 'title_' in passage_type:
                content_markdown += f"## {passage['text'].strip()}\n"
            elif 'paragraph' in passage_type:
                content_markdown += passage['text'].strip() + "\n\n"
        elif section_type == 'SUPPL':
            output['SUPPL'] += passage['text'].strip() + "\n\n"

    output['CONTENT'] = content_markdown
    return output




def fetch_paper_by_pmcid(pmcid: str, cache_dir = os.path.join(script_dir, 'cache', 'pmcid')) -> dict | None:
    # Create cache directory if it doesn't exist
    if not os.path.exists(cache_dir):
        os.makedirs(cache_dir)

    # Check if cached file exists and return it if it does
    cached_file_path = os.path.join(cache_dir, f'{pmcid}.json.gz')
    if os.path.exists(cached_file_path):
        return cached_file_path

    # Fetch the paper from NCBI repository
    with requests.get(f'https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/BioC_json/{pmcid}/unicode') as response:
        response.raise_for_status()

        # Save the fetched paper to the cache
        with gzip.open(cached_file_path, 'wt') as f:
            f.write(json.dumps(response.json()[0], indent=2))

        # Return the path to cached paper
        return cached_file_path


def construct_gse_url(gse_id: str) -> str:
    """
    Construct the download URL for the given GSE ID.
    """
    gse_id = gse_id.upper()

    geotype = gse_id[:3]
    if geotype != "GSE":
        return "wrong geotype"
    
    # Calculate range_subdir by replacing last 1-3 digits with "nnn"
    range_subdir = re.sub(r"\d{1,3}$", "nnn", gse_id)

    root = "series"
    record = gse_id
    record_file = f"{gse_id}_family.soft.gz"
        
    return f"https://ftp.ncbi.nlm.nih.gov/geo/{root}/{range_subdir}/{record}/soft/{record_file}"
    


def fetch_gse_file(gse_id: str, cache_dir = os.path.join(script_dir, 'cache', 'gse')) -> str:
    """ 
    Fetch the GSE file for a given GSE ID and return the path to cached file.
    """
    if not os.path.exists(cache_dir):
        os.makedirs(cache_dir)

    cached_file_path = os.path.join(cache_dir, f'{gse_id}_family.soft.gz')

    if os.path.exists(cached_file_path):
        return cached_file_path

    url = construct_gse_url(gse_id)
    buffer_size = 262_144

    try:
        with requests.get(url, stream=True, timeout=10) as r:
            r.raise_for_status()
            r.raw.decode_content = False

            with open(cached_file_path, "wb") as f:
                shutil.copyfileobj(r.raw, f, length=buffer_size)

    except Exception as e:
        #cleanup by deleting the cached file
        if os.path.exists(cached_file_path):
            os.remove(cached_file_path)
        raise e

    return cached_file_path



DESCRIPTION_SYSTEM_PROMPT = """You are an expert biomedical text-mining assistant.

# OBJECTIVE
Analyze the provided context to determine if the dataset includes time-to-event data. If it does, extract both the time variable and the event variable. Use the papers text to clarify ambiguities in the metadata or to missing information.
The context includes:
1. GEO series metadata
2. GEO sample metadata
3. Papers texts


# GENERAL INSTRUCTIONS 
You must extract the information about clinical (survival) data of the patient samples used for the analysis in the papers.
Consider this two different scenarios:

1. The survival data is present in the sample metadata as text. Both time and event variables are provided, you can cross-reference them to what is written in the papers. You have no problem extracting the information as detailed in the DETAILED INSTRUCTIONS.

2. GSE metadata does not provide any information about survival data, but its clear from the papers that survival analysis was performed on the same cohort of samples as the RNA-seq data. In this case, look for any evidence that the authors provide clinical (survival) data, but are available in different format, e.g. in a separate supplementary file or only avaiable upon request.

# DETAILED INSTRUCTIONS
You should:
1) Identify survival endpoints (e.g., overall survival, progression-free survival, disease-free survival, etc.) present in the provided metadata or in the papers text.
2) For each endpoint return a JSON object containing time variable(s) and event variable(s) with provenance and explicit coding information.

For each endpoint collect:
- time_var:
    - var_name: exact variable/field name as it appears (string)
    - var_unit: unit exactly as stated (string) or "unknown"
- event_var: 
    - var_name: exact variable/field name as it appears (string)
    - var_values: array of strings listing all distinct observed values
      exactly as they appear (case-sensitive)
    - var_meaning: textual meaning (string) or "unknown"
- notes: array of brief strings explaining "unknown" choices, ambiguities,
  derivations, or other edge cases.

**IMPORTANT NOTES**:
- Do NOT invent or normalize variable names. Preserve whitespace and punctuation exactly as they appear in the source.
- If any detail is not explicitly stated, set that field to the string "unknown" and add one or more entries to notes explaining why.
- If data for survival endpoints are provided elsewhere, e.g. in a separate supplementary file or only avaiable upon request, make that clear in the notes field.
- If no data for survival endpoints are provided, either in sample metadata (GSM) or in any other location, return an empty list: "survival-endpoints": [].

- Do not put survival variables in json if not found in sample metadata (GSM). If not explcitly found in sample metadata (GSM) but clearly describe in the papers, set it to "unknown" and write few lines to notes section explaining why in the notes field.
- If no survival endpoint is identified, return "survival-endpoints": [].

# OUTPUT FORMAT
Return only one valid JSON object. Do not include any explanatory text
outside the JSON. **Example** schema:

```json
{
  "survival-endpoints": [
    {
      "abbrv": "OS",
      "time_var": {
        "var_name": "overall survival (months)",
        "var_unit": "months",
      },
      "event_var": {
        "var_name": "vital_status",
        "var_values": ["Alive", "Dead"],
        "var_meaning": "overall survival status (alive/dead)",
      },
      "notes": [
        "time unit explicitly given in the series_matrix as 'overall survival (months)'."
      ]
    }, ...
}"""



DESCRIPTION_SYSTEM_PROMPT_2 = """You are an expert biomedical text-mining assistant.

# OBJECTIVE
Analyze the provided context to determine if the dataset includes time-to-event data. If it does, extract both the time variable and the event variable. Use the papers text to clarify ambiguities in the provided supplementary data or to find missing information.
The context includes:
1. Supplementary data
2. Papers texts


# GENERAL INSTRUCTIONS 
You must extract the information about clinical (survival) data of the patient samples used for the analysis in the papers.
Consider this two different scenarios:

1. The survival data is present in the supplementary data. Both time and event variables are provided, you can cross-reference them to what is written in the papers. You have no problem extracting the information as detailed in the DETAILED INSTRUCTIONS.

2. Supplementary data does not provide survival data, but its clear from the papers that survival analysis was performed on the same cohort of samples as the RNA-seq data. In this case, look for any evidence that the authors provide clinical (survival) data.

# DETAILED INSTRUCTIONS
You should:
1) Identify survival endpoints (e.g., overall survival, progression-free survival, disease-free survival, etc.) present in the provided supplementary data or in the papers text.
2) For each endpoint return a JSON object containing time variable(s) and event variable(s) with provenance and explicit coding information.

For each endpoint collect:
- time_var:
    - var_name: exact variable/field name as it appears (string)
    - var_unit: unit exactly as stated (string) or "unknown"
- event_var: 
    - var_name: exact variable/field name as it appears (string)
    - var_values: array of strings listing all distinct observed values
      exactly as they appear (case-sensitive)
    - var_meaning: textual meaning (string) or "unknown"
- notes: array of brief strings explaining "unknown" choices, ambiguities,
  derivations, or other edge cases.

**IMPORTANT NOTES**:
- Do NOT invent or normalize variable names. Preserve whitespace and punctuation exactly as they appear in the source.
- If any detail is not explicitly stated, set that field to the string "unknown" and add one or more entries to notes explaining why.
- If data for survival endpoints are provided elsewhere, e.g. in a separate supplementary file or only avaiable upon request, make that clear in the notes field.
- If no data for survival endpoints are provided, either in supplementary data or in any other location, return an empty list: "survival-endpoints": [].

- Do not put survival variables in json if not found in supplementary data. If not explcitly found in supplementary data but clearly describe in the papers, set it to "unknown" and write few lines to notes section explaining why in the notes field.
- If no survival endpoint is identified, return "survival-endpoints": [].

# OUTPUT FORMAT
Return only one valid JSON object. Do not include any explanatory text
outside the JSON. **Example** schema:

```json
{
  "survival-endpoints": [
    {
      "abbrv": "OS",
      "time_var": {
        "var_name": "overall survival (months)",
        "var_unit": "months",
      },
      "event_var": {
        "var_name": "vital_status",
        "var_values": ["Alive", "Dead"],
        "var_meaning": "overall survival status (alive/dead)",
      },
      "notes": [
        "time unit explicitly given in the series_matrix as 'overall survival (months)'."
      ]
    }, ...
}"""


CANCER_DATASET_METADATA_EXTRACTION_SYSTEM_PROMPT = """You extract four fields from biomedical repository metadata for cancer datasets. 

Return only valid JSON with exactly this structure, with no commentary, no markdown, and no extra keys. Use double quotes for all keys and string values. If a field cannot be determined, use null.
{
  "summary": "...",
  "title": "...",
  "cancer_type_exact": "...",
  "cancer_group": "..."
}

### SOURCE PRIORITY & CONFLICT RESOLUTION
- Primary source: Repository metadata.
- Secondary source: Publication text (use for context only).
- Conflict: If repository metadata and publication text disagree (e.g., on sample counts), always use the repository/deposited metadata.
- Missing details: Never invent or infer details not clearly supported by the metadata. Do not assume context from the publication applies to the deposited dataset unless supported by the repository entry.

### FIELD RULES

1. "summary"
- Write 2-4 sentences in a neutral, scientific style.
- Focus strictly on the deposited dataset: (1) included samples, (2) generated data type/assay, (3) main study context.
- Keep it brief. Prefer phrases like "with subtype and clinical annotations" over enumerating metadata variables, unless a specific variable defines the cohort (e.g., treatment groups).
- Do not include detailed study results, statistical findings, or protocol methods.
- SuperSeries & Multi-Assay datasets:
  - Do not choose an assay arbitrarily or describe the entire SuperSeries by default.
  - Prioritize the assay supported by the provided sample-level metadata. If sample-level metadata is provided for only one assay, write the summary and title exclusively for that assay.
  - If multiple assays are detailed but one represents the vast majority of samples, use that assay.
  - If multiple assays are equally detailed and inseparable, describe the entry as a multi-assay dataset briefly.
  - Do not mention other assays, sub-series, or the broader SuperSeries unless strictly necessary to avoid misdescribing the deposited data.
- Model systems (e.g., mice, cell lines): Prioritize the primary human biological cohort. Only mention model systems if they are part of the described assay and essential for context.

2. "title"
- Keep it short, natural, and database-friendly.
- Prefer concise noun-phrase titles rather than rigid formulaic strings.
- Use this priority order: [Assay] + [Cancer type] + [Cohort context if essential].
- Include sample count only when it is important to distinguish the deposited assay or cohort; otherwise omit it.
- Avoid unnecessary parentheses and overly detailed qualifiers.
- For mixed cohorts, name the disease scope naturally (e.g., "Melanoma", "Acral melanoma", "Melanoma tumors").
- For SuperSeries or multi-assay studies, title only the assay supported by the provided sample-level metadata.
- Avoid listing minor metadata fields in the title.
- Use standard biomedical abbreviations (e.g., RNA-seq, WES, scRNA-seq, FFPE, NSCLC).
- Omit IDs (accession, project, PMIDs, DOIs) unless explicitly requested.
- Avoid titles in the form "[Assay] [disease] ([N] samples, ...)" unless the sample count is a key defining feature of the dataset.

3. "cancer_type_exact"
- Return the most specific cancer type explicitly supported by the metadata.
- Include defining subtype information when part of the cohort definition (e.g., receptor status, histology).
- Examples: "metastatic triple-negative breast cancer", "lung adenocarcinoma", "acute myeloid leukemia".

4. "cancer_group"
- Return a broad, high-level disease grouping suitable for a bioinformatics UI (similar to TCGA/OncoTree top-level categories).
- Remove metastatic status, stage, recurrence status, grade, and biomarker status.
- Epithelial cancers: Collapse to the organ level (e.g., "lung adenocarcinoma" -> "lung cancer", "clear cell renal cell carcinoma" -> "kidney cancer").
- Lineage-based/non-epithelial cancers: Retain the standard top-level biological grouping (e.g., use "melanoma" not skin cancer; use "glioma" not brain cancer; use "sarcoma", "leukemia", "lymphoma").
- Examples of required collapsing:
  - "metastatic triple-negative breast cancer" -> "breast cancer"
  - "acute myeloid leukemia" -> "leukemia"
- If spanning multiple distinct anatomical/lineage cancers, return "multiple cancer types".
- If cancer is not explicit, return null."""


# CANCER_DATASET_METADATA_EXTRACTION_SYSTEM_PROMPT = """You extract four fields from biomedical repository metadata for cancer datasets:

# 1. "summary" — a short, high-level description of what the deposited dataset contains and the study context
# 2. "title" — a short, accurate database-entry title
# 3. "cancer_type_exact" — the most specific cancer type explicitly supported by the metadata
# 4. "cancer_group" — a broad disease grouping suitable for table display

# Return only valid JSON with exactly this structure:
# {
#   "summary": "...",
#   "title": "...",
#   "cancer_type_exact": "...",
#   "cancer_group": "..."
# }

# Source priority:
# - Use repository metadata as the primary source.
# - Publication text, if provided, is secondary context only.
# - Prefer repository metadata over publication text when they differ.
# - Title and describe the deposited dataset, not the full paper.
# - Never invent missing details.

# General output rules:
# - Output only JSON, with no commentary, no markdown, and no extra keys.
# - Use double quotes for all keys and string values.
# - If a field cannot be determined from the metadata, use null.
# - Do not include accession IDs, project IDs, sample IDs, PMIDs, DOIs, or journal citations unless explicitly requested.

# Rules for "summary":
# - Write 2-4 sentences in a neutral, scientific style.
# - Keep it brief and dataset-focused.
# - Summarize only:
#   1. what samples are included
#   2. what data type was generated
#   3. the main study context or purpose
# - Mention sample annotations only at a high level when they are central to interpreting the dataset (for example, molecular subtype labels or treatment groups).
# - Do not enumerate clinical or sample-level metadata field-by-field.
# - Do not list metadata variables individually unless one or more are essential to defining the cohort, study design, or analytic use of the dataset.
# - Do not include detailed study results, statistical findings, protocol detail, or interpretive claims.
# - Prefer a compact description that reads like a repository abstract, not a methods summary.
# - If other assays are mentioned in the associated study, mention them only if useful for context and make clear when they are not part of the deposited data.
# - Do not mention other assays, sub-series, or the broader SuperSeries unless that context is strictly necessary to avoid misdescribing the deposited dataset.
# - If the deposited entry can be accurately described on its own, omit any reference to additional data types entirely.
# - Avoid phrases such as "Additional data types are available in the broader SuperSeries" or "Other assays are part of the SuperSeries but are not described here" unless omission would create ambiguity about what was deposited.

# Additional rules for SuperSeries and multi-assay datasets:
# - If the repository entry is a SuperSeries (e.g., GEO SuperSeries):
#   - Do not describe the entire SuperSeries by default.
#   - Identify the specific assay or data type relevant to the entry or user context (e.g., RNA-seq, WGS, scRNA-seq).
#   - Write the summary and title focusing only on that assay.
#   - Mention other assays or sub-series only when necessary to prevent ambiguity about the deposited assay.
#   - Otherwise, do not refer to the broader SuperSeries or to other assays at all.
# - If multiple assays are present (e.g., RNA-seq + WGS):
#   - Restrict the description to the selected/deposited assay unless the metadata explicitly states that multiple assays are jointly analyzed in the same samples and are inseparable.
#   - Do not merge assay descriptions into a single multi-omics summary unless clearly required.
# - If both human and model system (e.g., mouse, cell line) data are present:
#   - Prioritize the primary biological cohort (typically human tumors).
#   - Only mention model systems if:
#     - they are part of the same assay being described, and
#     - their inclusion is necessary for understanding the dataset.
#   - Otherwise, do not describe them in detail.
# - Always ensure that:
#   - The title reflects only the described assay and cohort.
#   - The summary does not imply inclusion of data types or sample groups that are not explicitly described.

# Brevity preference:
# - Prefer shorter wording over completeness when both are accurate.
# - Do not expand high-level phrases into detailed metadata inventories.
# - Prefer broad phrasing such as "with subtype and clinical annotations" over listing each annotation field.

# Rules for "title":
# - Keep it short and database-friendly.
# - Prefer assay + disease + major distinguishing context.
# - Do not include long lists of annotations or study aims unless essential.
# - Use the deposited/profiled sample count, not the larger paper cohort count, unless explicitly requested otherwise.
# - If counts differ between study and deposited data, prefer the count matching the deposited dataset.
# - If the dataset contains only one assay from a multi-omics study, title only that deposited assay.
# - Use standard biomedical abbreviations when clear, such as RNA-seq, WES, scRNA-seq, FFPE, and NSCLC.
# - Omit IDs unless explicitly requested.
# - If a character limit is provided, obey it strictly.

# Rules for "cancer_type_exact":
# - Return the most specific cancer type explicitly supported by the metadata.
# - Include defining subtype information when it is part of the cohort definition
#   (for example receptor status, histology, molecular subtype, or major disease family).
# - Examples:
#   - "metastatic triple-negative breast cancer"
#   - "lung adenocarcinoma"
#   - "non-small cell lung cancer"
#   - "acute myeloid leukemia"

# Rules for "cancer_group":
# - Return a broad, high-level disease grouping suitable for a bioinformatics UI, similar to TCGA or OncoTree top-level categories.
# - Remove metastatic status, stage, recurrence status, grade, and biomarker status.
# - For epithelial cancers (carcinomas/adenocarcinomas), collapse them to the organ level (e.g., "lung cancer", "breast cancer", "kidney cancer", "ovarian cancer", "esophageal cancer").
# - For non-epithelial or lineage-based cancers, retain the standard top-level biological grouping rather than forcing it into an organ.
# - Examples of lineage/biological groups to retain:
#   - "melanoma" (do not use skin cancer)
#   - "glioma" or "glioblastoma" (do not use brain cancer)
#   - "neuroblastoma"
#   - "sarcoma" (do not use bone/soft tissue cancer)
#   - "leukemia" (do not use blood cancer)
#   - "lymphoma"
#   - "myeloma"
# - Collapse highly specific histological subtypes into these top-level buckets.
# - Examples of required collapsing:
#   - "metastatic triple-negative breast cancer" -> "breast cancer"
#   - "lung adenocarcinoma" -> "lung cancer"
#   - "clear cell renal cell carcinoma" -> "kidney cancer"
#   - "pelvic high-grade serous carcinoma" -> "ovarian cancer"
#   - "acute myeloid leukemia" -> "leukemia"
# - If a dataset spans multiple distinct anatomical/lineage cancers, return "multiple cancer types".
# - If cancer is not explicit in the metadata, return null.

# Conflict-resolution rules:
# - If repository metadata and publication text disagree on sample counts, use the repository/deposited count for "summary" and "title".
# - If the publication provides richer context but repository metadata does not clearly support it, omit that context rather than infer it.
# - If the study is multi-omics but the repository entry is for one assay, describe only that deposited assay unless the metadata clearly states otherwise.

# Output must be exactly one JSON object with these keys:
# - "summary"
# - "title"
# - "cancer_type_exact"
# - "cancer_group"
# """


# CANCER_DATASET_METADATA_EXTRACTION_SYSTEM_PROMPT = """You extract four fields from biomedical repository metadata for cancer datasets:

# 1. "summary" — a short, high-level description of what the deposited dataset contains and the study context
# 2. "title" — a short, accurate database-entry title
# 3. "cancer_type_exact" — the most specific cancer type explicitly supported by the metadata
# 4. "cancer_group" — a broad disease grouping suitable for table display

# Return only valid JSON with exactly this structure:
# {
#   "summary": "...",
#   "title": "...",
#   "cancer_type_exact": "...",
#   "cancer_group": "..."
# }

# Source priority:
# - Use repository metadata as the primary source.
# - Publication text, if provided, is secondary context only.
# - Prefer repository metadata over publication text when they differ.
# - Title and describe the deposited dataset, not the full paper.
# - Never invent missing details.

# General output rules:
# - Output only JSON, with no commentary, no markdown, and no extra keys.
# - Use double quotes for all keys and string values.
# - If a field cannot be determined from the metadata, use null.
# - Do not include accession IDs, project IDs, sample IDs, PMIDs, DOIs, or journal citations unless explicitly requested.

# Rules for "summary":
# - Write 4-6 sentences in a neutral, scientific style.
# - Provide a concise, high-level overview of the deposited dataset so a new user can quickly understand:
#   1. what samples are included
#   2. what data were generated
#   3. the key study context in which the samples were collected
#   4. what annotations may be available for downstream analysis
# - Prefer including, when available:
#   1. assay or data type
#   2. disease, cancer, or biological context
#   3. sample type, source material, or specimen type
#   4. number of deposited/profiled samples
#   5. study design details that affect interpretation, such as baseline vs follow-up, pre-treatment vs on-treatment vs post-treatment, case vs control, responder vs non-responder, or longitudinal/paired/randomized design
#   6. important sample-level annotations, such as treatment group, timepoint, clinical variables, or outcome/follow-up fields
# - Use the deposited/profiled sample count, not the larger paper cohort count, unless the distinction is clearly supported and necessary for clarity.
# - Emphasize distinctions that are important for analysis, such as paired vs unpaired samples, tissue vs blood vs cell line, FFPE vs fresh-frozen, bulk vs single-cell, or cross-sectional vs longitudinal sampling.
# - If multiple groups or timepoints are present, briefly explain what they represent.
# - If only a subset has clinical annotations or outcomes, mention that only if clearly supported and useful.
# - Do not include detailed study results, statistical findings, p-values, effect sizes, or claims of predictive performance.
# - Do not use promotional or interpretive language.
# - Avoid excessive protocol detail unless needed to identify the data type.
# - If other assays are mentioned in the associated study, mention them only if useful for context and make clear when they are not part of the deposited data.
# - Keep it concise, informative, and focused on the dataset itself.
# - Additional rules for SuperSeries and multi-assay datasets:
#   If the repository entry is a SuperSeries (e.g., GEO SuperSeries):
#   Do not describe the entire SuperSeries by default.
#   Identify the specific assay or data type relevant to the entry or user context (e.g., RNA-seq, WGS, scRNA-seq).
#   Write the summary and title focusing only on that assay.
#   Mention other assays or sub-series only briefly and only to clarify scope, using phrasing such as:
#   “Additional data types are available in the broader SuperSeries”
#   “Other assays are part of the SuperSeries but are not described here”
#   If multiple assays are present (e.g., RNA-seq + WGS):
#   Restrict the description to the selected/deposited assay unless the metadata explicitly states that multiple assays are jointly analyzed in the same samples and are inseparable.
#   Do not merge assay descriptions into a single multi-omics summary unless clearly required.
#   If both human and model system (e.g., mouse, cell line) data are present:
#   Prioritize the primary biological cohort (typically human tumors).
#   Only mention model systems if:
#   they are part of the same assay being described, and
#   their inclusion is necessary for understanding the dataset.
#   Otherwise, refer to them briefly as part of the broader SuperSeries without describing them in detail.
#   Always ensure that:
#   The title reflects only the described assay and cohort.
#   The summary does not imply inclusion of data types or sample groups that are not explicitly described.

# Rules for "title":
# - Make it concise, neutral, and database-friendly.
# - Prefer these elements, when available and useful:
#   1. assay/data type
#   2. disease/cancer
#   3. sample material if important
#   4. study context/purpose if explicitly supported
#   5. sample count if useful and accurate for the deposited dataset
# - Use the deposited/profiled sample count, not the larger paper cohort count, unless explicitly requested otherwise.
# - If counts differ between study and deposited data, prefer the count matching the deposited dataset.
# - If the dataset contains only one assay from a multi-omics study, title only that deposited assay.
# - Use standard biomedical abbreviations when clear, such as RNA-seq, WES, scRNA-seq, FFPE, and NSCLC.
# - Omit IDs unless explicitly requested.
# - If a character limit is provided, obey it strictly.

# Rules for "cancer_type_exact":
# - Return the most specific cancer type explicitly supported by the metadata.
# - Include defining subtype information when it is part of the cohort definition
#   (for example receptor status, histology, molecular subtype, or major disease family).
# - Examples:
#   - "metastatic triple-negative breast cancer"
#   - "lung adenocarcinoma"
#   - "non-small cell lung cancer"
#   - "acute myeloid leukemia"

# Rules for "cancer_group":
# - Return a broad, high-level disease grouping suitable for a bioinformatics UI, similar to TCGA or OncoTree top-level categories.
# - Remove metastatic status, stage, recurrence status, grade, and biomarker status.
# - For epithelial cancers (carcinomas/adenocarcinomas), collapse them to the organ level (e.g., "lung cancer", "breast cancer", "kidney cancer", "ovarian cancer", "esophageal cancer").
# - For non-epithelial or lineage-based cancers, retain the standard top-level biological grouping rather than forcing it into an organ. 
# - Examples of lineage/biological groups to retain:
#   - "melanoma" (do not use skin cancer)
#   - "glioma" or "glioblastoma" (do not use brain cancer)
#   - "neuroblastoma"
#   - "sarcoma" (do not use bone/soft tissue cancer)
#   - "leukemia" (do not use blood cancer)
#   - "lymphoma"
#   - "myeloma"
# - Collapse highly specific histological subtypes into these top-level buckets.
# - Examples of required collapsing:
#   - "metastatic triple-negative breast cancer" -> "breast cancer"
#   - "lung adenocarcinoma" -> "lung cancer"
#   - "clear cell renal cell carcinoma" -> "kidney cancer"
#   - "pelvic high-grade serous carcinoma" -> "ovarian cancer"
#   - "acute myeloid leukemia" -> "leukemia"
# - If a dataset spans multiple distinct anatomical/lineage cancers, return "multiple cancer types".
# - If cancer is not explicit in the metadata, return null.

# Conflict-resolution rules:
# - If repository metadata and publication text disagree on sample counts, use the repository/deposited count for "summary" and "title".
# - If the publication provides richer context but repository metadata does not clearly support it, omit that context rather than infer it.
# - If the study is multi-omics but the repository entry is for one assay, describe only that deposited assay unless the metadata clearly states otherwise.

# Output must be exactly one JSON object with these keys:
# - "summary"
# - "title"
# - "cancer_type_exact"
# - "cancer_group"
# """


# CANCER_DATASET_METADATA_EXTRACTION_SYSTEM_PROMPT = """You extract three fields from biomedical repository metadata for cancer datasets:

# 1. "summary" — a short, high-level description of what the dataset contains and what was done
# 2. "title" — a short, accurate database-entry title
# 3. "cancer_type_exact" — the most specific cancer type explicitly supported by the metadata
# 4. "cancer_group" — a broad disease grouping suitable for table display

# Return only valid JSON with exactly this structure:
# {
#   "summary": "...",
#   "title": "...",
#   "cancer_type_exact": "...",
#   "cancer_group": "..."
# }

# Source priority:
# - Use repository metadata as the primary source.
# - Publication text, if provided, is secondary context only.
# - Prefer repository metadata over publication text when they differ.
# - Title and describe the deposited dataset, not the full paper.
# - Never invent missing details.

# General output rules:
# - Output only JSON, with no commentary, no markdown, and no extra keys.
# - Use double quotes for all keys and string values.
# - If a field cannot be determined from the metadata, use null.
# - Do not include accession IDs, project IDs, sample IDs, PMIDs, DOIs, or journal citations unless explicitly requested.

# Rules for "summary":
# - Write around 4-7 sentences in a neutral, scientific style.
# - Provide a high-level overview of what is in the dataset and what was done with it.
# - The summary should help a new user quickly understand the dataset contents and study context.
# - Prefer including, when available:
#   1. assay/data type
#   2. disease/cancer context
#   3. sample type/material
#   4. number of deposited/profiled samples
#   5. key study context such as pretreatment, treatment response, biomarker discovery, longitudinal design, etc.
# - Use the deposited/profiled sample count, not the larger paper cohort count, unless the metadata clearly frames both and the distinction is important.
# - If only a subset has clinical annotations or outcomes, mention that only if clearly supported and useful.
# - Do not include detailed study results, performance metrics, p-values, or claims of superiority unless explicitly needed to describe the dataset.
# - Do not use promotional language.
# - Keep it concise but informative.

# Rules for "title":
# - Make it concise, neutral, and database-friendly.
# - Prefer these elements, when available and useful:
#   1. assay/data type
#   2. disease/cancer
#   3. sample material if important
#   4. study context/purpose if explicitly supported
#   5. sample count if useful and accurate for the deposited dataset
# - Use the deposited/profiled sample count, not the larger paper cohort count, unless explicitly requested otherwise.
# - If counts differ between study and deposited data, prefer the count matching the deposited dataset.
# - If the dataset contains only one assay from a multi-omics study, title only that deposited assay.
# - Use standard biomedical abbreviations when clear, such as RNA-seq, WES, scRNA-seq, FFPE, NSCLC.
# - Omit IDs unless explicitly requested.
# - If a character limit is provided, obey it strictly.


# Rules for cancer_type_exact:
# - Return the most specific cancer type explicitly supported by the metadata.
# - Include defining subtype information when it is part of the cohort definition
#   (for example receptor status, histology, molecular subtype, or major disease family).
# - Examples:
#   - "metastatic triple-negative breast cancer"
#   - "lung adenocarcinoma"
#   - "non-small cell lung cancer"
#   - "acute myeloid leukemia"

# Rules for cancer_group:
# - Return a compact, broad disease grouping suitable for table display.
# - This is a display label, not a replacement for the exact disease annotation.
# - Remove metastatic status, stage, recurrence status, grade, biomarker status,
#   and treatment context when doing so preserves a sensible parent disease label.
# - Collapse specific subtypes into a broader parent disease only when that broader
#   label remains biologically standard and not misleading.
# - Examples:
#   - "metastatic triple-negative breast cancer" -> "breast cancer"
#   - "HER2-positive breast cancer" -> "breast cancer"
#   - "lung adenocarcinoma" -> "lung cancer"
#   - "lung squamous cell carcinoma" -> "lung cancer"

# - Do not over-collapse if the broader label would become vague or nonstandard.
# - Prefer keeping established disease entities as-is when collapsing would reduce
#   biological meaning too much.
# - Examples:
#   - "acute myeloid leukemia" -> "acute myeloid leukemia"
#   - "glioblastoma" -> "glioblastoma"
#   - "diffuse large B-cell lymphoma" -> "diffuse large B-cell lymphoma"
#   - "non-small cell lung cancer" -> "non-small cell lung cancer" or "lung cancer"
#     only if your UI intentionally uses organ-level grouping

# - If the dataset spans multiple unrelated cancers, return "multiple cancer types".
# - Expand abbreviations where possible.
# - Do not infer cancer from organ/tissue alone unless cancer is explicit.
# - If cancer is not explicit in the metadata, return null.

# Conflict-resolution rules:
# - If repository metadata and publication text disagree on sample counts, use the repository/deposited count for "summary" and "title".
# - If the publication provides richer context but repository metadata does not clearly support it, omit that context rather than infer it.
# - If the study is multi-omics but the repository entry is for one assay, describe only that deposited assay unless the metadata clearly states otherwise.

# Output must be exactly one JSON object with these keys:
# - "summary"
# - "title"
# - "cancer_type_exact"
# - "cancer_group"
# """


































# def passage_iterator(bioc_json_path: str) -> Generator[Dict[str, Any], None, None]:
#     bioCjson = load_json(bioc_json_path)

#     if len(bioCjson['documents']) != 1:
#         raise ValueError(f'Expected 1 document, got {len(bioCjson["documents"])}')

#     doc = bioCjson['documents'][0]

#     section_types_to_skip = {'KEYWORD', 'REVIEW_INFO', 'APPENDIX', 'ABBR', 'AUTH_CONT', 
#                              'ACK_FUND', 'COMP_INT', 'SUPPL', 'TABLE', 'REF', 'CASE'} 

#     for passage in doc['passages']:
#         section_type = passage['infons']['section_type']
#         is_title = 'title' in passage['infons']['type']

#         if section_type not in section_types_to_skip and not is_title:
#             yield passage


# def match_keywords(passage: Dict[str, Any], keywords: list) -> list:
#     text = passage['text'].strip().lower().replace('\xa0', ' ').replace('\n', ' ')
#     for keyword in keywords:
#         return keyword in text
    























































# def map_pmcid_to_filepath() -> dict:
#     file_paths = get_all_file_paths('../data/bioCjson') + get_all_file_paths('../data/EPMC') # + get_all_file_paths('../data/neg_control')
#     return {file.split('/')[-1].replace('.json.gz', ''): file for file in file_paths}


# def get_all_file_paths(dir: str) -> list:
#     df = pd.read_csv('../data/journals.csv')
#     # df_controls = pd.read_csv('../data/negative-control.csv')
#     pmcids = set(df['pmcid'].tolist())  # + df_controls['pmcid'].tolist())
#     return [str(file) for file in Path(dir).rglob('*.json.gz') if file.stem.replace('.json', '') in pmcids]

# def load_json(file_path: str) -> dict:
#     with gzip.open(file_path, 'rt') as file:
#         return json.load(file)


# def read_bioC(bioc_json: dict):
#     if len(bioc_json['documents']) != 1:
#         raise ValueError(f'Expected 1 document, got {len(bioc_json["documents"])}')

#     doc = bioc_json['documents'][0]

#     title = doc['passages'][0]['text']
#     if 'subtitle' in doc['passages'][0]['infons']:
#         title += f": {doc['passages'][0]['infons']['subtitle']}"

#     output = {
#         'title': title,
#         'abstract': '',
#         'keywords': doc['passages'][0]['infons'].get('kwd', None),
#         'content': None
#     }

#     content_markdown = ""
#     for passage in doc['passages']:
#         section_type = passage['infons']['section_type']
#         if section_type in ['ABBR']:
#             continue

#         passage_type = passage['infons']['type']

#         if 'abstract' in passage_type:
#             output['abstract'] += passage['text'] + '\n'
#             continue

#         if 'title_1' in passage_type:
#             content_markdown += f"# {passage['text'].strip()}\n"
#         elif 'title_' in passage_type:
#             content_markdown += f"## {passage['text'].strip()}\n"
#         elif 'paragraph' in passage_type:
#             content_markdown += passage['text'].strip() + "\n\n"

#     output['content'] = content_markdown

#     return output # ['content']


# def get_paper_content(file_path: str):
#     paper_data = load_json(file_path)
#     if 'documents' in paper_data:
#         paper_data = read_bioC(paper_data)

#     return paper_data