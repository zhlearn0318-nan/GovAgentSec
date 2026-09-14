from __future__ import annotations

from dataclasses import dataclass
from math import isfinite


MAX_DOCUMENT_CHARACTERS = 16_000
MAX_IDENTIFIER_CHARACTERS = 128


def _normalized_label(name: str, value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{name} must not be blank")
    if len(normalized) > MAX_IDENTIFIER_CHARACTERS:
        raise ValueError(f"{name} is too long")
    return normalized


def _probability(name: str, value: float) -> None:
    if not isfinite(value) or not 0.0 <= value <= 1.0:
        raise ValueError(f"{name} must be between 0 and 1")


@dataclass(frozen=True, slots=True)
class KnowledgeDocument:
    document_id: str
    content: str
    source: str
    source_trust: float
    verified: bool
    poison_score: float = 0.0

    def __post_init__(self) -> None:
        document_id = _normalized_label("document_id", self.document_id)
        source = _normalized_label("source", self.source)
        content = self.content.strip()
        if not content:
            raise ValueError("content must not be blank")
        if len(content) > MAX_DOCUMENT_CHARACTERS:
            raise ValueError("content is too long")
        _probability("source_trust", self.source_trust)
        _probability("poison_score", self.poison_score)
        object.__setattr__(self, "document_id", document_id)
        object.__setattr__(self, "source", source)
        object.__setattr__(self, "content", content)
