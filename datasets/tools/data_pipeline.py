#!/usr/bin/env python3
"""Assemble and validate the web-facing dataset artifacts."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
METADATA_DIR = ROOT / "publish" / "metadata"
DOWNLOADS_DIR = ROOT / "publish" / "downloads"

DATA_SUMMARY = METADATA_DIR / "data_summary.json"
GEO_SUMMARIES = METADATA_DIR / "geo_series_summaries.json"
SAMPLE_ORIGIN = METADATA_DIR / "sample_origin.json"
PMC_CITATIONS = METADATA_DIR / "pmcid_to_citation.json"

HELP = """
Dataset artifacts are missing or inconsistent.

From the repository root, run:
  pnpm data:assemble   # assemble publish artifacts from existing per-GSE outputs

Regenerate canonical study outputs by running each bulk notebook stage in the
documented order. See datasets/docs/workflows.md for commands and review steps.
""".strip()


class DataValidationError(RuntimeError):
    """Raised when published dataset artifacts are not ready for the webapp."""


def read_json_list(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise DataValidationError(f"Missing metadata file: {path.relative_to(ROOT.parent)}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DataValidationError(
            f"Invalid JSON in {path.relative_to(ROOT.parent)}: {exc}"
        ) from exc
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise DataValidationError(
            f"Expected a JSON array of objects in {path.relative_to(ROOT.parent)}"
        )
    return value


def unique_values(items: list[dict[str, Any]], key: str, label: str) -> set[str]:
    values = [item.get(key) for item in items]
    if not all(isinstance(value, str) and value for value in values):
        raise DataValidationError(f"Every {label} entry must have a non-empty {key}")
    string_values = [value for value in values if isinstance(value, str)]
    if len(string_values) != len(set(string_values)):
        raise DataValidationError(f"Duplicate {key} values found in {label}")
    return set(string_values)


def expected_download_names(datasets: list[dict[str, Any]]) -> set[str]:
    expected: set[str] = set()
    for dataset in datasets:
        data_id = dataset.get("data_id")
        if not isinstance(data_id, str) or not data_id:
            continue
        file_names = dataset.get("data_file_names") or []
        if not isinstance(file_names, list):
            raise DataValidationError(f"data_file_names must be an array for {data_id}")
        for name in file_names:
            if not isinstance(name, str) or Path(name).name != name:
                raise DataValidationError(f"Unsafe or invalid download filename for {data_id}: {name!r}")
            expected.add(name)
            if name.endswith("_preprocessed.csv"):
                expected.add(f"{data_id}_preprocessed_ssgsea.csv")
    return expected


def validate() -> None:
    datasets = read_json_list(DATA_SUMMARY)
    summaries = read_json_list(GEO_SUMMARIES)
    origins = read_json_list(SAMPLE_ORIGIN)
    citations = read_json_list(PMC_CITATIONS)

    dataset_ids = unique_values(datasets, "data_id", "data summary")
    summary_ids = unique_values(summaries, "data_id", "GEO summaries")
    origin_ids = unique_values(origins, "data_id", "sample origins")

    if summary_ids != dataset_ids:
        raise DataValidationError(
            f"GEO summary coverage differs from data_summary.json: "
            f"missing={sorted(dataset_ids - summary_ids)}, extra={sorted(summary_ids - dataset_ids)}"
        )
    if origin_ids != dataset_ids:
        raise DataValidationError(
            f"Sample-origin coverage differs from data_summary.json: "
            f"missing={sorted(dataset_ids - origin_ids)}, extra={sorted(origin_ids - dataset_ids)}"
        )

    citation_ids = unique_values(citations, "pmcid", "PMC citations")
    required_pmcids = {
        pmcid
        for dataset in datasets
        for pmcid in dataset.get("pmcids", [])
        if isinstance(pmcid, str)
    }
    missing_citations = required_pmcids - citation_ids
    if missing_citations:
        raise DataValidationError(f"Missing PMC citations: {sorted(missing_citations)}")

    expected = expected_download_names(datasets)
    if not DOWNLOADS_DIR.is_dir():
        raise DataValidationError(
            f"Missing downloads directory: {DOWNLOADS_DIR.relative_to(ROOT.parent)}"
        )
    missing_downloads = sorted(name for name in expected if not (DOWNLOADS_DIR / name).is_file())
    if missing_downloads:
        preview = ", ".join(missing_downloads[:12])
        suffix = " ..." if len(missing_downloads) > 12 else ""
        raise DataValidationError(
            f"Missing {len(missing_downloads)} published downloads: {preview}{suffix}"
        )

    print(
        f"Published data is valid: {len(dataset_ids)} datasets, "
        f"{len(required_pmcids)} referenced publications, {len(expected)} downloads."
    )


def run_step(label: str, *command: str) -> None:
    print(f"\n==> {label}", flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


def assemble() -> None:
    run_step(
        "Build data_summary.json",
        sys.executable,
        "geo/scripts/combine_summaries_and_progress.py",
    )
    run_step(
        "Assemble downloads",
        sys.executable,
        "geo/scripts/prepare-download-files.py",
    )
    validate()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser(
        "assemble",
        help="Assemble publish artifacts from existing study outputs",
    )
    return parser


def main() -> int:
    build_parser().parse_args()
    try:
        assemble()
    except (DataValidationError, subprocess.CalledProcessError) as exc:
        print(f"\nERROR: {exc}\n\n{HELP}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
