from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
import subprocess
import sys
from typing import Mapping, Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from integrations.openclaw.sidecar import build_real_adapter  # noqa: E402
from risk.output_guard import MessageRole, OutputContext  # noqa: E402


FIELDS = (
    "sample_id", "category", "provider", "model", "user_input",
    "retrieved_context", "deepseek_response", "output_risk_score",
    "risk_level", "final_action", "false_positive_reason", "categories",
    "session_key", "error",
)


def extract_openclaw_response(payload: object) -> tuple[str, str, str]:
    if not isinstance(payload, Mapping) or payload.get("status") != "ok":
        raise ValueError("OpenClaw run did not complete")
    result = payload.get("result")
    if not isinstance(result, Mapping):
        raise ValueError("OpenClaw result is invalid")
    payloads = result.get("payloads")
    meta = result.get("meta")
    if not isinstance(payloads, list) or not payloads or not isinstance(meta, Mapping):
        raise ValueError("OpenClaw response is missing")
    first = payloads[0]
    agent_meta = meta.get("agentMeta")
    if not isinstance(first, Mapping) or not isinstance(agent_meta, Mapping):
        raise ValueError("OpenClaw response metadata is invalid")
    text = first.get("text")
    provider = agent_meta.get("provider")
    model = agent_meta.get("model")
    if (
        not isinstance(text, str)
        or not text.strip()
        or provider != "deepseek"
        or model != "deepseek-v4-flash"
    ):
        raise ValueError("OpenClaw did not return a deepseek-v4-flash response")
    return text.strip(), provider, model


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run real deepseek-v4-flash through OpenClaw and Output Guard"
    )
    parser.add_argument(
        "--dataset",
        type=Path,
        default=PROJECT_ROOT / "security_eval" / "deepseek_live_prompts.csv",
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--openclaw-js", type=Path, required=True)
    parser.add_argument("--model-root", type=Path, required=True)
    parser.add_argument("--trustrag-module", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=4)
    args = parser.parse_args(argv)
    if not 1 <= args.limit <= 20:
        raise SystemExit("--limit must be between 1 and 20")

    with args.dataset.open("r", encoding="utf-8-sig", newline="") as handle:
        samples = tuple(csv.DictReader(handle))[: args.limit]
    if not samples:
        raise SystemExit("DeepSeek live dataset is empty")
    adapter = build_real_adapter(args.model_root, args.trustrag_module)
    rows: list[dict[str, object]] = []
    for sample in samples:
        session_key = f"agent:main:protect-output-live-{sample['sample_id']}"
        try:
            completed = subprocess.run(
                [
                    str(args.node.resolve()),
                    str(args.openclaw_js.resolve()),
                    "agent",
                    "--agent", "main",
                    "--session-key", session_key,
                    "--model", "deepseek/deepseek-v4-flash",
                    "--message", sample["user_input"],
                    "--thinking", "off",
                    "--timeout", "600",
                    "--json",
                ],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=660,
                check=False,
                shell=False,
            )
            if completed.returncode != 0:
                raise RuntimeError("OpenClaw agent command failed")
            response, provider, model = extract_openclaw_response(
                json.loads(completed.stdout)
            )
            detection = adapter.detect_output(
                response,
                OutputContext(
                    original_task=sample["user_input"],
                    role=MessageRole.AGENT,
                    is_quoted=sample["is_quoted"].casefold() == "true",
                ),
            )
            rows.append(
                {
                    "sample_id": sample["sample_id"],
                    "category": sample["category"],
                    "provider": provider,
                    "model": model,
                    "user_input": sample["user_input"],
                    "retrieved_context": "",
                    "deepseek_response": response,
                    "output_risk_score": detection.risk_score,
                    "risk_level": detection.risk_level,
                    "final_action": detection.action,
                    "false_positive_reason": (
                        "generated_safe_response_was_blocked"
                        if detection.action != "ALLOW" else ""
                    ),
                    "categories": "|".join(detection.categories),
                    "session_key": session_key,
                    "error": "",
                }
            )
        except Exception as exc:
            rows.append(
                {
                    "sample_id": sample.get("sample_id", ""),
                    "category": sample.get("category", ""),
                    "provider": "",
                    "model": "",
                    "user_input": sample.get("user_input", ""),
                    "retrieved_context": "",
                    "deepseek_response": "",
                    "output_risk_score": "",
                    "risk_level": "",
                    "final_action": "",
                    "false_positive_reason": "",
                    "categories": "",
                    "session_key": session_key,
                    "error": type(exc).__name__,
                }
            )

    target = args.output.resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    summary = {
        "samples": len(rows),
        "errors": sum(bool(row["error"]) for row in rows),
        "allowed": sum(row["final_action"] == "ALLOW" for row in rows),
        "model": "deepseek-v4-flash",
        "output": str(target),
    }
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return 0 if summary["errors"] == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
