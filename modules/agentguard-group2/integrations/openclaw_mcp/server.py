"""Dependency-free MCP server exposing AgentGuard-controlled demo tools."""

from __future__ import annotations

import json
import os
import sys
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, IO, Mapping

from .agentguard_client import AgentGuardClient, AgentGuardClientError


SERVER_VERSION = "0.2.0"
MCP_PROTOCOL_VERSION = "2025-11-25"
SUPPORTED_PROTOCOL_VERSIONS = {
    "2025-11-25",
    "2025-06-18",
    "2025-03-26",
    "2024-11-05",
}
MAX_MESSAGE_CHARS = 1024 * 1024
TOOL_NAME = "list_notices"
PAYMENT_TOOL_NAME = "request_test_payment"
DANGEROUS_TOOL_NAME = "run_protected_command"
STATUS_TOOL_NAME = "get_control_request_status"
MAX_CONTROL_STATUS_RECORDS = 200


TOOL_DEFINITION: dict[str, Any] = {
    "name": TOOL_NAME,
    "title": "查询内部公告（只读）",
    "description": (
        "通过 AgentGuard 的权限、票据、安全内核和审计链查询内部公告；"
        "不能直连数据库，不提供写入、删除、付款、发布或运维能力。"
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "limit": {
                "type": "integer",
                "minimum": 1,
                "maximum": 100,
                "default": 20,
                "description": "最多返回的公告条数",
            }
        },
        "additionalProperties": False,
    },
    "outputSchema": {
        "type": "object",
        "properties": {
            "control_request_id": {"type": "string"},
            "status": {"type": "string"},
            "reason_code": {"type": "string"},
            "row_count": {"type": "integer"},
            "rows": {"type": "array"},
            "side_effect": {"const": False},
            "message": {"type": "string"},
        },
        "required": ["control_request_id", "status", "reason_code", "row_count", "rows", "side_effect", "message"],
        "additionalProperties": False,
    },
    "annotations": {
        "title": "AgentGuard 只读公告查询",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
}

PAYMENT_TOOL_DEFINITION: dict[str, Any] = {
    "name": PAYMENT_TOOL_NAME,
    "title": "申请测试付款（需人工审批）",
    "description": "向隔离测试账本申请付款。AgentGuard只返回审批要求，本工具不能自行批准或绕过审批。",
    "inputSchema": {
        "type": "object",
        "properties": {
            "payee": {"type": "string", "minLength": 1, "maxLength": 80},
            "amount": {"type": "integer", "minimum": 1, "maximum": 1000000},
            "currency": {"type": "string", "enum": ["CNY", "USD", "EUR"], "default": "CNY"},
        },
        "required": ["payee", "amount"],
        "additionalProperties": False,
    },
    "annotations": {"title": "AgentGuard 测试付款审批", "readOnlyHint": False, "destructiveHint": True, "idempotentHint": False, "openWorldHint": False},
}

DANGEROUS_TOOL_DEFINITION: dict[str, Any] = {
    "name": DANGEROUS_TOOL_NAME,
    "title": "受保护命令执行（策略检查）",
    "description": "提交命令给AgentGuard检查；危险命令会被策略直接阻断，适合演示大模型无法绕过安全控制。",
    "inputSchema": {
        "type": "object",
        "properties": {"command": {"type": "string", "minLength": 1, "maxLength": 200}},
        "required": ["command"],
        "additionalProperties": False,
    },
    "annotations": {"title": "AgentGuard 危险命令阻断", "readOnlyHint": False, "destructiveHint": True, "idempotentHint": False, "openWorldHint": False},
}

STATUS_TOOL_DEFINITION: dict[str, Any] = {
    "name": STATUS_TOOL_NAME,
    "title": "查询控制请求状态（只读）",
    "description": (
        "使用此前工具返回的 control_request_id 查询脱敏状态和失败原因；"
        "本工具不能批准、恢复或执行任何操作。状态保留在受控 MCP 状态存储中。"
    ),
    "inputSchema": {
        "type": "object",
        "properties": {
            "control_request_id": {
                "type": "string",
                "pattern": "^mcp-req-[0-9a-f]{32}$",
                "description": "此前受控工具返回的请求编号",
            }
        },
        "required": ["control_request_id"],
        "additionalProperties": False,
    },
    "annotations": {
        "title": "AgentGuard 控制请求状态",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    },
}


def _status_message(status: str, reason_code: str) -> str:
    if status == "executed_isolated":
        return "策略已允许，并已在隔离环境完成；没有外部业务副作用。"
    if status == "pending_approval":
        return "请求已安全暂停，正在等待人工审批；模型没有执行付款。"
    if reason_code == "MCP_G010_REQUEST_NOT_FOUND":
        return "当前 MCP 会话中没有找到该请求；请求可能来自其他会话或已超过保留上限。"
    if reason_code == "G002_POLICY_DENY":
        return "AgentGuard 策略拒绝了该操作，未执行任何命令。"
    return f"请求已阻断且未执行，原因代码：{reason_code}。"


def _response(message_id: Any, result: Mapping[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": message_id, "result": dict(result)}


def _error(message_id: Any, code: int, message: str) -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": message_id,
        "error": {"code": code, "message": message},
    }


def _safe_rows(business_result: Mapping[str, Any]) -> list[dict[str, Any]]:
    rows = business_result.get("rows", [])
    if not isinstance(rows, list):
        return []
    safe: list[dict[str, Any]] = []
    allowed = ("id", "title", "department", "published_at")
    for item in rows[:100]:
        if not isinstance(item, Mapping):
            continue
        safe.append({key: item[key] for key in allowed if key in item})
    return safe


class McpServer:
    """Small protocol adapter; contains no policy or business execution logic."""

    def __init__(
        self,
        client: AgentGuardClient,
        *,
        controlled_demo_tools: bool = True,
        status_store_path: str | os.PathLike[str] | None = None,
    ) -> None:
        self.client = client
        self.controlled_demo_tools = controlled_demo_tools
        self.initialized = False
        self._control_statuses: OrderedDict[str, dict[str, Any]] = OrderedDict()
        configured_store = status_store_path or os.environ.get(
            "AGENTGUARD_MCP_STATUS_STORE_FILE", ""
        )
        self._status_store_path = (
            Path(configured_store).expanduser().resolve() if configured_store else None
        )
        self._load_control_statuses()

    def _load_control_statuses(self) -> None:
        path = self._status_store_path
        if path is None or not path.is_file():
            return
        try:
            if path.stat().st_size > MAX_MESSAGE_CHARS:
                return
            decoded = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            return
        if not isinstance(decoded, list):
            return
        loaded: OrderedDict[str, dict[str, Any]] = OrderedDict()
        for item in decoded[-MAX_CONTROL_STATUS_RECORDS:]:
            if not isinstance(item, Mapping):
                continue
            request_id = item.get("control_request_id")
            if (
                isinstance(request_id, str)
                and len(request_id) == 40
                and request_id.startswith("mcp-req-")
                and all(character in "0123456789abcdef" for character in request_id[8:])
            ):
                loaded[request_id] = dict(item)
        self._control_statuses = loaded

    def _persist_control_statuses(self) -> None:
        path = self._status_store_path
        if path is None:
            return
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
            temporary.write_text(
                json.dumps(list(self._control_statuses.values()), ensure_ascii=False),
                encoding="utf-8",
            )
            os.replace(temporary, path)
        except OSError:
            # The status query is observability-only. A failed local cache write
            # must never turn a denied or approval-gated action into execution.
            return

    def _remember_control_status(
        self, tool_name: str, control_request_id: str, output: Mapping[str, Any]
    ) -> None:
        self._load_control_statuses()
        if not control_request_id.startswith("mcp-req-") or len(control_request_id) != 40:
            return
        status = str(output.get("status", "blocked"))
        reason_code = str(output.get("reason_code", "MCP_G006_UNSAFE_RESPONSE"))
        record = {
            "control_request_id": control_request_id,
            "tool": tool_name,
            "status": status,
            "reason_code": reason_code,
            "executed": status == "executed_isolated",
            "approval_required": status == "pending_approval",
            "message": _status_message(status, reason_code),
            "recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace(
                "+00:00", "Z"
            ),
        }
        self._control_statuses[control_request_id] = record
        self._control_statuses.move_to_end(control_request_id)
        while len(self._control_statuses) > MAX_CONTROL_STATUS_RECORDS:
            self._control_statuses.popitem(last=False)
        self._persist_control_statuses()

    def _query_control_status(self, message_id: Any, arguments: Mapping[str, Any]) -> dict[str, Any]:
        if set(arguments) != {"control_request_id"}:
            return _error(message_id, -32602, "必须且只能提供 control_request_id")
        control_request_id = arguments.get("control_request_id")
        if (
            not isinstance(control_request_id, str)
            or len(control_request_id) != 40
            or not control_request_id.startswith("mcp-req-")
            or any(character not in "0123456789abcdef" for character in control_request_id[8:])
        ):
            return _error(message_id, -32602, "control_request_id 格式无效")
        self._load_control_statuses()
        record = self._control_statuses.get(control_request_id)
        if record is None:
            output = {
                "control_request_id": control_request_id,
                "tool": "",
                "status": "not_found",
                "reason_code": "MCP_G010_REQUEST_NOT_FOUND",
                "executed": False,
                "approval_required": False,
                "message": _status_message("not_found", "MCP_G010_REQUEST_NOT_FOUND"),
                "recorded_at": "",
            }
        else:
            output = dict(record)
        return _response(
            message_id,
            {
                "content": [{"type": "text", "text": json.dumps(output, ensure_ascii=False, separators=(",", ":"))}],
                "structuredContent": output,
                "isError": record is None,
            },
        )

    def _initialize(self, message_id: Any, params: Any) -> dict[str, Any]:
        requested = params.get("protocolVersion", "") if isinstance(params, Mapping) else ""
        negotiated = (
            str(requested)
            if str(requested) in SUPPORTED_PROTOCOL_VERSIONS
            else MCP_PROTOCOL_VERSION
        )
        self.initialized = True
        return _response(
            message_id,
            {
                "protocolVersion": negotiated,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {
                    "name": "agentguard-openclaw-controlled-tools",
                    "version": SERVER_VERSION,
                },
                "instructions": (
                    "提供查询放行、付款审批、危险操作阻断和结果状态查询；所有业务调用必须经过 AgentGuard。"
                ),
            },
        )

    def _call_tool(self, message_id: Any, params: Any) -> dict[str, Any]:
        if not isinstance(params, Mapping):
            return _error(message_id, -32602, "tools/call params 必须是对象")
        tool_name = params.get("name")
        allowed_tools = {TOOL_NAME, PAYMENT_TOOL_NAME, DANGEROUS_TOOL_NAME, STATUS_TOOL_NAME} if self.controlled_demo_tools else {TOOL_NAME}
        if tool_name not in allowed_tools:
            return _error(message_id, -32602, "未知或未授权的工具")
        arguments = params.get("arguments", {})
        if not isinstance(arguments, Mapping):
            return _error(message_id, -32602, "arguments 必须是对象")
        if tool_name == STATUS_TOOL_NAME:
            return self._query_control_status(message_id, arguments)
        try:
            if tool_name == TOOL_NAME:
                if set(arguments) - {"limit"}:
                    return _error(message_id, -32602, "包含未允许的工具参数")
                limit = arguments.get("limit", 20)
                if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
                    return _error(message_id, -32602, "limit 必须是 1 到 100 的整数")
                gateway_result = self.client.list_notices(limit)
            elif tool_name == PAYMENT_TOOL_NAME:
                if set(arguments) - {"payee", "amount", "currency"}:
                    return _error(message_id, -32602, "包含未允许的工具参数")
                payee, amount, currency = arguments.get("payee"), arguments.get("amount"), arguments.get("currency", "CNY")
                if not isinstance(payee, str) or not payee.strip() or len(payee) > 80:
                    return _error(message_id, -32602, "payee 必须是 1 到 80 个字符")
                if isinstance(amount, bool) or not isinstance(amount, int) or not 1 <= amount <= 1000000:
                    return _error(message_id, -32602, "amount 必须是 1 到 1000000 的整数")
                if currency not in {"CNY", "USD", "EUR"}:
                    return _error(message_id, -32602, "currency 只允许 CNY、USD 或 EUR")
                gateway_result = self.client.request_payment(payee.strip(), amount, currency)
            else:
                if set(arguments) - {"command"}:
                    return _error(message_id, -32602, "包含未允许的工具参数")
                command = arguments.get("command")
                if not isinstance(command, str) or not command.strip() or len(command) > 200:
                    return _error(message_id, -32602, "command 必须是 1 到 200 个字符")
                gateway_result = self.client.check_dangerous_command(command.strip())
        except AgentGuardClientError as exc:
            return _response(
                message_id,
                {
                    "content": [{"type": "text", "text": f"调用未执行：{exc.code}"}],
                    "isError": True,
                    "structuredContent": {
                        "status": "blocked",
                        "reason_code": exc.code,
                        "row_count": 0,
                        "rows": [],
                        "side_effect": False,
                    },
                },
            )

        status = str(gateway_result.get("status", "blocked"))
        reason_code = str(gateway_result.get("reason_code", "MCP_G006_UNSAFE_RESPONSE"))
        http_status = gateway_result.get("_agentguard_http_status")
        control_request_id = str(gateway_result.get("_agentguard_request_id", ""))
        if tool_name != TOOL_NAME:
            expected = status in {"pending_approval", "blocked"} and http_status in {202, 403}
            if not expected:
                status, reason_code = "blocked", "MCP_G009_CONTROL_DECISION_REQUIRED"
            output = {"control_request_id": control_request_id, "status": status, "reason_code": reason_code, "executed": False, "approval_required": status == "pending_approval", "message": _status_message(status, reason_code)}
            self._remember_control_status(str(tool_name), control_request_id, output)
            return _response(message_id, {"content": [{"type": "text", "text": json.dumps(output, ensure_ascii=False, separators=(",", ":"))}], "structuredContent": output, "isError": status == "blocked"})
        if status != "executed_isolated" or http_status != 200:
            if status == "executed_isolated":
                status = "blocked"
                reason_code = "MCP_G008_HTTP_STATUS_MISMATCH"
            output = {
                "control_request_id": control_request_id,
                "status": status,
                "reason_code": reason_code,
                "row_count": 0,
                "rows": [],
                "side_effect": False,
                "message": _status_message(status, reason_code),
            }
            self._remember_control_status(str(tool_name), control_request_id, output)
            return _response(
                message_id,
                {
                    "content": [
                        {
                            "type": "text",
                            "text": f"AgentGuard 未放行或未执行：{reason_code}",
                        }
                    ],
                    "isError": True,
                    "structuredContent": output,
                },
            )
        receipt = gateway_result.get("receipt")
        business = receipt.get("business_result") if isinstance(receipt, Mapping) else None
        if not isinstance(business, Mapping) or business.get("side_effect") is not False:
            output = {
                "control_request_id": control_request_id,
                "status": "blocked",
                "reason_code": "MCP_G007_READONLY_RESULT_REQUIRED",
                "row_count": 0,
                "rows": [],
                "side_effect": False,
                "message": _status_message("blocked", "MCP_G007_READONLY_RESULT_REQUIRED"),
            }
            self._remember_control_status(str(tool_name), control_request_id, output)
            return _response(
                message_id,
                {
                    "content": [
                        {
                            "type": "text",
                            "text": "AgentGuard 未返回可验证的只读业务结果",
                        }
                    ],
                    "isError": True,
                    "structuredContent": output,
                },
            )
        rows = _safe_rows(business)
        output = {
            "control_request_id": control_request_id,
            "status": "executed_isolated",
            "reason_code": reason_code,
            "row_count": len(rows),
            "rows": rows,
            "side_effect": False,
            "message": _status_message("executed_isolated", reason_code),
        }
        self._remember_control_status(str(tool_name), control_request_id, output)
        return _response(
            message_id,
            {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(output, ensure_ascii=False, separators=(",", ":")),
                    }
                ],
                "structuredContent": output,
                "isError": False,
            },
        )

    def handle(self, message: Any) -> dict[str, Any] | None:
        if not isinstance(message, Mapping) or message.get("jsonrpc") != "2.0":
            return _error(None, -32600, "无效 JSON-RPC 请求")
        message_id = message.get("id")
        is_notification = "id" not in message
        method = message.get("method")
        if not isinstance(method, str):
            return None if is_notification else _error(message_id, -32600, "缺少 method")
        if method == "notifications/initialized":
            return None
        if method == "notifications/cancelled":
            return None
        if is_notification:
            return None
        if method == "initialize":
            return self._initialize(message_id, message.get("params", {}))
        if method == "ping":
            return _response(message_id, {})
        if not self.initialized:
            return _error(message_id, -32002, "MCP 会话尚未 initialize")
        if method == "tools/list":
            tools = [TOOL_DEFINITION, PAYMENT_TOOL_DEFINITION, DANGEROUS_TOOL_DEFINITION, STATUS_TOOL_DEFINITION] if self.controlled_demo_tools else [TOOL_DEFINITION]
            return _response(message_id, {"tools": tools})
        if method == "tools/call":
            return self._call_tool(message_id, message.get("params", {}))
        return _error(message_id, -32601, "方法不存在")


def serve_stdio(server: McpServer, reader: IO[str] | None = None, writer: IO[str] | None = None) -> int:
    """Serve newline-delimited UTF-8 JSON-RPC. Protocol output is stdout only.

    Windows pipes otherwise inherit the active console code page (often GBK),
    while MCP requires UTF-8 on the wire.  Reconfigure only the real process
    streams; injected text streams used by tests are left untouched.
    """

    if reader is None and hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8", errors="strict")
    if writer is None and hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="strict", newline="\n")

    source = sys.stdin if reader is None else reader
    target = sys.stdout if writer is None else writer
    while True:
        line = source.readline(MAX_MESSAGE_CHARS + 1)
        if line == "":
            return 0
        if len(line) > MAX_MESSAGE_CHARS:
            while line and not line.endswith("\n"):
                line = source.readline(MAX_MESSAGE_CHARS + 1)
            reply = _error(None, -32600, "MCP 消息超过 1 MiB")
        else:
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                reply = _error(None, -32700, "JSON 解析失败")
            else:
                try:
                    reply = server.handle(message)
                except Exception as exc:  # fail closed without leaking internals
                    print(f"internal MCP error: {type(exc).__name__}", file=sys.stderr)
                    reply = _error(message.get("id") if isinstance(message, Mapping) else None, -32603, "内部错误，调用未执行")
        if reply is not None:
            target.write(json.dumps(reply, ensure_ascii=False, separators=(",", ":")) + "\n")
            target.flush()
