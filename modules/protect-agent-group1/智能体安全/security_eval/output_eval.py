from __future__ import annotations

import csv
from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterable, Protocol

from agent.state import SourceType
from risk.output_guard import MessageRole, OutputContext, RetrievedContext

from .metrics import binary_metrics


@dataclass(frozen=True, slots=True)
class OutputCalibrationSample:
    sample_id: str
    label: str
    category: str
    language: str
    original_task: str
    retrieved_context: tuple[RetrievedContext, ...]
    is_quoted: bool
    candidate_output: str


@dataclass(frozen=True, slots=True)
class OutputEvaluationResult:
    rows: tuple[dict[str, object], ...]
    metrics: dict[str, object]


class OutputDetectionAdapter(Protocol):
    def detect_output(self, text: str, context: OutputContext, *, conversation_id=None): ...


def _boolean(value: str) -> bool:
    normalized = value.strip().casefold()
    if normalized not in {"true", "false"}:
        raise ValueError("boolean field is invalid")
    return normalized == "true"


def load_output_calibration(path: Path | str) -> tuple[OutputCalibrationSample, ...]:
    source = Path(path)
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = tuple(csv.DictReader(handle))
    required = {
        "sample_id", "label", "category", "language", "original_task",
        "retrieved_source", "retrieved_context", "is_quoted", "candidate_output",
    }
    samples: list[OutputCalibrationSample] = []
    seen: set[str] = set()
    for row in rows:
        if set(row) != required:
            raise ValueError("output calibration schema is invalid")
        sample_id = row["sample_id"].strip()
        if not sample_id or sample_id in seen:
            raise ValueError("output calibration sample_id is invalid")
        seen.add(sample_id)
        label = row["label"].strip()
        if label not in {"benign", "risk"}:
            raise ValueError("output calibration label is invalid")
        retrieved_text = row["retrieved_context"].strip()
        retrieved: tuple[RetrievedContext, ...] = ()
        if retrieved_text:
            retrieved = (
                RetrievedContext(
                    source=SourceType(row["retrieved_source"].strip()),
                    content=retrieved_text,
                    role=MessageRole.TOOL,
                    has_external_payload=True,
                    is_quoted=_boolean(row["is_quoted"]),
                ),
            )
        samples.append(
            OutputCalibrationSample(
                sample_id=sample_id,
                label=label,
                category=row["category"].strip(),
                language=row["language"].strip(),
                original_task=row["original_task"].strip(),
                retrieved_context=retrieved,
                is_quoted=_boolean(row["is_quoted"]),
                candidate_output=row["candidate_output"].strip(),
            )
        )
    return tuple(samples)


def _false_positive_reason(detection) -> str:
    if detection.parsed_risk_label != "risk":
        return ""
    try:
        raw = json.loads(detection.raw_output)
    except (TypeError, json.JSONDecodeError):
        return "unparsed_risk_signal"
    for name in ("output_behavior", "piguard", "qwen3guard"):
        value = raw.get(name)
        if isinstance(value, dict):
            reasons = value.get("reasons")
            if isinstance(reasons, list) and reasons:
                return str(reasons[-1])
            if name == "output_behavior":
                for signal in value.values():
                    if isinstance(signal, dict) and signal.get("score", 0) >= 0.30:
                        nested = signal.get("reasons")
                        if isinstance(nested, list) and nested:
                            return str(nested[-1])
    return "risk_threshold_reached"


def evaluate_output_samples(
    adapter: OutputDetectionAdapter,
    samples: Iterable[OutputCalibrationSample],
) -> OutputEvaluationResult:
    rows: list[dict[str, object]] = []
    labels: list[str] = []
    predictions: list[str] = []
    for sample in samples:
        context = OutputContext(
            original_task=sample.original_task,
            retrieved_context=sample.retrieved_context,
            role=MessageRole.AGENT,
            is_quoted=sample.is_quoted,
        )
        detection = adapter.detect_output(sample.candidate_output, context)
        labels.append(sample.label)
        predictions.append(detection.parsed_risk_label)
        is_false_positive = sample.label == "benign" and detection.parsed_risk_label == "risk"
        rows.append(
            {
                "sample_id": sample.sample_id,
                "label": sample.label,
                "prediction": detection.parsed_risk_label,
                "category": sample.category,
                "language": sample.language,
                "user_input": sample.original_task,
                "retrieved_context": "\n".join(
                    item.content for item in sample.retrieved_context
                ),
                "deepseek_response": sample.candidate_output,
                "output_risk_score": detection.risk_score,
                "risk_level": detection.risk_level,
                "final_action": detection.action,
                "false_positive_reason": (
                    _false_positive_reason(detection) if is_false_positive else ""
                ),
                "categories": "|".join(detection.categories),
                "raw_output": detection.raw_output,
            }
        )
    return OutputEvaluationResult(tuple(rows), binary_metrics(labels, predictions))


def write_output_predictions(path: Path | str, rows: Iterable[dict[str, object]]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    materialized = tuple(rows)
    if not materialized:
        raise ValueError("output predictions must not be empty")
    with target.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=tuple(materialized[0]))
        writer.writeheader()
        writer.writerows(materialized)
