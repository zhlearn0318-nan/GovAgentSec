from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


MAX_INPUT_CHARACTERS = 16_000


class SourceType(StrEnum):
    USER = "user"
    WEB = "web"
    FILE = "file"
    RAG = "rag"
    MEMORY = "memory"
    TOOL = "tool"


@dataclass(frozen=True, slots=True)
class AgentRequest:
    content: str
    source: SourceType = SourceType.USER
    use_rag: bool | None = None
    conversation_id: str | None = None

    def __post_init__(self) -> None:
        normalized = self.content.strip()
        if not normalized:
            raise ValueError("content must not be blank")
        if len(normalized) > MAX_INPUT_CHARACTERS:
            raise ValueError(
                f"content exceeds the {MAX_INPUT_CHARACTERS} character limit"
            )
        object.__setattr__(self, "content", normalized)
        if self.conversation_id is not None:
            conversation_id = self.conversation_id.strip()
            if (
                not conversation_id
                or len(conversation_id) > 128
                or any(ord(character) < 32 for character in conversation_id)
            ):
                raise ValueError("conversation_id has an invalid format")
            object.__setattr__(self, "conversation_id", conversation_id)
