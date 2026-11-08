import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {loadRouting,openclawModelPatch,modelRoutingStatus} from '../modules/model-routing/routing.mjs';
import {OllamaLocalJudge,makeLocalJudge} from '../modules/govagentsec-trace/local-judges.mjs';
import {LocalJudge as LegacyJudge} from '../modules/trajectory-governance/local-judge.mjs';
import {TraceStore} from '../modules/govagentsec-trace/store.mjs';
import {createCalibrationFixtures,CALIBRATION_VERSION} from '../modules/govagentsec-trace/calibration-fixtures.mjs';
import {assess} from '../modules/govagentsec-trace/scoring.mjs';

const out=path.resolve('local-validation/model-routing',new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(out,{recursive:true});
const report={passed:false,source:'synthetic-local-routing-smoke',external_requests:0,
  session_smoke:'local-mock-not-cloud-connectivity',review_smoke:'local-Ollama-protocol-mock-and-heuristic',checks:[]};
const originalFetch=globalThis.fetch;
const hostConfigPath=path.join(process.env.USERPROFILE??'','.openclaw/openclaw.json');
const fingerprint=()=>existsSync(hostConfigPath)?createHash('sha256').update(readFileSync(hostConfigPath)).digest('hex'):null;
const before=fingerprint();
let server;
try {
  const policy=loadRouting(process.argv[2] || undefined),patch=openclawModelPatch(policy);
  assert.notEqual(patch.agents.defaults.model.primary,'ollama/qwen3:8b');
  assert.deepEqual(patch.agents.defaults.model.fallbacks,[]);
  assert.deepEqual(patch.models.providers[policy.session_llm.provider].apiKey,{source:'env',provider:'default',id:policy.session_llm.api_key_env});
  const host=path.join(process.env.APPDATA??'','npm/node_modules/openclaw');
  assert.equal(JSON.parse(readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
  const {validateConfigObjectRaw}=await import(pathToFileURL(path.join(host,'dist/config/config.js')));
  const checked=validateConfigObjectRaw(patch);
  assert.equal(checked.ok,true,JSON.stringify(checked.issues));
  const provider=patch.models.providers[policy.session_llm.provider];
  if(policy.session_llm.provider==='deepseek') {
    const {t:build}=await import(pathToFileURL(path.join(host,'dist/openai-transport-stream-B0WkSqXp.js')));
    const {a:levels}=await import(pathToFileURL(path.join(host,'dist/thinking-CSA4xwds.js')));
    for(const model of provider.models) {
      const m={...model,provider:'deepseek',api:provider.api,baseUrl:provider.baseUrl};
      assert(levels('deepseek',m.id,[m]).includes('xhigh'));
      for(const [input,wire] of [['none','none'],['low','low'],['high','high'],['xhigh','max']]) {
        const payload=build(m,{messages:[{role:'user',content:'SYNTHETIC TEST',timestamp:1}]},{reasoningEffort:input,maxTokens:16});
        assert.equal(payload.reasoning_effort,wire);
      }
    }
    report.checks.push('Flash/Pro selectable; pinned transport maps off/low/high/xhigh without network');
  }
  writeFileSync(path.join(out,'openclaw-model-patch.json'),JSON.stringify(patch,null,2));
  report.checks.push('fixed-host-schema-valid; API default; env SecretRef; no local auto fallback');

  const canary='SYNTHETIC_TRACE_DO_NOT_EXPORT',requests=[];
  server=createServer(async(req,res)=>{
    let text='';for await(const chunk of req)text+=chunk;
    const body=text?JSON.parse(text):{};requests.push({route:req.url,body});
    res.setHeader('Content-Type','application/json');
    if(req.url==='/v1/chat/completions') {
      assert.deepEqual(body.messages,[{role:'user',content:'SYNTHETIC_SMOKE_REPLY_OK'}]);
      assert.equal(body.model,policy.session_llm.model);
      res.end(JSON.stringify({choices:[{message:{role:'assistant',content:'OK'}}]}));
    } else if(req.url==='/api/show')res.end(JSON.stringify({model_info:{'general.architecture':'synthetic-test-weights','general.parameter_count':100}}));
    else if(req.url==='/api/chat') {
      const o=JSON.parse(body.messages[1].content);
      res.end(JSON.stringify({message:{content:JSON.stringify({...o.safety_floor,N:o.N,U:o.U,R:o.R,A_r:o.A_r,H:o.H,failure_status:o.failure_status,rationale:'synthetic local structured review'})}}));
    } else {res.statusCode=404;res.end('{}');}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const endpoint='http://127.0.0.1:'+server.address().port;
  // Block external transport before DNS. Mock replacement is test-only, never a production endpoint bypass.
  globalThis.fetch=(url,options)=>{
    if(new URL(url).origin!==endpoint){report.external_requests++;throw Error('external network forbidden by smoke harness');}
    return originalFetch(url,options);
  };
  const apiReply=await fetch(endpoint+'/v1/chat/completions',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({model:policy.session_llm.model,messages:[{role:'user',content:'SYNTHETIC_SMOKE_REPLY_OK'}]})});
  assert.equal((await apiReply.json()).choices[0].message.content,'OK');
  report.checks.push('synthetic API contract returns OK; no existing prompt or trace sent');

  const store=new TraceStore(path.join(out,'traces'));createCalibrationFixtures(store);
  const trace=store.read('calibration-normal_public');trace.events[0].payload.prompt=canary;
  const judge=new OllamaLocalJudge({endpoint,allowSynthetic:true,timeoutMs:5000});
  const scoring={allowSynthetic:true,t_star:.75,calibration_version:CALIBRATION_VERSION,calibrated:false};
  const assessment=await assess(trace,judge,scoring);
  assert.equal(judge.lastMode,'ollama');assert.equal(assessment.safety.decision,'pass');
  assert(!JSON.stringify(requests).includes(canary));
  assert.equal(requests.filter(r=>r.route==='/api/chat').length,1);
  report.local_assessment={S:assessment.safety.S,Q:assessment.quality.Q,source:assessment.source,synthetic:true};
  report.checks.push('review succeeds with external requests blocked before DNS; trace text absent from API mock');

  for(const endpoint of ['https://api.deepseek.com','http://localhost:11434','http://127.0.0.1.evil:11434','http://user:password@127.0.0.1:11434']){
    assert.throws(()=>new OllamaLocalJudge({endpoint}));assert.throws(()=>new LegacyJudge({endpoint}));
  }
  const count=requests.length;
  judge.endpoint='https://api.deepseek.com';await judge.review(trace);
  assert.equal(judge.lastMode,'heuristic-fallback');assert.equal(requests.length,count);assert.equal(report.external_requests,0);
  const legacy=new LegacyJudge();legacy.endpoint='https://api.deepseek.com';
  assert.equal((await legacy.review_safety({synthetic:canary})).status,'unknown');
  assert.equal(report.external_requests,0);
  report.checks.push('remote endpoint construction and post-construction mutation blocked in both judges');

  globalThis.fetch=async()=>{throw Error('all-network-disabled');};
  const offline=new OllamaLocalJudge({allowSynthetic:true,timeoutMs:100});
  const fallback=await assess(trace,offline,scoring);
  assert.equal(offline.lastMode,'heuristic-fallback');assert.equal(typeof fallback.quality.Q,'number');
  assert.match(fallback.source,/启发式/);
  report.offline_assessment={S:fallback.safety.S,Q:fallback.quality.Q,source:fallback.source};
  report.checks.push('all-network-disabled still gives explicitly labelled local heuristic assessment');

  let chatCalls=0;
  globalThis.fetch=async(url)=>{
    if(String(url).endsWith('/api/tags'))return new Response(JSON.stringify({models:[{name:'qwen3:4b',digest:legacy.expectedDigest}]}));
    if(String(url).endsWith('/api/show'))return new Response(JSON.stringify({remote_host:'https://cloud.invalid',remote_model:'cloud'}));
    chatCalls++;throw Error('evidence must not be sent');
  };
  legacy.endpoint='http://127.0.0.1:11435';
  assert.equal((await legacy.review_safety({synthetic:canary})).status,'unknown');
  await new OllamaLocalJudge({allowSynthetic:true}).review(trace);assert.equal(chatCalls,0);
  report.checks.push('cloud-backed Ollama rejected before evidence in both review paths');
  globalThis.fetch=originalFetch;

  // A local endpoint redirect must not turn into a remote evidence POST.
  const redirectServer=createServer((_req,res)=>{res.writeHead(307,{Location:'https://external.invalid/api/chat'});res.end();});
  await new Promise(r=>redirectServer.listen(0,'127.0.0.1',r));
  try {
    const redirected=new OllamaLocalJudge({endpoint:'http://127.0.0.1:'+redirectServer.address().port,allowSynthetic:true,timeoutMs:1000});
    await redirected.review(trace);assert.equal(redirected.lastMode,'heuristic-fallback');
  }finally{await new Promise(r=>redirectServer.close(r));}
  report.checks.push('real HTTP redirect rejected before cloud evidence request');

  const bad=structuredClone(policy);bad.external_review_enabled=true;
  const badFile=path.join(out,'invalid-policy.json');writeFileSync(badFile,JSON.stringify(bad));
  assert.throws(()=>loadRouting(badFile));assert(makeLocalJudge() instanceof OllamaLocalJudge);
  const fixture={gateway:{port:18789},plugins:{entries:{'protect-agent':{enabled:true}}},tools:{deny:['unsafe']},
    models:{providers:{ollama:{api:'ollama',baseUrl:'http://127.0.0.1:11434'}}},agents:{defaults:{model:{primary:'ollama/qwen3:8b'}}}};
  const configFile=path.join(out,'synthetic-openclaw.json');writeFileSync(configFile,JSON.stringify(fixture));
  const env={...process.env,[policy.session_llm.api_key_env]:'synthetic-test-key-never-used',GOVAGENTSEC_MODEL_ROUTING_CONFIG:path.resolve(process.argv[2]||'config/model-routing.json')};
  const applied=spawnSync(process.execPath,['scripts/apply_model_routing.mjs','--config',configFile],{env,encoding:'utf8',windowsHide:true});
  assert.equal(applied.status,0,applied.stderr);
  const merged=JSON.parse(readFileSync(configFile));assert.deepEqual(merged.plugins,fixture.plugins);assert.deepEqual(merged.tools,fixture.tools);
  for(const key of Object.keys(patch.agents.defaults.models))assert(merged.agents.defaults.models[key]);
  assert.deepEqual(merged.gateway,fixture.gateway);assert.deepEqual(merged.models.providers.ollama,fixture.models.providers.ollama);
  assert(!readFileSync(configFile,'utf8').includes('synthetic-test-key-never-used'));
  delete env[policy.session_llm.api_key_env];const unchanged=readFileSync(configFile,'utf8');
  const refused=spawnSync(process.execPath,['scripts/apply_model_routing.mjs','--config',configFile],{env,encoding:'utf8',windowsHide:true});
  assert.notEqual(refused.status,0);assert.equal(readFileSync(configFile,'utf8'),unchanged);
  report.checks.push('config application preserves hooks, tool rules, gateway and local model; no inline key');
  report.configured_default={session:patch.agents.defaults.model.primary,review:policy.security_review_llm.model};
  if(before)report.current_host=modelRoutingStatus(JSON.parse(readFileSync(hostConfigPath,'utf8')));
  report.gateway_config_unchanged=fingerprint()===before;assert(report.gateway_config_unchanged);
  report.passed=true;
}catch(e){report.error=String(e.message);process.exitCode=1;}
finally{
  globalThis.fetch=originalFetch;
  if(server)await new Promise(r=>server.close(r));
  writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json'),error:report.error}));
}
