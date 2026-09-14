from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import sys
from typing import Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from integrations.openclaw.sidecar import build_real_adapter  # noqa: E402
from security_eval.metrics import binary_metrics  # noqa: E402


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Regression-test the unchanged Input Guard")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model-root", type=Path, required=True)
    parser.add_argument("--trustrag-module", type=Path, required=True)
    args = parser.parse_args(argv)

    with args.manifest.open("r", encoding="utf-8-sig", newline="") as handle:
        samples = tuple(csv.DictReader(handle))
    if not samples or len({row["sample_id"] for row in samples}) != len(samples):
        raise SystemExit("manifest is empty or has duplicate IDs")
    adapter = build_real_adapter(args.model_root, args.trustrag_module)
    predictions: list[dict[str, object]] = []
    labels: list[str] = []
    predicted: list[str] = []
    for index, sample in enumerate(samples, 1):
        detection = adapter.detect(sample["text"], sample["source"])
        labels.append(sample["label"])
        predicted.append(detection.parsed_risk_label)
        predictions.append(
            {
                "sample_id": sample["sample_id"],
                "label": sample["label"],
                "prediction": detection.parsed_risk_label,
                "source": sample["source"],
                "risk_score": detection.risk_score,
                "action": detection.action,
            }
        )
        if index % 50 == 0:
            print(f"input regression progress: {index}/{len(samples)}", flush=True)

    metrics = binary_metrics(labels, predicted)
    target = args.output.resolve()
    target.mkdir(parents=True, exist_ok=True)
    with (target / "predictions.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as handle:
        writer = csv.DictWriter(handle, fieldnames=tuple(predictions[0]))
        writer.writeheader()
        writer.writerows(predictions)
    (target / "metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(metrics, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
