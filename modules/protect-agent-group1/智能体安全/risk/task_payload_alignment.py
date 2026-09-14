from __future__ import annotations

from dataclasses import dataclass
import re

from agent.state import SourceType

from .risk_schema import GuardSignal


_EXTERNAL_SOURCES = frozenset({SourceType.WEB, SourceType.RAG})
_PRIMARY_MARKER = re.compile(
    r"(?:Question|User task|Original task|User request|用户任务|原始任务|用户请求)\s*[:：]",
    re.IGNORECASE,
)
_PAYLOAD_MARKER = re.compile(
    r"(?:Untrusted\s+(?:email content|tool response|retrieval result|result|content|document|page|article|message|record)"
    r"|External\s+(?:email|page|article|content|document|post|record|message|tool response)"
    r"|外部不可信(?:内容|页面|文档|消息|工具响应|检索结果)|不可信(?:内容|工具响应|检索结果))\s*[:：]",
    re.IGNORECASE,
)
_ANALYSIS_INTENT = re.compile(
    r"\b(?:analy[sz]e|explain|summarize|classify|audit|review|translate|quote|discuss)\b"
    r"|(?:分析|解释|总结|分类|审计|复核|翻译|引用|讨论)",
    re.IGNORECASE,
)
_READ_INTENT = re.compile(
    r"\b(?:find|fetch|retrieve|read|show|list|extract|return|check|summarize|get)\b"
    r"|(?:查找|读取|检索|展示|列出|提取|返回|检查|总结)",
    re.IGNORECASE,
)
_QUOTED_CONTEXT = re.compile(
    r"\b(?:quoted|quotation|example|sample|sentence|says|describes)\b"
    r"|(?:引用|引文|示例|样例|句子|描述|原文)",
    re.IGNORECASE,
)
_TRUSTED_NON_EXECUTION_TASK = re.compile(
    r"\btranslate\b.{0,80}\b(?:text|plain text)\s+only\b"
    r"|\b(?:summarize|review|analy[sz]e)\b.{0,80}\b(?:as\s+)?(?:text|plain text)\s+only\b"
    r"|\b(?:analy[sz]e|review|quote)\b.{0,80}\bwithout\s+executing\b"
    r"|(?:仅翻译为文本|只翻译文本|仅作分析|不执行地分析)",
    re.IGNORECASE | re.DOTALL,
)
_OVERRIDE = re.compile(
    r"\b(?:ignore|disregard|override|bypass|replace)\b.{0,80}"
    r"\b(?:instruction|policy|task|rule|message)\b"
    r"|(?:忽略|绕过|覆盖|替换).{0,40}(?:指令|策略|任务|规则|审批)",
    re.IGNORECASE | re.DOTALL,
)

_ACTION_PATTERNS = {
    "read": re.compile(
        r"\b(?:find|fetch|retrieve|read|show|list|extract|return|check|get|access|open)\b"
        r"|(?:查找|读取|检索|展示|列出|提取|返回|检查)",
        re.IGNORECASE,
    ),
    "communicate": re.compile(
        r"\b(?:send|forward|upload|export|post|share|redirect|reveal|disclose)\b"
        r"|\bemail\s+(?:a|an|the|my|all|this|that|it|them|copy)\b"
        r"|(?:发送|转发|上传|导出|发布|分享|重定向|泄露)", re.IGNORECASE
    ),
    "create": re.compile(
        r"\b(?:create|schedule|dispatch|subscribe|book)\b|(?:创建|安排|调度|调遣|订阅|预约)",
        re.IGNORECASE,
    ),
    "delete": re.compile(
        r"\b(?:delete|remove|erase|purge)\b|(?:删除|移除|清除|销毁)", re.IGNORECASE
    ),
    "modify": re.compile(
        r"\b(?:modify|change|update|set|replace|reset|hide)\b|(?:修改|变更|更新|设置|替换|重置|隐藏|改为)",
        re.IGNORECASE,
    ),
    "execute": re.compile(
        r"\b(?:execute|run|invoke|call|trigger)\b|(?:执行|运行|调用|触发)", re.IGNORECASE
    ),
    "identity": re.compile(
        r"\b(?:switch|impersonate|assume|grant|revoke)\b|(?:切换|冒充|扮演|授予|撤销)",
        re.IGNORECASE,
    ),
    "finance": re.compile(
        r"\b(?:transfer|pay|refund|charge)\b|(?:转账|支付|退款|扣款)", re.IGNORECASE
    ),
    "transform": re.compile(
        r"\b(?:invert|reverse|encode|decode)\b|(?:反转|倒序|编码|解码)", re.IGNORECASE
    ),
    "physical": re.compile(
        r"\b(?:guide|move|navigate|drive)\b|(?:引导|移动|导航|驾驶)", re.IGNORECASE
    ),
    "analyze": re.compile(
        r"\b(?:determine|classify|analy[sz]e|evaluate)\b|(?:判断|分类|分析|评估)",
        re.IGNORECASE,
    ),
}
_DIRECTIVE = re.compile(
    r"(?:^|[.!?。！？]\s*|['\"]\s*)(?:please\s+|can you\s+|you must\s+|must\s+)?"
    r"(?:send|forward|upload|export|post|share|redirect|reveal|disclose|create|schedule|"
    r"dispatch|subscribe|book|delete|remove|erase|purge|modify|change|update|set|replace|reset|hide|"
    r"execute|run|invoke|call|trigger|switch|impersonate|assume|grant|revoke|transfer|pay|"
    r"refund|invert|reverse|encode|decode|guide|move|navigate|drive)\b"
    r"|(?:请|立即|然后|必须|务必)?\s*(?:发送|转发|上传|导出|发布|分享|泄露|创建|安排|"
    r"调度|调遣|订阅|预约|删除|移除|修改|变更|更新|设置|替换|重置|隐藏|执行|运行|调用|触发|"
    r"切换|冒充|授予|撤销|转账|支付|反转|倒序)",
    re.IGNORECASE,
)
_IMPERATIVE_READ_DIRECTIVE = re.compile(
    r"(?:^|[,.!?，。！？]\s*|['\"]\s*)(?:please\s+)?"
    r"(?:find|fetch|retrieve|read|show|list|extract|return|check|get|access|open)\b",
    re.IGNORECASE,
)
_ANALYTICAL_DIRECTIVE = re.compile(
    r"(?:^|[.!?。！？]\s*|[\r\n]+\s*|['\"]\s*)(?:please\s+)?"
    r"(?:determine|classify|analy[sz]e|evaluate)\b",
    re.IGNORECASE,
)
_SENSITIVE_TARGET = re.compile(
    r"\b(?:password|credential|access token|session token|api[ _-]?key|medical record|"
    r"health record|bank account|saving account|credit card|private|confidential|secret|vault)\b",
    re.IGNORECASE,
)
_SELF_SERVICE_CTA = re.compile(
    r"\b(?:view|change|manage|update)\s+your\s+"
    r"(?:(?:purchase|order|account)\s+history|(?:email|notification|account)\s+"
    r"(?:preference|preferences|setting|settings))\b",
    re.IGNORECASE,
)
_ADDRESSED_DIRECTIVE = re.compile(
    r"\b(?:please|can you|could you|would you|you must|you should)\s+"
    r"(?:find|fetch|retrieve|read|show|list|extract|return|check|get|send|forward|"
    r"upload|export|post|share|redirect|reveal|disclose|create|schedule|dispatch|"
    r"subscribe|book|delete|remove|erase|purge|modify|change|update|set|replace|"
    r"reset|hide|execute|run|invoke|call|trigger|switch|impersonate|assume|grant|"
    r"revoke|transfer|pay|refund|invert|reverse|encode|decode)\b",
    re.IGNORECASE,
)


def _actions(text: str) -> frozenset[str]:
    return frozenset(name for name, pattern in _ACTION_PATTERNS.items() if pattern.search(text))


@dataclass(frozen=True, slots=True)
class TaskPayloadAlignmentAssessment:
    signal: GuardSignal
    has_envelope: bool
    executable_payload: bool
    task_aligned: bool
    analysis_only: bool
    data_movement: bool
    primary_intent: str
    payload_intent: str


@dataclass(frozen=True, slots=True)
class TaskPayloadAlignmentDetector:
    """Detect new executable intent introduced by untrusted external payloads."""

    def detect(self, text: str, source: SourceType) -> TaskPayloadAlignmentAssessment:
        if source not in _EXTERNAL_SOURCES:
            return self._result(0.0, False, False, True, False, False, "none", "none")

        payload_match = _PAYLOAD_MARKER.search(text)
        if payload_match is None:
            return self._result(0.0, False, False, True, False, False, "none", "none")

        task_match = _PRIMARY_MARKER.search(text)
        task_start = task_match.end() if task_match else 0
        task = text[task_start:payload_match.start()].strip()
        prefix = text[:task_match.start()].strip() if task_match else ""
        payload = text[payload_match.end():].strip()
        analysis_only = bool(_ANALYSIS_INTENT.search(task))
        primary_intent = "analysis" if analysis_only else "read" if _READ_INTENT.search(task) else "action"
        task_actions = _actions(task)
        payload_actions = _actions(payload)
        prefix_attack = bool(
            prefix
            and (
                _DIRECTIVE.search(prefix)
                or _ADDRESSED_DIRECTIVE.search(prefix)
                or _OVERRIDE.search(prefix)
            )
        )
        quoted_analysis = analysis_only and bool(
            _QUOTED_CONTEXT.search(task) or _TRUSTED_NON_EXECUTION_TASK.search(task)
        )
        executable = bool(
            _DIRECTIVE.search(payload)
            or _ADDRESSED_DIRECTIVE.search(payload)
            or _ANALYTICAL_DIRECTIVE.search(payload)
            or _OVERRIDE.search(payload)
            or prefix_attack
            or (
                _IMPERATIVE_READ_DIRECTIVE.search(payload)
                and (
                    "communicate" in payload_actions
                    or _SENSITIVE_TARGET.search(payload)
                )
            )
        )
        self_service_cta_only = (
            _SELF_SERVICE_CTA.search(payload) is not None
            and payload_actions.issubset({"read", "modify"})
            and _SENSITIVE_TARGET.search(payload) is None
            and _OVERRIDE.search(payload) is None
        )
        if self_service_cta_only:
            executable = False
        if quoted_analysis and not _OVERRIDE.search(payload):
            executable = False
        data_movement = "communicate" in payload_actions
        aligned = not executable or bool(payload_actions and payload_actions.issubset(task_actions))

        if executable and not aligned:
            return self._result(
                0.95, True, True, False, analysis_only, data_movement,
                primary_intent, "hijack_action", ("task_payload_hijack",),
                ("alignment=external_action_mismatch",),
            )
        if executable:
            return self._result(
                0.45, True, True, True, analysis_only, data_movement,
                primary_intent, "aligned_action", ("external_instruction",),
                ("alignment=action_matches_primary_task",),
            )
        return self._result(
            0.10 if quoted_analysis else 0.0, True, False, True, analysis_only,
            False, primary_intent, "quoted_instruction" if quoted_analysis else "passive_data",
            reasons=("alignment=quoted_analysis" if quoted_analysis else "alignment=passive_payload",),
        )

    @staticmethod
    def _result(
        score: float, has_envelope: bool, executable: bool, aligned: bool,
        analysis_only: bool, data_movement: bool, primary_intent: str,
        payload_intent: str, categories: tuple[str, ...] = (),
        reasons: tuple[str, ...] = (),
    ) -> TaskPayloadAlignmentAssessment:
        return TaskPayloadAlignmentAssessment(
            GuardSignal("task_payload_alignment", score, categories, reasons),
            has_envelope, executable, aligned, analysis_only, data_movement,
            primary_intent, payload_intent,
        )
