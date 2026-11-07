// Real host chat.send only; never emits synthetic hooks or modifies security/identity configuration.
import { readFileSync,existsSync,mkdirSync,writeFileSync,statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { TraceStore } from '../modules/govagentsec-trace/store.mjs';
import { digest } from '../modules/govagentsec-trace/privacy.mjs';
import { configurationChecks,isLocalUrl } from './lib/trace_live_check.mjs';
import { PROMPTS,inspectEvolutionTrace,DOC_TOOL,NOTICE_TOOL } from './lib/real_evolution.mjs';

const [scenario='success',output='local-validation/real-evolution-capture']=process.argv.slice(2);
const agentId='gov-evolution-demo';
if(!Object.hasOwn(PROMPTS,scenario))throw Error('scenario must be success|recovery|d004');
mkdirSync(output,{recursive:true});
const report={source:'real-openclaw',synthetic:false,scenario,prompt_sha256:digest(PROMPTS[scenario]),passed:false,trace_id:null};
let browser,page,sessionKey,settled=false,stage='config';
const rpc=(method,params={})=>page.locator('openclaw-app-shell').evaluate((e,{method,params})=>e.context.gateway.snapshot.client.request(method,params),{method,params});
try{
  const configPath=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json');
  const config=JSON.parse(readFileSync(configPath,'utf8')),fingerprint=digest(config);
  const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
  if(JSON.parse(readFileSync(path.join(host,'package.json'),'utf8')).version!=='2026.7.1-2')throw Error('FIXED_VERSION_REQUIRED');
  const pre=configurationChecks(config,agentId,process.env,{existsSync,readFileSync});report.identity=pre.identity;
  if(!pre.identity.demo_loopback_static_dev)throw Error('THIS_DEMO_REQUIRES_EXPLICIT_LOOPBACK_TEST_IDENTITY');
  const ignored=new Set(['OIDC_MODE','OIDC_CREDENTIAL_CONFIGURED']);
  report.preflight=pre.checks;
  if(pre.checks.some(c=>!c.passed&&!ignored.has(c.code)))throw Error('PREFLIGHT_FAILED');
  const demoAgent=config.agents.list.find(a=>a.id===agentId);
  if(JSON.stringify([...(demoAgent.tools?.allow??[])].sort())!==JSON.stringify([DOC_TOOL,NOTICE_TOOL].sort())
    ||demoAgent.tools?.alsoAllow?.length||demoAgent.skills?.length!==0)throw Error('RESTRICTED_DEMO_AGENT_REQUIRED');
  if(!config.mcp.servers['agentguard-notices'].toolFilter.include.includes('list_notices'))throw Error('NOTICE_TOOL_FILTER_MISSING');
  stage='agentguard_ready';
  const ready=await(await fetch(pre.bridgeEnv.AGENTGUARD_MCP_BASE_URL+'/readyz',{signal:AbortSignal.timeout(5000),redirect:'error'})).json();
  if(!ready.ready)throw Error('AGENTGUARD_NOT_READY');
  const provider=config.models.providers.ollama;
  if(!provider||pre.primary!=='ollama/qwen3:8b'||!isLocalUrl(provider.baseUrl))throw Error('LOCAL_MODEL_REQUIRED');
  stage='local_model';
  const modelInfo=await(await fetch(new URL('/api/show',provider.baseUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'qwen3:8b'}),redirect:'error',signal:AbortSignal.timeout(10000)})).json();
  if(modelInfo.remote_model||modelInfo.remote_host||!modelInfo.model_info?.['general.parameter_count'])throw Error('LOCAL_WEIGHTS_REQUIRED');
  const port=config.gateway.port??18789;
  const processProbe=spawnSync('powershell.exe',['-NoProfile','-Command',
    "$ErrorActionPreference='Stop'; $owners=@(& netstat.exe -ano -p TCP | ForEach-Object { $p=$_.Trim() -split '\\s+'; if ($p.Length -eq 5 -and $p[1] -match (':'+$env:EVOLUTION_PORT+'$') -and $p[3] -eq 'LISTENING') { $p[4] } }); $starts=@($owners | Sort-Object -Unique | ForEach-Object { [DateTimeOffset](Get-Process -Id ([int]$_)).StartTime } | ForEach-Object { $_.ToUnixTimeMilliseconds() }); ConvertTo-Json -Compress -InputObject $starts"],
    {encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,EVOLUTION_PORT:String(port)}});
  const starts=JSON.parse(processProbe.stdout||'[]');
  if(!starts.length||starts.some(t=>t<statSync(configPath).mtimeMs))throw Error('RESTART_GATEWAY_AFTER_CONFIG');
  stage='browser_connect';
  const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
  browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage();
  await page.route('**/*',r=>isLocalUrl(r.request().url())?r.continue():r.abort());
  await page.goto(`http://127.0.0.1:${port}/#token=`+encodeURIComponent(config.gateway.auth.token));
  await page.waitForFunction(()=>!!document.querySelector('openclaw-app-shell')?.context?.gateway?.snapshot?.client,null,{timeout:45000});
  stage='trace_health';
  const health=await rpc('govagentsec.trace.health');
  if(!health.available||health.content_mode!=='hash')throw Error('TRACE_HASH_CAPTURE_REQUIRED');
  const beforeFailures=(health.failures?.length??0)+(health.capture_failures?.length??0);
  const store=new TraceStore(path.join(pre.traceConfig.dataDir,'traces'));
  const runId=randomUUID();sessionKey=`agent:${agentId}:typhoon-evolution-`+randomUUID();report.trace_id=runId;report.session_key=sessionKey;
  if(digest(JSON.parse(readFileSync(configPath,'utf8')))!==fingerprint)throw Error('CONFIG_CHANGED');
  stage='submit';
  const ack=await rpc('chat.send',{sessionKey,agentId,message:PROMPTS[scenario],thinking:'off',deliver:false,idempotencyKey:runId,timeoutMs:240000});
  if(ack.runId!==runId)throw Error('RUN_ID_MISMATCH');
  stage='await_run';
  const deadline=Date.now()+245000;let trace;
  while(Date.now()<deadline){
    // Do not open the live head anchor while Windows is replacing it. Wait through the host lifecycle RPC.
    const state=await rpc('agent.wait',{runId,timeoutMs:15000});
    if(state.status!=='timeout'){await new Promise(r=>setTimeout(r,3000));trace=store.read(runId);settled=true;break;}
  }
  if(!settled)throw Error('RUN_TIMEOUT');
  const afterHealth=await rpc('govagentsec.trace.health');
  if((afterHealth.failures?.length??0)+(afterHealth.capture_failures?.length??0)>beforeFailures)throw Error('CAPTURE_LOSS');
  report.inspection=inspectEvolutionTrace(trace,pre.bridgeEnv.AGENTGUARD_MCP_STATUS_STORE_FILE+'.requests');
  report.integrity=trace.integrity;report.trace_status=trace.summary.trace_status;
  report.passed=report.inspection.kind===scenario;
  if(!report.passed)report.error='SCENARIO_NOT_OBSERVED';
}catch(error){report.error=/^[A-Z_]+$/.test(error.message)?error.message:'COLLECTION_FAILED';report.error_type=error.name;report.failure_stage=stage;}
finally{
  if(report.trace_id&&!settled&&page){try{await rpc('chat.abort',{sessionKey,runId:report.trace_id});report.abort_requested=true;}catch{report.abort_requested=false;}}
  await browser?.close();report.exit_code=report.passed?0:1;
  const file=path.join(output,(report.trace_id??randomUUID())+'.json');writeFileSync(file,JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,trace_id:report.trace_id,scenario,error:report.error,report:file,inspection:report.inspection?.reason}));process.exitCode=report.exit_code;
}
