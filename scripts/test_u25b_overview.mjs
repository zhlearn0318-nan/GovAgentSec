// Real local demo JWT/delegation; synthetic audit files and local health server.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import runtimePlugin,{buildSnapshot} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/index.js';
import {DemoIdentityBridge} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs';
const out=path.resolve(process.argv[2]??path.join(fs.readFileSync('.runtime/u25-evidence-path.txt','utf8').trim(),'overview-rpc'));fs.mkdirSync(out,{recursive:true});
const report={passed:false,source:'real-local-jwt-synthetic-audit-local-health',synthetic_audit:true,checks:[]};
let requests=0,offline=false;
const server=http.createServer((req,res)=>{requests++;res.writeHead(offline?503:200,{'Content-Type':'application/json'});res.end(JSON.stringify(req.url==='/readyz'?{ready:!offline}:{status:offline?'offline':'ok'}));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const config={agentGuardBaseUrl:'http://127.0.0.1:'+server.address().port,identityMode:'loopback_static_dev',auditPath:path.join(out,'synthetic-audit.jsonl'),statusPath:path.join(out,'synthetic-status.json'),approvalPath:path.join(out,'synthetic-approvals.json')};
fs.writeFileSync(config.auditPath,['allow','require_approval','deny'].map((effect,i)=>JSON.stringify({event:'enforcement_decision',request_id:'synthetic-'+i,task_id:'synthetic-task',tool:'file.read',operation:'read',parameters:{text:'PRIVATE_SYNTHETIC_MARKER'},result:{policy_effect:effect,status:effect==='allow'?'executed_isolated':effect==='deny'?'blocked':'pending_approval',reason_code:'FIXTURE',receipt:effect==='allow'?{receipt_id:'synthetic-receipt'}:null}})).join('\n')+'\n');
fs.writeFileSync(config.statusPath,'[{},{}]');fs.writeFileSync(config.approvalPath,'[]');
const key=Symbol.for('govagentsec.demoIdentity.bridge'),previous=globalThis[key],bridge=new DemoIdentityBridge({root:path.join(out,'identity')});globalThis[key]=bridge;
const methods=new Map();runtimePlugin.register({pluginConfig:config,registerGatewayMethod:(name,handler,options)=>methods.set(name,{handler,options}),registerHttpRoute(){},on(){}});
const rpc=async params=>{let answer;await methods.get('govagentsec.runtime.overview').handler({params,respond:(ok,data,error)=>{answer={ok,data,error};}});return answer;};
const check=name=>report.checks.push(name);
try{
  assert.equal(methods.get('govagentsec.runtime.overview').options.scope,'operator.read');
  assert.equal((await rpc({})).ok,false);assert.equal(requests,0);check('anonymous-denied-before-service-or-audit-read');
  await bridge.request('enable');
  const passwords=Object.fromEntries([...fs.readFileSync('docs/OIDC_USAGE.md','utf8').matchAll(/\| (jingban|shenpi|weihu) \| ([^|]+?) \|/g)].map(m=>[m[1],m[2]]));
  const bearer='Bearer '+(await bridge.request('login',{account:'jingban',password:passwords.jingban})).access_token;
  assert.equal((await rpc({bearer,roles:['security_admin']})).error.code,'INVALID_REQUEST');assert.equal(requests,0);check('extra-fields-rejected-before-read');
  const result=await rpc({bearer});assert(result.ok);const original=await buildSnapshot(config);
  assert.deepEqual(result.data.counts,original.counts);assert.deepEqual(result.data.evidence,original.evidence);assert.equal(result.data.counts.total,3);
  assert.deepEqual(Object.keys(result.data).sort(),['counts','evidence','generated_at','services']);
  assert.deepEqual(Object.keys(result.data.services).sort(),['agentguard','dependencies','openclaw_mcp']);
  assert(!JSON.stringify(result.data).includes('PRIVATE_SYNTHETIC_MARKER'));assert(!JSON.stringify(result.data).includes(out));assert(!JSON.stringify(result.data).includes(bearer));
  assert(result.data.services.agentguard.available);assert(result.data.services.dependencies.available);assert.equal(result.data.services.openclaw_mcp.records,2);check('aggregate-matches-original-snapshot-no-bodies-paths-or-credentials');
  offline=true;const failure=await rpc({bearer});assert(failure.ok);assert.equal(failure.data.services.agentguard.available,false);assert.equal(failure.data.services.dependencies.available,false);check('service-failure-not-presented-as-healthy');
  await bridge.request('revoke',{},bearer);const before=requests;assert.equal((await rpc({bearer})).ok,false);assert.equal(requests,before);check('revoked-identity-denied-before-read');
  report.passed=true;
}catch(error){report.error=error.message;process.exitCode=1;}
finally{await bridge.request('disable').catch(()=>bridge.stop(true));if(previous===undefined)delete globalThis[key];else globalThis[key]=previous;await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,error:report.error,checks:report.checks.length,report:path.join(out,'report.json')}));}
