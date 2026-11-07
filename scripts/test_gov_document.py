"""Real local OPA + HMAC + Wasm + confined synthetic document integration."""
import copy
import json
import sys
import tempfile
import os
import time
import subprocess
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1] / 'modules/agentguard-group2'
sys.path.insert(0, str(ROOT))
from enforcement import build_gateway, compute_action_digest
from enforcement.documents import document_action, DocumentReader, REGISTRY
from integrations.openclaw_mcp.server import McpServer

class Documents(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.gateway = build_gateway(self.temp.name, project_root=ROOT, secret=b'x'*32, enable_local_adapters=True)
        self.reader = self.gateway.business_adapters.documents

    def request(self, document='emergency_plan', clearance=2):
        return dict(request_id='test-request', task_id='test-task', timestamp=datetime.now(timezone.utc).isoformat(),
                    subject=dict(id='synthetic-duty-user', roles=['office_user'], clearance=clearance),
                    action=document_action(document), context=dict(destination_zone='internal', enforcement_point='gateway', business_hours=True, repeat_count=0),
                    environment=dict(sandbox=dict(enabled=False, profile='')), approval={})

    def approve(self, request, actor='synthetic-approver'):
        request['approval'] = self.gateway.approvals.issue(request, compute_action_digest(request), actor, ['business_approver'])
        return request

    def test_public_internal(self):
        for doc in ['emergency_plan','material_inventory']:
            result = self.gateway.invoke(self.request(doc, 1))
            self.assertEqual(result['status'], 'executed_isolated')
            self.assertIn('合成数据', result['receipt']['business_result']['document_content'])
        self.assertEqual(self.reader.read_count, 2)

    def test_denials_zero_reads(self):
        for doc, code in [('command_contacts','D004_CLEARANCE_INSUFFICIENT'), ('protected_resource','D005_PROTECTED_RESOURCE')]:
            result = self.gateway.invoke(self.request(doc,1))
            self.assertIn(code, result['policy_reason_codes'])
            self.assertEqual(self.reader.read_count,0)

    def test_approval_and_redaction(self):
        request=self.request('duty_contacts')
        pending=self.gateway.invoke(request)
        self.assertEqual(pending['status'],'pending_approval')
        self.assertIn('A004_SENSITIVE_DATA',pending['policy_reason_codes'])
        self.assertEqual(self.reader.read_count,0)
        result=self.gateway.invoke(self.approve(request))
        self.assertEqual(result['status'],'executed_isolated')
        self.assertNotIn('13800000001',result['receipt']['business_result']['document_content'])
        self.assertEqual(self.gateway.invoke(request)['status'],'blocked')
        self.assertEqual(self.reader.read_count,1)
        audit=(Path(self.temp.name)/'enforcement_audit.jsonl').read_text(encoding='utf8')
        self.assertNotIn('内部值班通信录',audit)

    def test_self_approval(self):
        result=self.gateway.invoke(self.approve(self.request('duty_contacts'),'synthetic-duty-user'))
        self.assertIn('D105_SELF_APPROVAL',result['policy_reason_codes'])
        self.assertEqual(self.reader.read_count,0)

    def test_expired_approval_and_tampered_approval(self):
        request=self.request('duty_contacts')
        self.gateway.approvals.clock=lambda:time.time()-100000
        self.approve(request)
        self.gateway.approvals.clock=time.time
        self.assertEqual(self.gateway.invoke(request)['status'],'blocked')
        for key,value in [('resource','govdoc://other'),('data_level','public'),('parameters',{'document_id':'emergency_plan'})]:
            request=self.approve(self.request('duty_contacts'))
            request['action'][key]=value
            self.assertEqual(self.gateway.invoke(request)['status'],'blocked')
        self.assertEqual(self.reader.read_count,0)

    def test_symlink_escape(self):
        root=Path(self.temp.name)/'documents';root.mkdir()
        outside=Path(self.temp.name)/'outside.txt';outside.write_text('合成数据',encoding='utf8')
        try:os.symlink(outside,root/'public.txt')
        except OSError:
            # Windows junctions are reparse points and need no symlink privilege.
            linked=Path(self.temp.name)/'linked-documents'
            command="New-Item -ItemType Junction -Path $env:GOV_LINK -Target $env:GOV_TARGET | Out-Null"
            subprocess.run(['powershell','-NoProfile','-Command',command],env={**os.environ,'GOV_LINK':str(linked),'GOV_TARGET':str(root)},check=True,capture_output=True)
            self.addCleanup(lambda:os.rmdir(linked))
            root=linked
        reader=DocumentReader(root)
        with self.assertRaises(ValueError):reader.execute(self.request())
        self.assertEqual(reader.read_count,0)

    def test_ticket_tamper_replay_concurrent_expired(self):
        request=self.request(); ticket=self.gateway.authorize(request)['ticket']
        for key, value in [('resource','govdoc://other'),('data_level','secret'),('parameters',{'document_id':'command_contacts'})]:
            changed=copy.deepcopy(request);changed['action'][key]=value
            self.assertEqual(self.gateway.dispatch(changed,ticket)['reason_code'],'G205_TICKET_BINDING_MISMATCH')
        self.assertEqual(self.reader.read_count,0)
        with ThreadPoolExecutor(max_workers=6) as pool:
            results=list(pool.map(lambda _:self.gateway.dispatch(request,ticket),range(6)))
        self.assertEqual(sum(r['status']=='executed_isolated' for r in results),1)
        self.assertEqual(self.reader.read_count,1)
        ticket=self.gateway.authorize(request,ttl_seconds=-1)['ticket']
        self.assertEqual(self.gateway.dispatch(request,ticket)['reason_code'],'G204_TICKET_EXPIRED')
        self.assertEqual(self.reader.read_count,1)

    def test_opa_adapter_errors(self):
        with patch.object(self.gateway.opa,'decide',side_effect=RuntimeError('offline')):
            self.assertEqual(self.gateway.invoke(self.request())['status'],'blocked')
        self.assertEqual(self.reader.read_count,0)
        with patch.object(self.reader,'execute',side_effect=RuntimeError('no content')):
            result=self.gateway.invoke(self.request())
            self.assertEqual(result['status'],'blocked');self.assertIsNone(result['receipt'])

    def test_invalid_ids_and_paths(self):
        for value in ['../secret.txt','C:/Windows/system.ini','/etc/passwd','unknown']:
            with self.assertRaises(ValueError):document_action(value)
        for value in ['../secret.txt','C:/Windows/system.ini','/etc/passwd']:
            with patch.dict(REGISTRY,{'emergency_plan':(value,*REGISTRY['emergency_plan'][1:])}):
                self.assertEqual(self.gateway.invoke(self.request())['status'],'blocked')
        self.assertEqual(self.reader.read_count,0)

    def test_mcp_rejects_authority_fields(self):
        class Client:
            def read_gov_document(inner, document_id):
                result=self.gateway.invoke(self.request(document_id))
                result['_agentguard_http_status']=result['http_status']
                return result
        server=McpServer(Client());server.initialized=True
        for key in ['path','subject','clearance','data_level','resource','operation','approval','ticket']:
            result=server._call_tool(1,{'name':'read_gov_document','arguments':{'document_id':'emergency_plan',key:'forged'}})
            self.assertIn('error',result)
        self.assertEqual(self.reader.read_count,0)
        result=server._call_tool(1,{'name':'read_gov_document','arguments':{'document_id':'emergency_plan'}})
        self.assertEqual(self.reader.read_count,1)
        text=json.dumps(result)
        for secret in ['ticket_jti','action_digest',str(ROOT)]:self.assertNotIn(secret,text)

if __name__=='__main__':unittest.main(verbosity=2)
