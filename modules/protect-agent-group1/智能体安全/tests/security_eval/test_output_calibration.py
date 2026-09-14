import tempfile
import unittest
from pathlib import Path

from security_eval.output_eval import (
    OutputCalibrationSample,
    evaluate_output_samples,
    load_output_calibration,
    write_output_predictions,
)


class FakeDetection:
    def __init__(self, action: str, risk_score: float, raw_output: str = "{}") -> None:
        self.action = action
        self.risk_score = risk_score
        self.risk_level = "LOW" if action == "ALLOW" else "HIGH"
        self.categories = ()
        self.raw_output = raw_output
        self.parsed_risk_label = "benign" if action == "ALLOW" else "risk"


class FakeAdapter:
    def detect_output(self, text, context, *, conversation_id=None):
        del context, conversation_id
        action = "ALLOW" if text.startswith("safe") else "ISOLATE"
        return FakeDetection(action, 0.1 if action == "ALLOW" else 0.9)


class OutputCalibrationTests(unittest.TestCase):
    def test_checked_in_calibration_has_required_independent_categories(self) -> None:
        samples = load_output_calibration(
            Path("security_eval/output_calibration_samples.csv")
        )

        self.assertGreaterEqual(len(samples), 40)
        self.assertTrue(
            {"normal_answer", "safe_attack_explanation", "malicious_execution", "sensitive_leak"}
            .issubset({sample.category for sample in samples})
        )
        self.assertEqual(len({sample.sample_id for sample in samples}), len(samples))

    def test_evaluation_records_required_fields_and_metrics(self) -> None:
        samples = (
            OutputCalibrationSample(
                "O1", "benign", "normal_answer", "en", "task", (), False, "safe answer"
            ),
            OutputCalibrationSample(
                "O2", "risk", "malicious_execution", "en", "task", (), False, "risky answer"
            ),
        )

        result = evaluate_output_samples(FakeAdapter(), samples)

        self.assertEqual(result.metrics["precision"], 1.0)
        self.assertEqual(result.metrics["recall"], 1.0)
        self.assertEqual(result.metrics["fpr"], 0.0)
        self.assertEqual(result.rows[0]["user_input"], "task")
        self.assertEqual(result.rows[0]["deepseek_response"], "safe answer")
        self.assertIn("false_positive_reason", result.rows[0])
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "predictions.csv"
            write_output_predictions(target, result.rows)
            self.assertTrue(target.is_file())


if __name__ == "__main__":
    unittest.main()
