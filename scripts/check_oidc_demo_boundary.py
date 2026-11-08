import json
from check_identity import check
cfg={'mcp':{'servers':{'agentguard-notices':{'env':{'AGENTGUARD_MCP_IDENTITY_MODE':'oidc','AGENTGUARD_MCP_TOKEN_FILE':'PRIVATE_TOKEN_FILE_PLACEHOLDER'}}}}}
env={'AGENTGUARD_OIDC_ENABLED':'true','AGENTGUARD_OIDC_ISSUER':'https://organization.example.invalid','AGENTGUARD_OIDC_AUDIENCE':'synthetic-resource'}
cases=[]
for name,values,configured in [('missing',{},False),('prerequisites-only',env,True),
 ('demo',env|{'AGENTGUARD_OIDC_ISSUER':'https://agentguard-demo.invalid/in-process'},False),
 ('development-enabled',env|{'AGENTGUARD_ALLOW_DEVELOPMENT_IDENTITY':'true'},False),
 ('mfa-disabled',env|{'AGENTGUARD_OIDC_REQUIRE_MFA':'false'},False)]:
 r=check(cfg,values);assert r['configured']==configured,(name,r);assert r['verified'] is False
 cases.append({'case':name,'configured':r['configured'],'verified':r['verified'],'missing':r['missing']})
print(json.dumps({'passed':True,'source':'synthetic-identity-prerequisite-matrix','production_oidc':False,'cases':cases},ensure_ascii=False,indent=2))
