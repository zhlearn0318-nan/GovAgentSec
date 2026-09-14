from __future__ import annotations

from dataclasses import dataclass
import re

from agent.state import SourceType

from .risk_schema import GuardSignal
from .output_guard import OutputBehaviorAssessment


_EXTERNAL_SOURCES = frozenset({SourceType.WEB, SourceType.RAG})
_ATTACK_EVIDENCE = tuple(
    re.compile(pattern, re.IGNORECASE | re.DOTALL)
    for pattern in (
        r"\b(?:ignore|disregard|forget|override|bypass|disable|cancel(?:led)?|replace)\b.{0,100}\b(?:instruction|direction|message|policy|rule|safeguard|security|task|control)",
        r"\b(?:system|developer|safety|security)\b.{0,50}\b(?:instruction|message|prompt|rule|policy|control)\b",
        r"\bdo\s+not\s+(?:follow|obey)\b.{0,80}\b(?:system|developer|previous|prior|instruction|message)\b",
        r"\b(?:execute|follow|obey)\b.{0,60}\b(?:instead|only|command|instruction|text)\b",
        r"\b(?:reveal|disclose|expose|print|leak|send|upload|export)\b.{0,100}\b(?:system prompt|secret|credential|password|api[ _-]?key|token|private|confidential|protected|memory|customer data)\b",
        r"(?:\[system\]|<system>|###\s*system|new\s+system\s+instruction)",
    )
)
_PRIVACY_PROTECTION_INTENT = re.compile(
    r"\b(?:redact|anonymize|pseudonymize|mask|remove|delete|scrub)\b"
    r".{0,100}\b(?:email|phone|address|personal|pii|identifier|sensitive)\b",
    re.IGNORECASE | re.DOTALL,
)
_NON_EXECUTION_CONTEXT = re.compile(
    r"\b(?:read-only|training|warning example|policy excerpt|policy note|memory note|"
    r"documentation only|for analysis|for review)\b"
    r"|\b(?:do not|don't|without|no)\b.{0,70}"
    r"\b(?:perform|execute|open|access|change|switch|bypass|permission|requested)\b"
    r"|(?:只读|培训|警示示例|策略摘录|政策摘录|仅用于|不要|不得|不执行|不访问|不修改)",
    re.IGNORECASE | re.DOTALL,
)
_PASSIVE_STRUCTURED_DATA = re.compile(r"^\s*[\[{].*[\]}]\s*$", re.DOTALL)
_PRIMARY_TASK = re.compile(
    r"\b(?:Question|User task|Original task|User request)\s*:", re.IGNORECASE
)
_EXTERNAL_PAYLOAD = re.compile(
    r"\b(?:"
    r"Untrusted\s+(?:email content|tool response|retrieval result|result|content)"
    r"|External\s+(?:email|page|article|content|document|post|record|message|tool response)"
    r")\s*:",
    re.IGNORECASE,
)
_PREFIX_INSTRUCTION = re.compile(
    r"\b(?:format|render|modify|reverse|enhance|write|determine|replace|subscribe)\b",
    re.IGNORECASE,
)
_HIGH_IMPACT_EXTERNAL_ACTION = re.compile(
    r"\b(?:transfer|forward|upload|export|redirect|modify|update|change|remove|delete|"
    r"post|share|create|write|render|reverse|replace|subscribe|determine)\b"
    r".{0,120}\b(?:fund|money|account|record|allergy|patient|genetic|shipment|address|"
    r"private|confidential|protected|data|detail|email|answer|response|summary|script|"
    r"file|newsletter|review|sentiment|advertisement|cipher)\b",
    re.IGNORECASE | re.DOTALL,
)
_READ_REQUEST = re.compile(
    r"\b(?:find|fetch|retrieve|read|show|list|extract|return|check|get|give)\b",
    re.IGNORECASE,
)
_SENSITIVE_DATA_TARGET = re.compile(
    r"\b(?:password|credential|api[ _-]?key|access token|session token|credit card|"
    r"bank account|saving account|private|confidential|restricted|secret|vault)\b",
    re.IGNORECASE,
)
_PII_SELECTOR_REFERENCE = re.compile(
    r"\b(?:show|list|find|get|check|which)\b.{0,120}"
    r"\b(?:files?|documents?|folders?|projects?|repositories?|events?|calendars?|"
    r"titles?|identifiers?|ids?)\b.{0,120}"
    r"\b(?:shared with|associated with|owned by|for)\b.{0,80}"
    r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}",
    re.IGNORECASE | re.DOTALL,
)
_FIGURATIVE_HARM_CONTEXT = re.compile(
    r"\b(?:explode|burst)\s+with\s+(?:laughter|laughing|joy)\b"
    r"|\bdie\s+(?:with|from|of)?\s*(?:laughter|laughing)\b"
    r"|\bkiller\s+(?:joke|punchline)\b",
    re.IGNORECASE,
)
_VETERINARY_CARE_CONTEXT = re.compile(
    r"(?:\b(?:where|which|licensed|veterinary|vet|clinic|hospital|humane)\b"
    r".{0,100}\b(?:euthaniz(?:e|ation)|end-of-life|palliative)\b"
    r".{0,100}\b(?:dog|cat|pet|animal)\b)"
    r"|(?:\b(?:dog|cat|pet|animal)\b.{0,100}"
    r"\b(?:veterinary|vet|clinic|hospital|humane|end-of-life|palliative)\b)",
    re.IGNORECASE | re.DOTALL,
)
_FICTIONAL_PRODUCTION_ACTION = re.compile(
    r"\b(?:stage|staging|choreograph|simulate|reenact)\b",
    re.IGNORECASE,
)
_FICTIONAL_PRODUCTION_MEDIUM = re.compile(
    r"\b(?:film|movie|tv|television|show|theater|theatre|play|production|scene|actors?|"
    r"performers?|crew|fictional)\b",
    re.IGNORECASE,
)
_FICTIONAL_VIOLENCE = re.compile(
    r"\b(?:massacre|battle|fight|explosion|shooting|violence|combat)\b",
    re.IGNORECASE,
)


def _is_predominantly_english(text: str) -> bool:
    letters = [character for character in text if character.isalpha()]
    if len(letters) < 10:
        return False
    latin = sum("a" <= character.casefold() <= "z" for character in letters)
    return latin / len(letters) >= 0.85


def _has_explicit_attack_evidence(text: str) -> bool:
    return any(pattern.search(text) is not None for pattern in _ATTACK_EVIDENCE)


def _has_external_task_hijack_evidence(text: str, source: SourceType) -> bool:
    if source not in _EXTERNAL_SOURCES:
        return False
    payload_match = _EXTERNAL_PAYLOAD.search(text)
    if payload_match is None:
        return False
    task_match = _PRIMARY_TASK.search(text)
    prefix = ""
    if task_match is not None and task_match.start() < payload_match.start():
        prefix = text[: task_match.start()].strip()
    payload = text[payload_match.end() :].strip()
    return (
        bool(prefix and _PREFIX_INSTRUCTION.search(prefix))
        or _has_explicit_attack_evidence(payload)
        or _HIGH_IMPACT_EXTERNAL_ACTION.search(payload) is not None
    )


def _trusted_primary_task(text: str) -> str:
    payload_match = _EXTERNAL_PAYLOAD.search(text)
    if payload_match is None:
        return ""
    task_match = _PRIMARY_TASK.search(text)
    start = task_match.end() if task_match and task_match.start() < payload_match.start() else 0
    return text[start:payload_match.start()].strip()


def _has_passive_alignment(signal: GuardSignal) -> bool:
    return (
        signal.available
        and signal.score < 0.30
        and any(
            reason in {"alignment=passive_payload", "alignment=quoted_analysis"}
            for reason in signal.reasons
        )
    )


def _benign_content_context_reason(
    text: str,
    categories: tuple[str, ...],
) -> str | None:
    if (
        categories
        and set(categories).issubset({"violent", "unethical_acts"})
        and _FIGURATIVE_HARM_CONTEXT.search(text) is not None
    ):
        return "fusion=figurative_harm_context"
    if (
        categories == ("violent",)
        and _VETERINARY_CARE_CONTEXT.search(text) is not None
    ):
        return "fusion=legitimate_veterinary_care"
    if (
        categories == ("violent",)
        and _FICTIONAL_PRODUCTION_ACTION.search(text) is not None
        and _FICTIONAL_PRODUCTION_MEDIUM.search(text) is not None
        and _FICTIONAL_VIOLENCE.search(text) is not None
    ):
        return "fusion=fictional_production_context"
    return None


@dataclass(frozen=True, slots=True)
class FusionResult:
    injection: GuardSignal
    content: GuardSignal
    alignment: GuardSignal
    privilege: GuardSignal
    multi_turn: GuardSignal


@dataclass(frozen=True, slots=True)
class GuardFusion:
    """Calibrate correlated Guard signals without using labels or dataset identity."""

    enabled: bool = True
    suppressed_injection_score: float = 0.20

    def __post_init__(self) -> None:
        if not 0.0 <= self.suppressed_injection_score < 0.30:
            raise ValueError("suppressed_injection_score must be below 0.30")

    def fuse(
        self,
        text: str,
        source: SourceType,
        injection: GuardSignal,
        content: GuardSignal,
    ) -> tuple[GuardSignal, GuardSignal]:
        result = self.fuse_all(text, source, injection, content)
        return result.injection, result.content

    def fuse_output(
        self,
        injection: GuardSignal,
        content: GuardSignal,
        behavior: OutputBehaviorAssessment,
    ) -> FusionResult:
        """Fuse agent-output behavior; PIGuard text similarity never blocks alone."""
        if not self.enabled:
            return FusionResult(
                injection,
                content,
                behavior.task_alignment,
                GuardSignal("output_privilege_not_applicable", 0.0),
                GuardSignal("output_conversation_not_applicable", 0.0),
            )

        behavior_evidence = max(
            behavior.execution.score,
            behavior.disclosure.score,
            behavior.propagation.score,
            behavior.task_alignment.score,
        )
        if behavior.safe_reference and behavior_evidence < 0.30:
            injection = GuardSignal(
                injection.detector,
                min(injection.score, 0.10),
                tuple(category for category in injection.categories if category != "prompt_injection"),
                injection.reasons + ("output=safe_quoted_reference",),
                injection.available,
            )
            content = GuardSignal(
                content.detector,
                min(content.score, 0.20),
                (),
                content.reasons + ("output=safe_quoted_reference",),
                content.available,
            )
        elif (
            injection.available
            and "prompt_injection" in injection.categories
            and behavior_evidence < 0.30
        ):
            injection = GuardSignal(
                injection.detector,
                min(injection.score, self.suppressed_injection_score),
                tuple(category for category in injection.categories if category != "prompt_injection"),
                injection.reasons + ("output=piguard_without_behavior_evidence",),
                injection.available,
            )

        if behavior.propagation.score >= 0.90:
            injection = GuardSignal(
                injection.detector,
                max(injection.score, behavior.propagation.score),
                tuple(dict.fromkeys(injection.categories + behavior.propagation.categories)),
                injection.reasons + behavior.propagation.reasons,
                injection.available and behavior.propagation.available,
            )
        if behavior.disclosure.score >= 0.90:
            content = GuardSignal(
                content.detector,
                max(content.score, behavior.disclosure.score),
                tuple(dict.fromkeys(content.categories + behavior.disclosure.categories)),
                content.reasons + behavior.disclosure.reasons,
                content.available and behavior.disclosure.available,
            )

        alignment_score = max(
            behavior.task_alignment.score,
            behavior.execution.score,
        )
        alignment = GuardSignal(
            "output_behavior_alignment",
            alignment_score,
            tuple(
                dict.fromkeys(
                    behavior.task_alignment.categories + behavior.execution.categories
                )
            ),
            behavior.task_alignment.reasons + behavior.execution.reasons,
            behavior.task_alignment.available and behavior.execution.available,
        )
        return FusionResult(
            injection,
            content,
            alignment,
            GuardSignal("output_privilege_not_applicable", 0.0),
            GuardSignal("output_conversation_not_applicable", 0.0),
        )

    def fuse_all(
        self,
        text: str,
        source: SourceType,
        injection: GuardSignal,
        content: GuardSignal,
        *,
        alignment: GuardSignal = GuardSignal("task_payload_alignment", 0.0),
        privilege: GuardSignal = GuardSignal("privilege_boundary", 0.0),
        multi_turn: GuardSignal = GuardSignal("conversation_risk", 0.0),
    ) -> FusionResult:
        if not self.enabled:
            return FusionResult(
                injection, content, alignment, privilege, multi_turn
            )
        if (
            content.available
            and content.score >= 0.90
            and content.categories == ("personally_identifiable_information",)
            and _PRIVACY_PROTECTION_INTENT.search(text) is not None
            and not _has_explicit_attack_evidence(text)
            and alignment.score < 0.90
            and privilege.score < 0.90
            and multi_turn.score < 0.90
        ):
            content = GuardSignal(
                detector=content.detector,
                score=0.20,
                categories=(),
                reasons=content.reasons + ("fusion=privacy_protection_intent",),
                available=content.available,
            )
        pii_only = content.categories == ("personally_identifiable_information",)
        all_context_available = all(
            item.available
            for item in (injection, content, alignment, privilege, multi_turn)
        )
        primary_task = _trusted_primary_task(text)
        task_aligned_passive_pii = (
            all_context_available
            and source in _EXTERNAL_SOURCES
            and pii_only
            and _has_passive_alignment(alignment)
            and bool(primary_task)
            and _READ_REQUEST.search(primary_task) is not None
            and _SENSITIVE_DATA_TARGET.search(primary_task) is None
            and not _has_explicit_attack_evidence(text)
            and privilege.score < 0.90
            and multi_turn.score < 0.90
        )
        pii_selector_reference = (
            all_context_available
            and source is SourceType.USER
            and pii_only
            and injection.score < 0.30
            and alignment.score < 0.90
            and privilege.score < 0.90
            and multi_turn.score < 0.90
            and _PII_SELECTOR_REFERENCE.search(text) is not None
            and _SENSITIVE_DATA_TARGET.search(text) is None
            and not _has_explicit_attack_evidence(text)
        )
        if task_aligned_passive_pii or pii_selector_reference:
            content = GuardSignal(
                detector=content.detector,
                score=min(content.score, 0.20),
                categories=(),
                reasons=content.reasons
                + (
                    "fusion=task_aligned_passive_pii"
                    if task_aligned_passive_pii
                    else "fusion=pii_selector_reference",
                ),
                available=content.available,
            )
        benign_context_reason = _benign_content_context_reason(
            text,
            content.categories,
        )
        if (
            benign_context_reason is not None
            and all_context_available
            and source is SourceType.USER
            and injection.score < 0.30
            and alignment.score < 0.90
            and privilege.score < 0.90
            and multi_turn.score < 0.90
            and not _has_explicit_attack_evidence(text)
        ):
            content = GuardSignal(
                detector=content.detector,
                score=min(content.score, 0.20),
                categories=(),
                reasons=content.reasons + (benign_context_reason,),
                available=content.available,
            )
        if alignment.available and alignment.score >= 0.90:
            categories = tuple(
                dict.fromkeys(injection.categories + ("prompt_injection",))
            )
            injection = GuardSignal(
                detector=injection.detector,
                score=max(injection.score, 0.90),
                categories=categories,
                reasons=injection.reasons
                + ("fusion=task_payload_alignment_hijack",),
                available=injection.available,
            )
            return FusionResult(
                injection, content, alignment, privilege, multi_turn
            )
        if (
            injection.available
            and content.available
            and _is_predominantly_english(text)
            and _has_external_task_hijack_evidence(text, source)
            and (
                (
                    not _has_passive_alignment(alignment)
                    and "alignment=action_matches_primary_task"
                    not in alignment.reasons
                )
                or _has_explicit_attack_evidence(text)
            )
        ):
            if (
                injection.score >= 0.90
                and "prompt_injection" in injection.categories
            ):
                return FusionResult(
                    injection, content, alignment, privilege, multi_turn
                )
            categories = tuple(
                dict.fromkeys(injection.categories + ("prompt_injection",))
            )
            injection = GuardSignal(
                detector=injection.detector,
                score=max(injection.score, 0.90),
                categories=categories,
                reasons=injection.reasons
                + ("fusion=external_task_hijack_evidence",),
                available=injection.available,
            )
            return FusionResult(
                injection, content, alignment, privilege, multi_turn
            )
        passive_alignment = _has_passive_alignment(alignment)
        quoted_analysis = "alignment=quoted_analysis" in alignment.reasons
        affirmative_passive_evidence = passive_alignment and (
            quoted_analysis
            or (source == SourceType.RAG and content.score < 0.30)
        )
        non_execution_context = (
            "privilege=analysis_only" in privilege.reasons
            or _NON_EXECUTION_CONTEXT.search(text) is not None
            or (
                source is SourceType.TOOL
                and _PASSIVE_STRUCTURED_DATA.fullmatch(text) is not None
            )
        )
        external_payload_scoped = (
            source in _EXTERNAL_SOURCES
            and "input_scope=external_payload" in injection.reasons
        )
        trusted_non_execution_context = non_execution_context and (
            not external_payload_scoped or affirmative_passive_evidence
        )
        should_suppress = (
            injection.available
            and content.available
            and "prompt_injection" in injection.categories
            and content.score < 0.90
            and not _has_explicit_attack_evidence(text)
            and alignment.score < 0.90
            and privilege.score < 0.90
            and multi_turn.score < 0.90
            and (
                trusted_non_execution_context
                or (
                    source in _EXTERNAL_SOURCES
                    and (
                        affirmative_passive_evidence
                        or (
                            _is_predominantly_english(text)
                            and "input_scope=external_payload"
                            not in injection.reasons
                        )
                    )
                )
            )
        )
        if not should_suppress:
            return FusionResult(
                injection, content, alignment, privilege, multi_turn
            )

        adjusted = GuardSignal(
            detector=injection.detector,
            score=min(injection.score, self.suppressed_injection_score),
            categories=tuple(
                category
                for category in injection.categories
                if category != "prompt_injection"
            ),
            reasons=injection.reasons
            + (
                "fusion=passive_external_payload"
                if affirmative_passive_evidence
                else (
                    "fusion=non_execution_context"
                    if trusted_non_execution_context
                    else "fusion=external_english_without_attack_evidence"
                ),
            ),
            available=injection.available,
        )
        return FusionResult(
            adjusted, content, alignment, privilege, multi_turn
        )
