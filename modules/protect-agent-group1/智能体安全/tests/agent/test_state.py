import unittest

from agent.state import AgentRequest, SourceType
from agent.ports import ModelAction, ModelDecision
from risk.risk_schema import GuardSignal


class AgentRequestTests(unittest.TestCase):
    def test_normalizes_content_and_defaults_to_user_source(self) -> None:
        request = AgentRequest(content="  请总结这段内容  ")

        self.assertEqual(request.content, "请总结这段内容")
        self.assertEqual(request.source, SourceType.USER)

    def test_rejects_blank_content(self) -> None:
        with self.assertRaisesRegex(ValueError, "content must not be blank"):
            AgentRequest(content="   ")

    def test_rejects_oversized_content(self) -> None:
        with self.assertRaisesRegex(ValueError, "content exceeds"):
            AgentRequest(content="x" * 16_001)

    def test_normalizes_optional_conversation_id(self) -> None:
        request = AgentRequest(content="hello", conversation_id="  case-42  ")

        self.assertEqual(request.conversation_id, "case-42")

    def test_rejects_invalid_conversation_id(self) -> None:
        with self.assertRaisesRegex(ValueError, "conversation_id"):
            AgentRequest(content="hello", conversation_id="bad\nidentifier")


class GuardSignalTests(unittest.TestCase):
    def test_accepts_normalized_score(self) -> None:
        signal = GuardSignal(detector="test", score=0.5)

        self.assertEqual(signal.score, 0.5)
        self.assertTrue(signal.available)

    def test_rejects_score_outside_zero_and_one(self) -> None:
        with self.assertRaisesRegex(ValueError, "between 0 and 1"):
            GuardSignal(detector="test", score=1.01)


class ModelDecisionTests(unittest.TestCase):
    def test_rejects_non_tool_request_for_tool_action(self) -> None:
        with self.assertRaisesRegex(ValueError, "tool decisions"):
            ModelDecision(action=ModelAction.TOOL, tool_request="not-a-request")


if __name__ == "__main__":
    unittest.main()
