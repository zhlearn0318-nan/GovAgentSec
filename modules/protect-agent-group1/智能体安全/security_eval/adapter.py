from __future__ import annotations

import json
from dataclasses import dataclass
from time import perf_counter_ns

from agent.agent import SOURCE_TRUST
from agent.state import AgentRequest, SourceType
from guards.guard_router import GuardRouter
from guards.base import GuardPort
from guards.piguard import BaselinePIGuard
from guards.qwen3guard import BaselineQwen3Guard
from policy.policy_engine import PolicyAction, PolicyEngine
from rag_security.provenance import KnowledgeDocument
from rag_security.trustrag_adapter import BaselineTrustRAG, TrustRAGPort
from risk.risk_engine import RiskEngine
from risk.guard_fusion import GuardFusion
from risk.conversation_state import ConversationObservation, ConversationRiskState
from risk.privilege_boundary import PrivilegeBoundaryDetector
from risk.output_guard import OutputBehaviorDetector, OutputContext
from risk.risk_schema import GuardSignal, RiskContext
from risk.task_payload_alignment import TaskPayloadAlignmentDetector


SOURCE_MAP = {
    "user": SourceType.USER,
    "web": SourceType.WEB,
    "file": SourceType.FILE,
    "rag": SourceType.RAG,
    "memory": SourceType.MEMORY,
    "tool": SourceType.TOOL,
    "cross_source_multi_turn": SourceType.MEMORY,
    "agent_answer": SourceType.TOOL,
}


@dataclass(frozen=True, slots=True)
class DetectionResult:
    normalized_text: str
    raw_output: str
    parsed_risk_label: str
    risk_level: str
    categories: tuple[str, ...]
    risk_score: float
    detector_score: float
    action: str
    retained: bool
    latency_ms: float
    detectors_available: bool = True


@dataclass(frozen=True, slots=True)
class RAGChunkInput:
    retrieval_id: str
    text: str


@dataclass(frozen=True, slots=True)
class RAGDefenseResult:
    retrieval_id: str
    detection: DetectionResult
    retained: bool


class SecurityEvalAdapter:
    def __init__(
        self,
        *,
        piguard: GuardPort | None = None,
        qwen3guard: GuardPort | None = None,
        trustrag: TrustRAGPort | None = None,
        guard_fusion: GuardFusion | None = None,
        task_payload_detector: TaskPayloadAlignmentDetector | None = None,
        privilege_detector: PrivilegeBoundaryDetector | None = None,
        conversation_state: ConversationRiskState | None = None,
        output_behavior_detector: OutputBehaviorDetector | None = None,
        enable_alignment: bool = True,
        enable_privilege: bool = True,
        enable_conversation: bool = True,
    ) -> None:
        self.piguard = piguard or BaselinePIGuard()
        self.qwen3guard = qwen3guard or BaselineQwen3Guard()
        self.router = GuardRouter()
        self.risk_engine = RiskEngine()
        self.policy_engine = PolicyEngine()
        self.trustrag = trustrag or BaselineTrustRAG()
        self.guard_fusion = guard_fusion or GuardFusion()
        self.task_payload_detector = (
            task_payload_detector or TaskPayloadAlignmentDetector()
        )
        self.privilege_detector = privilege_detector or PrivilegeBoundaryDetector()
        self.conversation_state = conversation_state or ConversationRiskState()
        self.output_behavior_detector = output_behavior_detector or OutputBehaviorDetector()
        self.enable_alignment = enable_alignment
        self.enable_privilege = enable_privilege
        self.enable_conversation = enable_conversation

    def detect_output(
        self,
        text: str,
        context: OutputContext,
        *,
        conversation_id: str | None = None,
    ) -> DetectionResult:
        """Screen agent behavior with output-specific evidence and provenance."""
        del conversation_id  # A safe refusal must not inherit input attack risk.
        started = perf_counter_ns()
        request = AgentRequest(text, source=SourceType.TOOL)
        injection = self.router.scan(self.piguard, request.content, SourceType.TOOL)
        content = self._scan_output_content(request.content, context.original_task)
        behavior = self.output_behavior_detector.detect(request.content, context)
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
        categories = tuple(
            sorted(
                set(
                    fused.injection.categories
                    + fused.content.categories
                    + fused.alignment.categories
                )
            )
        )
        raw = {
            "piguard": self._signal(fused.injection),
            "qwen3guard": self._signal(fused.content),
            "output_behavior": {
                "execution": self._signal(behavior.execution),
                "disclosure": self._signal(behavior.disclosure),
                "propagation": self._signal(behavior.propagation),
                "task_alignment": self._signal(behavior.task_alignment),
            },
            "output_context": {
                "role": context.role.value,
                "is_quoted": context.is_quoted,
                "safe_reference": behavior.safe_reference,
                "retrieved_items": len(context.retrieved_context),
                "external_items": sum(
                    item.has_external_payload for item in context.retrieved_context
                ),
                "sources": sorted({item.source.value for item in context.retrieved_context}),
            },
            "risk": {
                "score": assessment.score,
                "level": assessment.level.value,
                "reasons": assessment.reasons,
            },
            "policy": {
                "action": decision.action.value,
                "reason_code": decision.reason_code,
            },
        }
        signals = (
            fused.injection,
            fused.content,
            fused.alignment,
            fused.privilege,
            fused.multi_turn,
        )
        return DetectionResult(
            normalized_text=request.content,
            raw_output=json.dumps(raw, ensure_ascii=False, sort_keys=True),
            parsed_risk_label=(
                "benign" if decision.action is PolicyAction.ALLOW else "risk"
            ),
            risk_level=assessment.level.value,
            categories=categories,
            risk_score=assessment.score,
            detector_score=max(signal.score for signal in signals),
            action=decision.action.value,
            retained=decision.action is PolicyAction.ALLOW,
            latency_ms=(perf_counter_ns() - started) / 1_000_000,
            detectors_available=all(signal.available for signal in signals),
        )

    def _scan_output_content(self, text: str, original_task: str) -> GuardSignal:
        method = getattr(self.qwen3guard, "scan_output", None)
        if not callable(method):
            return self.router.scan(self.qwen3guard, text, SourceType.TOOL)
        try:
            signal = method(original_task, text)
            if not isinstance(signal, GuardSignal):
                raise TypeError("invalid detector output")
            return signal
        except Exception:
            try:
                detector_name = str(self.qwen3guard.name).strip() or "unknown_guard"
            except Exception:
                detector_name = "unknown_guard"
            return GuardSignal(
                detector=detector_name,
                score=1.0,
                categories=("detector_unavailable",),
                reasons=("security detector failed",),
                available=False,
            )

    def detect(
        self,
        text: str,
        source: str,
        *,
        conversation_id: str | None = None,
        granted_permissions: frozenset[str] = frozenset(),
    ) -> DetectionResult:
        started = perf_counter_ns()
        source_type = SOURCE_MAP[source]
        request = AgentRequest(
            text,
            source=source_type,
            conversation_id=conversation_id,
        )
        injection = self.router.scan(self.piguard, request.content, source_type)
        content = self.router.scan(self.qwen3guard, request.content, source_type)
        alignment_assessment = (
            self.task_payload_detector.detect(request.content, source_type)
            if self.enable_alignment
            else None
        )
        privilege_assessment = (
            self.privilege_detector.detect(
                request.content,
                source_type,
                granted_permissions=granted_permissions,
            )
            if self.enable_privilege
            else None
        )
        alignment = (
            alignment_assessment.signal
            if alignment_assessment is not None
            else GuardSignal(
                "task_payload_alignment",
                0.0,
                reasons=("component=disabled_for_ablation",),
            )
        )
        privilege = (
            privilege_assessment.signal
            if privilege_assessment is not None
            else GuardSignal(
                "privilege_boundary",
                0.0,
                reasons=("component=disabled_for_ablation",),
            )
        )
        preliminary = self.guard_fusion.fuse_all(
            request.content,
            source_type,
            injection,
            content,
            alignment=alignment,
            privilege=privilege,
        )
        multi_turn = GuardSignal("conversation_risk", 0.0)
        if (
            self.enable_conversation
            and request.conversation_id is not None
        ):
            multi_turn = self.conversation_state.observe(
                request.conversation_id,
                ConversationObservation(
                    source=source_type,
                    current_risk=max(
                        preliminary.injection.score,
                        preliminary.content.score,
                        alignment.score,
                        privilege.score,
                    ),
                    sensitive_resource_access=(
                        privilege_assessment.sensitive_resource_access
                        if privilege_assessment is not None
                        else False
                    ),
                    privilege_change=(
                        privilege_assessment.privilege_change
                        if privilege_assessment is not None
                        else False
                    ),
                    data_movement=(
                        bool(
                            alignment_assessment
                            and alignment_assessment.data_movement
                        )
                        or bool(
                            privilege_assessment
                            and privilege_assessment.data_movement
                        )
                    ),
                ),
            )
        elif not self.enable_conversation:
            multi_turn = GuardSignal(
                "conversation_risk",
                0.0,
                reasons=("component=disabled_for_ablation",),
            )
        fused = self.guard_fusion.fuse_all(
            request.content,
            source_type,
            preliminary.injection,
            preliminary.content,
            alignment=alignment,
            privilege=privilege,
            multi_turn=multi_turn,
        )
        assessment = self.risk_engine.assess(
            RiskContext(
                source=source_type,
                injection=fused.injection,
                content=fused.content,
                alignment=fused.alignment,
                privilege=fused.privilege,
                multi_turn=fused.multi_turn,
                source_trust=SOURCE_TRUST[source_type],
            )
        )
        decision = self.policy_engine.decide(assessment)
        categories = tuple(
            sorted(
                set(
                    fused.injection.categories
                    + fused.content.categories
                    + fused.alignment.categories
                    + fused.privilege.categories
                    + fused.multi_turn.categories
                )
            )
        )
        raw = {
            "piguard": self._signal(fused.injection),
            "qwen3guard": self._signal(fused.content),
            "task_payload_alignment": self._signal(fused.alignment),
            "privilege_boundary": self._signal(fused.privilege),
            "conversation_risk": self._signal(fused.multi_turn),
            "risk": {
                "score": assessment.score,
                "level": assessment.level.value,
                "reasons": assessment.reasons,
            },
            "policy": {
                "action": decision.action.value,
                "reason_code": decision.reason_code,
            },
        }
        return DetectionResult(
            normalized_text=request.content,
            raw_output=json.dumps(raw, ensure_ascii=False, sort_keys=True),
            parsed_risk_label=(
                "benign" if decision.action is PolicyAction.ALLOW else "risk"
            ),
            risk_level=assessment.level.value,
            categories=categories,
            risk_score=assessment.score,
            detector_score=max(
                fused.injection.score,
                fused.content.score,
                fused.alignment.score,
                fused.privilege.score,
                fused.multi_turn.score,
            ),
            action=decision.action.value,
            retained=decision.action is PolicyAction.ALLOW,
            latency_ms=(perf_counter_ns() - started) / 1_000_000,
            detectors_available=all(
                signal.available
                for signal in (
                    fused.injection,
                    fused.content,
                    fused.alignment,
                    fused.privilege,
                    fused.multi_turn,
                )
            ),
        )

    def defend_rag(
        self,
        query: str,
        chunks: tuple[RAGChunkInput, ...],
        *,
        conversation_id: str | None = None,
    ) -> tuple[RAGDefenseResult, ...]:
        detections = tuple(
            self.detect(
                chunk.text,
                "rag",
                conversation_id=conversation_id,
            )
            for chunk in chunks
        )
        documents = tuple(
            KnowledgeDocument(
                document_id=chunk.retrieval_id,
                content=chunk.text,
                source="rag_eval",
                source_trust=1.0,
                verified=True,
                poison_score=detection.detector_score,
            )
            for chunk, detection in zip(chunks, detections)
        )
        result = self.trustrag.assess(query, documents)
        retained_ids = {document.document_id for document in result.trusted_documents}
        return tuple(
            RAGDefenseResult(
                retrieval_id=chunk.retrieval_id,
                detection=detection,
                retained=(
                    detection.retained and chunk.retrieval_id in retained_ids
                ),
            )
            for chunk, detection in zip(chunks, detections)
        )

    @staticmethod
    def _signal(signal) -> dict[str, object]:
        return {
            "detector": signal.detector,
            "score": signal.score,
            "categories": signal.categories,
            "reasons": signal.reasons,
            "available": signal.available,
        }
