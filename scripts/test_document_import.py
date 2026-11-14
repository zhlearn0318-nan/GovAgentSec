"""Local import -> verified identity -> task scope -> OPA -> ticket -> reader."""
import base64
import copy
import io
import sys
import tempfile
import unittest
import uuid
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'modules/agentguard-group2'))
from identity.demo_provider import DemoIdentity
from enforcement.document_library import DocumentLibrary, ImportError as DocumentImportError, extract_text


class DocumentImport(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=ROOT/'local-validation');self.addCleanup(self.temp.cleanup)
        self.demo=DemoIdentity(self.temp.name,personal_confirmation=True)
        self.demo.handle('enable');self.addCleanup(self.demo.disable)
        self.admin=self.login('superadmin-test')

    def login(self,user):
        return 'Bearer '+self.demo.handle('login',{'user':user})['access_token']

    def upload(self,level='internal',**changes):
        payload=dict(filename='测试资料.txt',title='新资料',data_level=level,
            content_base64=base64.b64encode('合成测试：新资料正文。手机号13800138000 token=not-a-real-key'.encode()).decode())
        payload.update(changes)
        return payload

    def imported(self,level='internal'):
        result=self.demo.handle('document_import',self.upload(level),self.admin)
        self.assertEqual(result['status'],'ok',result)
        return result['document']['document_id']

    def start(self,token):
        p=dict(session_key='agent:main:import-'+uuid.uuid4().hex,run_id=uuid.uuid4().hex,tool_call_id=uuid.uuid4().hex)
        self.assertEqual(self.demo.handle('activate_chat',{'session_key':p['session_key']},token)['status'],'ok')
        self.assertEqual(self.demo.chat.handle('chat_start',p)['status'],'ok')
        return p

    def prepare(self,p,doc):
        return self.demo.chat.handle('chat_document_prepare',{**p,'params':{'document_id':doc}})

    def execute(self,p,doc):
        return self.demo.chat.handle('chat_document_execute',{**p,'params':{'document_id':doc}})

    def count(self):return self.demo.service.gateway.business_adapters.documents.read_count

    def test_four_levels_real_read_and_denial_zero_count(self):
        docs={level:self.imported(level) for level in ['public','internal','confidential','secret']}
        for user,allowed in [('office-test',{'public'}),('approver-test',{'public','internal'}),('superadmin-test',set(docs))]:
            token=self.login(user);p=self.start(token)
            summary=self.demo.status(token)['permission_summary']
            for level,doc in docs.items():
                row=next(r for r in summary['materials'] if r['document_id']==doc)
                self.assertEqual(row['readable'],level in allowed)
                p['tool_call_id']=uuid.uuid4().hex;before=self.count();result=self.prepare(p,doc)
                if level in allowed:
                    self.assertEqual(result['status'],'document_prepared',result)
                    self.assertEqual(self.count(),before)
                    content=self.execute(p,doc)
                    self.assertEqual(content['status'],'executed_isolated',content)
                    self.assertIn('新资料正文',content['content'])
                    self.assertNotIn('13800138000',content['content']);self.assertNotIn('not-a-real-key',content['content'])
                    self.assertEqual(self.count(),before+1)
                    self.assertEqual(self.execute(p,doc)['status'],'blocked')
                    self.assertEqual(self.count(),before+1)
                else:
                    self.assertEqual(result['status'],'blocked',result)
                    self.assertIn('D004_CLEARANCE_INSUFFICIENT',self.demo.requests[result['request_id']]['policy_reason_codes'])
                    self.assertEqual(self.count(),before)

    def test_confidential_requires_confirmation_then_once(self):
        doc=self.imported('confidential')
        self.demo.users['approver-test']['clearance']=2
        token=self.login('approver-test');p=self.start(token)
        result=self.prepare(p,doc)
        self.assertEqual(result['status'],'pending_approval',result)
        self.assertIn('A004_SENSITIVE_DATA',self.demo.requests[result['request_id']]['policy_reason_codes']);self.assertEqual(self.count(),0)
        approved=self.demo.handle('resolve',{'request_id':result['request_id'],'resolution':'approve'},token)
        self.assertEqual(approved['status'],'authorized',approved)
        self.assertEqual(self.prepare(p,doc)['status'],'document_prepared')
        self.assertEqual(self.execute(p,doc)['status'],'executed_isolated');self.assertEqual(self.count(),1)
        self.assertEqual(self.execute(p,doc)['status'],'blocked');self.assertEqual(self.count(),1)

    def test_permissions_extra_fields_and_bad_level_no_insert(self):
        for token in [None,self.login('office-test'),self.login('approver-test'),self.login('auditor-test')]:
            self.assertEqual(self.demo.handle('document_import',self.upload(),token)['status'],'blocked')
        for payload in [self.upload(data_level='top_secret'),self.upload(resource='file:///outside'),self.upload(subject='admin'),
                        self.upload(filename='../secret.txt'),self.upload(filename='C:\\secret.txt')]:
            self.assertEqual(self.demo.handle('document_import',payload,self.admin)['status'],'blocked')
        self.assertEqual(self.demo.library.catalogue(),{})

    def test_document_parsing_rejects_invalid_binary_and_oversize(self):
        for payload in [self.upload(content_base64='invalid'), self.upload(filename='a.exe'),
                        self.upload(content_base64=base64.b64encode(b'\x00abc').decode()),
                        self.upload(content_base64=base64.b64encode(b'a'*32769).decode()),
                        self.upload(content_base64='A'*400000)]:
            self.assertEqual(self.demo.handle('document_import',payload,self.admin)['status'],'blocked')
        raw=io.BytesIO()
        with zipfile.ZipFile(raw,'w') as z:
            z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>合成 DOCX 正文</w:t></w:r></w:p></w:body></w:document>')
        result=self.demo.handle('document_import',self.upload(filename='资料.docx',content_base64=base64.b64encode(raw.getvalue()).decode()),self.admin)
        self.assertEqual(result['status'],'ok',result)
        self.assertEqual(self.demo.library.read(result['document']['document_id'],'internal'),'合成 DOCX 正文')
        raw=io.BytesIO()
        with zipfile.ZipFile(raw,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('word/document.xml','a'*1100000)
        with self.assertRaises(DocumentImportError):extract_text('bomb.docx',base64.b64encode(raw.getvalue()).decode())

    def test_persistent_registry_without_body_in_status_or_audit(self):
        import json
        doc=self.imported()
        self.demo.disable();self.demo.handle('enable');self.admin=self.login('superadmin-test')
        self.assertIn(doc,self.demo.document_registry)
        fresh=DocumentLibrary(Path(self.temp.name)/'materials')
        self.assertIn(doc,fresh.catalogue())
        self.assertNotIn('新资料正文',json.dumps(self.demo.status(self.admin),ensure_ascii=False))
        self.assertNotIn('新资料正文',(Path(self.temp.name)/'identity-audit.jsonl').read_text(encoding='utf-8'))
        p=self.start(self.admin);self.assertEqual(self.prepare(p,doc)['status'],'document_prepared')
        self.assertEqual(self.execute(p,doc)['status'],'executed_isolated')
        audit=self.demo.service.gateway.audit.path if hasattr(self.demo.service.gateway.audit,'path') else None
        for path in Path(self.temp.name).rglob('*.jsonl'):
            self.assertNotIn('新资料正文',path.read_text(encoding='utf-8'))

    def test_tamper_opa_failure_and_revocation_never_read(self):
        doc=self.imported('secret');p=self.start(self.admin)
        req=self.demo.task_request(self.demo.chat.runs[p['run_id']]['material_tasks'][doc],self.demo.document_action(doc))
        req['action']['data_level']='public'
        self.assertEqual(self.demo.service.invoke(req,self.admin)['status'],'blocked');self.assertEqual(self.count(),0)
        with patch.object(self.demo.service.gateway.opa,'decide',side_effect=RuntimeError('offline')):
            self.assertEqual(self.prepare(p,doc)['status'],'blocked');self.assertEqual(self.count(),0)
        self.assertEqual(self.prepare(p,doc)['status'],'document_prepared')
        self.demo.handle('revoke',{},self.admin)
        self.assertEqual(self.execute(p,doc)['status'],'blocked');self.assertEqual(self.count(),0)

    def test_existing_run_not_silently_expanded(self):
        token=self.login('approver-test');p=self.start(token);doc=self.imported()
        self.assertNotIn(doc,self.demo.chat.runs[p['run_id']]['material_tasks'])
        self.assertEqual(self.prepare(p,doc)['status'],'blocked');self.assertEqual(self.count(),0)
        fresh=self.start(token);self.assertEqual(self.prepare(fresh,doc)['status'],'document_prepared')
        self.assertEqual(self.execute(fresh,doc)['status'],'executed_isolated');self.assertEqual(self.count(),1)

    def test_delete_invalidates_prepared_read_and_pending_approval(self):
        doc=self.imported('confidential');admin_run=self.start(self.admin)
        self.assertEqual(self.prepare(admin_run,doc)['status'],'document_prepared')
        self.demo.users['approver-test']['clearance']=2
        token=self.login('approver-test');pending_run=self.start(token)
        pending=self.prepare(pending_run,doc)
        self.assertEqual(pending['status'],'pending_approval')
        deleted=self.demo.handle('document_delete',{'document_id':doc},self.admin)
        self.assertEqual(deleted['status'],'ok',deleted)
        self.assertNotIn(doc,self.demo.document_registry)
        self.assertEqual(self.execute(admin_run,doc)['status'],'blocked')
        confirmed=self.demo.handle('resolve',{'request_id':pending['request_id'],'resolution':'approve'},token)
        self.assertEqual(confirmed['status'],'blocked',confirmed)
        self.assertEqual(self.count(),0)
        self.assertNotIn(doc,DocumentLibrary(Path(self.temp.name)/'materials').catalogue())
        self.assertTrue(any(e['event']=='document.deleted' and e['document_id']==doc for e in self.demo.events))
        self.assertEqual(self.demo.handle('document_delete',{'document_id':doc},self.admin)['status'],'blocked')

    def test_delete_permission_builtin_and_untrusted_fields(self):
        doc=self.imported()
        for token in [None,self.login('office-test'),self.login('approver-test'),self.login('auditor-test')]:
            self.assertEqual(self.demo.handle('document_delete',{'document_id':doc},token)['status'],'blocked')
            self.assertIn(doc,self.demo.document_registry)
        for payload in [{'document_id':'grid_curves'},{'document_id':'../documents.sqlite'},
                        {'document_id':doc,'subject':'admin'},{'document_id':doc,'resource':'file:///outside'}]:
            self.assertEqual(self.demo.handle('document_delete',payload,self.admin)['status'],'blocked')
        self.assertIn('grid_curves',self.demo.document_registry)
        self.assertIn(doc,self.demo.document_registry)


if __name__=='__main__':unittest.main()
