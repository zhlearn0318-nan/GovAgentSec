from __future__ import annotations

import importlib.util
import sys
import types
from collections import defaultdict, deque
from pathlib import Path
from typing import Any, Protocol

from .provenance import KnowledgeDocument
from .trustrag_adapter import TrustRAGResult


class TrustRAGBackend(Protocol):
    def retained_mask(self, texts: tuple[str, ...]) -> tuple[bool, ...]:
        """Return one retention decision for every unchanged input text."""
        ...


class LocalOfficialTrustRAGBackend:
    """TrustRAG's official kmeans_ngram removal stage with local SimCSE."""

    def __init__(
        self,
        embedding_model_path: Path | str,
        official_module_path: Path | str,
        *,
        device: str = "cuda",
    ) -> None:
        self.embedding_model_path = Path(embedding_model_path).resolve()
        self.official_module_path = Path(official_module_path).resolve()
        self.device = device
        self._numpy: Any | None = None
        self._tokenizer: Any | None = None
        self._model: Any | None = None
        self._official: Any | None = None

    def _load_official_module(self) -> Any:
        utility_stub = types.ModuleType("src.utils")
        utility_stub.progress_bar = lambda iterable, **_: iterable
        previous = sys.modules.get("src.utils")
        sys.modules["src.utils"] = utility_stub
        try:
            spec = importlib.util.spec_from_file_location(
                "integrated_trustrag_official_defend_module",
                self.official_module_path,
            )
            if spec is None or spec.loader is None:
                raise RuntimeError("cannot load official TrustRAG defend_module.py")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
        finally:
            if previous is None:
                sys.modules.pop("src.utils", None)
            else:
                sys.modules["src.utils"] = previous

    def _load(self) -> None:
        if self._model is not None:
            return
        if not self.embedding_model_path.is_dir():
            raise FileNotFoundError(
                f"TrustRAG embedding model not found: {self.embedding_model_path}"
            )
        if not self.official_module_path.is_file():
            raise FileNotFoundError(
                f"TrustRAG official module not found: {self.official_module_path}"
            )

        import numpy as np
        import torch
        from transformers import AutoModel, AutoTokenizer

        if self.device != "cuda" or not torch.cuda.is_available():
            raise RuntimeError(
                "official TrustRAG embedding code requires the default CUDA device"
            )
        tokenizer = AutoTokenizer.from_pretrained(
            str(self.embedding_model_path), local_files_only=True
        )
        model = AutoModel.from_pretrained(
            str(self.embedding_model_path), local_files_only=True
        ).cuda().eval()
        self._numpy = np
        self._tokenizer = tokenizer
        self._model = model
        self._official = self._load_official_module()

    @staticmethod
    def _map_unchanged_outputs(
        inputs: tuple[str, ...], retained: list[str]
    ) -> tuple[bool, ...]:
        positions: dict[str, deque[int]] = defaultdict(deque)
        for index, text in enumerate(inputs):
            positions[text].append(index)
        retained_positions: set[int] = set()
        for output in retained:
            text = str(output)
            if not positions[text]:
                raise ValueError("TrustRAG returned text that was not an unchanged input")
            retained_positions.add(positions[text].popleft())
        return tuple(index in retained_positions for index in range(len(inputs)))

    def retained_mask(self, texts: tuple[str, ...]) -> tuple[bool, ...]:
        if len(texts) < 2:
            return tuple(True for _ in texts)
        self._load()
        embeddings = [
            self._official.get_sentence_embedding(text, self._tokenizer, self._model)
            .detach()
            .cpu()
            .numpy()[0]
            for text in texts
        ]
        _, retained_texts = self._official.k_mean_filtering(
            self._numpy.asarray(embeddings), list(texts), [], True
        )
        return self._map_unchanged_outputs(texts, list(retained_texts))


class OfficialTrustRAG:
    """Normalize TrustRAG removal decisions for the agent's RAG port."""

    def __init__(self, backend: TrustRAGBackend) -> None:
        self.backend = backend

    def assess(
        self, query: str, documents: tuple[KnowledgeDocument, ...]
    ) -> TrustRAGResult:
        if not query.strip():
            raise ValueError("query must not be blank")
        mask = self.backend.retained_mask(tuple(doc.content for doc in documents))
        if len(mask) != len(documents) or not all(isinstance(value, bool) for value in mask):
            raise ValueError("TrustRAG backend returned an invalid retention mask")
        trusted = tuple(doc for doc, retained in zip(documents, mask) if retained)
        filtered = len(documents) - len(trusted)
        return TrustRAGResult(
            trusted_documents=trusted,
            poison_score=filtered / len(documents) if documents else 0.0,
            filtered_count=filtered,
        )
