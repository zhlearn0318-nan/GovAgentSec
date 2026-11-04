"""Exercise real local AgentGuard using synthetic business requests only."""
import json,os,sys
from pathlib import Path
repo=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(repo/'modules/agentguard-group2'))
from integrations.openclaw_mcp.config import AdapterConfig
from integrations.openclaw_mcp.agentguard_client import AgentGuardClient
root=Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=True)
os.environ['AGENTGUARD_MCP_STATUS_STORE_FILE']=str(root/'statuses.json')
config=AdapterConfig.from_environment({'AGENTGUARD_MCP_BASE_URL':'http://127.0.0.1:8080','AGENTGUARD_MCP_IDENTITY_MODE':'loopback_static_dev','AGENTGUARD_MCP_DEV_SUBJECT_FILE':str(repo/'modules/agentguard-group2/integrations/openclaw_mcp/dev-subject.example.json')})
client=AgentGuardClient(config)
results={
 'list_notices':client.list_notices(1),
 'request_test_payment':client.request_payment('task-workbench-test-only',1,'CNY'),
 'run_protected_command':client.check_dangerous_command('echo task-workbench-test'),
}
# Retain only public bridge identifiers and statuses, never execution tickets.
public={name:{'control_request_id':r['_agentguard_request_id'],'status':r.get('status'),'reason_code':r.get('reason_code')} for name,r in results.items()}
(root/'requests.json').write_text(json.dumps(public,ensure_ascii=False,indent=2),'utf8')
print(json.dumps(public,ensure_ascii=False))
