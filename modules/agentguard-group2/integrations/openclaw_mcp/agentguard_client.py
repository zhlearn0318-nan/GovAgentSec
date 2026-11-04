"""Narrow HTTP client that can call only AgentGuard's enforcement endpoint."""

from __future__ import annotations

import json
import os
from pathlib import Path
import ssl
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any

from .config import AdapterConfig, AdapterConfigError


class AgentGuardClientError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        raise AgentGuardClientError(
            "MCP_G004_REDIRECT_BLOCKED", "AgentGuard 地址返回重定向，已默认拒绝"
        )


class AgentGuardClient:
    """Calls one fixed REST route; it has no direct business-system capability."""

    def __init__(self, config: AdapterConfig) -> None:
        self.config = config
        ssl_context = ssl.create_default_context(cafile=config.ca_bundle or None)
        self._opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPHandler(),
            urllib.request.HTTPSHandler(context=ssl_context),
            _NoRedirect(),
        )

    @staticmethod
    def _business_hours() -> bool:
        now = datetime.now().astimezone()
        return now.weekday() < 5 and 8 <= now.hour < 18

    def _request_payload(self, action: dict[str, Any]) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace(
            "+00:00", "Z"
        )
        call_id = uuid.uuid4().hex
        return {
            "request_id": f"mcp-req-{call_id}",
            "task_id": f"mcp-task-{call_id}",
            "timestamp": now,
            "subject": self.config.request_subject(),
            "action": action,
            "context": {
                "source": "mcp",
                "server_time": now,
                "destination_zone": "internal",
                "enforcement_point": "gateway",
                "business_hours": self._business_hours(),
                "repeat_count": 0,
                "mcp_adapter": "agentguard-openclaw-controlled-tools",
            },
            "environment": {"sandbox": {"enabled": False, "profile": ""}},
            "approval": {},
        }

    def _invoke(self, action: dict[str, Any]) -> dict[str, Any]:
        try:
            token = self.config.authorization_token()
            payload = self._request_payload(action)
        except AdapterConfigError as exc:
            raise AgentGuardClientError(exc.code, str(exc)) from exc
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json",
            "User-Agent": "AgentGuard-OpenClaw-MCP/0.2.0",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(
            self.config.invoke_url,
            data=json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode(
                "utf-8"
            ),
            headers=headers,
            method="POST",
        )
        try:
            with self._opener.open(request, timeout=self.config.timeout_seconds) as response:
                raw = response.read(self.config.max_response_bytes + 1)
                status = int(response.status)
        except urllib.error.HTTPError as exc:
            raw = exc.read(self.config.max_response_bytes + 1)
            status = int(exc.code)
        except AgentGuardClientError:
            raise
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise AgentGuardClientError(
                "MCP_G002_AGENTGUARD_UNAVAILABLE",
                f"AgentGuard 不可用，调用未执行（{type(exc).__name__}）",
            ) from exc
        if len(raw) > self.config.max_response_bytes:
            raise AgentGuardClientError(
                "MCP_G003_RESPONSE_TOO_LARGE", "AgentGuard 响应超过安全上限"
            )
        try:
            result = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise AgentGuardClientError(
                "MCP_G005_INVALID_RESPONSE", "AgentGuard 返回了无效 JSON"
            ) from exc
        if not isinstance(result, dict):
            raise AgentGuardClientError(
                "MCP_G005_INVALID_RESPONSE", "AgentGuard 响应必须是 JSON 对象"
            )
        result["_agentguard_http_status"] = status
        # This identifier is generated locally before the request leaves the
        # adapter.  Keep it as private bridge metadata so the MCP layer can
        # return a correlation handle without trusting or leaking backend
        # response fields such as action digests or execution tickets.
        result["_agentguard_request_id"] = payload["request_id"]
        self._persist_request(payload, result)
        return result

    @staticmethod
    def _persist_request(payload: dict[str, Any], result: dict[str, Any]) -> None:
        # Operator-owned metadata only; no bearer credential or execution ticket.
        status_file = os.environ.get("AGENTGUARD_MCP_STATUS_STORE_FILE")
        if not status_file:
            return
        root = Path(status_file + ".requests")
        request_id = payload["request_id"]
        if not isinstance(request_id, str) or len(request_id) != 40 or not request_id.startswith("mcp-req-") or any(c not in "0123456789abcdef" for c in request_id[8:]):
            return
        record = {"control_request_id": request_id, "request": payload,
                  "status": "pending" if result.get("status") == "pending_approval" else result.get("status", "unknown"),
                  "action_digest": result.get("action_digest"), "reason_code": result.get("reason_code"),
                  "created_at": payload["timestamp"], "receipt": result.get("receipt"),
                  "executed": result.get("status") == "executed_isolated", "history": []}
        try:
            root.mkdir(parents=True, exist_ok=True)
            temporary = root / (request_id + ".tmp")
            with temporary.open("x", encoding="utf8") as handle:
                json.dump(record, handle, ensure_ascii=False)
            os.replace(temporary, root / (request_id + ".json"))
        except OSError:
            # Observability cannot turn a denial into execution.
            return

    def list_notices(self, limit: int) -> dict[str, Any]:
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
            raise AgentGuardClientError(
                "MCP_G001_ARGUMENT_INVALID", "limit 必须是 1 到 100 的整数"
            )
        return self._invoke({
            "tool": "database.query",
            "operation": "query",
            "resource": "db://public/notices",
            "parameters": {"limit": limit, "item_count": limit},
            "risk_level": "low",
            "data_level": "internal",
        })

    def request_payment(self, payee: str, amount: int, currency: str) -> dict[str, Any]:
        return self._invoke({
            "tool": "payment.transfer",
            "operation": "transfer",
            "resource": f"erp://payments/{payee}",
            "parameters": {"amount": amount, "currency": currency, "item_count": 1},
            "risk_level": "high",
            "data_level": "confidential",
        })

    def check_dangerous_command(self, command: str) -> dict[str, Any]:
        return self._invoke({
            "tool": "shell.execute",
            "operation": "execute",
            "resource": "host://protected-demo-host",
            "parameters": {"command": command, "item_count": 1},
            "risk_level": "critical",
            "data_level": "internal",
        })
