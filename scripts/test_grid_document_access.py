"""Native identity -> scoped document grant -> OpenClaw tools -> actual dispatch."""
import copy
import json
import sqlite3
import sys
import tempfile
import time
import unittest
import uuid
from contextlib import closing
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'modules/agentguard-group2'))
from identity.demo_provider import DemoIdentity

class GridDocumentAccess(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=ROOT/'local-validation');self.addCleanup(self.temp.cleanup)
        self.demo=DemoIdentity(self.temp.name,personal_confirmation=True);self.demo.handle('enable');self.addCleanup(self.demo.disable)
        self.analyst=self.login('office-test');self.approver=self.login('approver-test')
    def login(self,user):return 'Bearer '+self.demo.handle('login',{'user':user})['access_token']
    def grant(self):
        r=self.demo.handle('document_request',{'document_id':'grid_records','purpose':'分析2024年9月用电异常并核查检修原因','minutes':30},self.analyst)
        self.assertEqual(r['status'],'ok',r)
        done=self.demo.handle('document_review',{'request_id':r['request']['id'],'resolution':'approve'},self.approver)
        self.assertEqual(done['status'],'ok',done);return done
    def start(self):
        p={'session_key':'agent:main:grid-'+uuid.uuid4().hex,'run_id':'grid-'+uuid.uuid4().hex,'tool_call_id':uuid.uuid4().hex,'params':{'period':'2024-09'}}
        self.assertEqual(self.demo.handle('activate_chat',{'session_key':p['session_key']},self.analyst)['status'],'ok')
        r=self.demo.chat.handle('chat_start',p);self.assertEqual(r['status'],'ok',r);return p
    def test_request_preview_and_scoped_read(self):
        summary=self.demo.status(self.analyst)['permission_summary']
        self.assertEqual(set(m['document_id'] for m in summary['materials']),{'grid_curves','grid_records','grid_other'})
        self.assertIn('audit.assess',summary['capabilities']);self.assertNotIn('admission.manage',summary['capabilities'])
        r=self.demo.handle('document_preview',{'document_id':'grid_curves'},self.analyst);self.assertEqual(r['status'],'ok',r);self.assertIn('M001',r['content'])
        r=self.demo.handle('document_preview',{'document_id':'grid_records'},self.analyst);self.assertEqual(r['status'],'blocked',r);self.assertNotIn('content',r)
        request=self.demo.handle('document_request',{'document_id':'grid_records','purpose':'分析用电下降与检修的关联','minutes':30},self.analyst)['request']
        self.assertEqual(self.demo.handle('document_review',{'request_id':request['id'],'resolution':'approve'},self.analyst)['status'],'blocked')
        self.grant()
        self.assertEqual(self.demo.subject(self.analyst)['clearance'],0)
        r=self.demo.handle('document_preview',{'document_id':'grid_records'},self.analyst);self.assertEqual(r['status'],'ok',r);json.loads(r['content'])
        self.assertEqual(self.demo.handle('document_preview',{'document_id':'grid_other'},self.analyst)['status'],'blocked')
    def test_native_grid_reads_authorized_files_and_replay_denied(self):
        self.grant();p=self.start()
        for doc in ['grid_curves','grid_records']:
            read={**p,'tool_call_id':uuid.uuid4().hex,'params':{'document_id':doc}}
            prepared=self.demo.chat.handle('chat_document_prepare',read);self.assertEqual(prepared['status'],'document_prepared',prepared)
            executed=self.demo.chat.handle('chat_document_execute',read);self.assertEqual(executed['status'],'executed_isolated',executed)
        r=self.demo.chat.handle('chat_grid_prepare',p);self.assertEqual(r['status'],'grid_prepared',r)
        r=self.demo.chat.handle('chat_grid_execute',p);self.assertEqual(r['status'],'ok',r);self.assertEqual(len(r['documents']),2)
        self.assertEqual([d['document_id'] for d in r['documents']],['grid_curves','grid_records']);self.assertEqual(r['subject']['id'],'office-test')
        self.assertEqual(self.demo.chat.handle('chat_grid_execute',p)['reason_code'],'DOCUMENT_CALL_REPLAY')
    def test_grant_expiry_between_prepare_and_execute(self):
        self.grant();p=self.start();self.assertEqual(self.demo.chat.handle('chat_grid_prepare',p)['status'],'grid_prepared')
        with closing(sqlite3.connect(self.demo.document_access.path)) as db:db.execute('UPDATE requests SET expires_at=?',(time.time()-1,));db.commit()
        r=self.demo.chat.handle('chat_grid_execute',p);self.assertEqual(r['status'],'blocked',r);self.assertNotIn('documents',r)
    def test_unapproved_task_cannot_gain_scope_midrun(self):
        p=self.start();self.assertEqual(self.demo.chat.handle('chat_grid_prepare',p)['status'],'blocked')
        self.grant();self.assertEqual(self.demo.chat.handle('chat_grid_prepare',p)['status'],'blocked')
        new=self.start();self.assertEqual(self.demo.chat.handle('chat_grid_prepare',new)['status'],'grid_prepared')
    def test_foreign_fields_and_other_resource_rejected(self):
        for payload in [{'document_id':'grid_other','purpose':'访问其他园区的全部用电资料','minutes':30},
                        {'document_id':'grid_records','purpose':'访问检修记录进行原因核查','minutes':999},
                        {'document_id':'grid_records','purpose':'访问检修记录进行原因核查','minutes':30,'subject':'admin'}]:
            self.assertEqual(self.demo.handle('document_request',payload,self.analyst)['status'],'blocked')

if __name__=='__main__':unittest.main()
