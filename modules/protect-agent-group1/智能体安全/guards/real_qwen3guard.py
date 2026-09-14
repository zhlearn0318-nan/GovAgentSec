from __future__ import annotations

import re
from dataclasses import dataclass
from math import isfinite
from pathlib import Path
from typing import Any, Protocol

from agent.state import SourceType
from risk.risk_schema import GuardSignal


_SAFETY_RE = re.compile(r"^Safety:\s*(Safe|Unsafe|Controversial)\s*$", re.MULTILINE)
_CATEGORIES_RE = re.compile(r"^Categories:\s*([^\r\n]+)\s*$", re.MULTILINE)
_CATEGORY_MAP = {
    "violent": "violent",
    "non-violent illegal acts": "non_violent_illegal_acts",
    "sexual content or sexual acts": "sexual_content_or_acts",
    "pii": "personally_identifiable_information",
    "personally identifiable information": "personally_identifiable_information",
    "suicide & self-harm": "suicide_and_self_harm",
    "unethical acts": "unethical_acts",
    "politically sensitive topics": "politically_sensitive_topics",
    "copyright violation": "copyright_violation",
    "jailbreak": "jailbreak",
}


@dataclass(frozen=True, slots=True)
class Qwen3GuardVerdict:
    safety: str
    categories: tuple[str, ...]
    raw_output: str


def parse_qwen3guard_output(output: str) -> Qwen3GuardVerdict:
    if not isinstance(output, str) or not output.strip() or len(output) > 4096:
        raise ValueError("Qwen3Guard output is empty or oversized")
    safety_match = _SAFETY_RE.search(output)
    categories_match = _CATEGORIES_RE.search(output)
    if safety_match is None or categories_match is None:
        raise ValueError("Qwen3Guard structured output parse failure")
    safety = safety_match.group(1)
    category_text = categories_match.group(1).strip()
    if category_text.casefold() == "none":
        categories: tuple[str, ...] = ()
    else:
        normalized: list[str] = []
        for item in category_text.split(","):
            key = item.strip().casefold()
            if key not in _CATEGORY_MAP:
                raise ValueError(f"unknown Qwen3Guard category: {item.strip()}")
            category = _CATEGORY_MAP[key]
            if category not in normalized:
                normalized.append(category)
        categories = tuple(normalized)
    if (safety == "Safe") != (not categories):
        raise ValueError("Qwen3Guard safety/category fields contradict each other")
    return Qwen3GuardVerdict(safety=safety, categories=categories, raw_output=output.strip())


class Qwen3GuardBackend(Protocol):
    def moderate_user(self, text: str) -> str:
        """Return the official generated moderation response."""
        ...

    def moderate_assistant(self, user_text: str, assistant_text: str) -> str:
        """Moderate an assistant response with the original user task."""
        ...


class LocalQwen3GuardBackend:
    """Lazy, local-only backend for Qwen3Guard-Gen."""

    def __init__(
        self,
        model_path: Path | str,
        *,
        device: str = "cuda",
        max_input_tokens: int = 8192,
        max_new_tokens: int = 128,
    ) -> None:
        if max_input_tokens < 1 or max_new_tokens < 1:
            raise ValueError("token limits must be positive")
        self.model_path = Path(model_path).resolve()
        self.device = device
        self.max_input_tokens = max_input_tokens
        self.max_new_tokens = max_new_tokens
        self._torch: Any | None = None
        self._tokenizer: Any | None = None
        self._model: Any | None = None

    def _load(self) -> None:
        if self._model is not None:
            return
        if not self.model_path.is_dir():
            raise FileNotFoundError(f"Qwen3Guard model directory not found: {self.model_path}")
        if not (self.model_path / "model.safetensors").is_file():
            raise FileNotFoundError("Qwen3Guard model.safetensors is missing")

        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        if self.device.startswith("cuda") and not torch.cuda.is_available():
            raise RuntimeError("Qwen3Guard CUDA inference was requested but CUDA is unavailable")
        tokenizer = AutoTokenizer.from_pretrained(str(self.model_path), local_files_only=True)
        model = AutoModelForCausalLM.from_pretrained(
            str(self.model_path), local_files_only=True, torch_dtype="auto"
        ).to(self.device).eval()
        self._torch = torch
        self._tokenizer = tokenizer
        self._model = model

    def moderate_user(self, text: str) -> str:
        self._load()
        chat = self._tokenizer.apply_chat_template(
            [{"role": "user", "content": text}], tokenize=False
        )
        inputs = self._tokenizer(
            [chat], return_tensors="pt", truncation=True, max_length=self.max_input_tokens
        ).to(self.device)
        with self._torch.inference_mode():
            generated = self._model.generate(
                **inputs, max_new_tokens=self.max_new_tokens, do_sample=False
            )
        output_ids = generated[0][inputs.input_ids.shape[1] :].tolist()
        return str(self._tokenizer.decode(output_ids, skip_special_tokens=True))

    def moderate_assistant(self, user_text: str, assistant_text: str) -> str:
        self._load()
        chat = self._tokenizer.apply_chat_template(
            [
                {"role": "user", "content": user_text},
                {"role": "assistant", "content": assistant_text},
            ],
            tokenize=False,
        )
        inputs = self._tokenizer(
            [chat], return_tensors="pt", truncation=True, max_length=self.max_input_tokens
        ).to(self.device)
        with self._torch.inference_mode():
            generated = self._model.generate(
                **inputs, max_new_tokens=self.max_new_tokens, do_sample=False
            )
        output_ids = generated[0][inputs.input_ids.shape[1] :].tolist()
        return str(self._tokenizer.decode(output_ids, skip_special_tokens=True))


class RealQwen3Guard:
    name = "qwen3guard_real"

    def __init__(
        self,
        backend: Qwen3GuardBackend,
        *,
        controversial_score: float = 0.45,
    ) -> None:
        if (
            not isfinite(controversial_score)
            or not 0.0 < controversial_score <= 0.90
        ):
            raise ValueError("controversial_score must be between zero and 0.90")
        self.backend = backend
        self.controversial_score = controversial_score

    def scan(self, text: str, source: SourceType) -> GuardSignal:
        del source
        verdict = parse_qwen3guard_output(self.backend.moderate_user(text))
        score = {
            "Safe": 0.0,
            "Controversial": self.controversial_score,
            "Unsafe": 1.0,
        }[verdict.safety]
        return GuardSignal(
            detector=self.name,
            score=score,
            categories=verdict.categories,
            reasons=(
                f"official_safety={verdict.safety}",
                "official_output=" + verdict.raw_output,
            ),
        )

    def scan_output(self, original_task: str, assistant_text: str) -> GuardSignal:
        verdict = parse_qwen3guard_output(
            self.backend.moderate_assistant(original_task, assistant_text)
        )
        score = {
            "Safe": 0.0,
            "Controversial": self.controversial_score,
            "Unsafe": 1.0,
        }[verdict.safety]
        return GuardSignal(
            detector=self.name,
            score=score,
            categories=verdict.categories,
            reasons=(
                f"official_safety={verdict.safety}",
                "moderation_role=assistant",
                "official_output=" + verdict.raw_output,
            ),
        )
