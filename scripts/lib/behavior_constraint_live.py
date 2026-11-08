"""Temporary real HTTP/MCP service for U7. Synthetic data, no host config edits."""
import copy
import json
import os
import sqlite3
import sys
from contextlib import closing
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from behavior_constraint_fixture import AgentGuardService, ServiceConfig
from integrations.openclaw_mcp.config import AdapterConfig
from integrations.openclaw_mcp.agentguard_client import AgentGuardClient
from integrations.openclaw_mcp.server import McpServer


class ObservedClient(AgentGuardClient):
    def _request_payload(self, action):
        payload = super()._request_payload(action)
        self.last_request = copy.deepcopy(payload)
        return payload


def main():
    out=Path(sys.argv[1]).resolve();out.mkdir(parents=True,exist_ok=True)
    identity=out/'synthetic-user.json'
    identity.write_text(json.dumps({'id':'synthetic-duty','roles':['office_user'],'clearance':2,
        'department':'synthetic-emergency','mfa':True}),encoding='utf8')
    os.environ['AGENTGUARD_MCP_STATUS_STORE_FILE']=str(out/'status.json')
    service=AgentGuardService(ServiceConfig(port=0,opa_mode='cli',state_dir=str(out/'state'),
        enable_local_adapters=True,allow_development_identity=True),
        environ={'AGENTGUARD_TICKET_SECRET_HEX':'ce'*32}).start()
    try:
        def session(task):
            service.gateway.task_policies.create(task,'synthetic-duty',user_values={
                'file.read':{'document_id':'emergency_plan'},
                'notification.submit':{'recipient':'duty_office','template_id':'typhoon_notice'}})
            client=ObservedClient(AdapterConfig(agentguard_base_url=service.base_url,identity_mode='loopback_static_dev',
                dev_subject_file=str(identity),task_id=task))
            server=McpServer(client)
            server.handle({'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'u7-local-demo','version':'1'}}})
            return client,server
        def call(server,name,args):
            response=server.handle({'jsonrpc':'2.0','id':2,'method':'tools/call','params':{'name':name,'arguments':args}})
            assert 'error' not in response,response
            return response['result']['structuredContent']
        def count():
            db=out/'state/business/notice_outbox.sqlite'
            if not db.exists():return 0
            with closing(sqlite3.connect(db)) as conn:return conn.execute('SELECT count(*) FROM notice_outbox').fetchone()[0]
        client,server=session('u7-contaminated-task')
        tools=server.handle({'jsonrpc':'2.0','id':3,'method':'tools/list'})['result']['tools']
        assert any(t['name']=='submit_emergency_notice' for t in tools)
        public=call(server,'read_gov_document',{'document_id':'emergency_plan'})
        assert public['executed'] is True
        before=service.gateway.business_adapters.documents.read_count
        # Trusted test harness imports a synthetic upstream mail result, never a model provenance argument.
        service.gateway.task_policies.observe('u7-contaminated-task','synthetic-duty','file.read',{'document_id':'material_inventory'})
        poisoned=call(server,'read_gov_document',{'document_id':'material_inventory'})
        assert poisoned['reason_code']=='P006_PARAMETER_SOURCE_UNTRUSTED'
        assert before==service.gateway.business_adapters.documents.read_count
        service.gateway.task_policies.observe('u7-contaminated-task','synthetic-duty','notification.submit',{'recipient':'synthetic_external_office'})
        tainted=call(server,'submit_emergency_notice',{'recipient':'synthetic_external_office','template_id':'typhoon_notice'})
        assert tainted['status']=='pending_approval' and count()==0
        client2,server2=session('u7-user-authorized-task')
        legitimate=call(server2,'submit_emergency_notice',{'recipient':'duty_office','template_id':'typhoon_notice'})
        assert legitimate['status']=='pending_approval' and count()==0
        pending=client2.last_request
        req=Request(service.base_url+'/approvals/resolve',headers={'Content-Type':'application/json'},
            data=json.dumps({'request':pending,'resolution':'approve','approver_id':'synthetic-reviewer','approver_roles':['business_approver']}).encode())
        with urlopen(req,timeout=15) as response:approved=json.load(response)
        assert approved['status']=='executed_isolated' and count()==1,approved
        client2._persist_request(pending,approved)
        replay=call(server2,'submit_emergency_notice',{'recipient':'duty_office','template_id':'typhoon_notice'})
        assert replay['status']=='blocked' and count()==1
        report={'passed':True,'source':'real-local-http-mcp-opa-panel','data':'synthetic',
            'identity':'loopback_static_dev-not-production-OIDC','host_session':False,
            'contamination_source':'trusted-test-harness-synthetic-mail-result',
            'cases':[{'name':'user-public-document','status':public['status']},
                     {'name':'tool-derived-document','reason':poisoned['reason_code'],'read_count_delta':0},
                     {'name':'tool-derived-recipient','status':tainted['status'],'write_count':0},
                     {'name':'user-recipient-expansion','reason':legitimate['reason_code']},
                     {'name':'approved-one-use','status':approved['status'],'write_count':1},
                     {'name':'replay','reason':replay['reason_code'],'write_count':1}],
            'contract':service.gateway.task_policies.summary('u7-user-authorized-task')}
        (out/'mcp-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
        print(json.dumps({'base':service.base_url,'report':str(out/'mcp-report.json')},ensure_ascii=False),flush=True)
        sys.stdin.readline()  # Keep the real service available while the panel is inspected.
    finally:service.close()

if __name__=='__main__':main()
