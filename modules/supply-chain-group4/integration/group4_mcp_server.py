"""Read-only MCP adapter for the Group 4 skill supply-chain scanner.

The adapter never executes code from the inspected skill. Reports are written
to a dedicated OpenClaw audit directory rather than into the inspected tree.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any


SERVER_NAME = "supply-chain-security"
TOOL_NAME = "security_scan"
MAX_SCAN_FILE_BYTES = 2 * 1024 * 1024


def _reply(message_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": message_id, "result": result}


def _error(message_id: Any, code: int, message: str) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": message_id,
        "error": {"code": code, "message": message},
    }


def _is_reparse_point(path: Path) -> bool:
    attributes = getattr(path.stat(follow_symlinks=False), "st_file_attributes", 0)
    return path.is_symlink() or bool(attributes & 0x400)


def _allowed_roots() -> list[Path]:
    raw = os.environ.get("GROUP4_ALLOWED_ROOTS", "")
    roots: list[Path] = []
    for item in raw.split(os.pathsep):
        item = item.strip()
        if not item:
            continue
        candidate = Path(item).resolve(strict=True)
        if candidate.is_dir() and not _is_reparse_point(candidate):
            roots.append(candidate)
    if not roots:
        raise RuntimeError("GROUP4_ALLOWED_ROOTS 未配置有效目录")
    return roots


def _resolve_target(raw: str) -> Path:
    candidate = Path(raw).expanduser().resolve(strict=True)
    if not candidate.is_dir() or _is_reparse_point(candidate):
        raise ValueError("目标必须是普通目录，不能是符号链接或目录联接")
    allowed = False
    for root in _allowed_roots():
        try:
            candidate.relative_to(root)
            allowed = True
            break
        except ValueError:
            continue
    if not allowed:
        raise ValueError("目标目录不在管理员配置的扫描范围内")
    for name in ("SKILL.md", "skill_config.json"):
        file_path = candidate / name
        if file_path.exists() and (
            not file_path.is_file()
            or _is_reparse_point(file_path)
            or file_path.stat().st_size > MAX_SCAN_FILE_BYTES
        ):
            raise ValueError(f"{name} 不是安全的普通小文件")
    for file_path in candidate.glob("*.py"):
        if _is_reparse_point(file_path) or file_path.stat().st_size > MAX_SCAN_FILE_BYTES:
            raise ValueError(f"Python 文件不符合扫描大小或链接约束：{file_path.name}")
    return candidate


def _load_pipeline():
    raw = os.environ.get("GROUP4_PIPELINE_SCRIPT", "").strip()
    script = Path(raw).resolve(strict=True)
    spec = importlib.util.spec_from_file_location("group4_skill_security_pipeline", script)
    if spec is None or spec.loader is None:
        raise RuntimeError("无法加载第四组检测流水线")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_scan(target: Path) -> dict[str, Any]:
    pipeline = _load_pipeline()
    report_root = Path(os.environ["GROUP4_REPORT_DIR"]).resolve()
    report_root.mkdir(parents=True, exist_ok=True)
    trace_id = f"openclaw-group4-{uuid.uuid4().hex[:12]}"
    started_text = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in target.name)[:80]
    report_path = report_root / f"{time.strftime('%Y%m%d-%H%M%S')}-{safe_name}-{trace_id}.txt"

    first = pipeline.第一关静态扫描(str(target))
    second = pipeline.第二关权限校验(str(target))
    third = pipeline.第三关行为检测(str(target))
    level, recommendation = pipeline.生成总报告(
        str(target), first, second, third, str(report_path), trace_id, started_text
    )
    return {
        "status": "completed",
        "scanner": "group4_skill_supply_chain_pipeline",
        "target": str(target),
        "trace_id": trace_id,
        "security_level": level,
        "recommendation": recommendation,
        "static_risk_count": int(first.get("风险数", 0)),
        "permission_status": second.get("状态", "未知"),
        "behavior_risk_count": int(third.get("风险数", 0)),
        "high_risk_count": int(first.get("高危数", 0)) + int(third.get("高危数", 0)),
        "report_path": str(report_path),
        "target_code_executed": False,
    }


TOOLS = [
    {
        "name": TOOL_NAME,
        "description": (
            "对指定 Skill 目录执行第四组供应链静态、权限和代码行为扫描。"
            "只读取代码，不执行目标 Skill；报告写入独立审计目录。"
        ),
        "inputSchema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "target_path": {"type": "string", "description": "待扫描 Skill 的绝对目录路径"}
            },
            "required": ["target_path"],
        },
    }
]


def _handle(request: dict[str, Any]) -> dict[str, Any] | None:
    message_id = request.get("id")
    method = request.get("method")
    if method == "initialize":
        requested = request.get("params", {}).get("protocolVersion", "2024-11-05")
        return _reply(
            message_id,
            {
                "protocolVersion": requested,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": SERVER_NAME, "version": "1.0.0"},
            },
        )
    if method == "notifications/initialized":
        return None
    if method == "ping":
        return _reply(message_id, {})
    if method == "tools/list":
        return _reply(message_id, {"tools": TOOLS})
    if method == "tools/call":
        params = request.get("params")
        if not isinstance(params, dict) or params.get("name") != TOOL_NAME:
            return _error(message_id, -32602, "未知工具或参数格式错误")
        arguments = params.get("arguments")
        if not isinstance(arguments, dict) or not isinstance(arguments.get("target_path"), str):
            return _error(message_id, -32602, "target_path 必须是字符串")
        try:
            result = _run_scan(_resolve_target(arguments["target_path"]))
        except Exception as exc:
            safe = f"{type(exc).__name__}: {exc}"
            return _reply(
                message_id,
                {"content": [{"type": "text", "text": safe}], "isError": True},
            )
        return _reply(
            message_id,
            {
                "content": [
                    {"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=2)}
                ],
                "structuredContent": result,
                "isError": False,
            },
        )
    if message_id is None:
        return None
    return _error(message_id, -32601, f"不支持的方法：{method}")


def main() -> int:
    sys.stdin.reconfigure(encoding="utf-8", errors="strict", newline=None)
    sys.stdout.reconfigure(encoding="utf-8", errors="strict", newline="\n")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            response = _handle(request)
        except Exception as exc:
            response = _error(None, -32603, f"服务器内部错误：{type(exc).__name__}")
        if response is not None:
            sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
            sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
