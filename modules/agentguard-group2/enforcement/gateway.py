"""OPA 决策之后的强制执行点（PEP）与安全工具适配器。"""

from __future__ import annotations

import copy
import hashlib
import secrets
import uuid
from pathlib import Path
from typing import Any, Mapping

from approval.workflow import OpaClient, PROJECT_ROOT
from approval.credentials import (
    ApprovalCredentialError,
    ApprovalCredentialService,
    SQLiteApprovalLedger,
)
from identity import OidcIdentityError, OidcVerifier
from security_kernel import WasmSecurityKernel

from .documents import validate_document_action, scrub_document_receipt, REGISTRY as DOCUMENT_REGISTRY
from .audit import AuditLogger
from .adapters import BusinessAdapterError, LocalTestBusinessAdapters
from .tickets import ExecutionTicketStore, TicketError, compute_action_digest
from .signers import OpenBaoTransitSigner, TicketSigner
from .ledgers import TicketLedger
from .task_policy import TaskPolicies, TaskPolicyError, value_hash
from .notifications import validate_notice_action


DEFAULT_REGISTRY = {
    ("notification.submit", "submit"): {"module": "database_query.wat", "argument": "item_count"},
    ("file.read", "read"): {"module": "database_query.wat", "argument": "item_count"},
    ("database.query", "query"): {
        "module": "database_query.wat",
        "argument": "limit",
    },
    ("payment.transfer", "transfer"): {
        "module": "payment_transfer.wat",
        "argument": "amount",
    },
}


class EnforcementGateway:
    """所有工具调用的唯一入口：决策、签票、核销、隔离执行、审计。"""

    def __init__(
        self,
        opa_client: Any,
        ticket_store: ExecutionTicketStore,
        kernel: WasmSecurityKernel,
        audit_logger: AuditLogger,
        module_dir: Path | str,
        registry: Mapping[tuple[str, str], Mapping[str, str]] | None = None,
        business_adapters: Any | None = None,
        approval_service: ApprovalCredentialService | None = None,
        task_policies=None,
    ) -> None:
        self.opa = opa_client
        self.tickets = ticket_store
        self.kernel = kernel
        self.audit = audit_logger
        self.module_dir = Path(module_dir)
        self.registry = dict(DEFAULT_REGISTRY if registry is None else registry)
        self.business_adapters = business_adapters
        self.approvals = approval_service
        self.task_policies = task_policies
        self.require_task_policy = False
        # Enabled only by the private OpenClaw identity worker. Public services
        # cannot choose host execution through request parameters.
        self.host_dispatch_enabled = False
        # Private demonstration worker only; never populated from request fields.
        self.demo_native_approval_subjects = frozenset()

    def native_approval_only(self, request):
        subject = request.get('subject', {})
        return (subject.get('id') in self.demo_native_approval_subjects
                and subject.get('identity_source') == 'demo_idp_verified_jwt'
                and subject.get('clearance') == 3
                and {'security_admin', 'workspace_maintainer'}.issubset(subject.get('roles', [])))

    def governed(self, request):
        return (self.require_task_policy or request.get('context', {}).get('source') == 'mcp'
                or request.get('action', {}).get('tool') == 'notification.submit'
                or (self.task_policies is not None and self.task_policies.exists(request.get('task_id', ''))))

    def task_guard(self, request):
        if not self.governed(request):
            return None
        if self.task_policies is None:
            raise TaskPolicyError('P001_CONTRACT_REQUIRED', '任务权限服务不可用')
        if not self.task_policies.exists(request['task_id']):
            # Default template grants no sensitive value. Never infer user consent from MCP args.
            try:
                self.task_policies.create(request['task_id'], request['subject']['id'])
            except TaskPolicyError as exc:
                if exc.code != 'P005_CONTRACT_EXISTS':
                    raise
        if self.native_approval_only(request):
            return self.task_policies.evaluate(request, native_approval_only=True)
        return self.task_policies.evaluate(request)

    def authorize(self, request: Mapping[str, Any], ttl_seconds: int = 30) -> dict[str, Any]:
        safe_request = copy.deepcopy(dict(request))
        if safe_request.get('action', {}).get('tool') == 'notification.submit':
            try:
                validate_notice_action(safe_request['action'])
                if self.business_adapters is None:
                    raise ValueError('adapter unavailable')
            except Exception:
                return self._block(safe_request, 'G017_NOTICE_UNAVAILABLE', '送审动作不可用', policy_effect='registry_rejected')
        if safe_request.get("action", {}).get("tool") == "file.read":
            try:
                validate_document_action(safe_request["action"])
                if self.business_adapters is None:
                    raise ValueError("adapter unavailable")
            except Exception:
                return self._block(safe_request, "G016_DOCUMENT_UNAVAILABLE", "文档不可用", policy_effect="registry_rejected")
        try:
            decision = self.opa.decide(safe_request)
        except Exception as exc:
            return self._block(
                safe_request,
                "G001_OPA_UNAVAILABLE_FAIL_CLOSED",
                f"OPA 不可用，默认拒绝：{type(exc).__name__}",
                policy_effect="error",
                http_status=503,
            )

        effect = str(decision.get("effect", "deny"))
        if effect == "deny":
            return self._block(
                safe_request,
                "G002_POLICY_DENY",
                "OPA 策略拒绝工具调用",
                policy_effect=effect,
                policy_reason_codes=list(decision.get("reason_codes", [])),
            )
        try:
            governance = self.task_guard(safe_request)
        except Exception as exc:
            return self._block(safe_request, getattr(exc, 'code', 'P012_TASK_POLICY_UNAVAILABLE'),
                               '任务权限校验未通过', policy_effect='task_policy')
        native_only = self.native_approval_only(safe_request)
        if (effect == "require_approval" and not native_only) or (governance and governance['pending']):
            result = {
                "status": "pending_approval",
                "http_status": 202,
                "reason_code": governance['reason_code'] if governance and governance['pending'] else "G003_APPROVAL_PENDING",
                "policy_reason_codes": list(decision.get("reason_codes", [])),
                "policy_effect": "require_approval",
                "action_digest": decision.get("action_digest", ""),
                "receipt": None,
                "governance": governance,
            }
            self._audit(safe_request, result)
            return result
        if effect != "allow" and not (effect == "require_approval" and native_only):
            return self._block(
                safe_request,
                "G002_POLICY_DENY",
                "未知策略结果，默认拒绝",
                policy_effect=effect,
            )

        action = safe_request.get("action", {})
        tool_key = (str(action.get("tool", "")), str(action.get("operation", "")))
        if tool_key not in self.registry:
            return self._block(
                safe_request,
                "G004_UNREGISTERED_ADAPTER",
                "OPA 允许，但网关没有注册对应的安全工具适配器",
                policy_effect=effect,
            )

        current_digest = compute_action_digest(safe_request)
        if not secrets.compare_digest(str(decision.get("action_digest", "")), current_digest):
            return self._block(
                safe_request,
                "G005_POLICY_DIGEST_MISMATCH",
                "OPA 摘要与网关独立计算结果不一致",
                policy_effect=effect,
            )
        approval = safe_request.get("approval", {})
        if governance and governance['one_time_expansion'] and not approval.get('approval_id'):
            return self._block(safe_request, 'G010_APPROVAL_CREDENTIAL_INVALID', '缺少一次性审批凭证', policy_effect='approval_validation')
        validated_approval = None
        if isinstance(approval, Mapping) and approval.get("approval_id"):
            if self.approvals is None:
                return self._block(
                    safe_request,
                    "G010_APPROVAL_CREDENTIAL_INVALID",
                    "网关没有配置可信审批凭证服务",
                    policy_effect="approval_validation",
                )
            try:
                validated_approval = self.approvals.validate(
                    approval,
                    str(safe_request.get("task_id", "")),
                    current_digest,
                )
            except ApprovalCredentialError as exc:
                return self._block(
                    safe_request,
                    exc.code,
                    str(exc),
                    policy_effect="approval_validation",
                )
        try:
            token = self.tickets.issue(
                str(safe_request.get("task_id", "")), current_digest, ttl_seconds=ttl_seconds,
                scope=governance['scope'] if governance else None
            )
        except TicketError as exc:
            return self._block(
                safe_request,
                exc.code,
                str(exc),
                policy_effect="ticket_signing_error",
                http_status=503,
            )
        if validated_approval is not None:
            try:
                self.approvals.consume(validated_approval)
            except ApprovalCredentialError as exc:
                return self._block(
                    safe_request,
                    exc.code,
                    str(exc),
                    policy_effect="approval_validation",
                )
        result = {
            "status": "authorized",
            "http_status": 200,
            "reason_code": "G000_AUTHORIZED",
            "policy_effect": effect,
            "action_digest": current_digest,
            "ticket": token,
            "receipt": None,
            "governance": governance,
            "approval_mode": "personal_confirmation" if getattr(self,'personal_confirmation_digest',None)==current_digest else "openclaw_native_only" if native_only else "business_approval",
            "policy_reason_codes": list(decision.get("reason_codes", [])),
        }
        self._audit(safe_request, {**result, "ticket": "***REDACTED***"})
        return result

    def dispatch(self, request: Mapping[str, Any], ticket: str | None) -> dict[str, Any]:
        safe_request = copy.deepcopy(dict(request))
        action = safe_request.get("action", {})
        tool_key = (str(action.get("tool", "")), str(action.get("operation", "")))
        if tool_key not in self.registry:
            return self._block(
                safe_request,
                "G004_UNREGISTERED_ADAPTER",
                "后端没有注册对应工具适配器",
                policy_effect="not_evaluated",
            )
        digest = compute_action_digest(safe_request)
        try:
            ticket_payload = self.tickets.consume(
                ticket, str(safe_request.get("task_id", "")), digest
            )
            # Signed scope is required even if a caller removes the MCP context later.
            if ticket_payload.get('scope') or self.governed(safe_request):
                scope = ticket_payload.get('scope')
                if not scope or scope.get('subject_id') != safe_request.get('subject', {}).get('id'):
                    raise TicketError('P002_SUBJECT_MISMATCH', '票据缺少匹配主体的任务作用域')
                self.task_policies.consume_scope(safe_request, scope)
        except TaskPolicyError as exc:
            return self._block(safe_request, exc.code, str(exc), policy_effect='task_policy')
        except TicketError as exc:
            return self._block(
                safe_request,
                exc.code,
                str(exc),
                policy_effect="ticket_validation",
            )
        except Exception:
            return self._block(safe_request, 'P012_TASK_POLICY_UNAVAILABLE', '任务权限校验不可用', policy_effect='task_policy')

        if (self.host_dispatch_enabled and safe_request.get('context', {}).get('host_acl') is True
                and not (getattr(self, 'host_document_dispatch_enabled', False)
                         and safe_request.get('context', {}).get('host_document_adapter') is True
                         and action.get('tool') == 'file.read')):
            result = {'status': 'host_authorized', 'http_status': 200,
                      'reason_code': 'G000_HOST_AUTHORIZED', 'receipt': None}
            self._audit(safe_request, result)
            return result

        specification = self.registry[tool_key]
        parameter_name = specification["argument"]
        raw_argument = action.get("parameters", {}).get(parameter_name, 0)
        try:
            argument = max(-(2**31), min(2**31 - 1, int(raw_argument)))
        except (TypeError, ValueError):
            return self._block(
                safe_request,
                "G008_ADAPTER_ARGUMENT_INVALID",
                "工具适配器参数无法转换为受限整数",
                policy_effect="allowed_then_adapter_blocked",
            )
        sandbox_result = self.kernel.execute(
            self.module_dir / specification["module"], args=(argument,)
        )
        if sandbox_result["status"] != "executed_isolated":
            return self._block(
                safe_request,
                str(sandbox_result["reason_code"]),
                "安全内核阻断工具模块",
                policy_effect="allowed_then_sandbox_blocked",
                sandbox=sandbox_result,
            )
        business_result = None
        if self.business_adapters is not None:
            try:
                business_result = self.business_adapters.execute(safe_request)
            except Exception as exc:
                if getattr(exc, "outcome_unknown", False):
                    result = {
                        "status": "reconciliation_required",
                        "http_status": 202,
                        "reason_code": "G015_BUSINESS_OUTCOME_UNKNOWN",
                        "message": "远端写操作结果未知；不得重试，必须先按幂等键对账",
                        "policy_effect": "allowed_then_reconciliation_required",
                        "receipt": {
                            "task_id": safe_request.get("task_id", ""),
                            "action_digest": digest,
                            "ticket_jti": ticket_payload["jti"],
                            "reconciliation": {
                                "idempotency_key": getattr(exc, "idempotency_key", ""),
                                "endpoint_host": getattr(exc, "endpoint_host", ""),
                                "automatic_retry_allowed": False,
                            },
                            "sandbox": sandbox_result,
                        },
                    }
                    self._audit(safe_request, result)
                    return result
                return self._block(
                    safe_request,
                    "G009_BUSINESS_ADAPTER_FAILED",
                    f"业务适配器执行失败并默认拒绝：{type(exc).__name__}",
                    policy_effect="allowed_then_business_adapter_blocked",
                    sandbox=sandbox_result,
                )
        receipt = {
            "receipt_id": f"iso-{uuid.uuid4().hex[:16]}",
            "task_id": safe_request.get("task_id", ""),
            "action_digest": digest,
            "ticket_jti": ticket_payload["jti"],
            "tool": action.get("tool", ""),
            "operation": action.get("operation", ""),
            "result": (
                "authorized_preproduction_business_operation"
                if business_result is not None
                and business_result.get("adapter") == "authorized_production_https_api"
                else (
                    "local_test_business_operation"
                    if business_result is not None
                    else "wasmtime_isolated_simulation"
                )
            ),
            "sandbox": sandbox_result,
            "business_result": business_result,
        }
        result = {
            "status": "executed_isolated",
            "http_status": 200,
            "reason_code": "G000_EXECUTED",
            "policy_effect": "allow",
            "receipt": receipt,
        }
        self._audit(safe_request, result)
        return result

    def invoke(self, request: Mapping[str, Any]) -> dict[str, Any]:
        authorization = self.authorize(request)
        if authorization["status"] != "authorized":
            return authorization
        if self.host_dispatch_enabled and request.get('context', {}).get('host_acl') is True:
            return authorization  # Kept in private worker memory until the host retry.
        result = self.dispatch(request, authorization["ticket"])
        result['governance'] = authorization.get('governance')
        result['approval_mode'] = authorization.get('approval_mode', 'business_approval')
        result['policy_reason_codes'] = authorization.get('policy_reason_codes', [])
        return result

    def invoke_authenticated(
        self,
        request: Mapping[str, Any],
        authorization_header: str | None,
        verifier: OidcVerifier,
    ) -> dict[str, Any]:
        try:
            authenticated = verifier.authenticate_request(request, authorization_header)
        except OidcIdentityError as exc:
            return self._block(
                request,
                exc.code,
                str(exc),
                policy_effect="identity_rejected",
                http_status=401,
            )
        return self.invoke(authenticated)

    def _block(
        self,
        request: Mapping[str, Any],
        code: str,
        message: str,
        policy_effect: str,
        http_status: int = 403,
        **extra: Any,
    ) -> dict[str, Any]:
        result = {
            "status": "blocked",
            "http_status": http_status,
            "reason_code": code,
            "message": message,
            "policy_effect": policy_effect,
            "receipt": None,
            **extra,
        }
        self._audit(request, result)
        return result

    def _audit(self, request: Mapping[str, Any], result: Mapping[str, Any]) -> None:
        action = request.get("action", {})
        context = request.get("context", {})
        document_id = action.get('parameters', {}).get('document_id')
        known_document = isinstance(document_id, str) and document_id in DOCUMENT_REGISTRY
        contract_digest = None
        if self.task_policies is not None:
            try:
                contract_digest = self.task_policies.summary(request.get('task_id', ''))['scope_digest']
            except Exception:
                pass  # Identity/OPA may reject before a task contract exists.
        self.audit.write(
            {
                "event": "enforcement_decision",
                "request_id": request.get("request_id", ""),
                "task_id": request.get("task_id", ""),
                "subject_id": request.get("subject", {}).get("id", ""),
                "identity_source": request.get('subject', {}).get('identity_source'),
                "scope_digest": contract_digest,
                "run_id": context.get('run_id'),
                "session_key_hash": context.get('session_key_hash'),
                "tool": action.get("tool", ""),
                "operation": action.get("operation", ""),
                "parameters": {k: {'value_hash': value_hash(v)} for k, v in action.get('parameters', {}).items()},
                "data_level": action.get("data_level"),
                "document_id": document_id if known_document else None,
                "scenario": context.get("scenario", ""),
                "identity_note": context.get("identity_note", ""),
                "demo_run_id": context.get("demo_run_id", ""),
                "result": scrub_document_receipt({
                    **result,
                    "policy_reason_codes": result.get("policy_reason_codes", []),
                    "executed": result.get("status") == "executed_isolated" and result.get("receipt") is not None,
                }),
            }
        )


def build_gateway(
    state_dir: Path | str,
    project_root: Path | str = PROJECT_ROOT,
    secret: bytes | None = None,
    opa_client: Any | None = None,
    registry: Mapping[tuple[str, str], Mapping[str, str]] | None = None,
    enable_local_adapters: bool = False,
    signer: TicketSigner | None = None,
    ledger: TicketLedger | None = None,
    business_adapter: Any | None = None,
    approval_service: ApprovalCredentialService | None = None,
) -> EnforcementGateway:
    root = Path(project_root)
    state = Path(state_dir)
    state.mkdir(parents=True, exist_ok=True)
    if signer is None:
        ticket_secret = bytes(secret or secrets.token_bytes(32))
        ticket_signer = None
        if approval_service is None:
            from .signers import HmacKeyringSigner

            approval_secret = hashlib.sha256(
                b"agentguard-approval-v1\0" + ticket_secret
            ).digest()
            approval_service = ApprovalCredentialService(
                HmacKeyringSigner.single_key(approval_secret),
                SQLiteApprovalLedger(state / "approval_credentials.sqlite"),
            )
    else:
        ticket_secret = None
        ticket_signer = signer
        if approval_service is None:
            if isinstance(signer, OpenBaoTransitSigner):
                from approval.credentials import OpenBaoKvApprovalLedger

                approval_service = ApprovalCredentialService(
                    OpenBaoTransitSigner(
                        signer.address,
                        signer.token,
                        key_name="agentguard-approval",
                        mount=signer.mount,
                        namespace=signer.namespace,
                        timeout_seconds=signer.timeout_seconds,
                    ),
                    OpenBaoKvApprovalLedger(
                        signer.address,
                        signer.token,
                        namespace=signer.namespace,
                        timeout_seconds=signer.timeout_seconds,
                    ),
                )
            else:
                approval_service = ApprovalCredentialService(
                    signer,
                    SQLiteApprovalLedger(state / "approval_credentials.sqlite"),
                )
    return EnforcementGateway(
        opa_client=opa_client or OpaClient(root),
        ticket_store=ExecutionTicketStore(
            state / "execution_tickets.sqlite",
            secret=ticket_secret,
            signer=ticket_signer,
            ledger=ledger,
        ),
        kernel=WasmSecurityKernel(),
        audit_logger=AuditLogger(state / "enforcement_audit.jsonl"),
        module_dir=root / "security_kernel" / "modules",
        registry=registry,
        business_adapters=(
            business_adapter
            if business_adapter is not None
            else (LocalTestBusinessAdapters(state) if enable_local_adapters else None)
        ),
        approval_service=approval_service,
        task_policies=TaskPolicies(state / 'task_contracts.sqlite'),
    )
