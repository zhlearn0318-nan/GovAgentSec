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

from agent.deepseek_model import DeepSeekAgentModel, DeepSeekSettings  # noqa: E402
from agent.state import AgentRequest, SourceType  # noqa: E402
from integrations.openclaw.sidecar import build_real_adapter  # noqa: E402
from rag_security.provenance import KnowledgeDocument  # noqa: E402
from risk.output_guard import MessageRole, OutputContext, RetrievedContext  # noqa: E402
from security_eval.output_eval import load_output_calibration  # noqa: E402


FIELDS = (
    "sample_id", "user_input", "retrieved_context", "deepseek_response",
    "output_risk_score", "risk_level", "final_action", "false_positive_reason",
    "categories", "error",
)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Call deepseek-v4-flash and screen its real responses"
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=PROJECT_ROOT / "security_eval" / "output_calibration_samples.csv",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model-root", type=Path, required=True)
    parser.add_argument("--trustrag-module", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=8)
    args = parser.parse_args(argv)
    if not 1 <= args.limit <= 42:
        raise SystemExit("--limit must be between 1 and 42")

    settings = DeepSeekSettings.from_env()
    if settings.model != "deepseek-v4-flash":
        raise SystemExit("DEEPSEEK_MODEL must be deepseek-v4-flash")
    model = DeepSeekAgentModel(settings)
    adapter = build_real_adapter(args.model_root, args.trustrag_module)
    all_samples = load_output_calibration(args.dataset)
    preferred_categories = (
        "normal_answer",
        "safe_attack_explanation",
        "aligned_execution",
        "malicious_execution",
        "sensitive_leak",
        "attack_propagation",
    )
    selected = []
    for category in preferred_categories:
        for sample in all_samples:
            if sample.category == category and sample not in selected:
                selected.append(sample)
                break
    for sample in all_samples:
        if sample not in selected:
            selected.append(sample)
    samples = tuple(selected[: args.limit])
    rows: list[dict[str, object]] = []
    for sample in samples:
        retrieved_documents = tuple(
            KnowledgeDocument(
                document_id=f"deepseek-{sample.sample_id}-{index}",
                content=item.content,
                source=item.source.value,
                source_trust=0.4,
                verified=True,
            )
            for index, item in enumerate(sample.retrieved_context)
        )
        try:
            decision = model.plan(
                AgentRequest(sample.original_task, source=SourceType.USER),
                retrieved_documents,
            )
            response = decision.response_text
            context = OutputContext(
                original_task=sample.original_task,
                retrieved_context=tuple(
                    RetrievedContext(
                        source=item.source,
                        content=item.content,
                        role=MessageRole.TOOL,
                        has_external_payload=True,
                        is_quoted=sample.is_quoted,
                    )
                    for item in sample.retrieved_context
                ),
                role=MessageRole.AGENT,
                is_quoted=sample.is_quoted,
            )
            detection = adapter.detect_output(response, context)
            false_positive_reason = (
                "generated_safe_response_was_blocked"
                if detection.action != "ALLOW"
                else ""
            )
            rows.append(
                {
                    "sample_id": sample.sample_id,
                    "user_input": sample.original_task,
                    "retrieved_context": "\n".join(
                        item.content for item in sample.retrieved_context
                    ),
                    "deepseek_response": response,
                    "output_risk_score": detection.risk_score,
                    "risk_level": detection.risk_level,
                    "final_action": detection.action,
                    "false_positive_reason": false_positive_reason,
                    "categories": "|".join(detection.categories),
                    "error": "",
                }
            )
        except Exception as exc:
            rows.append(
                {
                    "sample_id": sample.sample_id,
                    "user_input": sample.original_task,
                    "retrieved_context": "\n".join(
                        item.content for item in sample.retrieved_context
                    ),
                    "deepseek_response": "",
                    "output_risk_score": "",
                    "risk_level": "",
                    "final_action": "",
                    "false_positive_reason": "",
                    "categories": "",
                    "error": type(exc).__name__,
                }
            )
    target = args.output.resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(
        json.dumps(
            {
                "model": settings.model,
                "samples": len(rows),
                "errors": sum(bool(row["error"]) for row in rows),
                "output": str(target),
            },
            ensure_ascii=False,
        )
    )
    return 0 if all(not row["error"] for row in rows) else 2


if __name__ == "__main__":
    raise SystemExit(main())
