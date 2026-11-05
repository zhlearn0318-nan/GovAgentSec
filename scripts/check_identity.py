"""Report formal identity prerequisites, without printing credentials."""
import argparse
import json
import os
import sys
from pathlib import Path

def check(config, env):
    server=config.get('mcp',{}).get('servers',{}).get('agentguard-notices',{})
    mcp_env=server.get('env',{})
    missing=[]
    if env.get('AGENTGUARD_OIDC_ENABLED','').lower() not in {'1','true'}: missing.append('服务端 AGENTGUARD_OIDC_ENABLED=true')
    issuer=env.get('AGENTGUARD_OIDC_ISSUER','')
    if not issuer.startswith('https://'): missing.append('真实组织 HTTPS OIDC issuer')
    if not env.get('AGENTGUARD_OIDC_AUDIENCE'): missing.append('组织分配的 OIDC audience')
    if mcp_env.get('AGENTGUARD_MCP_IDENTITY_MODE', 'oidc') != 'oidc': missing.append('MCP 身份模式必须为 oidc')
    if not (mcp_env.get('AGENTGUARD_MCP_TOKEN_FILE') or mcp_env.get('AGENTGUARD_MCP_BEARER_TOKEN')): missing.append('当前用户短期访问令牌的安全注入通道')
    return {'configured':not missing,'verified':False,'mcp_enabled':server.get('enabled',True) if server else False,'missing':missing,'role_mapping':{'roles':'realm_access.roles 或 resource_access.agentguard.roles','approver_role':'business_approver','required_claims':['sub','department','clearance','amr（MFA）']},'next_check':'使用真实用户和审批人分别验证签名、issuer、audience、角色、MFA，以及不可自批；未通过前保持停用'}

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    p=argparse.ArgumentParser();p.add_argument('--config',type=Path,default=Path.home()/'.openclaw/openclaw.json');args=p.parse_args()
    print(json.dumps(check(json.loads(args.config.read_text(encoding='utf-8-sig')),os.environ),ensure_ascii=False,indent=2))
