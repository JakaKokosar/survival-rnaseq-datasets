from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
KM_PATH = ROOT / "apps" / "web" / "public" / "py" / "km.py"
SPEC = importlib.util.spec_from_file_location("browser_km", KM_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load {KM_PATH}")
km = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(km)


class HallmarkRankingTests(unittest.TestCase):
    def test_ranks_valid_hallmarks_and_keeps_invalid_splits_last(self) -> None:
        csv_text = """time,event,HALLMARK_SIGNAL,HALLMARK_WEAK,HALLMARK_CONSTANT,HALLMARK_MISSING
1,1,1,1,5,
2,1,2,6,5,
3,1,3,2,5,
10,1,4,5,5,
11,1,5,3,5,
12,1,6,4,5,
"""

        payload = json.loads(km.compute_hallmark_ranking(csv_text, "time", "event"))
        results = payload["results"]

        self.assertEqual(payload["analysisVersion"], "hallmark-logrank-v2")
        self.assertEqual(results[0]["hallmark"], "HALLMARK_SIGNAL")
        self.assertEqual(results[0]["status"], "ok")
        self.assertEqual(results[0]["cutoff"], 3.5)
        self.assertEqual((results[0]["lowN"], results[0]["highN"]), (3, 3))
        self.assertIsNotNone(results[0]["pValue"])
        self.assertNotIn("qValue", results[0])
        self.assertEqual(results[-2]["hallmark"], "HALLMARK_CONSTANT")
        self.assertEqual(results[-2]["status"], "invalid_split")
        self.assertEqual(results[-1]["hallmark"], "HALLMARK_MISSING")
        self.assertEqual(results[-1]["status"], "insufficient_data")

    def test_marks_no_event_endpoint_as_unavailable(self) -> None:
        csv_text = """time,event,HALLMARK_TEST
1,0,1
2,0,2
3,0,3
4,0,4
"""

        payload = json.loads(km.compute_hallmark_ranking(csv_text, "time", "event"))

        self.assertEqual(payload["results"][0]["status"], "no_events")
        self.assertIsNone(payload["results"][0]["pValue"])

if __name__ == "__main__":
    unittest.main()
