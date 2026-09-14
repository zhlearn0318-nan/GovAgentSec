from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
import re

from agent.state import MAX_INPUT_CHARACTERS, SourceType

from .risk_schema import GuardSignal


MAX_RETRIEVED_CONTEXT_ITEMS = 8
MAX_RETRIEVED_CONTEXT_CHARACTERS = 4_096
MAX_RETRIEVED_CONTEXT_TOTAL_CHARACTERS = 16_000


class MessageRole(StrEnum):
    USER = "user"
    AGENT = "agent"
    TOOL = "tool"


@dataclass(frozen=True, slots=True)
class RetrievedContext:
    source: SourceType
    content: str
    role: MessageRole = MessageRole.TOOL
    has_external_payload: bool = True
    is_quoted: bool = False

    def __post_init__(self) -> None:
        content = self.content.strip()
        if not content or len(content) > MAX_RETRIEVED_CONTEXT_CHARACTERS:
            raise ValueError("retrieved context has an invalid length")
        object.__setattr__(self, "content", content)


@dataclass(frozen=True, slots=True)
class OutputContext:
    original_task: str
    retrieved_context: tuple[RetrievedContext, ...] = ()
    role: MessageRole = MessageRole.AGENT
    is_quoted: bool = False

    def __post_init__(self) -> None:
        original_task = self.original_task.strip()
        if not original_task or len(original_task) > MAX_INPUT_CHARACTERS:
            raise ValueError("original task has an invalid length")
        if len(self.retrieved_context) > MAX_RETRIEVED_CONTEXT_ITEMS:
            raise ValueError("too many retrieved context items")
        if not all(isinstance(item, RetrievedContext) for item in self.retrieved_context):
            raise ValueError("retrieved context item is invalid")
        if (
            sum(len(item.content) for item in self.retrieved_context)
            > MAX_RETRIEVED_CONTEXT_TOTAL_CHARACTERS
        ):
            raise ValueError("retrieved context is too large")
        object.__setattr__(self, "original_task", original_task)


_SAFE_TASK = re.compile(
    r"\b(?:analy[sz]e|explain|summarize|classify|audit|review|translate|quote|"
    r"identify|detect|discuss)\b|(?:分析|解释|总结|分类|审计|复核|翻译|引用|识别|检测|讨论)",
    re.IGNORECASE,
)
_SAFE_RESPONSE = re.compile(
    r"\b(?:quoted|quotation|example|sample|the text|the passage|the instruction|"
    r"prompt[- ]injection|attack|malicious|unsafe|do not follow|should not be followed|"
    r"must not be followed|do not execute|should not be executed|refuse)\b"
    r"|(?:引用|引文|示例|样例|这段文本|该指令|提示词注入|攻击|恶意|不安全|"
    r"不要遵循|不应遵循|不得遵循|不要执行|不应执行|拒绝)",
    re.IGNORECASE,
)
_PROTECTIVE_TASK = re.compile(
    r"\b(?:prevent|protect|avoid|reduce|minimi[sz]e)\b.{0,100}"
    r"\b(?:leak|disclosure|secret|credential|sensitive information)\b"
    r"|\b(?:security|safety)\b.{0,60}\b(?:advice|guidance|recommendation|checklist)\b"
    r"|(?:防止|避免|降低|减少|保护).{0,50}(?:泄露|秘密|凭据|密钥|敏感信息)"
    r"|(?:安全建议|安全指南|安全清单)",
    re.IGNORECASE | re.DOTALL,
)
_PROTECTIVE_RESPONSE = re.compile(
    r"\b(?:do not|don't|never|avoid|must not|should not)\b.{0,120}"
    r"\b(?:send|share|forward|upload|export|reveal|disclose|log|paste|publish)\b"
    r"|(?:不要|不得|不应|避免|严禁|不在).{0,80}"
    r"(?:发送|分享|转发|上传|导出|泄露|记录|粘贴|公开|发布)",
    re.IGNORECASE | re.DOTALL,
)
_ATTACK_DIRECTIVE = re.compile(
    r"\b(?:ignore|disregard|override|bypass|disable|replace)\b.{0,100}"
    r"\b(?:instructions?|policies|policy|rules?|safeguards?|security|approval|controls?)\b"
    r"|\b(?:reveal(?:ed)?|sent|send|upload(?:ed)?|export(?:ed)?|leak(?:ed)?|disclos(?:e|ed))\b.{0,100}"
    r"\b(?:system prompt|secret|credential|password|api[ _-]?key|token|confidential)\b"
    r"|(?:忽略|无视|覆盖|绕过|关闭|替换).{0,50}(?:指令|策略|规则|安全|审批|控制)"
    r"|(?:泄露|发送|上传|导出|公开).{0,50}(?:系统提示词|秘密|凭据|密码|密钥|令牌|机密)",
    re.IGNORECASE | re.DOTALL,
)
_COMPLETION_MARKER = re.compile(
    r"\b(?:done|completed|finished|successfully|i\s+(?:have|already)|i've|we\s+(?:have|already))\b"
    r"|(?:已完成|完成了|已经|成功(?:地)?)",
    re.IGNORECASE,
)
_ACTION_PATTERNS = {
    "communicate": re.compile(
        r"\b(?:send|sent|forward(?:ed)?|upload(?:ed)?|export(?:ed)?|post(?:ed)?|"
        r"shar(?:e|ed)|redirect(?:ed)?|reveal(?:ed)?|disclos(?:e|ed)|leak(?:ed)?)\b"
        r"|(?:发送|转发|上传|导出|发布|分享|重定向|泄露|公开)", re.IGNORECASE
    ),
    "delete": re.compile(
        r"\b(?:delet(?:e|ed)|remov(?:e|ed)|eras(?:e|ed)|purg(?:e|ed)|destroy(?:ed)?)\b|(?:删除|移除|清除|销毁)",
        re.IGNORECASE,
    ),
    "modify": re.compile(
        r"\b(?:modif(?:y|ied)|chang(?:e|ed)|updat(?:e|ed)|replac(?:e|ed)|reset|"
        r"disabl(?:e|ed)|enabl(?:e|ed))\b"
        r"|(?:修改|变更|更新|替换|重置|关闭|启用)", re.IGNORECASE
    ),
    "execute": re.compile(
        r"\b(?:execute|run|invoke|call|trigger)\b|(?:执行|运行|调用|触发)",
        re.IGNORECASE,
    ),
    "identity": re.compile(
        r"\b(?:switch|impersonate|assume|grant|revoke|elevate)\b"
        r"|(?:切换|冒充|授予|撤销|提权)", re.IGNORECASE
    ),
}
_INSTRUCTION_TO_ACT = re.compile(
    r"(?:^|[.!?。！？]\s*)(?:run|execute|send|upload|export|delete|remove|disable|"
    r"bypass|reveal|执行|运行|发送|上传|导出|删除|关闭|绕过|泄露)\b",
    re.IGNORECASE | re.MULTILINE,
)
_SECRET_PATTERNS = (
    re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(
        r"\b(?:api[ _-]?key|access token|session token|password)\s*(?:is|=|:)\s*"
        r"[\"']?[A-Za-z0-9_./+=:-]{16,}[\"']?",
        re.IGNORECASE,
    ),
)


def _actions(text: str) -> frozenset[str]:
    return frozenset(name for name, pattern in _ACTION_PATTERNS.items() if pattern.search(text))


@dataclass(frozen=True, slots=True)
class OutputBehaviorAssessment:
    execution: GuardSignal
    disclosure: GuardSignal
    propagation: GuardSignal
    task_alignment: GuardSignal
    safe_reference: bool


@dataclass(frozen=True, slots=True)
class OutputBehaviorDetector:
    """Detect unsafe output behavior without treating quoted attack text as execution."""

    def detect(self, response: str, context: OutputContext) -> OutputBehaviorAssessment:
        completed_action_marker = _COMPLETION_MARKER.search(response) is not None
        quoted_reference = bool(
            _SAFE_TASK.search(context.original_task)
            and _SAFE_RESPONSE.search(response)
            and (
                context.is_quoted
                or any(item.is_quoted for item in context.retrieved_context)
                or any(item.has_external_payload for item in context.retrieved_context)
            )
        )
        protective_guidance = bool(
            _PROTECTIVE_TASK.search(context.original_task)
            and _PROTECTIVE_RESPONSE.search(response)
            and not completed_action_marker
        )
        safe_reference = quoted_reference or protective_guidance
        response_actions = _actions(response)
        task_actions = _actions(context.original_task)
        completed_action = bool(response_actions and completed_action_marker)
        actionable_directive = bool(response_actions and _INSTRUCTION_TO_ACT.search(response))
        drift_actions = response_actions - task_actions
        execution_risk = bool(
            (completed_action and drift_actions)
            or (actionable_directive and not safe_reference and drift_actions)
        )
        task_drift = bool(drift_actions and execution_risk)
        disclosure = any(pattern.search(response) is not None for pattern in _SECRET_PATTERNS)
        propagation = bool(_ATTACK_DIRECTIVE.search(response) and not safe_reference)

        return OutputBehaviorAssessment(
            execution=GuardSignal(
                "output_execution_intent",
                0.95 if execution_risk else 0.0,
                ("output_execution",) if execution_risk else (),
                ("output=completed_or_actionable_behavior",) if execution_risk else (),
            ),
            disclosure=GuardSignal(
                "output_sensitive_disclosure",
                1.0 if disclosure else 0.0,
                ("sensitive_information_disclosure",) if disclosure else (),
                ("output=secret_pattern_detected",) if disclosure else (),
            ),
            propagation=GuardSignal(
                "output_attack_propagation",
                0.95 if propagation else 0.0,
                ("attack_payload_propagation",) if propagation else (),
                ("output=active_attack_payload",) if propagation else (),
            ),
            task_alignment=GuardSignal(
                "output_task_alignment",
                0.95 if task_drift else 0.0,
                ("output_task_drift",) if task_drift else (),
                ("output=unrequested_high_impact_action",) if task_drift else (),
            ),
            safe_reference=safe_reference,
        )
