from __future__ import annotations

from dataclasses import dataclass, field
from types import MappingProxyType

from .base import (
    MAX_TOOL_OUTPUT_CHARACTERS,
    ToolOutcome,
    ToolPort,
    ToolRequest,
    ToolStatus,
)
from .permissions import PermissionContext


@dataclass(frozen=True, slots=True)
class ToolGateway:
    tools: tuple[ToolPort, ...] = ()
    confirmation_threshold: float = 0.6
    _registry: dict[str, ToolPort] = field(init=False, repr=False, compare=False)

    def __post_init__(self) -> None:
        if not 0.0 <= self.confirmation_threshold <= 1.0:
            raise ValueError("confirmation_threshold must be between 0 and 1")
        registry = {tool.spec.name: tool for tool in self.tools}
        if len(registry) != len(self.tools):
            raise ValueError("tool names must be unique")
        object.__setattr__(self, "_registry", registry)

    def operation_risk(self, request: ToolRequest) -> float:
        tool = self._registry.get(request.name)
        return tool.spec.operation_risk if tool is not None else 1.0

    def execute(
        self, request: ToolRequest, permissions: PermissionContext
    ) -> ToolOutcome:
        tool = self._registry.get(request.name)
        if tool is None:
            return self._denied("UNKNOWN_TOOL", "工具未注册。")

        spec = tool.spec
        if request.scope not in spec.allowed_scopes or request.scope not in permissions.scopes:
            return self._denied("SCOPE_DENIED", "工具作用域未获授权。")
        if not set(spec.required_permissions).issubset(permissions.permissions):
            return self._denied("PERMISSION_DENIED", "工具权限不足。")

        arguments = {argument.name: argument.value for argument in request.arguments}
        names = set(arguments)
        if not names.issubset(spec.allowed_parameters) or not set(
            spec.required_parameters
        ).issubset(names) or any(
            not arguments[name].strip() for name in spec.required_parameters
        ):
            return self._denied("INVALID_PARAMETERS", "工具参数无效。")

        if spec.operation_risk >= self.confirmation_threshold and not request.confirmed:
            return ToolOutcome(
                status=ToolStatus.CONFIRMATION_REQUIRED,
                reason_code="CONFIRMATION_REQUIRED",
                message="该工具操作需要用户确认。",
            )

        try:
            output = tool.execute(MappingProxyType(arguments))
            if not isinstance(output, str) or len(output) > MAX_TOOL_OUTPUT_CHARACTERS:
                raise ValueError("invalid tool output")
        except Exception:
            return ToolOutcome(
                status=ToolStatus.ERROR,
                reason_code="TOOL_EXECUTION_FAILED",
                message="工具执行失败。",
            )
        return ToolOutcome(
            status=ToolStatus.EXECUTED,
            reason_code="TOOL_EXECUTED",
            message="工具执行完成。",
            output=output,
        )

    @staticmethod
    def _denied(reason_code: str, message: str) -> ToolOutcome:
        return ToolOutcome(
            status=ToolStatus.DENIED,
            reason_code=reason_code,
            message=message,
        )
