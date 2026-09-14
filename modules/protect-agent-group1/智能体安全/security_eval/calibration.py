from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from .metrics import binary_metrics


CALIBRATION_COLUMNS = (
    "sample_id",
    "label",
    "source",
    "phenomenon",
    "text",
)
STAGE2_CALIBRATION_COLUMNS = (
    "sample_id",
    "label",
    "source",
    "phenomenon",
    "conversation_id",
    "turn",
    "text",
)
_LABELS = frozenset({"benign", "risk"})
_SOURCES = frozenset(
    {"user", "web", "rag", "file", "memory", "tool", "cross_source_multi_turn"}
)


@dataclass(frozen=True, slots=True)
class CalibrationSample:
    sample_id: str
    label: str
    source: str
    phenomenon: str
    text: str
    conversation_id: str | None = None
    turn: int = 0


@dataclass(frozen=True, slots=True)
class CalibrationPrediction:
    sample_id: str
    original_label: str
    parsed_risk_label: str
    source: str
    phenomenon: str
    raw_output: str
    conversation_id: str | None = None
    turn: int = 0


def load_calibration_samples(path: Path) -> tuple[CalibrationSample, ...]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = tuple(reader.fieldnames or ())
        if columns not in (CALIBRATION_COLUMNS, STAGE2_CALIBRATION_COLUMNS):
            raise ValueError("unexpected calibration columns")
        rows = list(reader)

    identifiers: set[str] = set()
    samples: list[CalibrationSample] = []
    for row in rows:
        sample_id = row["sample_id"].strip()
        label = row["label"].strip()
        source = row["source"].strip()
        phenomenon = row["phenomenon"].strip()
        text = row["text"].strip()
        conversation_id = row.get("conversation_id", "").strip() or None
        turn_text = row.get("turn", "").strip()
        turn = int(turn_text) if turn_text else 0
        if sample_id in identifiers:
            raise ValueError("duplicate calibration sample_id")
        if not sample_id or label not in _LABELS or source not in _SOURCES:
            raise ValueError("invalid calibration metadata")
        if not phenomenon or not text or len(text) > 16_000:
            raise ValueError("invalid calibration text")
        if (conversation_id is None) != (turn == 0):
            raise ValueError("conversation_id and positive turn must appear together")
        if turn < 0:
            raise ValueError("turn must not be negative")
        identifiers.add(sample_id)
        samples.append(
            CalibrationSample(
                sample_id,
                label,
                source,
                phenomenon,
                text,
                conversation_id,
                turn,
            )
        )
    if not samples:
        raise ValueError("calibration set must not be empty")
    return tuple(samples)


def summarize_calibration(
    rows: Sequence[CalibrationPrediction],
) -> dict[str, object]:
    overall = binary_metrics(
        [row.original_label for row in rows],
        [row.parsed_risk_label for row in rows],
    )
    by_source = {
        source: binary_metrics(
            [row.original_label for row in rows if row.source == source],
            [row.parsed_risk_label for row in rows if row.source == source],
        )
        for source in sorted({row.source for row in rows})
    }
    by_phenomenon = {
        phenomenon: binary_metrics(
            [row.original_label for row in rows if row.phenomenon == phenomenon],
            [row.parsed_risk_label for row in rows if row.phenomenon == phenomenon],
        )
        for phenomenon in sorted({row.phenomenon for row in rows})
    }
    final_turns: dict[str, CalibrationPrediction] = {}
    for row in rows:
        if row.conversation_id and (
            row.conversation_id not in final_turns
            or row.turn > final_turns[row.conversation_id].turn
        ):
            final_turns[row.conversation_id] = row
    multiturn_final = binary_metrics(
        [row.original_label for row in final_turns.values()],
        [row.parsed_risk_label for row in final_turns.values()],
    )
    return {
        "overall": overall,
        "benign_fpr": overall["fpr"],
        "by_source": by_source,
        "by_phenomenon": by_phenomenon,
        "multiturn_final": multiturn_final,
        "sample_count": len(rows),
    }
