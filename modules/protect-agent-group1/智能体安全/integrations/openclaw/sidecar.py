from __future__ import annotations

import argparse
from dataclasses import dataclass
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Lock
from typing import Any, Protocol

from guards.real_piguard import LocalPIGuardBackend, RealPIGuard
from guards.real_qwen3guard import LocalQwen3GuardBackend, RealQwen3Guard
from rag_security.real_trustrag import LocalOfficialTrustRAGBackend, OfficialTrustRAG
from security_eval.adapter import (
    DetectionResult,
    RAGChunkInput,
    SecurityEvalAdapter,
)
from agent.state import SourceType
from risk.output_guard import MessageRole, OutputContext, RetrievedContext


API_VERSION = "1"
MAX_BODY_BYTES = 64 * 1024
MAX_TEXT_CHARACTERS = 16_000
MAX_TOOL_NAME_CHARACTERS = 128
_KINDS = frozenset({"input", "tool_call", "tool_result", "output"})
_ALLOWED_FIELDS = frozenset(
    {"version", "kind", "text", "conversationId", "toolName", "query", "outputContext"}
)
_OUTPUT_CONTEXT_FIELDS = frozenset(
    {"originalTask", "retrievedContext", "role", "isQuoted"}
)
_RETRIEVED_CONTEXT_FIELDS = frozenset(
    {"source", "text", "role", "hasExternalPayload", "isQuoted"}
)


class ScreeningAdapter(Protocol):
    def detect(
        self,
        text: str,
        source: str,
        *,
        conversation_id: str | None = None,
    ) -> DetectionResult: ...

    def detect_output(
        self,
        text: str,
        context: OutputContext,
        *,
        conversation_id: str | None = None,
    ) -> DetectionResult: ...

    def defend_rag(
        self,
        query: str,
        chunks: tuple[RAGChunkInput, ...],
        *,
        conversation_id: str | None = None,
    ): ...


@dataclass(frozen=True, slots=True)
class ScreenRequest:
    kind: str
    text: str
    conversation_id: str | None = None
    tool_name: str | None = None
    query: str | None = None
    output_context: OutputContext | None = None


@dataclass(frozen=True, slots=True)
class ScreenResponse:
    decision: str
    policy_action: str
    risk_level: str
    risk_score: float
    categories: tuple[str, ...]
    detectors_available: bool
    reason_code: str
    retained: bool

    def to_payload(self) -> dict[str, object]:
        return {
            "version": API_VERSION,
            "decision": self.decision,
            "policyAction": self.policy_action,
            "riskLevel": self.risk_level,
            "riskScore": round(self.risk_score, 6),
            "categories": list(self.categories),
            "detectorsAvailable": self.detectors_available,
            "reasonCode": self.reason_code,
            "retained": self.retained,
        }


def _optional_bounded_text(
    payload: dict[str, Any],
    field: str,
    *,
    maximum: int,
    allow_multiline: bool = False,
) -> str | None:
    value = payload.get(field)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    normalized = value.strip()
    if (
        not normalized
        or len(normalized) > maximum
        or any(
            ord(character) < 32
            and (not allow_multiline or character not in "\t\r\n")
            for character in normalized
        )
    ):
        raise ValueError(f"{field} has an invalid format")
    return normalized


def parse_screen_request(payload: object) -> ScreenRequest:
    if not isinstance(payload, dict):
        raise ValueError("request body must be an object")
    if set(payload) - _ALLOWED_FIELDS:
        raise ValueError("request body has unknown fields")
    if payload.get("version") != API_VERSION:
        raise ValueError("unsupported API version")

    kind = payload.get("kind")
    if not isinstance(kind, str) or kind not in _KINDS:
        raise ValueError("kind is invalid")
    text = payload.get("text")
    if not isinstance(text, str):
        raise ValueError("text must be a string")
    normalized_text = text.strip()
    if (
        not normalized_text
        or len(normalized_text) > MAX_TEXT_CHARACTERS
        or any(
            ord(character) < 32 and character not in "\t\r\n"
            for character in normalized_text
        )
    ):
        raise ValueError("text has an invalid length")

    conversation_id = _optional_bounded_text(
        payload,
        "conversationId",
        maximum=128,
    )
    tool_name = _optional_bounded_text(
        payload,
        "toolName",
        maximum=MAX_TOOL_NAME_CHARACTERS,
    )
    query = _optional_bounded_text(
        payload,
        "query",
        maximum=MAX_TEXT_CHARACTERS,
        allow_multiline=True,
    )
    if kind in {"tool_call", "tool_result"} and tool_name is None:
        raise ValueError("toolName is required for tool requests")
    if kind == "tool_result" and query is None:
        raise ValueError("query is required for tool results")
    output_context = _parse_output_context(payload.get("outputContext"))
    if kind == "output" and output_context is None:
        raise ValueError("outputContext is required for output requests")
    if kind != "output" and output_context is not None:
        raise ValueError("outputContext is only valid for output requests")
    return ScreenRequest(
        kind=kind,
        text=normalized_text,
        conversation_id=conversation_id,
        tool_name=tool_name,
        query=query,
        output_context=output_context,
    )


def _parse_output_context(value: object) -> OutputContext | None:
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) - _OUTPUT_CONTEXT_FIELDS:
        raise ValueError("outputContext is invalid")
    original_task = value.get("originalTask")
    role = value.get("role")
    is_quoted = value.get("isQuoted")
    retrieved = value.get("retrievedContext")
    if (
        not isinstance(original_task, str)
        or not isinstance(role, str)
        or not isinstance(is_quoted, bool)
        or not isinstance(retrieved, list)
        or len(retrieved) > 8
    ):
        raise ValueError("outputContext fields are invalid")
    items: list[RetrievedContext] = []
    for item in retrieved:
        if not isinstance(item, dict) or set(item) != _RETRIEVED_CONTEXT_FIELDS:
            raise ValueError("retrievedContext item is invalid")
        if (
            not isinstance(item.get("text"), str)
            or not isinstance(item.get("source"), str)
            or not isinstance(item.get("role"), str)
            or not isinstance(item.get("hasExternalPayload"), bool)
            or not isinstance(item.get("isQuoted"), bool)
        ):
            raise ValueError("retrievedContext flags are invalid")
        try:
            items.append(
                RetrievedContext(
                    source=SourceType(item.get("source")),
                    content=item.get("text"),
                    role=MessageRole(item.get("role")),
                    has_external_payload=item["hasExternalPayload"],
                    is_quoted=item["isQuoted"],
                )
            )
        except (TypeError, ValueError):
            raise ValueError("retrievedContext item is invalid") from None
    try:
        return OutputContext(
            original_task=original_task,
            retrieved_context=tuple(items),
            role=MessageRole(role),
            is_quoted=is_quoted,
        )
    except (TypeError, ValueError):
        raise ValueError("outputContext is invalid") from None


class OpenClawScreeningService:
    def __init__(self, adapter: ScreeningAdapter) -> None:
        self._adapter = adapter
        self._inference_lock = Lock()

    def screen(self, request: ScreenRequest) -> ScreenResponse:
        with self._inference_lock:
            retained = True
            if request.kind == "tool_result":
                result = self._adapter.defend_rag(
                    request.query or "tool result",
                    (RAGChunkInput("openclaw-tool-result", request.text),),
                    conversation_id=request.conversation_id,
                )[0]
                detection = result.detection
                retained = result.retained
            elif request.kind == "output":
                if request.output_context is None:
                    raise ValueError("output context is required")
                detection = self._adapter.detect_output(
                    request.text,
                    request.output_context,
                    conversation_id=request.conversation_id,
                )
            else:
                source = "user" if request.kind == "input" else "tool"
                detection = self._adapter.detect(
                    request.text,
                    source,
                    conversation_id=request.conversation_id,
                )

        decision = self._map_decision(detection, retained=retained)
        return ScreenResponse(
            decision=decision,
            policy_action=detection.action,
            risk_level=detection.risk_level,
            risk_score=detection.risk_score,
            categories=detection.categories,
            detectors_available=detection.detectors_available,
            reason_code=f"RISK_{detection.risk_level}",
            retained=retained,
        )

    @staticmethod
    def _map_decision(detection: DetectionResult, *, retained: bool) -> str:
        if not detection.detectors_available or not retained:
            return "BLOCK"
        if detection.action == "ALLOW":
            return "ALLOW"
        if detection.action in {"SANITIZE", "CONFIRM"}:
            return "REVIEW"
        return "BLOCK"


class ProtectAgentHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self,
        server_address: tuple[str, int],
        token: str,
        service: OpenClawScreeningService,
    ) -> None:
        self.token = token
        self.screening_service = service
        super().__init__(server_address, ProtectAgentRequestHandler)


class ProtectAgentRequestHandler(BaseHTTPRequestHandler):
    server: ProtectAgentHTTPServer
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        if self.path == "/healthz":
            self._json(200, {"ok": True, "status": "live"})
            return
        if self.path == "/readyz":
            if not self._authorized():
                self._error(401, "UNAUTHORIZED", "Authentication required.")
                return
            self._json(200, {"ready": True})
            return
        self._error(404, "NOT_FOUND", "Resource not found.")

    def do_POST(self) -> None:
        if self.path != "/v1/screen":
            self._error(404, "NOT_FOUND", "Resource not found.", close_connection=True)
            return
        if not self._authorized():
            self._error(
                401,
                "UNAUTHORIZED",
                "Authentication required.",
                close_connection=True,
            )
            return
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0]
        if content_type.strip().lower() != "application/json":
            self._error(
                415,
                "UNSUPPORTED_MEDIA_TYPE",
                "JSON is required.",
                close_connection=True,
            )
            return
        try:
            content_length = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            content_length = -1
        if content_length < 0 or content_length > MAX_BODY_BYTES:
            self._error(
                413,
                "BODY_TOO_LARGE",
                "Request body is too large.",
                close_connection=True,
            )
            return
        try:
            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8"))
            request = parse_screen_request(payload)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            self._error(400, "INVALID_REQUEST", "Request is invalid.")
            return
        try:
            response = self.server.screening_service.screen(request)
        except Exception:
            self._error(503, "SCREENING_UNAVAILABLE", "Security screening failed.")
            return
        self._json(200, response.to_payload())

    def _authorized(self) -> bool:
        authorization = self.headers.get("Authorization", "")
        prefix = "Bearer "
        if not authorization.startswith(prefix):
            return False
        return hmac.compare_digest(authorization[len(prefix) :], self.server.token)

    def _error(
        self,
        status: int,
        code: str,
        message: str,
        *,
        close_connection: bool = False,
    ) -> None:
        self._json(
            status,
            {"error": {"code": code, "message": message}},
            close_connection=close_connection,
        )

    def _json(
        self,
        status: int,
        payload: dict[str, object],
        *,
        close_connection: bool = False,
    ) -> None:
        encoded = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if close_connection:
            self.close_connection = True
            self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(encoded)


def create_http_server(
    host: str,
    port: int,
    *,
    token: str,
    service: OpenClawScreeningService,
) -> ProtectAgentHTTPServer:
    if host not in {"127.0.0.1", "::1"}:
        raise ValueError("sidecar must bind to a loopback address")
    if not isinstance(port, int) or not 0 <= port <= 65_535:
        raise ValueError("port is invalid")
    if not isinstance(token, str) or not 32 <= len(token) <= 512:
        raise ValueError("token has an invalid length")
    return ProtectAgentHTTPServer((host, port), token, service)


def build_real_adapter(
    model_root: Path | str,
    trustrag_module: Path | str,
) -> SecurityEvalAdapter:
    root = Path(model_root).resolve(strict=True)
    module = Path(trustrag_module).resolve(strict=True)
    return SecurityEvalAdapter(
        piguard=RealPIGuard(LocalPIGuardBackend(root / "PIGuard")),
        qwen3guard=RealQwen3Guard(
            LocalQwen3GuardBackend(root / "Qwen3Guard-Gen-0.6B")
        ),
        trustrag=OfficialTrustRAG(
            LocalOfficialTrustRAGBackend(
                root / "princeton-nlp-sup-simcse-bert-base-uncased",
                module,
            )
        ),
    )


def build_baseline_adapter() -> SecurityEvalAdapter:
    """Build the project's dependency-free offline protection pipeline."""
    return SecurityEvalAdapter()


def _read_token(path: Path | str) -> str:
    token = Path(path).resolve(strict=True).read_text(encoding="utf-8").strip()
    if not 32 <= len(token) <= 512 or any(character.isspace() for character in token):
        raise ValueError("token file is invalid")
    return token


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="protect-agent-openclaw-sidecar")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=19_171)
    parser.add_argument("--token-file", required=True)
    parser.add_argument("--mode", choices=("real", "baseline"), default="real")
    parser.add_argument("--model-root")
    parser.add_argument("--trustrag-module")
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        if args.mode == "baseline":
            adapter = build_baseline_adapter()
        else:
            if not args.model_root or not args.trustrag_module:
                raise ValueError("real mode requires model and TrustRAG paths")
            adapter = build_real_adapter(args.model_root, args.trustrag_module)
        adapter.detect("Summarize the public service status.", "user")
        adapter.defend_rag(
            "Summarize the public service status.",
            (RAGChunkInput("warmup", "The public service is operating normally."),),
        )
        server = create_http_server(
            args.host,
            args.port,
            token=_read_token(args.token_file),
            service=OpenClawScreeningService(adapter),
        )
    except Exception:
        return 2
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
