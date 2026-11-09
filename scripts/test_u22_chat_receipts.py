"""U22 display-only request correlation, with real local OPA/JWT/one-use tickets."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'modules/agentguard-group2'))
from identity.demo_provider import DemoIdentity


class ChatReceipts(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'local-validation')
        self.addCleanup(self.temp.cleanup)
        self.demo = DemoIdentity(self.temp.name)
        self.addCleanup(self.demo.disable)
        self.demo.handle('enable')
        self.office = self.login('office-test')
        self.finance = self.login('finance-test')
        self.approver = self.login('approver-test')
        self.auditor = self.login('auditor-test')
        self.session = 'agent:main:u22-receipt'
        self.demo.handle('bind_session', {'session_key':self.session}, self.office)
        self.start = dict(run_id='run-original', session_key=self.session,
                          paths=['nativefs://workspace/A/test.txt'])
        self.assertEqual(self.demo.chat.handle('chat_start', self.start)['status'], 'ok')
        action = dict(tool='native.read', operation='read', resource='nativefs://workspace/A/test.txt',
                      parameters={'path':'nativefs://workspace/A/test.txt', 'params_hash':'fixture'},
                      data_level='internal', risk_level='low')
        self.payload = dict(run_id='run-original', session_key=self.session, tool_call_id='call-original',
                            tool_name='read', params={}, action=action)

    def login(self, name):
        return 'Bearer ' + self.demo.handle('login', {'user':name})['access_token']

    def row(self, request_id, bearer=None):
        return next(r for r in self.demo.status(bearer or self.office)['requests'] if r['request_id'] == request_id)

    def result(self, payload=None, success=True):
        payload = payload or self.payload
        return self.demo.chat.handle('chat_result', {
            **{k:payload[k] for k in ('run_id','session_key','tool_name')},
            'tool_call_id':payload.get('tool_call_id'), 'success':success,
        })

    def pending(self):
        payload = copy.deepcopy(self.payload)
        payload['action']['resource'] = 'nativefs://workspace/B/test.txt'
        payload['action']['parameters']['path'] = 'nativefs://workspace/B/test.txt'
        denied = self.demo.chat.handle('chat_tool', payload)
        rid = denied['request_id']
        self.assertEqual(self.demo.handle('task_escalate', {'request_id':rid}, self.office)['status'], 'pending_approval')
        return payload, rid

    def test_trusted_location_and_authenticated_visibility(self):
        payload = self.payload | {'params':{'session_key':'agent:main:forged', 'run_id':'forged', 'request_id':'forged'}}
        rid = self.demo.chat.handle('chat_tool', payload)['request_id']
        row = self.row(rid)
        self.assertEqual(row['session_key'], self.session)
        self.assertEqual(row['run_id'], 'run-original')
        self.assertEqual(self.demo.status()['requests'], [])
        self.assertEqual(self.demo.status('Bearer invalid')['requests'], [])
        self.assertEqual(self.demo.status(self.finance)['requests'], [])
        self.assertEqual(self.row(rid, self.approver)['request_id'], rid)
        self.assertEqual(self.row(rid, self.auditor)['request_id'], rid)
        # UI callers cannot inject a request correlation field through resolve/bind.
        self.assertEqual(self.demo.handle('resolve', {'request_id':rid, 'run_id':'forged'}, self.approver)['reason_code'], 'DEMO_UNTRUSTED_FIELD')
        serialized = json.dumps(self.demo.status(self.approver))
        self.assertNotIn(self.office, serialized)
        self.assertNotIn('"ticket":', serialized)
        self.assertNotIn('"access_token":', serialized)

    def test_task_summary_locates_only_unique_live_owner_run(self):
        task_id = self.demo.chat.runs['run-original']['task']
        def summary(bearer):
            return next(row for row in self.demo.status(bearer)['tasks'] if row['task_id'] == task_id)

        for bearer in (self.office, self.approver, self.auditor):
            row = summary(bearer)
            self.assertEqual(row['session_key'], self.session)
            self.assertEqual(row['run_id'], 'run-original')
        self.assertEqual(self.demo.status(self.finance)['tasks'], [])
        self.assertEqual(self.demo.status()['tasks'], [])
        run = self.demo.chat.runs['run-original']
        owner = run['subject']
        run['subject'] = self.demo.subject(self.finance)['id']
        self.assertNotIn('session_key', summary(self.office))
        self.assertNotIn('run_id', summary(self.office))
        run['subject'] = owner
        self.demo.chat.runs['run-duplicate'] = dict(run)
        self.assertNotIn('session_key', summary(self.office))
        self.assertNotIn('run_id', summary(self.office))

    def test_historical_task_summary_never_guesses_new_run(self):
        task_id = self.demo.chat.runs['run-original']['task']
        self.demo.chat.handle('chat_end', {'run_id':'run-original'})
        self.demo.chat.handle('chat_start', self.start | {'run_id':'run-next'})
        rows = self.demo.status(self.office)['tasks']
        old = next(row for row in rows if row['task_id'] == task_id)
        self.assertNotIn('session_key', old)
        self.assertNotIn('run_id', old)
        current = next(row for row in rows if row['task_id'] != task_id)
        self.assertEqual(current['session_key'], self.session)
        self.assertEqual(current['run_id'], 'run-next')

    def test_exact_success_and_duplicate_result_does_not_rewrite(self):
        result = self.demo.chat.handle('chat_tool', self.payload)
        self.assertEqual(result['status'], 'host_authorized')
        rid = result['request_id']
        self.assertEqual(self.row(rid)['execution_status'], 'awaiting_host_result')
        self.result()
        row = self.row(rid)
        self.assertEqual(row['execution_status'], 'succeeded')
        self.assertEqual(row['execution_run_id'], 'run-original')
        self.assertEqual(row['tool_call_id'], 'call-original')
        self.result(success=False)
        self.assertEqual(self.row(rid)['execution_status'], 'succeeded')
        linked = [e for e in self.demo.events if e['event'] == 'chat.host_result']
        self.assertEqual(linked[0]['request_id'], rid)

    def test_host_failure_is_not_success(self):
        rid = self.demo.chat.handle('chat_tool', self.payload)['request_id']
        self.result(success=False)
        self.assertEqual(self.row(rid)['execution_status'], 'failed')
        self.assertEqual(self.row(rid)['status'], 'authorized')

    def test_missing_id_never_guesses_latest_request(self):
        payload = self.payload | {'tool_call_id':None}
        rid = self.demo.chat.handle('chat_tool', payload)['request_id']
        self.assertEqual(self.row(rid)['execution_status'], 'unknown')
        self.result(payload)
        self.assertEqual(self.row(rid)['execution_status'], 'unknown')
        self.assertFalse(self.demo.events[-1]['result_linked'])
        self.assertIsNone(self.demo.events[-1]['request_id'])

    def test_wrong_id_session_run_or_tool_does_not_link(self):
        rid = self.demo.chat.handle('chat_tool', self.payload)['request_id']
        for changed in [{'tool_call_id':'other'}, {'run_id':'other'},
                        {'session_key':'agent:main:other'}, {'tool_name':'write'}]:
            self.result(self.payload | changed)
            self.assertEqual(self.row(rid)['execution_status'], 'awaiting_host_result')
        self.result()
        self.assertEqual(self.row(rid)['execution_status'], 'succeeded')

    def test_duplicate_tool_id_is_ambiguous_not_a_latest_mapping(self):
        first = self.demo.chat.handle('chat_tool', self.payload)['request_id']
        second = self.demo.chat.handle('chat_tool', self.payload)['request_id']
        self.assertNotEqual(first, second)
        self.result()
        self.assertEqual(self.row(first)['execution_status'], 'unknown')
        self.assertEqual(self.row(second)['execution_status'], 'unknown')

    def test_approval_is_not_execution_and_retry_links_original_request(self):
        payload, rid = self.pending()
        approved = self.demo.handle('resolve', {'request_id':rid, 'resolution':'approve'}, self.approver)
        self.assertEqual(approved['status'], 'authorized')
        self.assertFalse(approved['executed'])
        row = self.row(rid)
        self.assertEqual(row['status'], 'authorized')
        self.assertEqual(row['execution_status'], 'not_started')
        self.assertEqual(self.demo.service.gateway.business_adapters.documents.read_count, 0)
        saved = next(iter(self.demo.chat.permits.values()))
        claims = self.demo.service.gateway.tickets._verify_envelope(saved['ticket'])
        self.assertEqual(row['authorization_expires_at'], claims['exp'])
        self.assertAlmostEqual(claims['exp'] - claims['iat'], 30, places=4)
        self.demo.chat.handle('chat_end', {'run_id':'run-original'})
        self.demo.chat.handle('chat_start', self.start | {'run_id':'run-retry'})
        retry = payload | {'run_id':'run-retry', 'tool_call_id':'call-retry'}
        self.assertEqual(self.demo.chat.handle('chat_tool', retry)['request_id'], rid)
        row = self.row(rid)
        self.assertEqual(row['run_id'], 'run-original')
        self.assertEqual(row['execution_run_id'], 'run-retry')
        self.assertEqual(row['execution_status'], 'awaiting_host_result')
        self.result(retry)
        self.assertEqual(self.row(rid)['execution_status'], 'succeeded')
        self.assertTrue(self.row(rid)['authorization_consumed_at'])
        self.assertNotEqual(self.demo.chat.handle('chat_tool', retry)['status'], 'host_authorized')
        self.assertEqual(self.row(rid)['execution_status'], 'succeeded')

    def test_expiry_projection_does_not_extend_or_consume_authorization(self):
        _, rid = self.pending()
        self.demo.handle('resolve', {'request_id':rid, 'resolution':'approve'}, self.approver)
        before = copy.deepcopy(self.demo.requests[rid])
        expiry = before['authorization_expires_at']
        subject = self.demo.subject(self.office)
        self.assertFalse(self.row(rid)['authorization_expired'])
        with patch('identity.demo_provider.time.time', return_value=expiry + 1):
            row = next(r for r in self.demo.request_summaries(subject) if r['request_id'] == rid)
        self.assertTrue(row['authorization_expired'])
        self.assertEqual(self.demo.requests[rid], before)
        self.assertEqual(row['execution_status'], 'not_started')

    def test_end_without_exact_result_marks_execution_unknown(self):
        rid = self.demo.chat.handle('chat_tool', self.payload)['request_id']
        self.demo.chat.handle('chat_end', {'run_id':'run-original'})
        self.assertEqual(self.row(rid)['execution_status'], 'unknown')

    def test_rebinding_drops_pending_result_association(self):
        rid = self.demo.chat.handle('chat_tool', self.payload)['request_id']
        self.demo.handle('bind_session', {'session_key':self.session}, self.office)
        self.assertEqual(self.row(rid)['execution_status'], 'unknown')
        self.assertFalse(self.demo.chat.host_calls)
        self.result()
        self.assertEqual(self.row(rid)['execution_status'], 'unknown')


if __name__ == '__main__':
    unittest.main(verbosity=2)
