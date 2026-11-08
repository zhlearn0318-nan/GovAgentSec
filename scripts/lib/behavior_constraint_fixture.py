"""Real local OPA/service/SQLite fixture, synthetic identity and data only."""
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / 'modules/agentguard-group2'
sys.path.insert(0, str(MODULE))
from service.app import AgentGuardService
from service.config import ServiceConfig
from enforcement.documents import document_action
from enforcement.notifications import notice_action


class GuardCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'local-validation')
        self.addCleanup(self.temp.cleanup)
        self.service = AgentGuardService(ServiceConfig(opa_mode='cli', state_dir=self.temp.name,
            enable_local_adapters=True, allow_development_identity=True),
            environ={'AGENTGUARD_TICKET_SECRET_HEX': 'ad'*32})
        self.addCleanup(self.service.close)
        self.gate = self.service.gateway
        self.policies = self.gate.task_policies
        self.policies.create('synthetic-task','synthetic-duty', user_values={
            'file.read':{'document_id':'emergency_plan'},
            'notification.submit':{'recipient':'duty_office','template_id':'typhoon_notice'}})

    def request(self, action=None):
        return {'request_id':'synthetic-request','task_id':'synthetic-task',
            'timestamp':datetime.now(timezone.utc).isoformat(),
            'subject':{'id':'synthetic-duty','roles':['office_user'],'clearance':2},
            'action':action or document_action('emergency_plan'),
            'context':{'source':'mcp','destination_zone':'internal','enforcement_point':'gateway','business_hours':True,'repeat_count':0},
            'environment':{'sandbox':{'enabled':False,'profile':''}}, 'approval':{}}

    def approve(self, request):
        return self.service.resolve_approval(request, 'approve', 'synthetic-reviewer', ['business_approver'])

    def notice_count(self):
        import sqlite3
        from contextlib import closing
        file = Path(self.temp.name) / 'business/notice_outbox.sqlite'
        if not file.exists():
            return 0
        with closing(sqlite3.connect(file)) as db:
            return db.execute('SELECT count(*) FROM notice_outbox').fetchone()[0]
