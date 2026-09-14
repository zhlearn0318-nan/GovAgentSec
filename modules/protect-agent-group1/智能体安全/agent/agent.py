from __future__ import annotations

from dataclasses import dataclass, field

from guards.base import GuardPort
from guards.guard_router import GuardRouter
from policy.policy_engine import PolicyAction, PolicyDecision, PolicyEngine
from rag_security.provenance import KnowledgeDocument
from rag_security.retriever import RetrieverPort
from rag_security.trustrag_adapter import TrustRAGPort, TrustRAGResult
from risk.risk_engine import RiskEngine
from risk.conversation_state import ConversationObservation, ConversationRiskState
from risk.guard_fusion import GuardFusion
from risk.privilege_boundary import (
    PrivilegeBoundaryAssessment,
    PrivilegeBoundaryDetector,
)
from risk.output_guard import (
    MessageRole,
    OutputBehaviorDetector,
    OutputContext,
    RetrievedContext,
)
from risk.risk_schema import GuardSignal, RiskAssessment, RiskContext
from risk.task_payload_alignment import (
    TaskPayloadAlignmentAssessment,
    TaskPayloadAlignmentDetector,
)
from tools.base import ToolOutcome, ToolStatus
from tools.gateway import ToolGateway
from tools.permissions import PermissionContext

from .ports import (
    MAX_MODEL_OUTPUT_CHARACTERS,
    AgentModelPort,
    ModelAction,
    ModelDecision,
)
from .result import AgentResponse, AgentStatus
from .state import AgentRequest, SourceType


SOURCE_TRUST = {
    SourceType.USER: 0.6,
    SourceType.WEB: 0.4,
    SourceType.FILE: 0.5,
    SourceType.RAG: 0.5,
    SourceType.MEMORY: 0.4,
    SourceType.TOOL: 0.3,
}


@dataclass(frozen=True, slots=True)
class SecurityAgent:
    piguard: GuardPort
    qwen3guard: GuardPort
    guard_router: GuardRouter
    retriever: RetrieverPort
    trustrag: TrustRAGPort
    risk_engine: RiskEngine
    policy_engine: PolicyEngine
    model: AgentModelPort
    tool_gateway: ToolGateway
    guard_fusion: GuardFusion = GuardFusion()
    task_payload_detector: TaskPayloadAlignmentDetector = TaskPayloadAlignmentDetector()
    privilege_detector: PrivilegeBoundaryDetector = PrivilegeBoundaryDetector()
    output_behavior_detector: OutputBehaviorDetector = OutputBehaviorDetector()
    conversation_state: ConversationRiskState = field(
        default_factory=ConversationRiskState,
        compare=False,
        repr=False,
    )
    retrieval_limit: int = 10

    def handle(
        self,
        request: AgentRequest,
        permissions: PermissionContext | None = None,
    ) -> AgentResponse:
        permissions = permissions or PermissionContext()
        injection = self.guard_router.scan(
            self.piguard, request.content, request.source
        )
        content = self.guard_router.scan(
            self.qwen3guard, request.content, request.source
        )
        alignment_assessment = self.task_payload_detector.detect(
            request.content, request.source
        )
        privilege_assessment = self.privilege_detector.detect(
            request.content,
            request.source,
            granted_permissions=permissions.permissions,
        )
        preliminary = self.guard_fusion.fuse_all(
            request.content,
            request.source,
            injection,
            content,
            alignment=alignment_assessment.signal,
            privilege=privilege_assessment.signal,
        )
        multi_turn = self._observe_conversation(
            request,
            source=request.source,
            current_risk=max(
                preliminary.injection.score,
                preliminary.content.score,
                preliminary.alignment.score,
                preliminary.privilege.score,
            ),
            alignment=alignment_assessment,
            privilege=privilege_assessment,
        )
        fused = self.guard_fusion.fuse_all(
            request.content,
            request.source,
            preliminary.injection,
            preliminary.content,
            alignment=preliminary.alignment,
            privilege=preliminary.privilege,
            multi_turn=multi_turn,
        )
        rag_result = self._retrieve(request)

        assessment, decision = self._decide(
            request.source,
            fused.injection,
            fused.content,
            rag_result,
            alignment=fused.alignment,
            privilege=fused.privilege,
            multi_turn=fused.multi_turn,
        )
        if decision.action is not PolicyAction.ALLOW:
            return self._policy_response(
                assessment, decision, used_rag=bool(request.use_rag)
            )

        try:
            model_decision = self.model.plan(
                request, rag_result.trusted_documents
            )
            if not isinstance(model_decision, ModelDecision):
                raise TypeError("invalid model decision")
        except Exception:
            return self._error_response(
                assessment, decision, used_rag=bool(request.use_rag)
            )

        if model_decision.action is ModelAction.RESPOND:
            return self._screen_output(
                model_decision.response_text,
                request=request,
                retrieved_documents=rag_result.trusted_documents,
                used_rag=bool(request.use_rag),
            )
        return self._run_tool(
            request,
            model_decision,
            permissions,
            fused.injection,
            fused.content,
            rag_result,
            alignment_assessment,
            privilege_assessment,
            fused.multi_turn,
        )

    def _observe_conversation(
        self,
        request: AgentRequest,
        *,
        source: SourceType,
        current_risk: float,
        alignment: TaskPayloadAlignmentAssessment,
        privilege: PrivilegeBoundaryAssessment,
        tool_call: str | None = None,
        force_data_movement: bool = False,
    ) -> GuardSignal:
        if request.conversation_id is None:
            return GuardSignal(
                "conversation_risk",
                0.0,
                reasons=("conversation=stateless_request",),
            )
        return self.conversation_state.observe(
            request.conversation_id,
            ConversationObservation(
                source=source,
                current_risk=current_risk,
                sensitive_resource_access=privilege.sensitive_resource_access,
                privilege_change=privilege.privilege_change,
                data_movement=(
                    alignment.data_movement
                    or privilege.data_movement
                    or force_data_movement
                ),
                tool_call=tool_call,
            ),
        )

    def _retrieve(self, request: AgentRequest) -> TrustRAGResult:
        if not request.use_rag:
            return TrustRAGResult((), 0.0, 0)
        try:
            documents = self.retriever.retrieve(
                request.content, self.retrieval_limit
            )
            if (
                not isinstance(documents, tuple)
                or len(documents) > self.retrieval_limit
                or not all(
                    isinstance(item, KnowledgeDocument) for item in documents
                )
            ):
                raise TypeError("invalid retrieval result")
            result = self.trustrag.assess(request.content, documents)
            if not isinstance(result, TrustRAGResult):
                raise TypeError("invalid TrustRAG result")
            return result
        except Exception:
            return TrustRAGResult((), 1.0, 0, available=False)

    def _decide(
        self,
        source: SourceType,
        injection: GuardSignal,
        content: GuardSignal,
        rag_result: TrustRAGResult,
        operation_risk: float = 0.0,
        *,
        alignment: GuardSignal = GuardSignal("task_payload_alignment", 0.0),
        privilege: GuardSignal = GuardSignal("privilege_boundary", 0.0),
        multi_turn: GuardSignal = GuardSignal("conversation_risk", 0.0),
    ) -> tuple[RiskAssessment, PolicyDecision]:
        assessment = self.risk_engine.assess(
            RiskContext(
                source=source,
                injection=injection,
                content=content,
                alignment=alignment,
                privilege=privilege,
                multi_turn=multi_turn,
                rag_risk=rag_result.poison_score,
                source_trust=SOURCE_TRUST[source],
                operation_risk=operation_risk,
                rag_available=rag_result.available,
            )
        )
        return assessment, self.policy_engine.decide(assessment)

    def _run_tool(
        self,
        request: AgentRequest,
        model_decision: ModelDecision,
        permissions: PermissionContext,
        injection: GuardSignal,
        content: GuardSignal,
        rag_result: TrustRAGResult,
        alignment_assessment: TaskPayloadAlignmentAssessment,
        privilege_assessment: PrivilegeBoundaryAssessment,
        multi_turn: GuardSignal,
    ) -> AgentResponse:
        tool_request = model_decision.tool_request
        if tool_request is None:
            raise AssertionError("validated tool decision has no request")
        operation_risk = self.tool_gateway.operation_risk(tool_request)
        multi_turn = self._observe_conversation(
            request,
            source=SourceType.TOOL,
            current_risk=max(operation_risk, multi_turn.score),
            alignment=alignment_assessment,
            privilege=privilege_assessment,
            tool_call=tool_request.name,
            force_data_movement=operation_risk >= 0.60,
        )
        assessment, decision = self._decide(
            request.source,
            injection,
            content,
            rag_result,
            operation_risk,
            alignment=alignment_assessment.signal,
            privilege=privilege_assessment.signal,
            multi_turn=multi_turn,
        )
        if decision.action in (PolicyAction.BLOCK, PolicyAction.ISOLATE):
            return self._policy_response(
                assessment, decision, used_rag=bool(request.use_rag)
            )

        outcome = self.tool_gateway.execute(tool_request, permissions)
        if outcome.status is not ToolStatus.EXECUTED:
            status = {
                ToolStatus.CONFIRMATION_REQUIRED: AgentStatus.CONFIRMATION_REQUIRED,
                ToolStatus.DENIED: AgentStatus.DENIED,
                ToolStatus.ERROR: AgentStatus.ERROR,
            }[outcome.status]
            return AgentResponse(
                status=status,
                content=outcome.message,
                assessment=assessment,
                decision=decision,
                used_rag=bool(request.use_rag),
                tool_outcome=outcome,
            )

        tool_injection = self.guard_router.scan(
            self.piguard, outcome.output, SourceType.TOOL
        )
        tool_content = self.guard_router.scan(
            self.qwen3guard, outcome.output, SourceType.TOOL
        )
        clean_rag = TrustRAGResult((), 0.0, 0)
        tool_assessment, tool_decision = self._decide(
            SourceType.TOOL,
            tool_injection,
            tool_content,
            clean_rag,
            operation_risk,
        )
        if tool_decision.action is not PolicyAction.ALLOW:
            return self._policy_response(
                tool_assessment,
                tool_decision,
                used_rag=bool(request.use_rag),
                tool_outcome=outcome,
            )

        try:
            final_text = self.model.finalize(
                request, rag_result.trusted_documents, outcome.output
            )
        except Exception:
            return self._error_response(
                tool_assessment,
                tool_decision,
                used_rag=bool(request.use_rag),
                tool_outcome=outcome,
            )
        return self._screen_output(
            final_text,
            request=request,
            retrieved_documents=rag_result.trusted_documents,
            tool_output=outcome.output,
            used_rag=bool(request.use_rag),
            tool_outcome=outcome,
        )

    def _screen_output(
        self,
        text: str,
        *,
        request: AgentRequest,
        retrieved_documents: tuple[KnowledgeDocument, ...] = (),
        tool_output: str | None = None,
        used_rag: bool,
        tool_outcome: ToolOutcome | None = None,
    ) -> AgentResponse:
        if (
            not isinstance(text, str)
            or not text.strip()
            or len(text) > MAX_MODEL_OUTPUT_CHARACTERS
        ):
            safe_signal = GuardSignal("invalid_model_output", 0.0)
            assessment, decision = self._decide(
                SourceType.USER,
                safe_signal,
                GuardSignal("model_output", 1.0, available=False),
                TrustRAGResult((), 0.0, 0),
            )
            return self._error_response(
                assessment, decision, used_rag=used_rag, tool_outcome=tool_outcome
            )
        context_items = [
            RetrievedContext(
                source=SourceType.RAG,
                content=document.content[:4_096],
                role=MessageRole.TOOL,
                has_external_payload=True,
                is_quoted=False,
            )
            for document in retrieved_documents[:8]
            if document.content.strip()
        ]
        if tool_output and len(context_items) < 8:
            context_items.append(
                RetrievedContext(
                    source=SourceType.TOOL,
                    content=tool_output[:4_096],
                    role=MessageRole.TOOL,
                    has_external_payload=True,
                    is_quoted=False,
                )
            )
        output_context = OutputContext(
            original_task=request.content,
            retrieved_context=tuple(context_items),
            role=MessageRole.AGENT,
            is_quoted=(
                "quoted" in request.content.casefold()
                or "quote" in request.content.casefold()
                or "引用" in request.content
            ),
        )
        injection = self.guard_router.scan(self.piguard, text, SourceType.TOOL)
        content = self._scan_output_content(text, request.content)
        behavior = self.output_behavior_detector.detect(text, output_context)
        fused = self.guard_fusion.fuse_output(injection, content, behavior)
        assessment = self.risk_engine.assess(
            RiskContext(
                source=SourceType.TOOL,
                injection=fused.injection,
                content=fused.content,
                alignment=fused.alignment,
                privilege=fused.privilege,
                multi_turn=fused.multi_turn,
                source_trust=0.80,
            )
        )
        decision = self.policy_engine.decide(assessment)
        if decision.action is not PolicyAction.ALLOW:
            return self._policy_response(
                assessment,
                decision,
                used_rag=used_rag,
                tool_outcome=tool_outcome,
            )
        return AgentResponse(
            status=AgentStatus.COMPLETED,
            content=text,
            assessment=assessment,
            decision=decision,
            used_rag=used_rag,
            tool_outcome=tool_outcome,
        )

    def _scan_output_content(self, text: str, original_task: str) -> GuardSignal:
        method = getattr(self.qwen3guard, "scan_output", None)
        if not callable(method):
            return self.guard_router.scan(self.qwen3guard, text, SourceType.TOOL)
        try:
            signal = method(original_task, text)
            if not isinstance(signal, GuardSignal):
                raise TypeError("invalid output guard signal")
            return signal
        except Exception:
            try:
                detector_name = str(self.qwen3guard.name).strip() or "unknown_guard"
            except Exception:
                detector_name = "unknown_guard"
            return GuardSignal(
                detector_name,
                1.0,
                ("detector_unavailable",),
                ("security detector failed",),
                available=False,
            )

    @staticmethod
    def _policy_response(
        assessment: RiskAssessment,
        decision: PolicyDecision,
        *,
        used_rag: bool,
        tool_outcome: ToolOutcome | None = None,
    ) -> AgentResponse:
        statuses = {
            PolicyAction.SANITIZE: AgentStatus.SANITIZATION_REQUIRED,
            PolicyAction.ISOLATE: AgentStatus.ISOLATED,
            PolicyAction.BLOCK: AgentStatus.BLOCKED,
            PolicyAction.CONFIRM: AgentStatus.CONFIRMATION_REQUIRED,
        }
        return AgentResponse(
            status=statuses[decision.action],
            content="请求已由安全策略停止。",
            assessment=assessment,
            decision=decision,
            used_rag=used_rag,
            tool_outcome=tool_outcome,
        )

    @staticmethod
    def _error_response(
        assessment: RiskAssessment,
        decision: PolicyDecision,
        *,
        used_rag: bool,
        tool_outcome: ToolOutcome | None = None,
    ) -> AgentResponse:
        return AgentResponse(
            status=AgentStatus.ERROR,
            content="安全处理失败。",
            assessment=assessment,
            decision=decision,
            used_rag=used_rag,
            tool_outcome=tool_outcome,
        )
