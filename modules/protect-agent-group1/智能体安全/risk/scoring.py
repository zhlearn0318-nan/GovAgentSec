from __future__ import annotations

from math import isfinite

from .risk_schema import RiskLevel


def level_for_score(score: float) -> RiskLevel:
    if not isfinite(score) or not 0.0 <= score <= 1.0:
        raise ValueError("score must be between 0 and 1")
    if score < 0.30:
        return RiskLevel.LOW
    if score < 0.60:
        return RiskLevel.MEDIUM
    if score < 0.80:
        return RiskLevel.HIGH
    return RiskLevel.CRITICAL

