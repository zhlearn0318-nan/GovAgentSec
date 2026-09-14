import unittest

from agent.state import SourceType
from risk.conversation_state import ConversationObservation, ConversationRiskState


class ConversationRiskStateTests(unittest.TestCase):
    def test_split_privilege_chain_accumulates_across_turns(self) -> None:
        state = ConversationRiskState(decay=0.60)

        first = state.observe(
            "case-a",
            ConversationObservation(
                source=SourceType.USER,
                current_risk=0.25,
                sensitive_resource_access=True,
            ),
        )
        second = state.observe(
            "case-a",
            ConversationObservation(
                source=SourceType.MEMORY,
                current_risk=0.45,
                privilege_change=True,
            ),
        )
        final = state.observe(
            "case-a",
            ConversationObservation(
                source=SourceType.TOOL,
                current_risk=0.30,
                tool_call="archive.export",
                data_movement=True,
            ),
        )

        self.assertLess(first.score, 0.60)
        self.assertGreaterEqual(second.score, 0.60)
        self.assertGreaterEqual(final.score, 0.90)
        self.assertIn("multi_turn_attack_chain", final.categories)
        snapshot = state.snapshot("case-a")
        self.assertIsNotNone(snapshot)
        self.assertEqual(snapshot.tool_calls, ("archive.export",))
        self.assertLessEqual(snapshot.event_count, 12)

    def test_conversations_are_isolated(self) -> None:
        state = ConversationRiskState(decay=0.60)
        state.observe(
            "case-a",
            ConversationObservation(
                source=SourceType.USER,
                current_risk=0.50,
                privilege_change=True,
            ),
        )

        other = state.observe(
            "case-b",
            ConversationObservation(source=SourceType.USER, current_risk=0.0),
        )

        self.assertEqual(other.score, 0.0)

    def test_sensitive_recon_followed_by_export_is_an_attack_chain(self) -> None:
        state = ConversationRiskState(decay=0.65)
        state.observe(
            "case-a",
            ConversationObservation(
                source=SourceType.MEMORY,
                current_risk=0.25,
                sensitive_resource_access=True,
            ),
        )

        result = state.observe(
            "case-a",
            ConversationObservation(
                source=SourceType.TOOL,
                current_risk=0.20,
                tool_call="records.export",
                data_movement=True,
            ),
        )

        self.assertGreaterEqual(result.score, 0.90)
        self.assertIn("multi_turn_attack_chain", result.categories)

    def test_clean_turns_decay_prior_risk(self) -> None:
        state = ConversationRiskState(decay=0.50)
        state.observe(
            "case-a",
            ConversationObservation(
                source=SourceType.USER,
                current_risk=0.95,
                privilege_change=True,
            ),
        )

        latest = None
        for _ in range(4):
            latest = state.observe(
                "case-a",
                ConversationObservation(source=SourceType.USER, current_risk=0.0),
            )

        self.assertIsNotNone(latest)
        self.assertLess(latest.score, 0.30)

    def test_oldest_conversation_is_evicted_at_capacity(self) -> None:
        state = ConversationRiskState(max_conversations=2)
        risky = ConversationObservation(
            source=SourceType.USER,
            current_risk=0.80,
            privilege_change=True,
        )
        state.observe("oldest", risky)
        state.observe("second", risky)
        state.observe("third", risky)

        restarted = state.observe(
            "oldest",
            ConversationObservation(source=SourceType.USER, current_risk=0.0),
        )

        self.assertEqual(restarted.score, 0.0)
        self.assertEqual(state.active_conversation_count, 2)

    def test_reset_removes_conversation_history(self) -> None:
        state = ConversationRiskState()
        state.observe(
            "case-a",
            ConversationObservation(
                source=SourceType.USER,
                current_risk=0.80,
                privilege_change=True,
            ),
        )

        self.assertTrue(state.reset("case-a"))
        clean = state.observe(
            "case-a",
            ConversationObservation(source=SourceType.USER, current_risk=0.0),
        )
        self.assertEqual(clean.score, 0.0)


if __name__ == "__main__":
    unittest.main()
