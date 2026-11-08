"""Synthetic local MCP fixture: real AgentGuard/OPA/tickets/adapters, no production data."""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'modules/agentguard-group2'))
from service.app import AgentGuardService
from service.config import ServiceConfig
from integrations.openclaw_mcp.config import AdapterConfig
from integrations.openclaw_mcp.agentguard_client import AgentGuardClient
from integrations.openclaw_mcp.server import McpServer


def main():
    output = Path(sys.argv[1]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    subject = output / 'synthetic-duty-user.json'
    subject.write_text(json.dumps({'id':'synthetic-duty-user','department':'synthetic-emergency',
        'roles':['office_user'],'clearance':1,'mfa':True}), encoding='utf-8')
    os.environ['AGENTGUARD_MCP_STATUS_STORE_FILE'] = str(output / 'status.json')
    config = ServiceConfig(port=0, opa_mode='cli', state_dir=str(output / 'state'),
                           enable_local_adapters=True, allow_development_identity=True)
    service = AgentGuardService(config, environ={'AGENTGUARD_TICKET_SECRET_HEX':'ab'*32}).start()
    try:
        service.gateway.task_policies.create('u6-synthetic-task','synthetic-duty-user',
            user_values={'file.read':{'document_id':'emergency_plan'}})
        client = AgentGuardClient(AdapterConfig(agentguard_base_url=service.base_url,
            identity_mode='loopback_static_dev', dev_subject_file=str(subject), task_id='u6-synthetic-task'))
        server = McpServer(client)
        server.initialized = True
        def call(name, arguments):
            response = server._call_tool(1, {'name':name,'arguments':arguments})
            assert 'error' not in response, response
            return response['result']
        public = call('read_gov_document', {'document_id':'emergency_plan'})
        notices = call('list_notices', {'limit':1})
        before = service.gateway.business_adapters.documents.read_count
        denied = call('read_gov_document', {'document_id':'command_contacts'})
        after = service.gateway.business_adapters.documents.read_count
        assert public['structuredContent']['executed'] is True
        assert notices['structuredContent']['status'] == 'executed_isolated'
        assert denied['structuredContent']['reason_code'] == 'G002_POLICY_DENY'
        assert 'D004_CLEARANCE_INSUFFICIENT' in denied['structuredContent']['policy_reason_codes']
        assert denied['structuredContent']['executed'] is False and before == after
        print(json.dumps({'source':'synthetic-local-agentguard-mcp','identity':'loopback_static_dev-not-production',
            'public':public,'notices':notices,'denied':denied,'read_count_before_denied':before,
            'read_count_after_denied':after},ensure_ascii=False))
    finally:
        service.close()


if __name__ == '__main__':
    main()
