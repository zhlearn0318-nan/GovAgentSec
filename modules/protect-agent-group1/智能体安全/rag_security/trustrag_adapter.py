from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Protocol

from .provenance import KnowledgeDocument


@dataclass(frozen=True, slots=True)
class TrustRAGResult:
    trusted_documents: tuple[KnowledgeDocument, ...]
    poison_score: float
    filtered_count: int
    available: bool = True

    def __post_init__(self) -> None:
        if not isinstance(self.trusted_documents, tuple) or not all(
            isinstance(document, KnowledgeDocument)
            for document in self.trusted_documents
        ):
            raise ValueError("trusted_documents must contain only documents")
        if not isfinite(self.poison_score) or not 0.0 <= self.poison_score <= 1.0:
            raise ValueError("poison_score must be between 0 and 1")
        if self.filtered_count < 0:
            raise ValueError("filtered_count must not be negative")


class TrustRAGPort(Protocol):
    def assess(
        self, query: str, documents: tuple[KnowledgeDocument, ...]
    ) -> TrustRAGResult:
        """Filter untrusted retrieval results and return normalized risk."""
        ...


@dataclass(frozen=True, slots=True)
class BaselineTrustRAG:
    """Offline provenance baseline; replace with a real TrustRAG adapter."""

    minimum_source_trust: float = 0.5
    maximum_poison_score: float = 0.8
    max_trusted_documents: int = 5

    def __post_init__(self) -> None:
        for name, value in (
            ("minimum_source_trust", self.minimum_source_trust),
            ("maximum_poison_score", self.maximum_poison_score),
        ):
            if not isfinite(value) or not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} must be between 0 and 1")
        if self.max_trusted_documents < 1:
            raise ValueError("max_trusted_documents must be positive")

    def assess(
        self, query: str, documents: tuple[KnowledgeDocument, ...]
    ) -> TrustRAGResult:
        if not query.strip():
            raise ValueError("query must not be blank")

        trusted: list[KnowledgeDocument] = []
        risks: list[float] = []
        filtered = 0
        for document in documents:
            provenance_risk = 0.0 if document.verified else 1.0
            trust_risk = 1.0 - document.source_trust
            document_risk = max(document.poison_score, provenance_risk, trust_risk)
            risks.append(document_risk)

            acceptable = (
                document.verified
                and document.source_trust >= self.minimum_source_trust
                and document.poison_score < self.maximum_poison_score
            )
            if acceptable and len(trusted) < self.max_trusted_documents:
                trusted.append(document)
            else:
                filtered += 1

        return TrustRAGResult(
            trusted_documents=tuple(trusted),
            poison_score=max(risks, default=0.0),
            filtered_count=filtered,
        )
