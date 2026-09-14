from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from risk.risk_schema import RiskAssessment, RiskLevel


class PolicyAction(StrEnum):
    ALLOW = "ALLOW"
    SANITIZE = "SANITIZE"
    ISOLATE = "ISOLATE"
    BLOCK = "BLOCK"
    CONFIRM = "CONFIRM"


@dataclass(frozen=True, slots=True)
class PolicyDecision:
    action: PolicyAction
    risk_level: RiskLevel
    reason_code: str


class PolicyEngine:
    _ACTIONS = {
        RiskLevel.LOW: PolicyAction.ALLOW,
        RiskLevel.MEDIUM: PolicyAction.SANITIZE,
        RiskLevel.HIGH: PolicyAction.ISOLATE,
        RiskLevel.CRITICAL: PolicyAction.BLOCK,
    }

    def decide(self, assessment: RiskAssessment) -> PolicyDecision:
        return PolicyDecision(
            action=self._ACTIONS[assessment.level],
            risk_level=assessment.level,
            reason_code=f"RISK_{assessment.level.value}",
        )
