from __future__ import annotations

from typing import Protocol

from agent.state import SourceType
from risk.risk_schema import GuardSignal


class GuardPort(Protocol):
    name: str

    def scan(self, text: str, source: SourceType) -> GuardSignal:
        """Return a normalized risk signal for untrusted text."""
        ...

