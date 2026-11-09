// Real password/JWT/delegation checks around the actual registered RPCs.
// Trace inputs are explicitly synthetic fixtures; no model or external API.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {DemoIdentityBridge} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs';
import {registerTrace} from '../modules/govagentsec-trace/register.mjs';
import {registerTrajectory} from '../modules/trajectory-governance/register.mjs';
import {createFixtures} from '../modules/govagentsec-trace/fixtures.mjs';
const out=path.resolve(process.argv[2]??fs.readFileSync('.runtime/u25-evidence-path.txt','utf8').trim()+'/workspace-access');fs.mkdirSync(out,{recursive:true});
const report={passed:false,source:'real-local-identity-registered-rpc-synthetic-traces',production_oidc:false,external_requests:0,checks:[]};
const methods=new Map(),routes=[],hooks={};
const api=dir=>({pluginConfig:{dataDir:path.join(out,dir)},config:{},logger:{warn(){}},on(n,h){hooks[n]=h;},registerHttpRoute:r=>routes.push(r),registerGatewayMethod:(n,h)=>methods.set(n,h)});
const store=registerTrace(api('trace')),fixture=createFixtures(store),ids=Object.keys(fixture);
registerTrajectory(api('legacy'));hooks.before_agent_run({runId:'isolated-u25',prompt:'synthetic permission test'});hooks.agent_end({runId:'isolated-u25',success:true});hooks.llm_output({runId:'isolated-u25',assistantTexts:['synthetic']});
const key=Symbol.for('govagentsec.demoIdentity.bridge'),previous=globalThis[key],bridge=new DemoIdentityBridge({root:path.join(out,'identity')});globalThis[key]=bridge;
const rpc=async(name,params={})=>{let response;await methods.get(name)({params,respond:(ok,data,error)=>response={ok,data,error}});return response;};
const passwords=Object.fromEntries([...fs.readFileSync('docs/U25_FOUR_ENTRY_WORKSPACE_IA.md','utf8').matchAll(/\| (jingban|shenpi|shenji|weihu) \| ([^|]+?) \|/g)].map(m=>[m[1],m[2]]));
const login=async account=>'Bearer '+(await bridge.request('login',{account,password:passwords[account]})).access_token;
const check=name=>report.checks.push(name);
try{
  for(const name of ['list','detail','candidates','historyPacks','assessmentStart','assign']){
    const r=await rpc('govagentsec.trace.'+name);assert.equal(r.ok,false);assert.equal(r.error.code,'BUSINESS_IDENTITY_REQUIRED');assert.equal(r.data,undefined);
  }
  assert.equal((await rpc('govagentsec.trajectory.list')).ok,false);
  const anonymous=await rpc('govagentsec.trajectory.workspace');assert(anonymous.ok);assert.deepEqual(anonymous.data.pending,[]);assert.deepEqual(anonymous.data.traces,[]);assert.deepEqual(anonymous.data.servers,[]);check('anonymous-trace-denied-and-workspace-private-data-absent');
  const route=routes.find(r=>r.path==='/plugins/govagentsec/trajectories');let code,body;
  await route.handler({method:'GET',url:route.path,headers:{}},{writeHead(n){code=n;},end(v){body=v;}});assert.equal(code,401);assert(!body.includes('event_hash'));check('legacy-http-private-data-denied');
  await bridge.request('enable');const officer=await login('jingban'),supervisor=await login('shenpi'),maintenance=await login('weihu');
  const assess={task_key:'expense-word-template',trace_ids:ids,judge:'heuristic'};
  assert((await rpc('govagentsec.trace.list',{bearer:officer})).ok);
  assert((await rpc('govagentsec.trajectory.list',{bearer:officer})).data.traces.length===1);
  const denied=await rpc('govagentsec.trace.assessmentStart',{...assess,bearer:officer,roles:['audit_reader']});assert.equal(denied.error.code,'BUSINESS_PERMISSION_DENIED');
  assert(store.list().every(t=>!t.assessment));check('officer-read-only-and-injected-role-cannot-assess');
  const started=await rpc('govagentsec.trace.assessmentStart',{...assess,bearer:supervisor});assert(started.ok);
  let state;for(let i=0;i<100;i++){state=(await rpc('govagentsec.trace.assessmentStatus',{job_id:started.data.job_id,bearer:supervisor})).data;if(state.status==='completed')break;await new Promise(r=>setTimeout(r,30));}
  assert.equal(state.status,'completed');assert.equal(state.completed,ids.length);assert(store.list().every(t=>t.assessment));check('supervisor-can-run-local-assessment-through-original-pipeline');
  assert.equal((await rpc('govagentsec.trace.admit',{candidate_id:'does-not-exist',bearer:supervisor})).error.code,'BUSINESS_PERMISSION_DENIED');
  const maintained=await rpc('govagentsec.trace.assessmentStart',{...assess,bearer:maintenance});assert(maintained.ok);check('maintenance-assess-and-supervisor-install-denied');
  await bridge.request('revoke',{},officer);const revoked=await rpc('govagentsec.trace.list',{bearer:officer});assert.equal(revoked.error.code,'BUSINESS_IDENTITY_REQUIRED');check('logout-revokes-rpc-access');
  report.passed=true;
}catch(e){report.error=e.message;process.exitCode=1;}finally{
  await bridge.request('disable').catch(()=>bridge.stop(true));if(previous===undefined)delete globalThis[key];else globalThis[key]=previous;
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,error:report.error,checks:report.checks.length,report:path.join(out,'report.json')}));
}
