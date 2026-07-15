#!/usr/bin/env python3
"""Assemble the flat, server-ready download directory."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent.parent
GEO = ROOT / "geo"
METADATA = ROOT / "publish" / "metadata"
DATA_SUMMARY = METADATA / "data_summary.json"
OUT = ROOT / "publish" / "downloads"


def file_names_to_publish(meta: dict[str, Any]) -> list[str]:
    names = list(meta.get("data_file_names") or [])
    data_id = meta.get("data_id")
    for name in meta.get("data_file_names") or []:
        if not name.endswith("_preprocessed.csv"):
            continue
        if data_id:
            names.append(f"{data_id}_preprocessed_ssgsea.csv")
    return list(dict.fromkeys(names))


def expected_sources(datasets: list[dict[str, Any]]) -> dict[str, Path]:
    sources: dict[str, Path] = {}
    for meta in datasets:
        data_id = meta.get("data_id")
        if not isinstance(data_id, str) or not data_id:
            raise ValueError("Every dataset must have a non-empty data_id")
        gse_dir = GEO / data_id
        for name in file_names_to_publish(meta):
            if Path(name).name != name:
                raise ValueError(f"Unsafe download filename for {data_id}: {name!r}")
            source = gse_dir / name
            previous = sources.get(name)
            if previous is not None and previous != source:
                raise ValueError(f"Duplicate published filename: {name}")
            sources[name] = source
    return sources


def same_file_state(source: Path, destination: Path) -> bool:
    if not destination.is_file():
        return False
    source_stat = source.stat()
    destination_stat = destination.stat()
    return (
        source_stat.st_size == destination_stat.st_size
        and source_stat.st_mtime_ns == destination_stat.st_mtime_ns
    )


def main() -> None:
    datasets = json.loads(DATA_SUMMARY.read_text(encoding="utf-8"))
    sources = expected_sources(datasets)
    missing_sources = [path for path in sources.values() if not path.is_file()]
    if missing_sources:
        preview = "\n".join(f"- {path.relative_to(ROOT)}" for path in missing_sources[:20])
        suffix = "\n- ..." if len(missing_sources) > 20 else ""
        raise FileNotFoundError(
            f"Missing {len(missing_sources)} canonical download sources:\n{preview}{suffix}"
        )

    OUT.mkdir(parents=True, exist_ok=True)
    expected_names = set(sources)
    for existing in OUT.iterdir():
        if existing.is_file() and existing.name not in expected_names:
            existing.unlink()
            print(f"removed stale: {existing.relative_to(ROOT)}")

    for name, source in sorted(sources.items()):
        destination = OUT / name
        if same_file_state(source, destination):
            continue
        shutil.copy2(source, destination)
        print(f"copied: {source.relative_to(ROOT)} -> {destination.relative_to(ROOT)}")

    print(f"published {len(expected_names)} downloads")


if __name__ == "__main__":
    main()
