import sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'modules/agentguard-group2'))
from identity.demo_provider import DemoIdentity

class Delegation(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(dir=ROOT/'local-validation');self.addCleanup(self.temp.cleanup)
  self.d=DemoIdentity(self.temp.name);self.addCleanup(self.d.disable);self.d.handle('enable')
 def login(self,user='office-test',old=None):
  r=self.d.handle('login',{'user':user},old);self.assertIn('access_token',r);return 'Bearer '+r['access_token']
 def test_switch_revokes_old_and_chat_not_other_tab(self):
  old=self.login();other=self.login();self.assertNotEqual(old,other)
  self.d.handle('bind_session',{'session_key':'agent:main:u13'},old)
  self.assertTrue(self.d.status(old)['execution_enabled'])
  fresh=self.login('approver-test',old)
  self.assertEqual(self.d.handle('invoke',{'scenario':'notice'},old)['reason_code'],'DEMO_DELEGATION_REVOKED')
  self.assertFalse(self.d.status(old)['execution_enabled']);self.assertFalse(self.d.chat.sessions)
  self.assertTrue(self.d.status(other)['execution_enabled']);self.assertTrue(self.d.status(fresh)['execution_enabled'])
  # The same verifier used by service.invoke rejects the revoked token too.
  self.assertEqual(self.d.service.invoke({},old)['reason_code'],'DEMO_DELEGATION_REVOKED')
 def test_roles_revoke_no_bearer_and_gateway_token(self):
  self.assertFalse(self.d.status()['execution_enabled'])
  for bearer in [None,'Bearer gateway-admin-not-business']:
   self.assertEqual(self.d.handle('invoke',{'scenario':'notice'},bearer)['status'],'blocked')
  office=self.login();pending=self.d.handle('invoke',{'scenario':'notice'},office)
  self.assertEqual(self.d.handle('resolve',{'request_id':pending['request_id'],'resolution':'approve'},office)['reason_code'],'D105_SELF_APPROVAL')
  approver=self.login('approver-test');result=self.d.handle('resolve',{'request_id':pending['request_id'],'resolution':'approve'},approver)
  self.assertTrue(result['executed'])
  audit=self.login('auditor-test');self.assertFalse(self.d.status(audit)['execution_enabled'])
  self.assertEqual(self.d.handle('invoke',{'scenario':'notice'},audit)['reason_code'],'DEMO_AUDITOR_READ_ONLY')
  self.assertEqual(self.d.handle('revoke',{},audit)['status'],'ok')
  self.assertEqual(self.d.status(audit)['delegation_reason'],'DEMO_DELEGATION_REVOKED')
  self.d.handle('revoke',{},office);self.assertFalse(self.d.status(office)['execution_enabled'])
  logs=(Path(self.temp.name)/'identity-audit.jsonl').read_text(encoding='utf-8')
  self.assertNotIn(office.split(' ')[1],logs);self.assertIn('delegation_revoked',logs)

if __name__=='__main__':unittest.main(verbosity=2)
