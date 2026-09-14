import unittest

from agent.state import SourceType
from risk.risk_engine import RiskEngine
from risk.risk_schema import GuardSignal, RiskContext, RiskLevel
from risk.scoring import level_for_score


def signal(name: str, score: float, *, available: bool = True) -> GuardSignal:
    return GuardSignal(detector=name, score=score, available=available)


class RiskScoringTests(unittest.TestCase):
    def test_risk_level_boundaries_are_half_open(self) -> None:
        self.assertEqual(level_for_score(0.2999), RiskLevel.LOW)
        self.assertEqual(level_for_score(0.30), RiskLevel.MEDIUM)
        self.assertEqual(level_for_score(0.60), RiskLevel.HIGH)
        self.assertEqual(level_for_score(0.80), RiskLevel.CRITICAL)

    def test_uses_documented_weighted_formula(self) -> None:
        context = RiskContext(
            source=SourceType.WEB,
            injection=signal("pig", 0.5),
            content=signal("qwen", 0.5),
            rag_risk=0.5,
            source_trust=0.5,
            operation_risk=0.5,
        )

        assessment = RiskEngine().assess(context)

        self.assertAlmostEqual(assessment.score, 0.5)
        self.assertEqual(assessment.level, RiskLevel.MEDIUM)

    def test_guard_unavailability_fails_closed(self) -> None:
        context = RiskContext(
            source=SourceType.USER,
            injection=signal("pig", 0.0, available=False),
            content=signal("qwen", 0.0),
        )

        assessment = RiskEngine().assess(context)

        self.assertEqual(assessment.score, 1.0)
        self.assertEqual(assessment.level, RiskLevel.CRITICAL)
        self.assertIn("pig unavailable", assessment.reasons)

    def test_high_confidence_signal_cannot_be_diluted_by_weights(self) -> None:
        context = RiskContext(
            source=SourceType.USER,
            injection=signal("pig", 0.95),
            content=signal("qwen", 0.0),
            source_trust=1.0,
        )

        assessment = RiskEngine().assess(context)

        self.assertEqual(assessment.score, 0.60)
        self.assertEqual(assessment.level, RiskLevel.HIGH)

    def test_task_payload_hijack_contributes_as_effective_injection(self) -> None:
        context = RiskContext(
            source=SourceType.RAG,
            injection=signal("pig", 0.02),
            content=signal("qwen", 0.0),
            alignment=signal("alignment", 0.95),
            source_trust=0.5,
        )

        assessment = RiskEngine().assess(context)

        self.assertGreaterEqual(assessment.score, 0.60)
        self.assertEqual(assessment.level, RiskLevel.HIGH)

    def test_privilege_boundary_contributes_as_effective_operation_risk(self) -> None:
        context = RiskContext(
            source=SourceType.USER,
            injection=signal("pig", 0.0),
            content=signal("qwen", 0.0),
            privilege=signal("privilege", 0.98),
        )

        assessment = RiskEngine().assess(context)

        self.assertGreaterEqual(assessment.score, 0.80)
        self.assertEqual(assessment.level, RiskLevel.CRITICAL)

    def test_multi_turn_attack_chain_contributes_as_effective_operation_risk(self) -> None:
        context = RiskContext(
            source=SourceType.MEMORY,
            injection=signal("pig", 0.0),
            content=signal("qwen", 0.0),
            multi_turn=signal("conversation", 0.95),
        )

        assessment = RiskEngine().assess(context)

        self.assertGreaterEqual(assessment.score, 0.80)
        self.assertEqual(assessment.level, RiskLevel.CRITICAL)

    def test_rejects_invalid_context_score(self) -> None:
        with self.assertRaisesRegex(ValueError, "source_trust"):
            RiskContext(
                source=SourceType.USER,
                injection=signal("pig", 0.0),
                content=signal("qwen", 0.0),
                source_trust=1.1,
            )


if __name__ == "__main__":
    unittest.main()
