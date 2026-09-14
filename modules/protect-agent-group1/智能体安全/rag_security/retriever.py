from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from .provenance import KnowledgeDocument


MAX_RETRIEVAL_RESULTS = 20


class RetrieverPort(Protocol):
    def retrieve(self, query: str, limit: int) -> tuple[KnowledgeDocument, ...]:
        """Return candidate documents from an untrusted retrieval boundary."""
        ...


@dataclass(frozen=True, slots=True)
class InMemoryRetriever:
    documents: tuple[KnowledgeDocument, ...] = ()

    def retrieve(self, query: str, limit: int) -> tuple[KnowledgeDocument, ...]:
        if not query.strip():
            raise ValueError("query must not be blank")
        if not 1 <= limit <= MAX_RETRIEVAL_RESULTS:
            raise ValueError(f"limit must be between 1 and {MAX_RETRIEVAL_RESULTS}")
        return self.documents[:limit]
