import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync,mkdtempSync,copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {registerNativeGrid,loadedSkill,librarySnapshot} from './register.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const hash=x=>createHash('sha256').update(x).digest('hex');
const temp=path.join(repo,'local-validation/native-grid-tests');mkdirSync(temp,{recursive:true});
test('fixed host manifest declares every native grid tool contract',()=>{
 const manifest=JSON.parse(readFileSync(path.join(repo,'modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/openclaw.plugin.json'),'utf8'));
 assert(manifest.contracts.tools.includes('gov_analyze_grid'));
 assert(manifest.contracts.tools.includes('gov_read_document'));
});
function setup(allowed=true){
 const root=mkdtempSync(path.join(temp,'run-')),workspace=path.join(root,'workspace'),skill=path.join(workspace,'skills/grid-anomaly-diagnosis/SKILL.md');
 mkdirSync(path.dirname(skill),{recursive:true});copyFileSync(path.join(here,'skills/grid-anomaly-diagnosis/SKILL.md'),skill);
 const hooks={},routes=[],methods={};let factory,calls=0;
 const api={config:{gateway:{port:18789},agents:{defaults:{workspace}}},on:(name,fn)=>hooks[name]=fn,registerTool:fn=>factory=fn,registerHttpRoute:route=>routes.push(route),registerGatewayMethod:(name,fn)=>methods[name]=fn};
 const ctx={agentId:'main',sessionKey:'agent:main:native-test-'+path.basename(root),runId:'run-test'};
 const bridge={request:async(op,payload)=>{calls++;assert.equal(op,'chat_grid_execute');assert.equal(payload.session_key,ctx.sessionKey);assert.deepEqual(payload.params,{period:'2024-09'});return allowed?{status:'ok',run_id:ctx.runId,subject:{id:'unit-user'},documents:[['grid_curves','curves.csv'],['grid_records','records.json']].map(([document_id,file])=>{const content=readFileSync(path.join(repo,'modules/grid-demo/data',file),'utf8');return {document_id,content,sha256:hash(content)};})}:{status:'blocked',reason_code:'GRID_ACCESS_REQUIRED'};}};
 registerNativeGrid(api,bridge,{root:path.join(root,'reports')});return {root,workspace,skill,hooks,routes,methods,api,ctx,tool:factory(ctx),calls:()=>calls};
}
function response(){return {status:null,headers:null,body:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};}

test('native model prompt receives exact current skill bytes and version',()=>{
 const s=setup();const built=s.hooks.before_prompt_build({prompt:'分析A园区用电异常'},s.ctx);
 assert(built.appendSystemContext.includes(readFileSync(s.skill,'utf8')));assert(built.appendSystemContext.includes(loadedSkill(s.api,s.ctx).hash));
 assert.equal(s.hooks.before_prompt_build({prompt:'你好'},{...s.ctx,sessionKey:s.ctx.sessionKey+'-unrelated'}),undefined);
 assert(s.hooks.before_prompt_build({prompt:'继续'},s.ctx).appendSystemContext.includes('version: 1.0.0'));
});
test('unauthorized native call never produces analysis',async()=>{
 const s=setup(false);s.hooks.before_prompt_build({prompt:'分析用电'},s.ctx);
 const r=await s.tool.execute('call-1',{period:'2024-09'});assert(r.isError);assert.match(r.content[0].text,/GRID_ACCESS_REQUIRED/);assert.equal(s.calls(),1);
});
test('tool rejects caller paths and dates before crossing authorization bridge',async()=>{
 const s=setup();const r=await s.tool.execute('call-1',{period:'2024-09',path:'C:/secret'});assert(r.isError);assert.equal(s.calls(),0);
});
test('published skill change during a run invalidates the previous loaded prompt',async()=>{
 const s=setup();s.hooks.before_prompt_build({prompt:'分析用电'},s.ctx);writeFileSync(s.skill,readFileSync(s.skill,'utf8').replace('version: 1.0.0','version: 1.1.0'));
 const r=await s.tool.execute('call-1',{period:'2024-09'});assert(r.isError);assert.match(r.content[0].text,/GRID_SKILL_PROMPT_NOT_LOADED_OR_CHANGED/);
});
test('library shows admission only for the installed skill bytes, including released candidates',()=>{
 const s=setup(),root=path.join(s.root,'reports'),dir=path.dirname(s.skill),identity={user:{id:'unit-user'},permission_summary:{can_assess:false}};
 assert.equal(librarySnapshot(s.api,root,identity).skill.status,'unverified');
 const artifact_hash=hash(readFileSync(s.skill,'utf8'));
 writeFileSync(path.join(dir,'admission.json'),JSON.stringify({artifact_hash,response:{decision:'allow'}}));
 assert.equal(librarySnapshot(s.api,root,identity).skill.status,'admitted');
 writeFileSync(s.skill,readFileSync(s.skill,'utf8').replace('version: 1.0.0','version: 1.1.0'));
 assert.equal(librarySnapshot(s.api,root,identity).skill.status,'unverified');
 const current=hash(readFileSync(s.skill,'utf8')),candidate_id='1a6aca03-51b7-4610-a9c5-8de247df9c21',dataDir=path.join(s.root,'trace');
 s.api.config.plugins={entries:{'govagentsec-trace':{config:{dataDir}}}};
 mkdirSync(path.join(dataDir,'skill-workshop',candidate_id),{recursive:true});
 writeFileSync(path.join(dir,'release.json'),JSON.stringify({candidate_id,artifact_hash:current,version:'1.1.0'}));
 writeFileSync(path.join(dataDir,'skill-workshop',candidate_id,'candidate.json'),JSON.stringify({artifact_hash:current,admission_passed:{artifact_hash:current,response:{decision:'allow'}}}));
 const snapshot=librarySnapshot(s.api,root,identity);assert.equal(snapshot.skill.status,'admitted');assert.equal(snapshot.skill.version,'1.1.0');assert.equal(snapshot.skill.release.candidate_id,candidate_id);
});
test('native tool calculates from scoped worker inputs; report capability is checked',async()=>{
 const s=setup();s.hooks.before_prompt_build({prompt:'分析用电'},s.ctx);const r=await s.tool.execute('call-1',{period:'2024-09'});
 assert(!r.isError,r.content[0].text);const result=JSON.parse(r.content[0].text);assert.equal(result.summary.meter_count,4);assert.equal(result.skill_version,'1.0.0');assert(r.details.grid_evidence.skill_prompt_loaded);assert.deepEqual(r.details.grid_evidence.document_ids,['grid_curves','grid_records']);
 const url=new URL(result.report_url),handler=s.routes.find(r=>r.path==='/plugins/govagentsec/grid-reports').handler;
 const denied=response();await handler({method:'GET',url:url.pathname},denied);assert.equal(denied.status,403);
 const ok=response();await handler({method:'GET',url:url.pathname+url.search},ok);assert.equal(ok.status,200);assert(ok.body.includes('<svg'));assert(ok.body.includes('M001'));
 const identity={user:{id:'unit-user'},permission_summary:{can_assess:false}},root=path.join(s.root,'reports');
 assert.equal(librarySnapshot(s.api,root,identity).reports.length,1);
 assert.equal(librarySnapshot(s.api,root,{...identity,user:{id:'other-user'}}).reports.length,0);
 const identityKey=Symbol.for('govagentsec.demoIdentity.bridge'),oldBridge=globalThis[identityKey];
 globalThis[identityKey]={request:async(op,payload,bearer)=>{assert.equal(op,'authorize');assert.deepEqual(payload,{permission:'audit.read'});assert.equal(bearer,'Bearer unit-test');return {status:'ok',...identity};}};
 const rpc=(name,params)=>new Promise(resolve=>s.methods[name]({params,respond:(success,value,error)=>resolve({success,value,error})}));
 try{
  const unauthenticated=await rpc('govagentsec.trace.gridLibrary',{});assert.equal(unauthenticated.success,false);
  const listing=await rpc('govagentsec.trace.gridLibrary',{bearer:'Bearer unit-test'});assert.equal(listing.value.reports[0].id,result.report_id);
  const cap=globalThis[Symbol.for('govagentsec.grid.report-capabilities')].get(url.searchParams.get('access'));cap.expires=Date.now()-1;
  const expired=response();await handler({method:'GET',url:url.pathname+url.search},expired);assert.equal(expired.status,403);
  const reopened=await rpc('govagentsec.trace.gridOpenReport',{bearer:'Bearer unit-test',report_id:result.report_id});assert(reopened.success);
  const renewed=response();await handler({method:'GET',url:reopened.value.url},renewed);assert.equal(renewed.status,200);
  identity.user.id='other-user';const forbidden=await rpc('govagentsec.trace.gridOpenReport',{bearer:'Bearer unit-test',report_id:result.report_id});assert.equal(forbidden.success,false);identity.user.id='unit-user';
 }finally{if(oldBridge)globalThis[identityKey]=oldBridge;else delete globalThis[identityKey];}
 const renewed=await s.tool.execute('call-2',{period:'2024-09'});assert(!renewed.isError);
 // Validate file integrity independently with the newly issued report capability.
 const freshUrl=new URL(JSON.parse(renewed.content[0].text).report_url),freshId=renewed.details.grid_evidence.report_id;
 const file=path.join(s.root,'reports',freshId,'report.html');writeFileSync(file,readFileSync(file,'utf8')+'tampered');const changed=response();await handler({method:'GET',url:freshUrl.pathname+freshUrl.search},changed);assert.equal(changed.status,409);
});
