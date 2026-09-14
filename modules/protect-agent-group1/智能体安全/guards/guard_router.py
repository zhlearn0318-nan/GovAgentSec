from __future__ import annotations

from agent.state import SourceType
from risk.risk_schema import GuardSignal

from .base import GuardPort


class GuardRouter:
    def scan(self, guard: GuardPort, text: str, source: SourceType) -> GuardSignal:
        try:
            detector_name = str(guard.name).strip() or "unknown_guard"
        except Exception:
            detector_name = "unknown_guard"
        try:
            signal = guard.scan(text, source)
            if not isinstance(signal, GuardSignal):
                raise TypeError("invalid detector output")
            return signal
        except Exception:
            return GuardSignal(
                detector=detector_name,
                score=1.0,
                categories=("detector_unavailable",),
                reasons=("security detector failed",),
                available=False,
            )
