// Installed-host configuration only. Credentials are preserved and never printed.
import fs from 'node:fs';
import path from 'node:path';
import {homedir} from 'node:os';
const profile=homedir();
const file=path.join(profile,'.openclaw/openclaw.json');
const c=JSON.parse(fs.readFileSync(file,'utf8'));
const workspace=c.agents.defaults.workspace;
if(path.resolve(workspace).toLowerCase()!==path.resolve(profile,'.openclaw/workspace').toLowerCase())throw Error('Unexpected main workspace');
const skillDir=path.join(workspace,'skills/grid-anomaly-diagnosis');
c.agents.list=(c.agents.list||[{id:'main'}]).filter(a=>a.id!=='gov-evolution-demo');
const main=c.agents.list.find(a=>a.id==='main');if(!main)throw Error('Main agent missing');
main.name='电网用电异常分析';
main.skills=['grid-anomaly-diagnosis'];
// Keep the user's current configured model and existing security hooks.
main.tools={...main.tools,allow:['gov_read_document','gov_analyze_grid']};
// An empty agent-level alsoAllow overrides the global coding-profile additions,
// removing both plugin tools before the stricter main allowlist is applied.
delete main.tools.alsoAllow;
c.tools.alsoAllow=['gov_read_document','gov_analyze_grid'];
c.tools.sandbox??={};c.tools.sandbox.tools??={};
c.tools.sandbox.tools.alsoAllow=['gov_read_document','gov_analyze_grid'];
// Preserve hook security configuration exactly. The installed fixed host already
// permits before_prompt_build unless this existing setting is explicitly false.
if(c.plugins.entries['agentguard-runtime-security'].hooks?.allowPromptInjection===false)throw Error('Existing prompt hook policy forbids this integration');
c.plugins.entries['govagentsec-trace'].config.gridDemoRelease={enabled:true,skillDirectory:skillDir};
const backup=file+'.before-native-grid';if(!fs.existsSync(backup))fs.copyFileSync(file,backup);
fs.writeFileSync(file,JSON.stringify(c,null,2)+'\n');
console.log(JSON.stringify({configured:true,agent:'main',workspace,skillDirectory:skillDir,modelPreserved:true}));
