from __future__ import annotations

from collections import OrderedDict, deque
from dataclasses import dataclass, field
from math import isfinite
from threading import RLock

from agent.state import SourceType

from .risk_schema import GuardSignal


@dataclass(frozen=True, slots=True)
class ConversationObservation:
    source: SourceType
    current_risk: float
    sensitive_resource_access: bool = False
    privilege_change: bool = False
    data_movement: bool = False
    tool_call: str | None = None

    def __post_init__(self) -> None:
        if not isfinite(self.current_risk) or not 0.0 <= self.current_risk <= 1.0:
            raise ValueError("current_risk must be between 0 and 1")
        if self.tool_call is not None:
            normalized = self.tool_call.strip()
            if not normalized or len(normalized) > 64:
                raise ValueError("tool_call has an invalid format")
            object.__setattr__(self, "tool_call", normalized)


@dataclass(frozen=True, slots=True)
class ConversationSnapshot:
    risk: float
    sensitive_resource_score: float
    privilege_change_score: float
    tool_calls: tuple[str, ...]
    event_count: int


@dataclass(slots=True)
class _ConversationRecord:
    risk: float = 0.0
    sensitive: float = 0.0
    privilege: float = 0.0
    data_movement: float = 0.0
    tool_activity: float = 0.0
    history: deque[tuple[str, float, tuple[str, ...]]] = field(default_factory=deque)
    tool_calls: deque[str] = field(default_factory=deque)


class ConversationRiskState:
    """Bounded in-memory feature state; raw conversation text is never retained."""

    def __init__(
        self,
        *,
        decay: float = 0.65,
        max_conversations: int = 1024,
        max_events: int = 12,
    ) -> None:
        if not 0.0 < decay < 1.0:
            raise ValueError("decay must be between 0 and 1")
        if max_conversations < 1 or max_events < 1:
            raise ValueError("state capacities must be positive")
        self.decay = decay
        self.max_conversations = max_conversations
        self.max_events = max_events
        self._records: OrderedDict[str, _ConversationRecord] = OrderedDict()
        self._lock = RLock()

    @property
    def active_conversation_count(self) -> int:
        with self._lock:
            return len(self._records)

    def observe(
        self,
        conversation_id: str,
        observation: ConversationObservation,
    ) -> GuardSignal:
        identifier = self._identifier(conversation_id)
        with self._lock:
            record = self._records.pop(identifier, None)
            if record is None:
                if len(self._records) >= self.max_conversations:
                    self._records.popitem(last=False)
                record = _ConversationRecord(
                    history=deque(maxlen=self.max_events),
                    tool_calls=deque(maxlen=self.max_events),
                )

            previous_sensitive = record.sensitive * self.decay
            previous_privilege = record.privilege * self.decay
            previous_data = record.data_movement * self.decay
            previous_tool = record.tool_activity * self.decay
            score = max(observation.current_risk, record.risk * self.decay)

            cross_boundary = (
                previous_sensitive >= 0.30 and observation.privilege_change
            ) or (
                previous_privilege >= 0.30
                and observation.sensitive_resource_access
            )
            attack_chain = (
                previous_sensitive >= 0.30
                and observation.data_movement
            ) or (
                previous_privilege >= 0.30
                and observation.sensitive_resource_access
                and observation.data_movement
            )
            if cross_boundary:
                score = max(score, 0.70)
            if attack_chain:
                score = max(score, 0.95)

            record.risk = score
            record.sensitive = max(
                previous_sensitive,
                1.0 if observation.sensitive_resource_access else 0.0,
            )
            record.privilege = max(
                previous_privilege,
                1.0 if observation.privilege_change else 0.0,
            )
            record.data_movement = max(
                previous_data,
                1.0 if observation.data_movement else 0.0,
            )
            record.tool_activity = max(
                previous_tool,
                1.0 if observation.tool_call is not None else 0.0,
            )

            categories: tuple[str, ...] = ()
            reasons: list[str] = [f"conversation=decay:{self.decay:.2f}"]
            if attack_chain:
                categories = ("multi_turn_attack_chain",)
                reasons.append("conversation=sensitive_privilege_tool_chain")
            elif cross_boundary:
                categories = ("multi_turn_elevated",)
                reasons.append("conversation=cross_boundary_sequence")
            record.history.append(
                (observation.source.value, score, categories)
            )
            if observation.tool_call is not None:
                record.tool_calls.append(observation.tool_call)
            self._records[identifier] = record

        return GuardSignal(
            "conversation_risk",
            min(score, 1.0),
            categories,
            tuple(reasons),
        )

    def reset(self, conversation_id: str) -> bool:
        identifier = self._identifier(conversation_id)
        with self._lock:
            return self._records.pop(identifier, None) is not None

    def snapshot(self, conversation_id: str) -> ConversationSnapshot | None:
        identifier = self._identifier(conversation_id)
        with self._lock:
            record = self._records.get(identifier)
            if record is None:
                return None
            return ConversationSnapshot(
                risk=record.risk,
                sensitive_resource_score=record.sensitive,
                privilege_change_score=record.privilege,
                tool_calls=tuple(record.tool_calls),
                event_count=len(record.history),
            )

    @staticmethod
    def _identifier(value: str) -> str:
        normalized = value.strip()
        if not normalized or len(normalized) > 128 or any(
            ord(character) < 32 for character in normalized
        ):
            raise ValueError("conversation_id has an invalid format")
        return normalized
