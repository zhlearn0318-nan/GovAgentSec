"""Real existing JWT/OPA/approval lifecycle; the new bridge only projects audit."""
import json
import unittest
from test_u22_chat_receipts import ChatReceipts


class ApprovalProjection(ChatReceipts):
    def test_request_self_deny_approve_retry_and_private_payload(self):
        payload, rid = self.pending()
        self.demo.handle('resolve', {'request_id':rid, 'resolution':'approve'}, self.office)
        approved = self.demo.handle('resolve', {'request_id':rid, 'resolution':'approve'}, self.approver)
        self.assertEqual(approved['status'], 'authorized')
        events = self.demo.trace_events
        self.assertEqual([e['event_type'] for e in events],
                         ['approval.requested', 'approval.denied', 'approval.approved'])
        self.assertTrue(all(e['run_id']=='run-original' and e['tool_call_id']=='call-original' for e in events))
        self.assertTrue(all(e['request_id']==rid for e in events))
        self.demo.chat.handle('chat_end', {'run_id':'run-original'})
        self.demo.chat.handle('chat_start', self.start | {'run_id':'retry'})
        payload = payload | {'run_id':'retry', 'tool_call_id':'retry-call'}
        self.assertEqual(self.demo.chat.handle('chat_tool', payload)['status'], 'host_authorized')
        self.result(payload)
        event = self.demo.trace_events[-1]
        self.assertEqual(event['event_type'], 'approval.execution')
        self.assertEqual((event['run_id'],event['origin_run_id']), ('retry','run-original'))
        self.assertEqual(event['status'], 'succeeded')
        count = len(self.demo.trace_events)
        self.result(payload, False)
        self.assertEqual(len(self.demo.trace_events), count)
        serialized = json.dumps(self.demo.trace_events)
        self.assertNotIn(self.office, serialized)
        for forbidden in ['"ticket"', '"parameters"', '"action"', '"bearer"']:
            self.assertNotIn(forbidden, serialized)
        audits = [json.loads(line) for line in (self.demo.directory/'identity-audit.jsonl').read_text('utf8').splitlines()]
        self.assertTrue(all(any(a['audit_id']==e['audit_id'] for a in audits) for e in self.demo.trace_events))
        self.assertNotIn('trace_events', self.demo.status(self.approver))

    def test_rejection_and_unlinked_result(self):
        _, rid = self.pending()
        self.demo.handle('resolve', {'request_id':rid, 'resolution':'reject'}, self.approver)
        self.assertEqual(self.demo.trace_events[-1]['event_type'], 'approval.rejected')
        count = len(self.demo.trace_events)
        self.result(self.payload | {'tool_call_id':'wrong'})
        self.assertEqual(len(self.demo.trace_events), count)


if __name__ == '__main__':
    unittest.main()
