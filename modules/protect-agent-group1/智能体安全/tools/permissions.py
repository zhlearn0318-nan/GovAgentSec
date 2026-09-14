from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class PermissionContext:
    permissions: frozenset[str] = frozenset()
    scopes: frozenset[str] = frozenset()

    def __post_init__(self) -> None:
        for label, values in (
            ("permission", self.permissions),
            ("scope", self.scopes),
        ):
            if any(not value.strip() or len(value) > 64 for value in values):
                raise ValueError(f"{label} has an invalid format")
