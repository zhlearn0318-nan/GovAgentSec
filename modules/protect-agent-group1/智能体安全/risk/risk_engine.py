from __future__ import annotations

from dataclasses import dataclass

from .risk_schema import RiskAssessment, RiskContext, RiskWeights
from .scoring import level_for_score


@dataclass(frozen=True, slots=True)
class RiskEngine:
    weights: RiskWeights = RiskWeights()

    def assess(self, context: RiskContext) -> RiskAssessment:
        unavailable = [
            signal.detector
            for signal in (
                context.injection,
                context.content,
                context.alignment,
                context.privilege,
                context.multi_turn,
            )
            if not signal.available
        ]
        if not context.rag_available:
            unavailable.append("trustrag")
        if unavailable:
            reasons = tuple(f"{name} unavailable" for name in unavailable)
            return RiskAssessment(
                score=1.0,
                level=level_for_score(1.0),
                reasons=reasons,
            )

        source_risk = 1.0 - context.source_trust
        effective_injection = max(
            context.injection.score,
            context.alignment.score,
        )
        effective_operation = max(
            context.operation_risk,
            context.privilege.score,
            context.multi_turn.score,
        )
        score = (
            self.weights.injection * effective_injection
            + self.weights.content * context.content.score
            + self.weights.rag * context.rag_risk
            + self.weights.source * source_risk
            + self.weights.operation * effective_operation
        )

        reasons: list[str] = []
        severe_signals = (
            ("prompt injection or task-payload hijack", effective_injection),
            ("harmful content", context.content.score),
            ("rag poisoning", context.rag_risk),
        )
        for name, value in severe_signals:
            if value >= 0.90:
                score = max(score, 0.60)
                reasons.append(f"high confidence {name}")

        elevated_count = sum(value >= 0.60 for _, value in severe_signals)
        if elevated_count >= 2:
            score = max(score, 0.80)
            reasons.append("multiple elevated security signals")

        if effective_operation >= 0.90:
            score = max(score, 0.80)
            reasons.append("critical operation, privilege, or conversation risk")

        score = min(max(score, 0.0), 1.0)
        return RiskAssessment(
            score=score,
            level=level_for_score(score),
            reasons=tuple(reasons),
        )
