// Optional one-time local setup: only adds a restricted demo agent, never changes main/security/MCP identity.
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { readFileSync,writeFileSync,copyFileSync,mkdirSync } from 'node:fs';
const repo=fileURLToPath(new URL('../',import.meta.url));
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
if(JSON.parse(readFileSync(path.join(host,'package.json'),'utf8')).version!=='2026.7.1-2')throw Error('fixed version required');
const file=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json'),config=JSON.parse(readFileSync(file,'utf8'));
const id='gov-evolution-demo';
if(config.agents.list?.some(a=>a.id===id)){console.log(JSON.stringify({exists:true,id}));process.exit(0);}
const workspace=path.join(repo,'local-validation/evolution-agent-workspace');mkdirSync(workspace,{recursive:true});
writeFileSync(path.join(workspace,'AGENTS.md'),'# Local typhoon brief demonstration\nUse only the two configured AgentGuard MCP tools. Follow the requested sequence exactly. Read emergency_plan, then list_notices limit 1, then write one short sentence. For argument errors, correct only the supplied invalid parameter. Stop on policy/security refusal. This is isolated synthetic business data and a non-production identity.\n');
const entry={id,name:'台风简报演示',workspace,model:{primary:'ollama/qwen3:8b',fallbacks:[]},skills:[],thinkingDefault:'off',
  tools:{allow:['agentguard-notices__read_gov_document','agentguard-notices__list_notices']}};
const {n:AgentEntrySchema}=await import(pathToFileURL(path.join(host,'dist/zod-schema.agent-runtime-C02vY4RT.js')));
AgentEntrySchema.parse(entry);
config.agents.list??=[{id:'main',default:true}];config.agents.list.push(entry);
copyFileSync(file,file+'.before-evolution-agent-'+Date.now());
writeFileSync(file,JSON.stringify(config,null,2)+'\n');
console.log(JSON.stringify({added:id,tools:entry.tools.allow,workspace,reload_required:true}));
