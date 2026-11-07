"""Apply the reviewed delivery defaults without rewriting unrelated settings."""
import argparse
import copy
import json
import shutil
from datetime import datetime
from pathlib import Path

def harden(current, bundled_skills=()):
    config=copy.deepcopy(current)
    ui=config.setdefault('gateway',{}).setdefault('controlUi',{})
    ui.update(allowInsecureAuth=False,embedSandbox='scripts')
    plugins=config.setdefault('plugins',{}).setdefault('entries',{})
    plugins.setdefault('protect-agent',{}).setdefault('hooks',{})['allowConversationAccess']=True
    plugins.setdefault('agentguard-runtime-security',{}).setdefault('config',{})['identityMode']='disabled'
    server=config.get('mcp',{}).get('servers',{}).get('agentguard-notices')
    if server:
        server['enabled']=False
        server.setdefault('env',{}).pop('AGENTGUARD_MCP_DEV_SUBJECT_FILE',None)
        server['env']['AGENTGUARD_MCP_IDENTITY_MODE']='oidc'
    # Bundled capabilities start disabled; administrators can enable reviewed
    # capabilities individually. Existing user skill directories are not touched.
    entries=config.setdefault('skills',{}).setdefault('entries',{})
    for name in bundled_skills:
        entries.setdefault(name,{})['enabled']=False
    return config

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--state',type=Path,default=Path.home()/'.openclaw')
    parser.add_argument('--openclaw-root',type=Path,required=True)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    target=args.state/'openclaw.json'
    current=json.loads(target.read_text(encoding='utf-8-sig'))
    skills=sorted(p.name for p in (args.openclaw_root/'skills').iterdir() if (p/'SKILL.md').is_file())
    updated=harden(current,skills)
    if args.apply:
        backup=args.state/'govagentsec'/('before-hardening-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'.json')
        backup.parent.mkdir(exist_ok=True)
        shutil.copy2(target,backup)
        temporary=target.with_suffix('.gov-hardening.tmp')
        temporary.write_text(json.dumps(updated,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        temporary.replace(target)
    print(json.dumps({'applied':args.apply,'changed':updated!=current,'development_mcp_enabled':False,'panel_sandbox':'scripts','insecure_auth':False,'protect_conversation_hooks':True,'disabled_bundled_skills':skills},ensure_ascii=False))
