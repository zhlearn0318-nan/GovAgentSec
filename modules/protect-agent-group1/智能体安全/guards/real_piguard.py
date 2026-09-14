from __future__ import annotations

import os
import re
import sys
from math import isfinite
from pathlib import Path
from typing import Any, Protocol

from agent.state import SourceType
from risk.risk_schema import GuardSignal


_PRIMARY_TASK_RE = re.compile(
    r"\b(?:Question|User task|Original task|User request)\s*:",
    re.IGNORECASE,
)
_EXTERNAL_PAYLOAD_RE = re.compile(
    r"\b(?:"
    r"Untrusted\s+(?:email content|tool response|retrieval result|result|content)"
    r"|External\s+(?:email|page|article|content|document|post|record|message|tool response)"
    r")\s*:",
    re.IGNORECASE,
)


def external_payload_for_piguard(text: str, source: SourceType) -> str:
    """Remove evaluation/task envelope while preserving untrusted payload text."""
    if source not in (SourceType.WEB, SourceType.RAG):
        return text
    payload_match = _EXTERNAL_PAYLOAD_RE.search(text)
    if payload_match is None:
        return text
    task_match = _PRIMARY_TASK_RE.search(text)
    prefix = ""
    if task_match is not None and task_match.start() < payload_match.start():
        prefix = text[: task_match.start()].strip()
    payload = text[payload_match.end() :].strip()
    scoped = "\n".join(part for part in (prefix, payload) if part)
    return scoped or text


class PIGuardBackend(Protocol):
    def injection_probability(self, text: str) -> float:
        """Return the real model probability for the injection class."""
        ...


class LocalPIGuardBackend:
    """Lazy, local-only Hugging Face backend for the official PIGuard weights."""

    def __init__(
        self,
        model_path: Path | str,
        *,
        device: str = "cuda",
        modules_cache: Path | str | None = None,
    ) -> None:
        self.model_path = Path(model_path).resolve()
        self.device = device
        self.modules_cache = Path(
            modules_cache
            or Path(__file__).resolve().parents[1] / "outputs" / "hf_modules_cache"
        ).resolve()
        self._torch: Any | None = None
        self._tokenizer: Any | None = None
        self._model: Any | None = None
        self._injection_label_id: int | None = None

    def _prepare_dynamic_module_cache(self) -> None:
        self.modules_cache.mkdir(parents=True, exist_ok=True)
        os.environ["HF_MODULES_CACHE"] = str(self.modules_cache)
        for module_name in (
            "transformers.utils",
            "transformers.utils.hub",
            "transformers.dynamic_module_utils",
        ):
            loaded_module = sys.modules.get(module_name)
            if loaded_module is not None:
                loaded_module.HF_MODULES_CACHE = str(self.modules_cache)

    def _load(self) -> None:
        if self._model is not None:
            return
        if not self.model_path.is_dir():
            raise FileNotFoundError(f"PIGuard model directory not found: {self.model_path}")
        if not (self.model_path / "model.safetensors").is_file():
            raise FileNotFoundError("PIGuard model.safetensors is missing")

        self._prepare_dynamic_module_cache()
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer

        if self.device.startswith("cuda") and not torch.cuda.is_available():
            raise RuntimeError("PIGuard CUDA inference was requested but CUDA is unavailable")
        tokenizer = AutoTokenizer.from_pretrained(
            str(self.model_path), local_files_only=True, trust_remote_code=True
        )
        model = AutoModelForSequenceClassification.from_pretrained(
            str(self.model_path), local_files_only=True, trust_remote_code=True
        ).to(self.device).eval()
        label2id = {
            str(label).casefold(): int(identifier)
            for label, identifier in model.config.label2id.items()
        }
        if "injection" not in label2id:
            raise RuntimeError(f"unexpected PIGuard label mapping: {model.config.label2id}")
        self._torch = torch
        self._tokenizer = tokenizer
        self._model = model
        self._injection_label_id = label2id["injection"]

    def injection_probability(self, text: str) -> float:
        self._load()
        encoded = self._tokenizer(
            text, truncation=True, max_length=512, return_tensors="pt"
        ).to(self.device)
        with self._torch.inference_mode():
            logits = self._model(**encoded).logits
            probability = self._torch.softmax(logits, dim=-1)[
                0, self._injection_label_id
            ].item()
        return float(probability)


class RealPIGuard:
    """Normalize the real PIGuard classifier decision for the security pipeline."""

    name = "piguard_real"

    def __init__(
        self,
        backend: PIGuardBackend,
        *,
        threshold: float = 0.5,
        scope_external_payload: bool = True,
    ) -> None:
        if not isfinite(threshold) or not 0.0 < threshold < 1.0:
            raise ValueError("threshold must be between zero and one")
        self.backend = backend
        self.threshold = threshold
        self.scope_external_payload = scope_external_payload

    def scan(self, text: str, source: SourceType) -> GuardSignal:
        model_input = (
            external_payload_for_piguard(text, source)
            if self.scope_external_payload
            else text
        )
        input_scope = "external_payload" if model_input != text else "full_input"
        probability = float(self.backend.injection_probability(model_input))
        if not isfinite(probability) or not 0.0 <= probability <= 1.0:
            raise ValueError("PIGuard returned an invalid probability")
        detected = probability >= self.threshold
        return GuardSignal(
            detector=self.name,
            score=max(probability, 0.90) if detected else probability,
            categories=("prompt_injection",) if detected else (),
            reasons=(
                f"model_probability={probability:.6f}",
                f"decision_threshold={self.threshold:.6f}",
                f"input_scope={input_scope}",
            ),
        )
