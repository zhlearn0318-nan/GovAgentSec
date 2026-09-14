from __future__ import annotations

from agent.state import SourceType
from risk.risk_schema import GuardSignal


class BaselinePIGuard:
    """Offline engineering baseline; replace with the real PIGuard adapter."""

    name = "baseline_piguard"
    _INDICATORS = (
        "ignore all previous instructions",
        "ignore previous instructions",
        "disregard previous instructions",
        "reveal the system prompt",
        "show the system prompt",
        "override your instructions",
        "无视之前的指令",
        "忽略之前的指令",
        "忽略所有指令",
        "泄露系统提示词",
        "透露系统提示",
        "覆盖系统指令",
    )

    def scan(self, text: str, source: SourceType) -> GuardSignal:
        del source
        normalized = text.casefold()
        match_count = sum(item in normalized for item in self._INDICATORS)
        if match_count == 0:
            return GuardSignal(detector=self.name, score=0.0)
        return GuardSignal(
            detector=self.name,
            score=0.99 if match_count > 1 else 0.95,
            categories=("prompt_injection",),
            reasons=("matched prompt-injection indicator",),
        )

