from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from policy.policy_engine import PolicyDecision
from risk.risk_schema import RiskAssessment
from tools.base import ToolOutcome


class AgentStatus(StrEnum):
    COMPLETED = "COMPLETED"
    SANITIZATION_REQUIRED = "SANITIZATION_REQUIRED"
    ISOLATED = "ISOLATED"
    BLOCKED = "BLOCKED"
    DENIED = "DENIED"
    CONFIRMATION_REQUIRED = "CONFIRMATION_REQUIRED"
    ERROR = "ERROR"


@dataclass(frozen=True, slots=True)
class AgentResponse:
    status: AgentStatus
    content: str
    assessment: RiskAssessment
    decision: PolicyDecision
    used_rag: bool = False
    tool_outcome: ToolOutcome | None = None

    def __post_init__(self) -> None:
        content = self.content.strip()
        if not content:
            raise ValueError("response content must not be blank")
        object.__setattr__(self, "content", content)
