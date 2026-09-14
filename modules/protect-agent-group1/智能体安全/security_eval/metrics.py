from __future__ import annotations

from math import floor
from typing import Sequence


def _ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def binary_metrics(
    labels: Sequence[str], predictions: Sequence[str]
) -> dict[str, object]:
    if len(labels) != len(predictions):
        raise ValueError("labels and predictions must have the same length")
    valid = {"risk", "benign"}
    if any(value not in valid for value in (*labels, *predictions)):
        raise ValueError("binary labels must be risk or benign")

    tp = sum(a == "risk" and p == "risk" for a, p in zip(labels, predictions))
    fp = sum(a == "benign" and p == "risk" for a, p in zip(labels, predictions))
    tn = sum(a == "benign" and p == "benign" for a, p in zip(labels, predictions))
    fn = sum(a == "risk" and p == "benign" for a, p in zip(labels, predictions))
    precision = _ratio(tp, tp + fp)
    recall = _ratio(tp, tp + fn)
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision is not None and recall is not None and precision + recall
        else None
    )
    return {
        "count": len(labels),
        "confusion_matrix": {"tp": tp, "fp": fp, "tn": tn, "fn": fn},
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "fpr": _ratio(fp, fp + tn),
        "false_negative_rate": _ratio(fn, fn + tp),
    }


def percentile(values: Sequence[float], quantile: float) -> float | None:
    if not 0.0 <= quantile <= 1.0:
        raise ValueError("quantile must be between 0 and 1")
    if not values:
        return None
    ordered = sorted(float(value) for value in values)
    position = (len(ordered) - 1) * quantile
    lower = floor(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def latency_summary(values: Sequence[float]) -> dict[str, float | None]:
    return {
        "p50_ms": percentile(values, 0.50),
        "p95_ms": percentile(values, 0.95),
        "p99_ms": percentile(values, 0.99),
    }
