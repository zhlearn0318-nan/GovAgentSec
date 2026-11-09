// Real fixed OpenClaw + local Ollama + isolated AgentGuard. No model fixture.
// Only synthetic registered documents are read; the user's gateway config is read-only.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {configPath,sha,version} from './lib/config-recovery.mjs';
import {goWorkspace,identityView} from './lib/identity-ui.mjs';
import {isLocalUrl} from './lib/trace_live_check.mjs';
import {TraceStore} from '../modules/govagentsec-trace/store.mjs';
import {contentEvidence} from '../modules/govagentsec-trace/privacy.mjs';

const out=path.resolve(process.argv[2]??'local-validation/u24-task-materials/'+new Date().toISOString().replace(/[:.]/g,'-')+'/live');
fs.mkdirSync(out,{recursive:true});version();
const baseline=fs.readFileSync(configPath()),live=JSON.parse(baseline);
const runtime=path.resolve('.runtime/u24-materials',randomUUID());fs.mkdirSync(runtime,{recursive:true});
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
const group=path.resolve('modules/agentguard-group2'),python=path.join(group,'.venv/Scripts/python.exe');
const DOC='agentguard-notices__read_gov_document',NOTICE='agentguard-notices__list_notices';
const session='agent:main:u24-materials-'+randomUUID(),runId=randomUUID();
const report={source:'real-openclaw-local-ollama-isolated-mcp',synthetic_model:false,synthetic_business_data:true,
 production_oidc:false,identity:'demo_idp_verified_jwt task gate + loopback_static_dev isolated MCP (non-production)',
 passed:false,checks:[],screenshots:[],external_browser_requests:0,session_key:session,trace_id:runId};
const secrets=[live.gateway.auth.token],delay=ms=>new Promise(r=>setTimeout(r,ms));
const check=(id,detail={})=>report.checks.push({id,passed:true,...detail});
const freePort=async()=>{const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
const initialContainers=new Set();let gateway,service,browser,identity,rpc,stage='preflight',config;
const startChild=(file,args,cwd,env,label)=>spawn(file,args,{cwd,env,windowsHide:true,stdio:['ignore',
 fs.openSync(path.join(runtime,label+'.log'),'w'),fs.openSync(path.join(runtime,label+'-error.log'),'w')]});
const waitHttp=async(base,child,ready=false)=>{for(let i=0;i<90;i++){
 if(child.exitCode!==null)throw Error('ISOLATED_PROCESS_EXIT_'+child.exitCode);
 try{const r=await fetch(base+(ready?'/readyz':''),{signal:AbortSignal.timeout(1000),redirect:'error'});if(r.ok&&(!ready||(await r.json()).ready===true))return;}catch{}
 await delay(1000);
}throw Error('LOCAL_SERVICE_TIMEOUT');};
try{
 const provider=structuredClone(live.models.providers.ollama);assert(isLocalUrl(provider?.baseUrl),'LOCAL_OLLAMA_REQUIRED');
 const modelInfo=await(await fetch(new URL('/api/show',provider.baseUrl),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'qwen3:8b'}),redirect:'error',signal:AbortSignal.timeout(10000)})).json();
 assert(!modelInfo.remote_model&&!modelInfo.remote_host&&modelInfo.model_info?.['general.parameter_count'],'LOCAL_WEIGHTS_REQUIRED');
 provider.models=provider.models.filter(m=>m.id==='qwen3:8b');assert.equal(provider.models.length,1);check('local-qwen-weights-no-remote-provider');
 const containers=spawnSync('docker',['ps','-aq'],{windowsHide:true,encoding:'utf8',timeout:10000});assert.equal(containers.status,0,'DOCKER_REQUIRED');
 for(const id of containers.stdout.trim().split(/\s+/).filter(Boolean))initialContainers.add(id);
 const servicePort=await freePort(),gatewayPort=await freePort(),base='http://127.0.0.1:'+gatewayPort,guardBase='http://127.0.0.1:'+servicePort;
 const env={...process.env};for(const key of Object.keys(env))if(key.startsWith('AGENTGUARD_'))delete env[key];
 Object.assign(env,{PYTHONUTF8:'1',AGENTGUARD_TICKET_SECRET_HEX:randomBytes(32).toString('hex'),AGENTGUARD_ALLOW_DEVELOPMENT_IDENTITY:'true'});
 stage='isolated-agentguard';service=startChild(python,['-m','service','--host','127.0.0.1','--port',String(servicePort),'--opa-mode','cli','--state-dir',path.join(runtime,'guard-state'),'--enable-local-adapters'],group,env,'agentguard');
 await waitHttp(guardBase,service,true);check('isolated-agentguard-ready');
 const subjectFile=path.join(runtime,'synthetic-subject.json');fs.writeFileSync(subjectFile,JSON.stringify({id:'office-test',department:'office',roles:['office_user'],clearance:1,mfa:true}));
 const pluginIds=['agentguard-runtime-security','protect-agent','govagentsec-session-sandbox','govagentsec-trajectory','govagentsec-trace'];
 const pluginPaths=live.plugins.load.paths.filter(p=>{try{return pluginIds.includes(JSON.parse(fs.readFileSync(path.join(p,'openclaw.plugin.json'))).id);}catch{return false;}});
 assert.equal(pluginPaths.length,pluginIds.length);
 const entries=Object.fromEntries(pluginIds.map(id=>[id,structuredClone(live.plugins.entries[id])]));
 entries['govagentsec-session-sandbox'].config.dataDir=path.join(runtime,'sandbox');
 for(const id of ['govagentsec-trajectory','govagentsec-trace'])entries[id].config.dataDir=path.join(runtime,id);
 entries['govagentsec-trace'].config.contentMode='hash';entries['govagentsec-trace'].config.usageWrapper={enabled:false};
 const guard=entries['agentguard-runtime-security'].config;guard.agentGuardBaseUrl=guardBase;
 for(const key of ['auditPath','statusPath','approvalPath'])guard[key]=path.join(runtime,key+'.json');
 const mcp={command:python,args:['-m','integrations.openclaw_mcp'],cwd:group,enabled:true,
  env:{AGENTGUARD_MCP_BASE_URL:guardBase,AGENTGUARD_MCP_IDENTITY_MODE:'loopback_static_dev',AGENTGUARD_MCP_DEV_SUBJECT_FILE:subjectFile,AGENTGUARD_MCP_STATUS_STORE_FILE:guard.statusPath},
  requestTimeoutMs:20000,connectionTimeoutMs:20000,supportsParallelToolCalls:false,toolFilter:{include:['read_gov_document','list_notices']}};
 config={gateway:{mode:'local',port:gatewayPort,bind:'loopback',auth:{mode:'token',token:randomUUID()},controlUi:{...live.gateway.controlUi,allowedOrigins:[base]}},
  models:{mode:'replace',providers:{ollama:provider}},mcp:{servers:{'agentguard-notices':mcp}},
  agents:{defaults:{model:{primary:'ollama/qwen3:8b',fallbacks:[]},workspace:path.join(runtime,'agent'),skipBootstrap:true,
   sandbox:{...live.agents.defaults.sandbox,backend:'docker',workspaceRoot:path.join(runtime,'workspaces')}},list:[{id:'main',skills:[],tools:{allow:[DOC,NOTICE]}}]},
  tools:{profile:'coding',elevated:{enabled:false},allow:[DOC,NOTICE],sandbox:{tools:{allow:[DOC,NOTICE],deny:[]}}},
  plugins:{allow:pluginIds,load:{paths:pluginPaths},entries}};
 secrets.push(config.gateway.auth.token);const cfg=path.join(runtime,'openclaw.json');fs.writeFileSync(cfg,JSON.stringify(config,null,2));
 stage='isolated-openclaw';gateway=startChild(process.execPath,[path.join(host,'dist/index.js'),'gateway','--port',String(gatewayPort)],process.cwd(),
  {...process.env,OPENCLAW_CONFIG_PATH:cfg,OPENCLAW_STATE_DIR:path.join(runtime,'state'),OPENCLAW_NO_RESPAWN:'1'},'gateway');
 await waitHttp(base,gateway);check('fixed-host-isolated-gateway-started');
 const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1500,height:1050},permissions:['clipboard-read','clipboard-write']});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();report.external_browser_requests++;return route.abort();});
 const page=await context.newPage();page.setDefaultTimeout(25000);
 await page.goto(base+'/chat?session='+encodeURIComponent(session)+'#token='+encodeURIComponent(config.gateway.auth.token));
 await page.waitForFunction(()=>document.querySelector('openclaw-app-shell')?.context?.gateway?.snapshot?.client,null,{timeout:60000});
 rpc=(method,params={})=>page.locator('openclaw-app-shell').evaluate((el,{method,params})=>el.context.gateway.snapshot.client.request(method,params),{method,params});
 identity=(op,p={})=>rpc('govagentsec.demoIdentity.'+op,p);
 const work=page.locator('govagentsec-workspace'),shot=async name=>{await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});report.screenshots.push(name+'.png');};
 stage='real-material-rpc-ui';assert.equal((await identity('status')).enabled,false);
 await goWorkspace(page,'settings');await work.getByRole('button',{name:'开启演示身份源',exact:true}).click();
 await goWorkspace(page,'login');await work.getByRole('combobox',{name:'选择演示用户'}).selectOption('office-test');
 await work.getByRole('button',{name:'进入工作台',exact:true}).click();
 await work.getByRole('button',{name:'以当前身份开始任务',exact:true}).click();await work.getByRole('button',{name:'确认绑定当前任务',exact:true}).click();
 await work.getByRole('checkbox',{name:'公开台风预案',exact:true}).waitFor();assert(await work.getByRole('checkbox',{name:'指挥中心联络表',exact:true}).isDisabled());
 for(const label of ['公开台风预案','应急物资清单'])await work.getByRole('checkbox',{name:label,exact:true}).check();
 await work.getByRole('button',{name:'确认本次只读材料',exact:true}).click();
 const draftBox=work.getByRole('textbox',{name:'本次任务指令'});await draftBox.waitFor();
 const draft=await draftBox.inputValue();assert(draft.includes('emergency_plan')&&draft.includes('material_inventory'));
 await work.getByRole('button',{name:'复制任务指令',exact:true}).click();await work.getByText('已复制。返回对话核对后发送，尚未发起模型调用。',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),draft);
 const materialState=await identityView(page,'materials',{session_key:session});assert.deepEqual(materialState.selected,['emergency_plan','material_inventory']);
 const forbidden=await identityView(page,'select_materials',{session_key:session,material_ids:['emergency_plan','command_contacts']});assert.equal(forbidden.status,'blocked');
 assert.deepEqual((await identityView(page,'materials',{session_key:session})).selected,materialState.selected);
 report.materials={selected:materialState.selected,denied_selection_reason:forbidden.reason_code};check('registered-rpc-two-materials-confirmed-and-unauthorized-atomic-rejection');
 check('real-ui-draft-clipboard-with-confirmed-IDs');await shot('01-materials-confirmed');
 const prompt=draft+'\n本次演示请依次调用 agentguard-notices__read_gov_document(document_id="emergency_plan")、agentguard-notices__read_gov_document(document_id="material_inventory")，然后调用 agentguard-notices__list_notices(limit=1)。完成这三次读取后直接输出简报，不再调用其他工具。';
 fs.writeFileSync(path.join(out,'confirmed-task.txt'),prompt);report.prompt_sha256=sha(prompt);
 const health=await rpc('govagentsec.trace.health');assert.equal(health.content_mode,'hash');
 stage='local-model-business-run';const started=Date.now();
 const ack=await rpc('chat.send',{sessionKey:session,agentId:'main',message:prompt,thinking:'off',deliver:false,idempotencyKey:runId,timeoutMs:300000});assert.equal(ack.runId,runId);
 const store=new TraceStore(path.join(entries['govagentsec-trace'].config.dataDir,'traces'));let ended=false;
 while(Date.now()-started<310000){const state=await rpc('agent.wait',{runId,timeoutMs:15000});if(state.status!=='timeout'){report.agent_state=state;ended=true;break;}}
 assert(ended,'LOCAL_MODEL_RUN_TIMEOUT');await delay(2500);report.duration_ms=Date.now()-started;
 stage='trace-receipt-validation';const detail=store.read(runId),events=detail.events??[];
 report.integrity=detail.integrity;report.event_count=events.length;report.event_types=[...new Set(events.map(e=>e.event_type))];
 assert.equal(detail.integrity?.valid,true);assert(events.some(e=>e.event_type==='run.started'));assert(events.some(e=>e.event_type==='run.ended'&&e.payload.success));
 const models=events.filter(e=>['model.output','model.started','model.ended'].includes(e.event_type));assert(models.length);assert(models.every(e=>e.payload.provider==='ollama'&&e.payload.model==='qwen3:8b'));
 check('same-run-real-model-start-end-valid-hash');
 const calls=events.filter(e=>e.event_type==='tool.started'),results=events.filter(e=>e.event_type==='tool.ended');report.tools=results.map(e=>({tool:e.payload.tool,failed:e.payload.failed,control_status:e.payload.control_status,request_id:e.request_id,task_id:e.task_id}));
 assert(results.filter(e=>e.payload.tool===DOC&&e.payload.correlation_verified).length>=2);
 assert(results.some(e=>e.payload.tool===NOTICE&&e.payload.correlation_verified));
 check('real-mcp-calls-with-authentic-correlated-receipts');
 fs.writeFileSync(path.join(out,'trace.json'),JSON.stringify(detail,null,2));
 const userState=await identityView(page);const chatReceipts=userState.requests.filter(r=>r.scenario==='chat'&&r.run_id===runId);
 report.task_acl_receipts=chatReceipts.map(r=>({request_id:r.request_id,task_id:r.task_id,status:r.status,execution_status:r.execution_status}));
 const history=await rpc('chat.history',{sessionKey:session,limit:20});
 const final=(history.messages??[]).filter(m=>m.role==='assistant').map(m=>typeof m.content==='string'?m.content:(m.content??[]).filter(p=>p.type==='text').map(p=>p.text).join('\n')).filter(Boolean).at(-1);
 if(final){fs.writeFileSync(path.join(out,'observed-response.md'),'# 本地模型实际答复（工具状态以报告为准）\n\n'+final+'\n');report.observed_response={file:'observed-response.md',sha256:sha(final),characters:final.length};}
 await page.locator('openclaw-app-shell').evaluate((el,key)=>el.navigate('chat',{search:'?session='+encodeURIComponent(key)}),session);await delay(1200);await shot('02-real-response');
 await goWorkspace(page,'approvals');await work.getByRole('combobox',{name:'审批筛选'}).selectOption('mine');await shot('03-actual-execution-status');
 const pending=results.filter(e=>e.payload.control_status==='pending_approval');
 if(pending.length){
  report.pending_mcp_receipts=pending.map(e=>{const row=JSON.parse(fs.readFileSync(guard.statusPath+'.requests/'+e.request_id+'.json'));return {request_id:e.request_id,reason_code:row.reason_code,status:row.status,executed:row.executed};});
  assert(chatReceipts.filter(r=>r.execution_status==='pending_approval').length>=pending.length,'MCP_PENDING_MUST_NOT_CLAIM_EXECUTED');
  await work.getByText('业务服务仍在等待审批，尚未执行。',{exact:true}).first().waitFor();check('MCP-pending-correctly-displayed-as-not-executed');
  report.unfinished='The selected task scope is checked by the host; the separate MCP service has no trusted per-call delegation to that contract. P006 remains enforced. No cross-user action-hash bridge or reconstructed approval is used.';
 }
 for(const document_id of materialState.selected){
  const call=calls.find(e=>e.payload.tool===DOC&&e.payload.params?.sha256===contentEvidence({document_id}).sha256);assert(call,'MISSING_DOCUMENT_CALL_'+document_id);
  const result=results.find(e=>e.tool_call_id===call.tool_call_id);assert.equal(result?.payload.control_status,'executed_isolated');assert.equal(result?.payload.correlation_verified,true);
  const receipt=JSON.parse(fs.readFileSync(guard.statusPath+'.requests/'+result.request_id+'.json'));
  assert.equal(receipt.executed,true);assert.equal(receipt.request.action.parameters.document_id.value_hash,sha(JSON.stringify(document_id)));assert.equal(receipt.receipt.business_result.adapter,'isolated_synthetic_document');
 }
 assert(results.some(e=>e.payload.tool===NOTICE&&e.payload.control_status==='executed_isolated'&&e.payload.correlation_verified));
 check('actual-mcp-two-documents-plus-notice-joined-to-agentguard-receipts');
 assert(chatReceipts.filter(r=>r.execution_status==='succeeded').length>=3,'TASK_ACL_HOST_RECEIPTS_REQUIRED');check('per-material-task-contracts-and-host-success-receipts');
 assert(final&&final.length>30,'BUSINESS_BRIEF_MISSING');fs.writeFileSync(path.join(out,'typhoon-brief.md'),'# 合成材料台风简报\n\n'+final+'\n');report.business_output={file:'typhoon-brief.md',sha256:sha(final),characters:final.length};
 fs.writeFileSync(path.join(out,'trace.json'),JSON.stringify(detail,null,2));check('local-synthetic-business-brief-written');
 await page.locator('openclaw-app-shell').evaluate((el,key)=>el.navigate('chat',{search:'?session='+encodeURIComponent(key)}),session);await delay(1200);await shot('02-real-brief');
 await page.locator('govagentsec-shell .inspect').click();await page.locator('govagentsec-shell').getByRole('region',{name:'轨迹审计',exact:true}).waitFor();await delay(1500);await shot('03-real-trace');
 assert.equal(report.external_browser_requests,0);report.passed=true;
}catch(e){report.failure_stage=stage;report.error=secrets.reduce((s,key)=>key?s.replaceAll(key,'[REDACTED]'):s,String(e.message)).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED]');process.exitCode=1;
 if(browser){const page=browser.contexts()[0]?.pages()[0];await page?.screenshot({path:path.join(out,'FAILED-page.png'),fullPage:true}).catch(()=>{});}
}finally{
 if(identity)try{await identity('disable');}catch{report.cleanup_error='isolated-identity-disable-failed';}
 await browser?.close();for(const child of [gateway,service])if(child?.pid)spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
 const after=spawnSync('docker',['ps','-aq'],{windowsHide:true,encoding:'utf8',timeout:10000});report.test_containers_cleaned=[];
 if(after.status===0)for(const id of after.stdout.trim().split(/\s+/).filter(Boolean)){
  if(initialContainers.has(id))continue;const inspected=spawnSync('docker',['inspect',id],{windowsHide:true,encoding:'utf8',timeout:10000});if(inspected.status!==0)continue;
  const container=JSON.parse(inspected.stdout)[0],marker='/.runtime/u24-materials/'+path.basename(runtime).toLowerCase()+'/';
  if(!container.Mounts?.some(m=>m.Destination==='/workspace'&&String(m.Source).replaceAll('\\','/').toLowerCase().includes(marker)))continue;
  const removed=spawnSync('docker',['rm','-f',id],{windowsHide:true,stdio:'ignore',timeout:10000}).status===0;report.test_containers_cleaned.push({id,removed});if(!removed){report.cleanup_error='test-container-remove-failed';}
 }
 report.main_config_unchanged=sha(baseline)===sha(fs.readFileSync(configPath()));if(!report.main_config_unchanged||report.cleanup_error){report.passed=false;process.exitCode=1;}
 const observed=id=>report.checks.some(c=>c.id===id&&c.passed);
 report.components={business_complete:report.passed?'PASS':'FAIL',material_selection:observed('registered-rpc-two-materials-confirmed-and-unauthorized-atomic-rejection')?'PASS':'NOT_VERIFIED',
  capture_start_model_end:observed('same-run-real-model-start-end-valid-hash')?'PASS':'NOT_VERIFIED',hash_chain:report.integrity?.valid?'PASS':'NOT_VERIFIED',
  real_mcp_calls:observed('real-mcp-calls-with-authentic-correlated-receipts')?'PASS':'NOT_VERIFIED',
  pending_not_misreported_as_executed:observed('MCP-pending-correctly-displayed-as-not-executed')?'PASS':'NOT_APPLICABLE'};
 report.runtime_logs=runtime;fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 fs.writeFileSync(path.join(out,'README.md'),'# 本地真实选材业务链\n\n来源：固定 OpenClaw + Ollama qwen3:8b + 独立 AgentGuard MCP；业务数据为合成资料，身份非生产。\n\n复跑：`node scripts/test_u24_materials_live.mjs`。结果以 report.json 为准；失败不当作通过。网关配置是否未变：'+report.main_config_unchanged+'。\n');
 console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json'),failure_stage:report.failure_stage,error:report.error}));
}
process.exit(process.exitCode??0);
