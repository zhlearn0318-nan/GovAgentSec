import unittest

from policy.policy_engine import PolicyAction, PolicyEngine
from risk.risk_schema import RiskAssessment, RiskLevel


class PolicyEngineTests(unittest.TestCase):
    def test_maps_each_risk_level_to_a_deterministic_action(self) -> None:
        engine = PolicyEngine()
        cases = {
            RiskLevel.LOW: PolicyAction.ALLOW,
            RiskLevel.MEDIUM: PolicyAction.SANITIZE,
            RiskLevel.HIGH: PolicyAction.ISOLATE,
            RiskLevel.CRITICAL: PolicyAction.BLOCK,
        }

        for level, expected_action in cases.items():
            with self.subTest(level=level):
                decision = engine.decide(
                    RiskAssessment(score=0.0, level=level)
                )
                self.assertEqual(decision.action, expected_action)
                self.assertEqual(decision.risk_level, level)

    def test_decision_exposes_stable_machine_readable_reason(self) -> None:
        decision = PolicyEngine().decide(
            RiskAssessment(score=0.8, level=RiskLevel.CRITICAL)
        )

        self.assertEqual(decision.reason_code, "RISK_CRITICAL")


if __name__ == "__main__":
    unittest.main()
