#!/usr/bin/env python3
"""Execute GEO pipeline notebooks in place under this tree (datasets/geo).

Usage (from repository root)—each run targets one notebook name across all GSE dirs:

    python datasets/geo/scripts/bulk_execute_geo_notebooks.py -n prepare_data.ipynb
    python datasets/geo/scripts/bulk_execute_geo_notebooks.py -n preprocess_data.ipynb
    python datasets/geo/scripts/bulk_execute_geo_notebooks.py -n ssgsea_analysis.ipynb
    python datasets/geo/scripts/bulk_execute_geo_notebooks.py -n sa_endpoints_stats.ipynb

Pass -n more than once only if you want several types executed in one process.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def paths_for_script() -> tuple[Path, Path]:
    """Return (geo_root, workspace_root).

    geo_root is datasets/geo (parent of this scripts/ directory).
    workspace_root is the repository root (parent of datasets/).
    """
    script_dir = Path(__file__).resolve().parent
    geo_root = script_dir.parent
    workspace_root = geo_root.parent.parent
    return geo_root, workspace_root


def discover_notebooks(geo_root: Path, notebook_name: str) -> list[Path]:
    """Return sorted absolute notebook paths under geo_root matching notebook_name."""
    return sorted(p.resolve() for p in geo_root.glob(f"**/{notebook_name}"))


def validate_notebook_basename(name: str) -> None:
    """Ensure name is a single path segment and ends with .ipynb."""
    if Path(name).name != name or not name.endswith(".ipynb"):
        raise ValueError("notebook must be a single .ipynb filename (no directories).")


def run_notebook(notebook_path: Path, workspace_root: Path) -> bool:
    """Execute one notebook in place with nbconvert. Returns True on success."""
    command = [
        sys.executable,
        "-m",
        "nbconvert",
        "--execute",
        "--to",
        "notebook",
        "--inplace",
        str(notebook_path),
    ]
    result = subprocess.run(command, cwd=workspace_root)
    return result.returncode == 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run nbconvert --execute on all matching notebooks under datasets/geo."
    )
    parser.add_argument(
        "--notebook",
        "-n",
        action="extend",
        nargs="+",
        required=True,
        metavar="NAME",
        help=(
            "Notebook filename under each GSE (typically one per invocation). "
            "Repeat -n only to run multiple names in sequence. "
            "Examples: prepare_data.ipynb, preprocess_data.ipynb, "
            "ssgsea_analysis.ipynb, sa_endpoints_stats.ipynb."
        ),
    )
    return parser.parse_args()


def main() -> int:
    """Execute all discovered notebooks; log failures and continue."""
    args = parse_args()

    for name in args.notebook:
        try:
            validate_notebook_basename(name)
        except ValueError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2

    geo_root, workspace_root = paths_for_script()

    notebooks: list[Path] = []
    for name in args.notebook:
        found = discover_notebooks(geo_root, name)
        if not found:
            print(f"warning: no {name} notebooks under {geo_root}.", file=sys.stderr)
        notebooks.extend(found)

    if not notebooks:
        print(f"No matching notebooks found under {geo_root}.")
        return 1

    labels = ", ".join(args.notebook)
    print(f"Found {len(notebooks)} notebooks to execute ({labels}).")
    failed: list[Path] = []
    for notebook_path in notebooks:
        rel_path = notebook_path.relative_to(workspace_root)
        print(f"Executing: {rel_path}")
        if not run_notebook(notebook_path, workspace_root):
            failed.append(rel_path)
            print(f"FAILED: {rel_path} (nbconvert exited non-zero)", file=sys.stderr)

    ok = len(notebooks) - len(failed)
    print(f"Done: {ok}/{len(notebooks)} succeeded, {len(failed)} failed.")
    if failed:
        print("Failed notebooks:", file=sys.stderr)
        for p in failed:
            print(f"  {p}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
