import GEOparse
import json
import os
import pandas as pd
from pathlib import Path

from typing import Optional, List, Dict, Any, Tuple
from dotenv import load_dotenv
from openai import OpenAI
from pydantic import BaseModel

from .helpers import (
    get_content,
    fetch_paper_by_pmcid,
    fetch_gse_file,
    DESCRIPTION_SYSTEM_PROMPT,
    DESCRIPTION_SYSTEM_PROMPT_2,
    CANCER_DATASET_METADATA_EXTRACTION_SYSTEM_PROMPT,
)

# Directory where this script is located
SCRIPT_DIR = Path(__file__).parent
DATASETS_DIR = SCRIPT_DIR.parents[1]
GSE_TO_PMCIDS_PATH = SCRIPT_DIR / "data" / "gse_to_pmcids.json"

# Load local notebook credentials without overriding variables explicitly set in
# the shell or notebook process.
load_dotenv(DATASETS_DIR / ".env")

api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError(
        "OPENAI_API_KEY is missing. Copy datasets/.env.example to "
        "datasets/.env and set the key."
    )

client = OpenAI(api_key=api_key)


class ResponseFormat(BaseModel):
    response: str


def call_openai(
    user_text: str,
    *,
    system_instructions: Optional[str] = None,
    model: str = "gpt-5-nano-2025-08-07",
    verbosity: str = "medium",
    reasoning_effort: str = "low",
) -> str:
    messages: List[Dict[str, Any]] = []
    if system_instructions:
        messages.append(
            {
                "role": "system",
                "content": [{"type": "input_text", "text": system_instructions}],
            }
        )
    messages.append(
        {
            "role": "user",
            "content": [{"type": "input_text", "text": user_text}],
        }
    )

    resp = client.responses.parse(
        model=model,
        input=messages,
        text={"verbosity": verbosity},
        reasoning={"effort": reasoning_effort},
        # service_tier="flex",
        text_format=ResponseFormat,
    )
    return resp.output_parsed


def get_pmcids_for_gse(gsid: str) -> list[str]:
    """Return linked PMCIDs for a GEO Series from the canonical mapping."""
    with open(GSE_TO_PMCIDS_PATH, "r", encoding="utf-8") as f:
        gse_to_pmcids = json.load(f)

    try:
        return gse_to_pmcids[gsid]
    except KeyError as exc:
        raise ValueError(
            f"No PMCIDs found for GEO Series ID {gsid} in "
            f"{GSE_TO_PMCIDS_PATH}."
        ) from exc


def generate_description_from_geo(gsid: str, limit_samples=None):
    """
    Generate description from GEO metadata (series + samples).

    Args:
        gsid: GEO Series ID (e.g., 'GSE100797')
        limit_samples: Optional limit on number of samples to include in prompt

    Returns:
        Dictionary with data_id, data_url, pmcids, and survival-endpoints
    """
    pmcids = get_pmcids_for_gse(gsid)

    soft_file_content = GEOparse.get_GEO(filepath=fetch_gse_file(gsid), silent=True)
    series_metadata = soft_file_content._get_metadata_as_string()
    samples_metadata: List[Tuple[str, str]] = []

    for idx, (gsm_id, gsm_data) in enumerate(soft_file_content.gsms.items()):
        if idx < 1:
            samples_metadata.append((gsm_id, gsm_data._get_metadata_as_string()))
        else:
            # Find all keys that start with 'characteristics_ch'
            char_keys = [
                key
                for key in gsm_data.metadata.keys()
                if key.startswith("characteristics_ch")
            ]

            # Combine all characteristics data
            char_data_by_channel = []
            for char_key in sorted(char_keys):
                char_data_by_channel.append(
                    (char_key, ", ".join(gsm_data.metadata[char_key]))
                )

            samples_metadata.append(
                (gsm_id, "\n".join([f"{k}: {v}" for k, v in char_data_by_channel]))
            )

    if limit_samples is not None:
        samples_metadata = samples_metadata[:limit_samples]

    samples_metadata_str = "\n".join(
        [f"{gsm_id}: {gsm_data}" for gsm_id, gsm_data in samples_metadata]
    )

    papers = [(pmcid, get_content(fetch_paper_by_pmcid(pmcid))) for pmcid in pmcids]
    papers = [
        (pmcid, f"{content['CONTENT']}\n\n{content['SUPPL']}")
        for pmcid, content in papers
    ]

    user_prompt = (
        f"**Papers**:{'\n'.join([f'{pmcid}:\n{content}' for pmcid, content in papers])}\n\n"
        f"**GEO Series metadata**:{series_metadata}\n\n"
        f"**GEO Samples metadata**: {samples_metadata_str}"
    )

    openai_response = call_openai(
        user_text=user_prompt,
        system_instructions=DESCRIPTION_SYSTEM_PROMPT,
        model="gpt-5.4", # gpt-5-mini-2025-08-07
        reasoning_effort="medium",
    )

    # Parse the JSON string from the response and spread it into the output
    response_data = json.loads(openai_response.response)

    outdata = {
        "data_id": gsid,
        "data_url": f"https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc={gsid}",
        "pmcids": pmcids,
        **response_data,
    }

    return outdata


def generate_geo_annotations(gsid: str, limit_samples=None) -> dict:
    """
    Extract summary, title, and cancer_type from GEO SOFT + GSM metadata and linked
    PMC papers (CONTENT/SUPPL), via LLM — same user_prompt layout as
    generate_description_from_geo, different system prompt.
    """
    pmcids = get_pmcids_for_gse(gsid)

    soft_file_content = GEOparse.get_GEO(
        filepath=fetch_gse_file(gsid), silent=True
    )
    series_metadata = soft_file_content._get_metadata_as_string()
    samples_metadata: List[Tuple[str, str]] = []

    for idx, (gsm_id, gsm_data) in enumerate(soft_file_content.gsms.items()):
        if idx < 1:
            samples_metadata.append((gsm_id, gsm_data._get_metadata_as_string()))
        else:
            char_keys = [
                key
                for key in gsm_data.metadata.keys()
                if key.startswith("characteristics_ch")
            ]
            char_data_by_channel = []
            for char_key in sorted(char_keys):
                char_data_by_channel.append(
                    (char_key, ", ".join(gsm_data.metadata[char_key]))
                )
            samples_metadata.append(
                (gsm_id, "\n".join([f"{k}: {v}" for k, v in char_data_by_channel]))
            )

    if limit_samples is not None:
        samples_metadata = samples_metadata[:limit_samples]

    samples_metadata_str = "\n".join(
        f"{gsm_id}: {gsm_data}" for gsm_id, gsm_data in samples_metadata
    )

    papers = [(pmcid, get_content(fetch_paper_by_pmcid(pmcid))) for pmcid in pmcids]
    papers = [
        (pmcid, f"{content['CONTENT']}\n\n{content['SUPPL']}")
        for pmcid, content in papers
    ]

    papers_block = "\n".join(f"{pmcid}:\n{content}" for pmcid, content in papers)
    user_prompt = (
        f"**Papers**:{papers_block}\n\n"
        f"**GEO Series metadata**:{series_metadata}\n\n"
        f"**GEO Samples metadata**: {samples_metadata_str}"
    )
    # return user_prompt
    # return CANCER_DATASET_METADATA_EXTRACTION_SYSTEM_PROMPT + "\n\n" + user_prompt
    openai_response = call_openai(
        user_text=user_prompt,
        system_instructions=CANCER_DATASET_METADATA_EXTRACTION_SYSTEM_PROMPT,
        model="gpt-5.4",
        reasoning_effort="high",
    )
    response_data = json.loads(openai_response.response)
    return {
        "data_id": gsid,
        **response_data,
    }


def generate_geo_locations(gsid: str, limit_samples=None) -> dict:
    """
    Extract locations from GEO SOFT + GSM metadata and linked
    PMC papers (CONTENT/SUPPL), via LLM.
    """
    pmcids = get_pmcids_for_gse(gsid)

    soft_file_content = GEOparse.get_GEO(
        filepath=fetch_gse_file(gsid), silent=True
    )
    series_metadata = soft_file_content._get_metadata_as_string()
    samples_metadata: List[Tuple[str, str]] = []

    for idx, (gsm_id, gsm_data) in enumerate(soft_file_content.gsms.items()):
        if idx < 1:
            samples_metadata.append((gsm_id, gsm_data._get_metadata_as_string()))
        else:
            char_keys = [
                key
                for key in gsm_data.metadata.keys()
                if key.startswith("characteristics_ch")
            ]
            char_data_by_channel = []
            for char_key in sorted(char_keys):
                char_data_by_channel.append(
                    (char_key, ", ".join(gsm_data.metadata[char_key]))
                )
            samples_metadata.append(
                (gsm_id, "\n".join([f"{k}: {v}" for k, v in char_data_by_channel]))
            )

    if limit_samples is not None:
        samples_metadata = samples_metadata[:limit_samples]

    samples_metadata_str = "\n".join(
        f"{gsm_id}: {gsm_data}" for gsm_id, gsm_data in samples_metadata
    )

    papers = [(pmcid, get_content(fetch_paper_by_pmcid(pmcid))) for pmcid in pmcids]
    papers = [
        (pmcid, f"{content['CONTENT']}\n\n{content['SUPPL']}")
        for pmcid, content in papers
    ]

    papers_block = "\n".join(f"{pmcid}:\n{content}" for pmcid, content in papers)
    user_prompt = (
        f"**Papers**:{papers_block}\n\n"
        f"**GEO Series metadata**:{series_metadata}\n\n"
        f"**GEO Samples metadata**: {samples_metadata_str}"
    )
    SYSTEM_PROMPT = """
Task: Extract the country or countries of origin of the biological samples or patient cohorts described in the provided text.

Rules:
1. Extract only sample/cohort origin, not author affiliations, sequencing site, vendors, or repository location.
2. Use institution/hospital names only when they are explicitly the collection sites or patient recruitment sites.
3. Normalize all locations to country names only.
4. If multiple sample cohorts are included, return all countries tied to sample collection.
5. If the text mixes newly collected samples with external public datasets, prioritize the cohort directly described in the provided metadata/sample block; include public-dataset countries only if the text explicitly states participant origin.
6. If origin cannot be determined reliably, return ["Not specified"].

Output:
Return raw JSON only. No markdown, no code fences, no extra text.

{
  "justification": "1-2 sentence evidence-based explanation.",
  "sample_geo_location": ["Country 1", "Country 2"]
}"""

    openai_response = call_openai(
        user_text=user_prompt,
        system_instructions=SYSTEM_PROMPT,
        model="gpt-5.4",
        reasoning_effort="medium",
    )
    response_data = json.loads(openai_response.response)
    return {
        "data_id": gsid,
        **response_data,
    }


def generate_description_from_supplement(
    gsid: str,
    supplementary_data_path: str,
) -> dict:
    """
    Generate description from supplementary clinical data file.

    Args:
        gsid: GEO Series ID (e.g., 'GSE150043')
        supplementary_data_path: Path to clinical data CSV file relative to GSE directory

    Returns:
        Dictionary with data_id, data_url, pmcids, and survival-endpoints
    """
    pmcids = get_pmcids_for_gse(gsid)

    # Construct full path to supplementary data file
    gse_dir = SCRIPT_DIR.parent / gsid
    supplementary_file = gse_dir / supplementary_data_path

    # Read supplementary data - ALL rows, ALL columns
    df_supplement = pd.read_csv(supplementary_file)

    # Convert DataFrame to string representation
    supplementary_data_str = df_supplement.to_string(index=False)

    # Fetch paper content
    papers = [(pmcid, get_content(fetch_paper_by_pmcid(pmcid))) for pmcid in pmcids]
    papers = [
        (pmcid, f"{content['CONTENT']}\n\n{content['SUPPL']}")
        for pmcid, content in papers
    ]

    user_prompt = (
        f"**Papers**:{'\n'.join([f'{pmcid}:\n{content}' for pmcid, content in papers])}\n\n"
        f"**Supplementary Data**:\n{supplementary_data_str}"
    )

    openai_response = call_openai(
        user_text=user_prompt,
        system_instructions=DESCRIPTION_SYSTEM_PROMPT_2,
        model="gpt-5.4",
        reasoning_effort="medium",
    )

    # Parse the JSON string from the response and spread it into the output
    response_data = json.loads(openai_response.response)

    outdata = {
        "data_id": gsid,
        "data_url": f"https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc={gsid}",
        "pmcids": list(pmcids),
        **response_data,
    }

    return outdata
