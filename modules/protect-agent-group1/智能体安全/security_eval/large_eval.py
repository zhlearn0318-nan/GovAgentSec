from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Mapping, Sequence

from security_eval.data_validation import sha256_text
from security_eval.metrics import binary_metrics, latency_summary


EXPANDED_PREDICTION_COLUMNS = (
    "prediction_id", "sample_id", "target_mode", "text_variant",
    "evaluation_source", "dataset", "source", "original_label",
    "system_raw_output", "parsed_risk_label", "risk_level", "risk_categories", "risk_score",
    "policy_action", "retained", "input_text_sha256",
    "normalized_text_sha256", "output_text_sha256", "latency_ms", "error",
    "system_version", "tested_at_utc", "language", "core_category",
    "content_type", "synthetic",
)


@dataclass(frozen=True, slots=True)
class ExpandedEvaluationCase:
    prediction_id: str
    sample_id: str
    target_mode: str
    text_variant: str
    evaluation_source: str
    text: str


def expand_manifest_rows(
    rows: Sequence[Mapping[str, str]],
) -> tuple[ExpandedEvaluationCase, ...]:
    cases: list[ExpandedEvaluationCase] = []
    for row in rows:
        sample_id = row["sample_id"]
        for target_mode, evaluation_source in (
            ("user_input", row["source"]),
            ("agent_output", "agent_answer"),
        ):
            for text_variant, field in (
                ("original", "text"),
                ("normalized", "normalized_text"),
            ):
                cases.append(
                    ExpandedEvaluationCase(
                        prediction_id=(
                            f"{sample_id}|{target_mode}|{text_variant}"
                        ),
                        sample_id=sample_id,
                        target_mode=target_mode,
                        text_variant=text_variant,
                        evaluation_source=evaluation_source,
                        text=row[field],
                    )
                )
    prediction_ids = {case.prediction_id for case in cases}
    if len(prediction_ids) != len(cases):
        raise ValueError("expanded prediction IDs must be unique")
    return tuple(cases)


def _binary(rows: Sequence[Mapping[str, str]]) -> dict[str, object]:
    return binary_metrics(
        [row["original_label"] for row in rows],
        [row["parsed_risk_label"] for row in rows],
    )


def _group_metrics(
    rows: Sequence[Mapping[str, str]], field: str
) -> dict[str, dict[str, object]]:
    return {
        value: _binary([row for row in rows if row[field] == value])
        for value in sorted({row[field] for row in rows})
    }


def summarize_expanded_predictions(
    rows: Sequence[Mapping[str, str]],
) -> dict[str, object]:
    if not rows:
        raise ValueError("expanded predictions cannot be empty")
    primary = [row for row in rows if row["text_variant"] == "original"]
    hard_negative = [
        row for row in primary
        if row["core_category"] == "benign_hard_negative"
    ]
    risk_categories = sorted(
        {
            row["core_category"]
            for row in primary
            if row["original_label"] == "risk"
        }
    )
    category_recall = {
        category: _binary(
            [row for row in primary if row["core_category"] == category]
        )["recall"]
        for category in risk_categories
    }
    hard_metrics = _binary(hard_negative) if hard_negative else None
    return {
        "prediction_count": len(rows),
        "base_sample_count": len({row["sample_id"] for row in rows}),
        "all_views": _binary(rows),
        "primary_original": _binary(primary),
        "by_target_mode": _group_metrics(primary, "target_mode"),
        "by_text_variant": _group_metrics(rows, "text_variant"),
        "by_dataset": _group_metrics(primary, "dataset"),
        "by_source": _group_metrics(primary, "source"),
        "by_language": _group_metrics(primary, "language"),
        "core_category_recall": category_recall,
        "minimum_core_category_recall": min(
            (value for value in category_recall.values() if value is not None),
            default=None,
        ),
        "hard_negative_fpr": (
            hard_metrics["fpr"] if hard_metrics is not None else None
        ),
        "output_parse_success_rate": (
            sum(not row["error"] for row in rows) / len(rows)
        ),
        "latency": latency_summary(
            [float(row["latency_ms"]) for row in rows]
        ),
        "errors": sum(bool(row["error"]) for row in rows),
    }


def evaluate_expanded_manifest(
    manifest_rows: Sequence[Mapping[str, str]],
    adapter,
    *,
    system_version: str,
    tested_at: str,
    emit_progress: bool = True,
) -> tuple[list[dict[str, object]], dict[str, object]]:
    by_sample = {row["sample_id"]: row for row in manifest_rows}
    if len(by_sample) != len(manifest_rows):
        raise ValueError("manifest sample IDs must be unique")
    cases = expand_manifest_rows(manifest_rows)
    predictions: list[dict[str, object]] = []
    for index, case in enumerate(cases, start=1):
        metadata = by_sample[case.sample_id]
        try:
            result = adapter.detect(case.text, case.evaluation_source)
            normalized = result.normalized_text
            raw_output = result.raw_output
            parsed_label = result.parsed_risk_label
            risk_level = result.risk_level
            categories = "|".join(result.categories)
            risk_score: object = f"{result.risk_score:.6f}"
            policy_action = getattr(
                result,
                "action",
                "ALLOW" if parsed_label == "benign" else "BLOCK",
            )
            retained = bool(result.retained)
            latency_ms = float(result.latency_ms)
            error = "" if result.detectors_available else "detector_unavailable"
        except Exception as exc:
            normalized = case.text.strip()
            raw_output = json.dumps(
                {"status": "FAIL_CLOSED", "error_type": type(exc).__name__},
                sort_keys=True,
            )
            parsed_label = "risk"
            risk_level = "ERROR_FAIL_CLOSED"
            categories = "detector_error"
            risk_score = ""
            policy_action = "BLOCK"
            retained = False
            latency_ms = 0.0
            error = type(exc).__name__
        predictions.append(
            {
                "prediction_id": case.prediction_id,
                "sample_id": case.sample_id,
                "target_mode": case.target_mode,
                "text_variant": case.text_variant,
                "evaluation_source": case.evaluation_source,
                "dataset": metadata["dataset"],
                "source": metadata["source"],
                "original_label": metadata["label"],
                "system_raw_output": raw_output,
                "parsed_risk_label": parsed_label,
                "risk_level": risk_level,
                "risk_categories": categories,
                "risk_score": risk_score,
                "policy_action": policy_action,
                "retained": str(retained).lower(),
                "input_text_sha256": sha256_text(case.text),
                "normalized_text_sha256": sha256_text(normalized),
                "output_text_sha256": sha256_text(raw_output),
                "latency_ms": f"{latency_ms:.6f}",
                "error": error,
                "system_version": system_version,
                "tested_at_utc": tested_at,
                "language": metadata["language"],
                "core_category": metadata["core_category"],
                "content_type": metadata["content_type"],
                "synthetic": metadata["synthetic"],
            }
        )
        if emit_progress and (index % 25 == 0 or index == len(cases)):
            print(f"expanded progress: {index}/{len(cases)}", flush=True)
    return predictions, summarize_expanded_predictions(predictions)
