"""RAG provenance contracts, retrieval ports, and poison filtering."""

from .provenance import KnowledgeDocument
from .real_trustrag import LocalOfficialTrustRAGBackend, OfficialTrustRAG
from .retriever import InMemoryRetriever, RetrieverPort
from .trustrag_adapter import BaselineTrustRAG, TrustRAGPort, TrustRAGResult

__all__ = [
    "BaselineTrustRAG",
    "InMemoryRetriever",
    "KnowledgeDocument",
    "LocalOfficialTrustRAGBackend",
    "OfficialTrustRAG",
    "RetrieverPort",
    "TrustRAGPort",
    "TrustRAGResult",
]
