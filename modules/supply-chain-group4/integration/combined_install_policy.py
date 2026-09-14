"""Chain the existing Aegis admission policy with the Group 4 scanner.

The existing Aegis decision remains authoritative unless Group 4 finds a
high-risk Skill. Both scanners run for every Skill request so both audit trails
remain complete; either scanner can fail closed.
"""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MAX_STDIN_BYTES = 1024 * 1024


def _block(code: str, reason: str, findings: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    response: dict[str, Any] = {
        "protocolVersion": 1,
        "decision": "block",
        "reason": reason[:1000],
        "findings": findings
        or [{"ruleId": code, "severity": "high", "message": reason[:1000]}],
    }
    return response


def _run_aegis(raw: bytes) -> dict[str, Any]:
    script = Path(os.environ["AEGIS_ORIGINAL_POLICY_SCRIPT"]).resolve(strict=True)
    completed = subprocess.run(
        [sys.executable, str(script)],
        input=raw,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=130,
        check=False,
        env=os.environ.copy(),
    )
    if completed.returncode != 0:
        raise RuntimeError(f"Aegis policy exited with {completed.returncode}")
    response = json.loads(completed.stdout.decode("utf-8"))
    if not isinstance(response, dict) or response.get("decision") not in {
        "allow",
        "block",
        "warn",
    }:
        raise RuntimeError("Aegis policy returned an invalid response")
    return response


def _load_pipeline():
    script = Path(os.environ["GROUP4_PIPELINE_SCRIPT"]).resolve(strict=True)
    spec = importlib.util.spec_from_file_location("group4_install_pipeline", script)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load Group 4 pipeline")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_group4(source: Path, target_name: str) -> tuple[str, Path, list[dict[str, Any]], str]:
    pipeline = _load_pipeline()
    report_root = Path(os.environ["GROUP4_AUDIT_REPORT_DIR"]).resolve()
    report_root.mkdir(parents=True, exist_ok=True)
    trace_id = f"install-group4-{uuid.uuid4().hex[:12]}"
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in target_name)[:80]
    report_path = report_root / f"{time.strftime('%Y%m%d-%H%M%S')}-{safe_name}-{trace_id}.txt"
    started = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    first = pipeline.第一关静态扫描(str(source))
    second = pipeline.第二关权限校验(str(source))
    third = pipeline.第三关行为检测(str(source))
    level, recommendation = pipeline.生成总报告(
        str(source), first, second, third, str(report_path), trace_id, started
    )
    findings: list[dict[str, Any]] = []
    for stage, result in (("static", first), ("behavior", third)):
        for finding in result.get("风险列表", [])[:20]:
            findings.append(
                {
                    "ruleId": f"GROUP4_{stage.upper()}_{finding.get('类型', 'RISK')}",
                    "severity": "high" if finding.get("等级") == "高危" else "medium",
                    "message": f"第四组{stage}扫描：{finding.get('类型', '风险')}",
                    "location": {"line": int(finding.get("行号", 1))},
                }
            )
    audit = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "trace_id": trace_id,
        "target_name": target_name,
        "security_level": level,
        "report_path": str(report_path),
        "target_code_executed": False,
    }
    with (report_root / "group4-install-audit.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(audit, ensure_ascii=False, separators=(",", ":")) + "\n")
    return level, report_path, findings, recommendation


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="strict", newline="")
    raw = sys.stdin.buffer.read(MAX_STDIN_BYTES + 1)
    if len(raw) > MAX_STDIN_BYTES:
        response = _block("GROUP4_INVALID_REQUEST", "安装请求超过 1 MiB 上限。")
    else:
        try:
            payload = json.loads(raw.decode("utf-8"))
            aegis_response = _run_aegis(raw)
            if payload.get("targetType") != "skill":
                response = aegis_response
            else:
                source = Path(str(payload.get("sourcePath", ""))).resolve(strict=True)
                if not source.is_dir():
                    raise ValueError("sourcePath must be a directory")
                level, report_path, findings, recommendation = _run_group4(
                    source, str(payload.get("targetName") or source.name)
                )
                if level == "高危":
                    response = _block(
                        "GROUP4_HIGH_RISK",
                        f"第四组供应链扫描判定为高危，已阻止安装；审计报告：{report_path}",
                        findings,
                    )
                else:
                    response = aegis_response
        except Exception as exc:
            response = _block(
                "GROUP4_POLICY_CHAIN_FAILED",
                f"联合安装策略未能可靠完成：{type(exc).__name__}，已按失败关闭策略阻止安装。",
            )
    sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
