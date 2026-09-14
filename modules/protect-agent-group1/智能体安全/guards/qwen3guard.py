from __future__ import annotations

from agent.state import SourceType
from risk.risk_schema import GuardSignal


class BaselineQwen3Guard:
    """Offline engineering baseline; not a substitute for Qwen3Guard."""

    name = "baseline_qwen3guard"
    _JAILBREAK_INDICATORS = (
        "jailbreak mode",
        "disable safety",
        "bypass safety",
        "越狱模式",
        "无视安全限制",
        "绕过安全限制",
        "关闭安全策略",
    )
    _HARM_INDICATORS = (
        "教我制作炸弹",
        "如何制造炸弹",
        "制作炸弹的步骤",
        "how to build a bomb",
    )

    def scan(self, text: str, source: SourceType) -> GuardSignal:
        del source
        normalized = text.casefold()
        jailbreak = any(item in normalized for item in self._JAILBREAK_INDICATORS)
        harmful = any(item in normalized for item in self._HARM_INDICATORS)
        if not jailbreak and not harmful:
            return GuardSignal(detector=self.name, score=0.0)
        categories = tuple(
            category
            for category, matched in (
                ("jailbreak", jailbreak),
                ("harmful_content", harmful),
            )
            if matched
        )
        return GuardSignal(
            detector=self.name,
            score=0.99 if jailbreak and harmful else 0.95,
            categories=categories,
            reasons=("matched content-safety indicator",),
        )

