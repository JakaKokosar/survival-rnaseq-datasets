from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import call, patch


DATASETS_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DATASETS_ROOT))

from tools import data_pipeline  # noqa: E402
from tools.data_pipeline import expected_download_names  # noqa: E402


class ExpectedDownloadNamesTests(unittest.TestCase):
    def test_adds_ssgsea_derivative_for_preprocessed_files(self) -> None:
        datasets = [
            {
                "data_id": "GSE123",
                "data_file_names": ["GSE123_original.csv", "GSE123_preprocessed.csv"],
            }
        ]

        self.assertEqual(
            expected_download_names(datasets),
            {
                "GSE123_original.csv",
                "GSE123_preprocessed.csv",
                "GSE123_preprocessed_ssgsea.csv",
            },
        )

    def test_rejects_nested_download_paths(self) -> None:
        datasets = [{"data_id": "GSE123", "data_file_names": ["nested/data.csv"]}]

        with self.assertRaisesRegex(RuntimeError, "Unsafe or invalid"):
            expected_download_names(datasets)


class AssembleTests(unittest.TestCase):
    @patch.object(data_pipeline, "validate")
    @patch.object(data_pipeline, "run_step")
    def test_builds_catalog_before_publishing(self, run_step_mock, validate_mock) -> None:
        data_pipeline.assemble()

        self.assertEqual(
            run_step_mock.call_args_list,
            [
                call(
                    "Build data_summary.json",
                    sys.executable,
                    "geo/scripts/combine_summaries_and_progress.py",
                ),
                call(
                    "Assemble downloads",
                    sys.executable,
                    "geo/scripts/prepare-download-files.py",
                ),
            ],
        )
        validate_mock.assert_called_once_with()
if __name__ == "__main__":
    unittest.main()
