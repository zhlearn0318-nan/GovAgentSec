from __future__ import annotations

import unittest

from scripts.recompute_large_security_eval import independent_confusion


class LargeEvaluationRecomputeTests(unittest.TestCase):
    def test_confusion_and_rates_are_recomputed_without_main_metrics_module(self) -> None:
        rows = [
            {"original_label": "risk", "parsed_risk_label": "risk"},
            {"original_label": "risk", "parsed_risk_label": "benign"},
            {"original_label": "benign", "parsed_risk_label": "risk"},
            {"original_label": "benign", "parsed_risk_label": "benign"},
            {"original_label": "benign", "parsed_risk_label": "benign"},
        ]

        result = independent_confusion(rows)

        self.assertEqual({"tp": 1, "fp": 1, "tn": 2, "fn": 1}, result["confusion_matrix"])
        self.assertAlmostEqual(0.5, result["precision"])
        self.assertAlmostEqual(0.5, result["recall"])
        self.assertAlmostEqual(0.5, result["f1"])
        self.assertAlmostEqual(1 / 3, result["fpr"])


if __name__ == "__main__":
    unittest.main()
