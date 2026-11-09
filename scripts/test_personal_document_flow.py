import sys,tempfile,unittest,uuid,time
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'modules/agentguard-group2'))
from identity.demo_provider import DemoIdentity
from enforcement.documents import REGISTRY

class PersonalDocuments(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory(dir=ROOT/'local-validation');self.addCleanup(temp.cleanup)
        self.demo=DemoIdentity(temp.name,personal_confirmation=True);self.demo.handle('enable');self.addCleanup(self.demo.disable)
    def start(self,user='admin',confidential=False):
        if confidential:self.demo.users['approver-test']['clearance']=2
        password={'admin':'Demo#Admin26','shenpi':'Demo#Shenpi26','jingban':'Demo#Jingban26'}[user]
        token='Bearer '+self.demo.handle('login',{'account':user,'password':password})['access_token']
        session='agent:main:'+uuid.uuid4().hex;run=uuid.uuid4().hex
        self.demo.handle('activate_chat',{'session_key':session},token)
        self.assertEqual(self.demo.chat.handle('chat_start',{'session_key':session,'run_id':run})['status'],'ok')
        return token,{'session_key':session,'run_id':run,'tool_call_id':uuid.uuid4().hex}
    def prepare(self,payload,doc):return self.demo.chat.handle('chat_document_prepare',{**payload,'params':{'document_id':doc}})
    def execute(self,payload,doc):return self.demo.chat.handle('chat_document_execute',{**payload,'params':{'document_id':doc}})
    def count(self):return self.demo.service.gateway.business_adapters.documents.read_count
    def test_admin_reads_every_registered_document_once(self):
        token,p=self.start()
        for doc in REGISTRY:
            p['tool_call_id']=uuid.uuid4().hex;before=self.count()
            self.assertEqual(self.prepare(p,doc)['status'],'document_prepared')
            self.assertEqual(self.count(),before)
            result=self.execute(p,doc);self.assertEqual(result['status'],'executed_isolated',result)
            self.assertIn('合成数据',result['content']);self.assertEqual(self.count(),before+1)
            self.assertEqual(self.execute(p,doc)['status'],'blocked');self.assertEqual(self.count(),before+1)
    def test_personal_confirmation_sensitive_read_and_no_second_execution(self):
        token,p=self.start('shenpi',True);result=self.prepare(p,'duty_contacts')
        self.assertEqual(result['status'],'pending_approval');self.assertEqual(self.count(),0)
        rid=result['request_id'];self.assertTrue(next(r for r in self.demo.status(token)['requests'] if r['request_id']==rid)['can_confirm_self'])
        result=self.demo.handle('resolve',{'request_id':rid,'resolution':'approve'},token)
        self.assertEqual(result['status'],'authorized',result);self.assertEqual(self.count(),0)
        self.assertEqual(self.prepare(p,'duty_contacts')['status'],'document_prepared')
        self.assertEqual(self.execute(p,'duty_contacts')['status'],'executed_isolated');self.assertEqual(self.count(),1)
        self.assertTrue(any(e['event_type']=='approval.approved' for e in self.demo.trace_events))
        self.assertTrue(any(e['event_type']=='approval.execution' for e in self.demo.trace_events))
        self.assertEqual(self.demo.handle('resolve',{'request_id':rid,'resolution':'approve'},token)['status'],'blocked')
        p['tool_call_id']='replay';self.prepare(p,'duty_contacts');self.assertEqual(self.execute(p,'duty_contacts')['status'],'blocked');self.assertEqual(self.count(),1)
    def test_reject_timeout_and_identity_switch_never_read(self):
        for mode in ['reject','timeout','revoke']:
            token,p=self.start('shenpi',True);r=self.prepare(p,'duty_contacts');rid=r['request_id']
            if mode=='timeout':self.demo.requests[rid]['confirmation_expires_at']=time.time()-1
            if mode=='revoke':self.demo.handle('revoke',{},token)
            self.demo.handle('resolve',{'request_id':rid,'resolution':'reject' if mode=='reject' else 'approve'},token)
            self.assertEqual(self.execute(p,'duty_contacts')['status'],'blocked')
        self.assertEqual(self.count(),0)
    def test_low_identity_hard_denies_cannot_be_confirmed(self):
        token,p=self.start('jingban')
        for doc in ['command_contacts','protected_resource']:
            p['tool_call_id']=uuid.uuid4().hex;r=self.prepare(p,doc)
            self.assertEqual(r['status'],'blocked')
            self.assertEqual(self.demo.handle('resolve',{'request_id':r['request_id'],'resolution':'approve'},token)['status'],'blocked')
        self.assertEqual(self.count(),0)
    def test_parameter_tamper_ticket_expiry_and_opa_failure(self):
        token,p=self.start();self.prepare(p,'emergency_plan')
        self.assertEqual(self.execute(p,'command_contacts')['status'],'blocked');self.assertEqual(self.count(),0)
        p['tool_call_id']='expired';self.prepare(p,'emergency_plan')
        with patch('time.time',return_value=time.time()+40):self.assertEqual(self.execute(p,'emergency_plan')['status'],'blocked')
        with patch.object(self.demo.service.gateway.opa,'decide',side_effect=RuntimeError('offline')):
            p['tool_call_id']='opa';self.assertEqual(self.prepare(p,'emergency_plan')['status'],'blocked')
        self.assertEqual(self.count(),0)

if __name__=='__main__':unittest.main()
