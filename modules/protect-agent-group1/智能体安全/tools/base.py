from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from math import isfinite
import re
from typing import Mapping, Protocol


MAX_ARGUMENT_CHARACTERS = 4_096
MAX_TOOL_OUTPUT_CHARACTERS = 16_000
_NAME_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_.:-]{0,63}$")


def _name(label: str, value: str) -> str:
    normalized = value.strip()
    if not _NAME_PATTERN.fullmatch(normalized):
        raise ValueError(f"{label} has an invalid format")
    return normalized


@dataclass(frozen=True, slots=True)
class ToolArgument:
    name: str
    value: str

    def __post_init__(self) -> None:
        name = _name("argument name", self.name)
        if len(self.value) > MAX_ARGUMENT_CHARACTERS:
            raise ValueError("argument value is too long")
        object.__setattr__(self, "name", name)


@dataclass(frozen=True, slots=True)
class ToolRequest:
    name: str
    arguments: tuple[ToolArgument, ...] = ()
    scope: str = "default"
    confirmed: bool = False

    def __post_init__(self) -> None:
        name = _name("tool name", self.name)
        scope = _name("scope", self.scope)
        argument_names = [argument.name for argument in self.arguments]
        if len(argument_names) != len(set(argument_names)):
            raise ValueError("tool arguments must not contain duplicates")
        object.__setattr__(self, "name", name)
        object.__setattr__(self, "scope", scope)


@dataclass(frozen=True, slots=True)
class ToolSpec:
    name: str
    allowed_parameters: tuple[str, ...] = ()
    required_parameters: tuple[str, ...] = ()
    required_permissions: tuple[str, ...] = ()
    allowed_scopes: tuple[str, ...] = ("default",)
    operation_risk: float = 0.0

    def __post_init__(self) -> None:
        name = _name("tool name", self.name)
        allowed = tuple(_name("parameter", item) for item in self.allowed_parameters)
        required = tuple(_name("parameter", item) for item in self.required_parameters)
        permissions = tuple(
            _name("permission", item) for item in self.required_permissions
        )
        scopes = tuple(_name("scope", item) for item in self.allowed_scopes)
        if len(allowed) != len(set(allowed)) or len(scopes) != len(set(scopes)):
            raise ValueError("tool spec values must not contain duplicates")
        if not set(required).issubset(allowed):
            raise ValueError("required parameters must be allowed")
        if not scopes:
            raise ValueError("allowed_scopes must not be empty")
        if not isfinite(self.operation_risk) or not 0.0 <= self.operation_risk <= 1.0:
            raise ValueError("operation_risk must be between 0 and 1")
        object.__setattr__(self, "name", name)
        object.__setattr__(self, "allowed_parameters", allowed)
        object.__setattr__(self, "required_parameters", required)
        object.__setattr__(self, "required_permissions", permissions)
        object.__setattr__(self, "allowed_scopes", scopes)


class ToolStatus(StrEnum):
    EXECUTED = "EXECUTED"
    DENIED = "DENIED"
    CONFIRMATION_REQUIRED = "CONFIRMATION_REQUIRED"
    ERROR = "ERROR"


@dataclass(frozen=True, slots=True)
class ToolOutcome:
    status: ToolStatus
    reason_code: str
    message: str
    output: str = ""


class ToolPort(Protocol):
    spec: ToolSpec

    def execute(self, arguments: Mapping[str, str]) -> str:
        """Execute validated arguments. Implementations remain untrusted."""
        ...
