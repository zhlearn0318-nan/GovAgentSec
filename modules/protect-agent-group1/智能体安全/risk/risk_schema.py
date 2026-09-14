from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from math import isfinite

from agent.state import SourceType


@dataclass(frozen=True, slots=True)
class GuardSignal:
    detector: str
    score: float
    categories: tuple[str, ...] = ()
    reasons: tuple[str, ...] = ()
    available: bool = True

    def __post_init__(self) -> None:
        detector = self.detector.strip()
        if not detector:
            raise ValueError("detector must not be blank")
        if not isfinite(self.score) or not 0.0 <= self.score <= 1.0:
            raise ValueError("score must be between 0 and 1")
        object.__setattr__(self, "detector", detector)


class RiskLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


def _validate_probability(name: str, value: float) -> None:
    if not isfinite(value) or not 0.0 <= value <= 1.0:
        raise ValueError(f"{name} must be between 0 and 1")


@dataclass(frozen=True, slots=True)
class RiskContext:
    source: SourceType
    injection: GuardSignal
    content: GuardSignal
    alignment: GuardSignal = GuardSignal("task_payload_alignment", 0.0)
    privilege: GuardSignal = GuardSignal("privilege_boundary", 0.0)
    multi_turn: GuardSignal = GuardSignal("conversation_risk", 0.0)
    rag_risk: float = 0.0
    source_trust: float = 0.6
    operation_risk: float = 0.0
    rag_available: bool = True

    def __post_init__(self) -> None:
        _validate_probability("rag_risk", self.rag_risk)
        _validate_probability("source_trust", self.source_trust)
        _validate_probability("operation_risk", self.operation_risk)


@dataclass(frozen=True, slots=True)
class RiskAssessment:
    score: float
    level: RiskLevel
    reasons: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        _validate_probability("score", self.score)


@dataclass(frozen=True, slots=True)
class RiskWeights:
    injection: float = 0.30
    content: float = 0.20
    rag: float = 0.25
    source: float = 0.10
    operation: float = 0.15

    def __post_init__(self) -> None:
        values = (
            self.injection,
            self.content,
            self.rag,
            self.source,
            self.operation,
        )
        for value in values:
            _validate_probability("weight", value)
        if abs(sum(values) - 1.0) > 1e-9:
            raise ValueError("risk weights must sum to 1")
