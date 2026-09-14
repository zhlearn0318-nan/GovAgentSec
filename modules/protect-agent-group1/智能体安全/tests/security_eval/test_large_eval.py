from __future__ import annotations

import unittest
from types import SimpleNamespace

from security_eval.large_eval import (
    evaluate_expanded_manifest,
    expand_manifest_rows,
    summarize_expanded_predictions,
)


class LargeEvaluationContractTests(unittest.TestCase):
    def test_each_manifest_row_expands_to_four_unique_hook_views(self) -> None:
        rows = [
            {
                "sample_id": "S001",
                "source": "web",
                "text": "Original untrusted text.",
                "normalized_text": "Normalized untrusted text.",
            },
            {
                "sample_id": "S002",
                "source": "user",
                "text": "第二条原文。",
                "normalized_text": "第二条规范文本。",
            },
        ]

        cases = expand_manifest_rows(rows)

        self.assertEqual(8, len(cases))
        self.assertEqual(8, len({case.prediction_id for case in cases}))
        self.assertEqual(
            {
                ("user_input", "original", "web", "Original untrusted text."),
                ("user_input", "normalized", "web", "Normalized untrusted text."),
                ("agent_output", "original", "agent_answer", "Original untrusted text."),
                ("agent_output", "normalized", "agent_answer", "Normalized untrusted text."),
            },
            {
                (case.target_mode, case.text_variant, case.evaluation_source, case.text)
                for case in cases
                if case.sample_id == "S001"
            },
        )

    def test_summary_keeps_primary_original_slice_separate_from_all_views(self) -> None:
        rows = []
        for target_mode in ("user_input", "agent_output"):
            for text_variant in ("original", "normalized"):
                rows.append(
                    {
                        "sample_id": "RISK",
                        "target_mode": target_mode,
                        "text_variant": text_variant,
                        "original_label": "risk",
                        "parsed_risk_label": "risk",
                        "dataset": "attack",
                        "source": "user",
                        "language": "en",
                        "core_category": "jailbreak",
                        "latency_ms": "10.0",
                        "error": "",
                    }
                )
        benign_predictions = {
            ("user_input", "original"): "benign",
            ("user_input", "normalized"): "risk",
            ("agent_output", "original"): "risk",
            ("agent_output", "normalized"): "benign",
        }
        for (target_mode, text_variant), prediction in benign_predictions.items():
            rows.append(
                {
                    "sample_id": "BENIGN",
                    "target_mode": target_mode,
                    "text_variant": text_variant,
                    "original_label": "benign",
                    "parsed_risk_label": prediction,
                    "dataset": "hard",
                    "source": "web",
                    "language": "en",
                    "core_category": "benign_hard_negative",
                    "latency_ms": "20.0",
                    "error": "",
                }
            )

        metrics = summarize_expanded_predictions(rows)

        self.assertEqual(8, metrics["prediction_count"])
        self.assertEqual(
            {"tp": 4, "fp": 2, "tn": 2, "fn": 0},
            metrics["all_views"]["confusion_matrix"],
        )
        self.assertEqual(4, metrics["primary_original"]["count"])
        self.assertEqual(
            {"tp": 2, "fp": 1, "tn": 1, "fn": 0},
            metrics["primary_original"]["confusion_matrix"],
        )
        self.assertEqual(0.5, metrics["hard_negative_fpr"])

    def test_evaluator_sends_only_view_text_and_source_to_detector(self) -> None:
        class RecordingAdapter:
            def __init__(self) -> None:
                self.calls = []

            def detect(self, text: str, source: str):
                self.calls.append((text, source))
                return SimpleNamespace(
                    normalized_text=text.strip(),
                    raw_output='{"policy":"ALLOW"}',
                    parsed_risk_label="benign",
                    risk_level="LOW",
                    categories=(),
                    risk_score=0.1,
                    retained=True,
                    latency_ms=1.25,
                    detectors_available=True,
                )

        adapter = RecordingAdapter()
        manifest = [
            {
                "sample_id": "S001",
                "dataset": "fixture",
                "source": "web",
                "label": "benign",
                "language": "en",
                "core_category": "benign_hard_negative",
                "content_type": "indirect",
                "synthetic": "false",
                "text": " Original ",
                "normalized_text": "Normalized",
            }
        ]

        predictions, metrics = evaluate_expanded_manifest(
            manifest,
            adapter,
            system_version="test-version",
            tested_at="2026-08-21T00:00:00+00:00",
            emit_progress=False,
        )

        self.assertEqual(
            [
                (" Original ", "web"),
                ("Normalized", "web"),
                (" Original ", "agent_answer"),
                ("Normalized", "agent_answer"),
            ],
            adapter.calls,
        )
        self.assertEqual(4, len(predictions))
        self.assertEqual("web", predictions[2]["source"])
        self.assertEqual("agent_answer", predictions[2]["evaluation_source"])
        self.assertEqual('{"policy":"ALLOW"}', predictions[2]["system_raw_output"])
        self.assertEqual(4, metrics["prediction_count"])


if __name__ == "__main__":
    unittest.main()
