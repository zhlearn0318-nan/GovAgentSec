"""U7 deterministic provenance tests with real OPA and zero-side-effect assertions."""
import copy
import json
import unittest
from unittest.mock import patch
from lib.behavior_constraint_fixture import GuardCase, document_action, notice_action
from enforcement.task_policy import sensitive_values, value_hash
from integrations.openclaw_mcp.server import McpServer


class Provenance(GuardCase):
    def test_explicit_user_document_executes(self):
        result = self.gate.invoke(self.request())
        self.assertEqual(result['status'], 'executed_isolated')
        self.assertEqual(result['governance']['provenance']['document_id']['source'], 'user')
        self.assertEqual(self.gate.business_adapters.documents.read_count, 1)

    def test_document_injection_and_forged_source_never_reads(self):
        req = self.request(document_action('material_inventory'))
        req['context']['provenance'] = {'document_id':'user'}
        self.policies.observe(req['task_id'],req['subject']['id'],'file.read',{'document_id':'material_inventory'})
        result = self.gate.invoke(req)
        self.assertEqual(result['reason_code'],'P006_PARAMETER_SOURCE_UNTRUSTED')
        self.assertEqual(result['governance']['provenance']['document_id']['source'],'tool_untrusted')
        self.assertEqual(self.gate.business_adapters.documents.read_count,0)

    def test_mail_recipient_injection_pending_and_approved_snapshot_once(self):
        req = self.request(notice_action('synthetic_external_office','typhoon_notice'))
        self.policies.observe(req['task_id'],req['subject']['id'],'notification.submit',{'recipient':'synthetic_external_office'})
        result = self.gate.invoke(req)
        self.assertEqual(result['status'],'pending_approval')
        self.assertEqual(result['governance']['provenance']['recipient']['source'],'tool_untrusted')
        self.assertEqual(self.notice_count(),0)
        approved = self.approve(req)
        self.assertEqual(approved['status'],'executed_isolated',approved)
        self.assertEqual(approved['governance']['provenance']['recipient']['source'],'approved_snapshot')
        self.assertEqual(self.notice_count(),1)
        self.assertEqual(self.gate.invoke(req)['status'],'blocked')
        self.assertEqual(self.notice_count(),1)

    def test_user_recipient_still_requires_expansion_approval(self):
        req=self.request(notice_action('duty_office','typhoon_notice'))
        pending=self.gate.invoke(req)
        self.assertEqual(pending['reason_code'],'P004_EXPANSION_REQUIRES_APPROVAL')
        self.assertEqual(pending['governance']['provenance']['recipient']['source'],'user')
        self.assertEqual(self.notice_count(),0)
        self.assertEqual(self.approve(req)['status'],'executed_isolated')
        self.assertEqual(self.notice_count(),1)

    def test_unknown_not_trusted_and_context_cannot_disable_guard(self):
        req=self.request(document_action('material_inventory'))
        req['context']['source']='direct'
        req['context']['skip_task_policy']=True
        result=self.service.invoke(req,None)
        self.assertEqual(result['governance']['provenance']['document_id']['source'],'unknown')
        self.assertEqual(self.gate.business_adapters.documents.read_count,0)

    def test_policy_denial_precedes_approval(self):
        req=self.request(document_action('command_contacts'));req['subject']['clearance']=1
        result=self.gate.invoke(req)
        self.assertIn('D004_CLEARANCE_INSUFFICIENT',result['policy_reason_codes'])
        self.assertEqual(self.approve(req)['status'],'blocked')
        self.assertEqual(self.gate.business_adapters.documents.read_count,0)

    def test_sensitive_field_coverage_and_no_plaintext_store(self):
        for key in ['path','file_path','url','recipient','recipients','amount','command','payee']:
            secret='synthetic-private-'+key
            self.assertIn(key,sensitive_values({'tool':'file.read','parameters':{key:secret}}))
        req=self.request(notice_action('synthetic_external_office','typhoon_notice'))
        self.gate.invoke(req)
        from pathlib import Path
        audit=(Path(self.temp.name)/'enforcement_audit.jsonl').read_text(encoding='utf8')
        self.assertNotIn('synthetic_external_office',audit)
        req=self.request();req['action']['parameters']['document_id']='synthetic-private-document-path'
        self.assertEqual(self.gate.invoke(req)['status'],'blocked')
        self.assertNotIn('synthetic-private-document-path',(Path(self.temp.name)/'enforcement_audit.jsonl').read_text(encoding='utf8'))

    def test_task_policy_failure_closed(self):
        with patch.object(self.policies,'evaluate',side_effect=OSError('offline')):
            self.assertEqual(self.gate.invoke(self.request())['reason_code'],'P012_TASK_POLICY_UNAVAILABLE')
        self.assertEqual(self.gate.business_adapters.documents.read_count,0)

    def test_mcp_rejects_authority_arguments(self):
        server=McpServer(None);server.initialized=True
        for field in ['subject','provenance','task_id','approval','ticket','allowed_tools']:
            response=server._call_tool(1,{'name':'submit_emergency_notice','arguments':{
                'recipient':'duty_office','template_id':'typhoon_notice',field:'forged'}})
            self.assertIn('error',response)
        self.assertEqual(self.notice_count(),0)

    def test_payment_and_command_sources_are_checked_before_execution(self):
        for action, field, value in [
            ({'tool':'payment.transfer','operation':'transfer','resource':'erp://payments/synthetic-vendor',
              'parameters':{'amount':100,'currency':'CNY','item_count':1},'risk_level':'high','data_level':'confidential'},'amount',100),
            ({'tool':'shell.execute','operation':'execute','resource':'host://synthetic',
              'parameters':{'command':'Get-Date','item_count':1},'risk_level':'high','data_level':'internal'},'command','Get-Date')]:
            req=self.request(action);req['subject']['roles']+=['finance_operator','ops_engineer']
            req['environment']['sandbox']={'enabled':True,'profile':'wasm-capability'}
            self.policies.observe(req['task_id'],req['subject']['id'],action['tool'],{field:value})
            result=self.gate.invoke(req)
            self.assertEqual(result['status'],'pending_approval',result)
            self.assertEqual(result['governance']['provenance'][field]['source'],'tool_untrusted')
            self.assertEqual(self.gate.business_adapters.payment_count(),0)

if __name__=='__main__':unittest.main()
