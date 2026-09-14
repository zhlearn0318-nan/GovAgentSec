from __future__ import annotations

from dataclasses import dataclass
import re

from agent.state import SourceType

from .risk_schema import GuardSignal


_ANALYSIS = re.compile(
    r"\b(?:explain|describe|analy[sz]e|detect|prevent|compare|discuss)\b"
    r"|(?:解释|描述|分析|检测|防止|比较|讨论)",
    re.IGNORECASE,
)
_NON_EXECUTION_CONTEXT = re.compile(
    r"\b(?:training|warning example|read-only|documentation only)\b"
    r"|\b(?:do not|don't|without)\b.{0,50}\b(?:perform|execute|switch|change|access|bypass)\b"
    r"|(?:培训|警示示例|只读|仅供文档|不要|不得|不执行|不切换|不修改)",
    re.IGNORECASE | re.DOTALL,
)
_PRIVILEGED_IDENTITY = re.compile(
    r"\b(?:administrator|admin|root|sudo|superuser|owner role|system account|"
    r"service identity|privileged identity|elevated privileges?)\b"
    r"|(?:管理员|超级用户|根用户|高权限|特权身份|系统账户|服务身份|所有者角色)",
    re.IGNORECASE,
)
_SENSITIVE_RESOURCE = re.compile(
    r"\b(?:restricted|protected|confidential|private)\s+(?:record|file|resource|data|archive)"
    r"|\b(?:admin console|security settings?|audit logs?|credential store|secret vault)\b"
    r"|\b(?:not authorized|unauthori[sz]ed|not permitted)\b.{0,40}\b(?:access|read|record|file)\b"
    r"|(?:受限|机密|私有|无权访问|未经授权).{0,20}(?:档案|记录|资源|数据|文件)"
    r"|(?:管理控制台|安全设置|审计日志|凭据库|密钥库)",
    re.IGNORECASE | re.DOTALL,
)
_PRIVILEGE_CHANGE = re.compile(
    r"\b(?:grant|revoke|elevate|escalate|expand|change|modify|add)\b.{0,50}"
    r"\b(?:permissions?|privileges?|roles?|capabilit(?:y|ies)|admin|owner)\b"
    r"|(?:授予|撤销|提升|扩大|修改|变更|添加).{0,30}(?:权限|角色|能力|管理员|所有者)",
    re.IGNORECASE | re.DOTALL,
)
_IDENTITY_SWITCH = re.compile(
    r"\b(?:switch|assume|impersonate|masquerade|become|use)\b.{0,45}"
    r"\b(?:administrator|admin|root|service identity|system account|another user|token)\b"
    r"|(?:切换|冒充|假扮|成为|使用).{0,25}(?:管理员|超级用户|服务身份|系统账户|他人身份|令牌)",
    re.IGNORECASE | re.DOTALL,
)
_AUTH_BYPASS = re.compile(
    r"\b(?:bypass|circumvent|disable|skip|ignore|evade)\b.{0,60}"
    r"\b(?:authentication|authorization|approval|access control|policy|permission check|security check|gate)\b"
    r"|\b(?:not authorized|unauthori[sz]ed|without authorization)\b.{0,40}\b(?:access|read|open|retrieve)\b"
    r"|(?:绕过|规避|禁用|跳过|忽略).{0,30}(?:认证|授权|审批|访问控制|策略|权限检查|安全检查)"
    r"|(?:无权|未经授权).{0,20}(?:访问|读取|打开|检索)",
    re.IGNORECASE | re.DOTALL,
)
_DATA_MOVEMENT = re.compile(
    r"\b(?:export|upload|send|forward|copy|transfer|publish|share)\b"
    r"|(?:导出|上传|发送|转发|复制|传输|发布|分享|外传)",
    re.IGNORECASE,
)
_PROTECTED_ACCESS = re.compile(
    r"\b(?:access|read|open|download|query|retrieve)\b"
    r"|(?:访问|读取|打开|下载|查询|检索)",
    re.IGNORECASE,
)


@dataclass(frozen=True, slots=True)
class PrivilegeBoundaryAssessment:
    signal: GuardSignal
    sensitive_resource_access: bool
    privilege_change: bool
    identity_switch: bool
    auth_bypass: bool
    data_movement: bool
    analysis_only: bool


@dataclass(frozen=True, slots=True)
class PrivilegeBoundaryDetector:
    """Detect capability expansion and protected-resource boundary violations."""

    def detect(
        self,
        text: str,
        source: SourceType,
        *,
        granted_permissions: frozenset[str] = frozenset(),
    ) -> PrivilegeBoundaryAssessment:
        privileged_identity = bool(_PRIVILEGED_IDENTITY.search(text))
        sensitive = bool(_SENSITIVE_RESOURCE.search(text))
        identity_switch = bool(_IDENTITY_SWITCH.search(text))
        privilege_change = bool(_PRIVILEGE_CHANGE.search(text)) or identity_switch
        auth_bypass = bool(_AUTH_BYPASS.search(text))
        data_movement = bool(_DATA_MOVEMENT.search(text))
        protected_access = sensitive and bool(_PROTECTED_ACCESS.search(text))
        non_execution = bool(_NON_EXECUTION_CONTEXT.search(text))
        analysis_only = (
            (bool(_ANALYSIS.search(text)) and not (
                privilege_change or identity_switch or data_movement or protected_access
            ))
            or (non_execution and not auth_bypass and not data_movement)
        )

        if analysis_only:
            return self._result(
                0.15, sensitive, privilege_change, identity_switch, auth_bypass,
                data_movement, True, ("privilege=analysis_only",),
            )

        explicit_violation = (
            auth_bypass
            or privilege_change
            or (identity_switch and privileged_identity)
            or (protected_access and (privileged_identity or data_movement))
        )
        if explicit_violation:
            reasons = ["privilege=boundary_violation"]
            if auth_bypass:
                reasons.append("privilege=auth_or_approval_bypass")
            if privilege_change:
                reasons.append("privilege=capability_change")
            if identity_switch:
                reasons.append("privilege=identity_switch")
            if sensitive:
                reasons.append("privilege=sensitive_resource")
            if data_movement:
                reasons.append("privilege=data_movement")
            return self._result(
                0.98 if auth_bypass or privilege_change else 0.92,
                sensitive, privilege_change, identity_switch, auth_bypass,
                data_movement, False, tuple(reasons), ("privilege_escalation",),
            )

        has_admin_permission = any(
            value.casefold() in {"admin", "administrator", "root", "security:write"}
            for value in granted_permissions
        )
        if privileged_identity or sensitive:
            score = 0.20 if has_admin_permission else 0.35
            return self._result(
                score, sensitive, privilege_change, identity_switch, auth_bypass,
                data_movement, False, ("privilege=boundary_reference",),
            )
        return self._result(
            0.0, False, False, False, False, data_movement, False,
            ("privilege=no_boundary_evidence",),
        )

    @staticmethod
    def _result(
        score: float,
        sensitive: bool,
        privilege_change: bool,
        identity_switch: bool,
        auth_bypass: bool,
        data_movement: bool,
        analysis_only: bool,
        reasons: tuple[str, ...],
        categories: tuple[str, ...] = (),
    ) -> PrivilegeBoundaryAssessment:
        return PrivilegeBoundaryAssessment(
            GuardSignal("privilege_boundary", score, categories, reasons),
            sensitive,
            privilege_change,
            identity_switch,
            auth_bypass,
            data_movement,
            analysis_only,
        )
