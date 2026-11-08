import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {applySandboxPolicy} from '../modules/session-sandbox/policy.mjs';
import {toolCoverage} from '../modules/trajectory-governance/task-links.mjs';
const out=path.resolve(process.env.GOV_U7B_EVIDENCE??path.join('local-validation/u7b-notify-live',new Date().toISOString().replace(/[:.]/g,'-')));
fs.mkdirSync(out,{recursive:true});
const short='submit_emergency_notice',full='agentguard-notices__'+short;
const report={passed:false,source:'live-config-and-real-mcp-stdio-list',chat_messages_sent:0,production_oidc:false};
try{
 const raw=fs.readFileSync(path.join(process.env.USERPROFILE,'.openclaw/openclaw.json')),c=JSON.parse(raw);
 const server=c.mcp.servers['agentguard-notices'];
 const matches=(pattern,name)=>new RegExp('^'+pattern.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$','i').test(name);
 assert.equal(server.enabled,true);assert(server.toolFilter.include.includes(short));
 assert(!(server.toolFilter.exclude??[]).some(p=>matches(p,short)));
 for(const t of [c.tools,c.tools.sandbox.tools]){
   assert(t.alsoAllow?.includes(full));assert(!(t.deny??[]).some(p=>matches(p,full)));
 }
 report.config_sha256=createHash('sha256').update(raw).digest('hex');
 report.include=server.toolFilter.include;report.exclude=server.toolFilter.exclude??[];
 report.identity_mode=server.env.AGENTGUARD_MCP_IDENTITY_MODE;
 report.enabled=server.enabled;
 for(const engine of ['docker','srt'])assert(applySandboxPolicy(c,engine,'F:/synthetic-u7b').tools.sandbox.tools.alsoAllow.includes(full));
 const python=path.resolve('modules/agentguard-group2/.venv/Scripts/python.exe');
 const generator=spawnSync(python,['-c',"import json,sys;from pathlib import Path;sys.path.insert(0,'scripts');from build_config import build;r=next(x['value'] for x in build({},Path('F:/synthetic-state'),Path('C:/synthetic-docker.exe')) if x['path']=='mcp.servers.agentguard-notices');print(json.dumps(dict(enabled=r['enabled'],identity=r['env']['AGENTGUARD_MCP_IDENTITY_MODE'],include=r['toolFilter']['include'])))"],{encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(generator.status,0,'Generator failed');report.generated=JSON.parse(generator.stdout);
 assert(report.generated.include.includes(short));assert.equal(report.generated.enabled,false);assert.equal(report.generated.identity,'oidc');
 const batch=JSON.parse(fs.readFileSync('.runtime/config-batch.json'));
 report.batch_include=batch.find(r=>r.path==='mcp.servers.agentguard-notices').value.toolFilter.include;
 assert(report.batch_include.includes(short));
 const frames=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'u7b-list-probe',version:'1'}}},
   {jsonrpc:'2.0',method:'notifications/initialized'}, {jsonrpc:'2.0',id:2,method:'tools/list',params:{}}];
 const listed=spawnSync(server.command,server.args,{cwd:server.cwd,env:{...process.env,...server.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},
   input:frames.map(f=>JSON.stringify(f)).join('\n')+'\n',encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:1048576});
 assert.equal(listed.status,0,'Live MCP stdio list failed');
 const replies=listed.stdout.trim().split(/\r?\n/).map(JSON.parse);const tools=replies.find(r=>r.id===2)?.result?.tools;
 assert(Array.isArray(tools));report.mcp_tools=tools.map(t=>t.name);assert(report.mcp_tools.includes(short));
 const notice=tools.find(t=>t.name===short);
 assert.deepEqual(notice.inputSchema.properties.recipient.enum,['duty_office','synthetic_external_office']);
 assert.deepEqual(notice.inputSchema.properties.template_id.enum,['typhoon_notice']);assert.equal(notice.inputSchema.additionalProperties,false);
 report.other_unlisted_tools=report.mcp_tools.filter(n=>!server.toolFilter.include.includes(n));
 report.tool_coverage=toolCoverage(c,[full,'exec']);assert.equal(report.tool_coverage.find(t=>t.name===full).managed,true);
 assert.equal(report.tool_coverage.find(t=>t.name==='exec').managed,false);
 report.passed=true;
}catch(e){report.error=e.message;process.exitCode=1;}
fs.writeFileSync(path.join(out,'tool-list-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,error:report.error,report:path.join(out,'tool-list-report.json')}));
