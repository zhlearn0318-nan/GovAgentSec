from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from rag_security.provenance import KnowledgeDocument
from tools.base import ToolRequest

from .state import AgentRequest


MAX_MODEL_OUTPUT_CHARACTERS = 16_000


class ModelAction(StrEnum):
    RESPOND = "RESPOND"
    TOOL = "TOOL"


@dataclass(frozen=True, slots=True)
class ModelDecision:
    action: ModelAction
    response_text: str = ""
    tool_request: ToolRequest | None = None

    def __post_init__(self) -> None:
        response_text = self.response_text.strip()
        if len(response_text) > MAX_MODEL_OUTPUT_CHARACTERS:
            raise ValueError("model response is too long")
        if self.action is ModelAction.RESPOND:
            if not response_text or self.tool_request is not None:
                raise ValueError("response decisions require only response_text")
        elif not isinstance(self.tool_request, ToolRequest) or response_text:
            raise ValueError("tool decisions require only tool_request")
        object.__setattr__(self, "response_text", response_text)

    @classmethod
    def respond(cls, text: str) -> ModelDecision:
        return cls(action=ModelAction.RESPOND, response_text=text)

    @classmethod
    def use_tool(cls, request: ToolRequest) -> ModelDecision:
        return cls(action=ModelAction.TOOL, tool_request=request)


class AgentModelPort(Protocol):
    def plan(
        self,
        request: AgentRequest,
        trusted_context: tuple[KnowledgeDocument, ...],
    ) -> ModelDecision:
        """Return a validated response or structured tool request."""
        ...

    def finalize(
        self,
        request: AgentRequest,
        trusted_context: tuple[KnowledgeDocument, ...],
        tool_output: str,
    ) -> str:
        """Produce a final answer from a screened tool response."""
        ...
