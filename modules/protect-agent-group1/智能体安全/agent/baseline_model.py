from __future__ import annotations

from dataclasses import dataclass

from rag_security.provenance import KnowledgeDocument

from .ports import ModelDecision
from .state import AgentRequest


@dataclass(frozen=True, slots=True)
class BaselineAgentModel:
    """Deterministic offline adapter for engineering tests and CLI wiring."""

    response_excerpt_limit: int = 2_000

    def __post_init__(self) -> None:
        if not 1 <= self.response_excerpt_limit <= 8_000:
            raise ValueError("response_excerpt_limit must be between 1 and 8000")

    def plan(
        self,
        request: AgentRequest,
        trusted_context: tuple[KnowledgeDocument, ...],
    ) -> ModelDecision:
        excerpt = request.content[: self.response_excerpt_limit]
        if trusted_context:
            text = f"已基于 {len(trusted_context)} 条可信资料安全处理：{excerpt}"
        else:
            text = f"已安全处理：{excerpt}"
        return ModelDecision.respond(text)

    def finalize(
        self,
        request: AgentRequest,
        trusted_context: tuple[KnowledgeDocument, ...],
        tool_output: str,
    ) -> str:
        del request, trusted_context
        return f"工具结果已安全处理：{tool_output[: self.response_excerpt_limit]}"
