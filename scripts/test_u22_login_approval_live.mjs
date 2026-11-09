import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import net from 'node:net';
import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {configPath,sha,version} from './lib/config-recovery.mjs';
import {hostWorkspace} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/chat-acl.mjs';
import {goWorkspace,identityView} from './lib/identity-ui.mjs';
import {parsePluginConfig} from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/client.mjs';
const out=path.resolve(process.env.GOV_U22_EVIDENCE??'local-validation/u22-login-approval-path/'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});version();const baseline=fs.readFileSync(configPath()),live=JSON.parse(baseline);
const runtime=path.resolve('.runtime/u22',randomUUID());fs.mkdirSync(runtime,{recursive:true});
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw'),session='agent:main:u22-'+randomUUID();
const report={passed:false,source:'u22-real-openclaw-ui-local-deterministic-provider',sandbox:'docker',read_observation:'host-validated-native-file-bridge',synthetic_model:true,production_oidc:false,external_requests:0,checks:[],screenshots:[],session};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const freePort=async()=>{const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
let gateway,browser,provider,rpc,identity;const credentials={},secrets=[live.gateway.auth.token],initialContainers=new Set();
let protectionOnly=false;
const check=(id,detail={})=>report.checks.push({id,passed:true,...detail});
try{
 const protection=parsePluginConfig(live.plugins.entries['protect-agent'].config);
 const ready=await fetch(protection.baseUrl+'/readyz',{headers:{Authorization:'Bearer '+fs.readFileSync(protection.tokenFile,'utf8').trim()},signal:AbortSignal.timeout(10000)});
 assert(ready.ok&&(await ready.json()).ready===true,'LOCAL_PROTECTION_NOT_READY');check('protection-service-ready');
 const dockerImage=live.agents.defaults.sandbox.docker.image;
 assert.equal(spawnSync('docker',['image','inspect',dockerImage],{windowsHide:true,stdio:'ignore',timeout:10000}).status,0,'LOCAL_DOCKER_IMAGE_REQUIRED');
 const beforeContainers=spawnSync('docker',['ps','-aq'],{windowsHide:true,encoding:'utf8',timeout:10000});
 assert.equal(beforeContainers.status,0,'DOCKER_NOT_READY');for(const id of beforeContainers.stdout.trim().split(/\s+/).filter(Boolean))initialContainers.add(id);
 const gatewayPort=await freePort(),modelPort=await freePort();const base='http://127.0.0.1:'+gatewayPort;
 // No prompt/response logging. Fixed synthetic action after each new user turn.
 provider=http.createServer(async(req,res)=>{
  if(req.url!=='/v1/chat/completions'){res.writeHead(404);res.end();return;}
  try{
   const pieces=[];for await(const p of req)pieces.push(p);const body=JSON.parse(Buffer.concat(pieces));
   const messages=body.messages??[],lastUser=messages.findLastIndex(m=>m.role==='user');
   const didTool=protectionOnly||messages.slice(lastUser+1).some(m=>m.role==='tool');
   const calls=[{index:0,id:'call_'+randomUUID().replaceAll('-',''),type:'function',function:{name:'read',arguments:JSON.stringify({path:'/workspace/B/controlled.txt'})}}];
   const delta=didTool?{role:'assistant',content:'合成回归：本轮工具调用已结束，请查看实际工具回执和审批状态。'}:{role:'assistant',tool_calls:calls};
   const finish=didTool?'stop':'tool_calls';report.model_requests=(report.model_requests??0)+1;
   if(body.stream){res.writeHead(200,{'Content-Type':'text/event-stream'});
    for(const [d,f] of [[delta,null],[{},finish]])res.write('data: '+JSON.stringify({id:'u14-local',object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:'u14-fixture',choices:[{index:0,delta:d,finish_reason:f}]})+'\n\n');
    res.end('data: [DONE]\n\n');
   }else{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'u14-local',object:'chat.completion',model:'u14-fixture',choices:[{index:0,message:delta,finish_reason:finish}],usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0}}));}
  }catch{res.writeHead(500);res.end('fixture failure');}
 });await new Promise(r=>provider.listen(modelPort,'127.0.0.1',r));
 const pluginIds=['agentguard-runtime-security','protect-agent','govagentsec-session-sandbox','govagentsec-trajectory','govagentsec-trace'];
 const pluginPaths=live.plugins.load.paths.filter(p=>{try{return pluginIds.includes(JSON.parse(fs.readFileSync(path.join(p,'openclaw.plugin.json'))).id);}catch{return false;}});
 assert.equal(pluginPaths.length,pluginIds.length);pluginPaths.push(path.resolve('scripts/fixtures/u22-read-counter'));
 const entries=Object.fromEntries(pluginIds.map(id=>[id,structuredClone(live.plugins.entries[id])]));
 entries['govagentsec-session-sandbox'].config.dataDir=path.join(runtime,'sandbox');
 for(const id of ['govagentsec-trajectory','govagentsec-trace'])entries[id].config.dataDir=path.join(runtime,id);
 for(const key of ['auditPath','statusPath','approvalPath'])entries['agentguard-runtime-security'].config[key]=path.join(runtime,key+'.json');
 entries['u22-read-counter']={enabled:true,hooks:{allowConversationAccess:true},config:{}};
 const config={gateway:{mode:'local',port:gatewayPort,bind:'loopback',auth:{mode:'token',token:randomUUID()},controlUi:{...live.gateway.controlUi,allowedOrigins:[base]}},
  models:{mode:'replace',providers:{'u14-local':{baseUrl:'http://127.0.0.1:'+modelPort+'/v1',apiKey:'synthetic-local-only',api:'openai-completions',models:[{id:'u14-fixture',name:'U14 本地确定性夹具',reasoning:false,input:['text'],contextWindow:128000,maxTokens:4096,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]}}},
  agents:{defaults:{model:{primary:'u14-local/u14-fixture',fallbacks:[]},workspace:path.join(runtime,'agent'),skipBootstrap:true,
   sandbox:{...live.agents.defaults.sandbox,backend:'docker',workspaceRoot:path.join(runtime,'workspaces')}}},
  tools:{profile:'coding',elevated:{enabled:false},deny:['exec','process','write','edit','apply_patch','web_fetch','web_search','browser','sessions_spawn'],sandbox:{tools:{allow:['read'],deny:[]}}},
  plugins:{allow:[...pluginIds,'u22-read-counter'],load:{paths:pluginPaths},entries}};
 secrets.push(config.gateway.auth.token);
 const cfg=path.join(runtime,'openclaw.json');
 const workspace=await hostWorkspace(config,{sessionKey:session,agentId:'main',workspaceDir:config.agents.defaults.workspace});
 for(const dir of ['A','B']){fs.mkdirSync(path.join(workspace,dir),{recursive:true});fs.writeFileSync(path.join(workspace,dir,'controlled.txt'),'SYNTHETIC DATA. Stock count: 3.');}
 const targetFile=path.join(workspace,'B','controlled.txt'),expectedBytes=fs.readFileSync(targetFile);
 entries['u22-read-counter'].config.targetFile=targetFile;
 fs.writeFileSync(cfg,JSON.stringify(config,null,2));
 const stdout=fs.openSync(path.join(runtime,'gateway.log'),'w'),stderr=fs.openSync(path.join(runtime,'gateway-error.log'),'w');
 gateway=spawn(process.execPath,[path.join(host,'dist/index.js'),'gateway','--port',String(gatewayPort)],{cwd:process.cwd(),windowsHide:true,
  env:{...process.env,OPENCLAW_CONFIG_PATH:cfg,OPENCLAW_STATE_DIR:path.join(runtime,'state'),OPENCLAW_NO_RESPAWN:'1'},stdio:['ignore',stdout,stderr]});
 for(let i=0;i<90;i++){if(gateway.exitCode!==null)throw Error('ISOLATED_GATEWAY_EXIT_'+gateway.exitCode);try{const r=await fetch(base,{signal:AbortSignal.timeout(1000)});if(r.ok)break;}catch{}await delay(1000);}
 const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));browser=await chromium.launch({channel:'msedge',headless:true});

 const contexts=[];
 const openPage=async()=>{
   const context=await browser.newContext({viewport:{width:1500,height:1000}});contexts.push(context);
   await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();report.external_requests++;return route.abort();});
   const page=await context.newPage();page.setDefaultTimeout(20000);
   await page.goto(base+'/chat?session='+encodeURIComponent(session)+'#token='+encodeURIComponent(config.gateway.auth.token));
   await page.waitForFunction(()=>document.querySelector('openclaw-app-shell')?.context?.gateway?.snapshot?.client,null,{timeout:60000});
   return page;
 };
 const page=await openPage();
 const call=(p,m,params={})=>p.locator('openclaw-app-shell').evaluate((el,{m,params})=>el.context.gateway.snapshot.client.request(m,params),{m,params});
 rpc=(m,params={})=>call(page,m,params);identity=(m,params={})=>rpc('govagentsec.demoIdentity.'+m,params);
 const nav=goWorkspace;
 const work=p=>p.locator('govagentsec-workspace');
 const shot=async(p,name)=>{await p.screenshot({path:path.join(out,name+'.png'),fullPage:true});report.screenshots.push(name+'.png');};
 const scan=async(p,label)=>{
   await work(p).getByRole('region',{name:'演示身份源',exact:true}).waitFor();
   await work(p).getByText('正在读取本机记录…',{exact:true}).waitFor({state:'hidden'});
   const visible=await work(p).evaluate(el=>el.shadowRoot?.querySelector('main')?.innerText??'');
   const shell=await p.locator('govagentsec-shell').evaluate(el=>el.shadowRoot?.querySelector('.identity-strip')?.innerText??'');
   assert(visible.trim().length>50,label+' workspace copy is empty');assert(shell.trim().length>10,label+' identity strip is empty');
   const banned=(visible+'\n'+shell).match(/\bU\d+\b|\bPASS\b|\bFAIL\b|\bPARTIAL\b|本轮验收|仅本机验收|工程自检/g)??[];
   report.copy_scan??=[];report.copy_scan.push({page:label,workspace_characters:visible.trim().length,shell_characters:shell.trim().length,violations:[...new Set(banned)]});assert.deepEqual(banned,[],label+' has engineering copy');
 };
 const login=async(p,user)=>{
   await nav(p,'login');const card=work(p).getByRole('region',{name:'演示身份源',exact:true});
   await card.getByRole('combobox',{name:'选择演示用户'}).selectOption(user);
   await card.getByRole('button',{name:'进入工作台',exact:true}).click();
   await work(p).getByRole('heading',{name:'工作台',exact:true}).waitFor();
   await work(p).getByRole('button',{name:'以当前身份开始任务',exact:true}).waitFor();
 };
 const status=()=>identity('status',{bearer:credentials['auditor-test']});
 await nav(page,'login');
 const initial=await identity('status');assert.equal(initial.enabled,false);
 assert.equal((await identity('invoke',{scenario:'notice'})).reason_code,'DEMO_IDENTITY_DISABLED');
 await scan(page,'login');await shot(page,'01-login');
 await nav(page,'settings');await work(page).getByRole('button',{name:'开启演示身份源',exact:true}).click();
 await login(page,'office-test');
 await scan(page,'workbench');await shot(page,'02-workbench-identity');
 // Public verification roles do not replace either UI's page-memory delegate.
 for(const user of ['office-test','auditor-test'])credentials[user]='Bearer '+(await identity('login',{user})).access_token;
 assert.equal((await identity('task_create',{directory:'A',bearer:'Bearer '+config.gateway.auth.token})).http_status,401);
 assert.equal((await identity('task_create',{directory:'A'})).status,'blocked');check('gateway-is-not-business-identity');
 await work(page).getByRole('button',{name:'以当前身份开始任务',exact:true}).click();
 await work(page).getByRole('button',{name:'确认绑定当前任务',exact:true}).click();
 await work(page).getByText(/已绑定|绑定成功/).first().waitFor();
 assert.equal(await work(page).getByRole('textbox',{name:'绑定聊天会话'}).count(),0);
 await shot(page,'03-current-task-bound');check('bind-current-chat-without-key-entry');
 const run=async(message)=>{
   const started=Date.now(),previous=(await rpc('u14.counter')).ends.length;
   const turn={index:(report.turns??=[]).length+1,started_at:new Date(started).toISOString()};report.turns.push(turn);
   await page.locator('openclaw-app-shell').evaluate((el,session)=>el.navigate('chat',{search:'?session='+encodeURIComponent(session)}),session);
   const draft=page.locator('openclaw-chat-pane textarea').first();await draft.waitFor();await draft.fill(message);await draft.press('Enter');
   const deadline=Date.now()+180000;
   while(Date.now()<deadline){const c=await rpc('u14.counter');report.last_counter=c;
    turn.duration_ms=Date.now()-started;turn.reads_started=c.reads;turn.reads_completed=c.completed;
    if(c.ends.length>previous){turn.success=c.ends.at(-1).success;assert.equal(turn.success,true);return c;}await delay(500);
   }throw Error('CHAT_AGENT_END_TIMEOUT');
 };
 let counter=await run('台风值班任务：只允许读取 /workspace/A/controlled.txt。请读取材料并报告结果。');
 let state=await status(),task=state.tasks.at(-1),denied=state.requests.findLast(r=>r.scenario==='chat');
 assert(task?.task_id);assert.equal(denied.reason_code,'P014_RESOURCE_OUTSIDE_TASK');assert.equal(counter.reads,0);
 assert.equal(denied.session_key,session);check('A-only-scope-B-denied-with-zero-read',{task_id:task.task_id});
 await nav(page,'approvals');await work(page).getByRole('combobox',{name:'审批筛选'}).selectOption('mine');let record=work(page).locator('article[data-request-id="'+denied.request_id+'"]');
 await record.getByRole('button',{name:'申请一次性扩权',exact:true}).click();
 await record.getByRole('button',{name:'批准本次重试',exact:true}).waitFor();assert(await record.getByRole('button',{name:'批准本次重试',exact:true}).isDisabled());
 assert.equal((await identity('resolve',{request_id:denied.request_id,bearer:credentials['office-test'],resolution:'approve'})).reason_code,'D105_SELF_APPROVAL');
 await scan(page,'requester-approvals');await shot(page,'04-requester-pending');check('self-approval-disabled-and-server-denied');
 const approver=await openPage();await login(approver,'approver-test');await nav(approver,'approvals','&request='+encodeURIComponent(denied.request_id));
 const approval=work(approver).locator('article[data-request-id="'+denied.request_id+'"]');
 await approval.getByRole('button',{name:'批准本次重试',exact:true}).waitFor();
 await approval.getByText('涉及材料：工作区/B/controlled.txt',{exact:true}).waitFor();
 await approval.getByText('原只读范围：工作区/A/',{exact:true}).waitFor();
 check('approver-sees-original-A-scope-and-exact-B-target');
 await scan(approver,'approver-approvals');await shot(approver,'05-approver-pending');
 await approval.getByRole('button',{name:'批准本次重试',exact:true}).click();
 for(let i=0;i<30;i++){state=await status();if(state.requests.find(r=>r.request_id===denied.request_id)?.status==='authorized')break;await delay(100);}
 const granted=state.requests.find(r=>r.request_id===denied.request_id);assert.equal(granted.status,'authorized');assert.equal((await rpc('u14.counter')).reads,0);
 assert(granted.authorization_expires_at>Date.now()/1000);assert(granted.authorization_expires_at-Date.now()/1000<=60);
 check('approval-authorizes-without-execution-or-ttl-extension');
 await record.getByRole('button',{name:'返回原任务',exact:true}).click();
 await page.locator('openclaw-chat-pane textarea').first().waitFor();assert.equal(new URL(page.url()).searchParams.get('session'),session);
 counter=await run('重试刚批准的原动作，报告真实工具回执。');assert(counter.reads>0);assert.equal(counter.completed,counter.reads);
 assert.equal(counter.source,'fixed-host-docker-pinned-fd');
 const targetIdentity=fs.statSync(targetFile,{bigint:true});assert.equal(counter.target_identity.dev,String(targetIdentity.dev));assert.equal(counter.target_identity.ino,String(targetIdentity.ino));
 assert.equal(counter.hashes.length,counter.completed);assert.equal(counter.bytes,expectedBytes.length*counter.completed);assert(counter.hashes.every(hash=>hash===sha(expectedBytes)));
 const allowed=counter.reads;assert.equal(counter.tool_results.filter(r=>r.tool==='read'&&r.success).length,1);
 check('exact-original-session-once-only-retry',{read_count:allowed});await shot(page,'06-retry-result');
 counter=await run('再次重试同一个原动作，报告真实工具回执。');assert.equal(counter.reads,allowed);
 assert.equal(counter.tool_results.filter(r=>r.tool==='read'&&r.success).length,1);check('second-retry-denied-without-second-read');
 await nav(page,'approvals');await work(page).getByRole('combobox',{name:'审批筛选'}).selectOption('mine');record=work(page).locator('article[data-request-id="'+denied.request_id+'"]');
 await record.getByText('聊天工具申请 · 已执行成功',{exact:true}).waitFor();
 await page.locator('.dashboard-header__breadcrumb-current').getByText('待审批',{exact:true}).waitFor();
 await shot(page,'07-result-and-approval');
 state=await status();const completed=state.requests.find(r=>r.request_id===denied.request_id);assert.equal(completed.execution_status,'succeeded');
 check('execution-receipt-separate-from-authorization');
 const shell=page.locator('govagentsec-shell');
 await shell.locator('.inspect').click();
 await shell.getByText('审批回执与调用图同屏核对；未采集的审批以回执为准。',{exact:true}).waitFor();
 await shell.locator('.drawer-receipts').getByText('聊天工具申请 · 已执行成功',{exact:true}).waitFor();
 const graph=shell.getByRole('region',{name:'轨迹审计',exact:true});
 await graph.locator('.event[data-event-id]').first().waitFor();
 const traceId=await graph.getAttribute('data-trace-id'),detail=await rpc('govagentsec.trace.detail',{trace_id:traceId});
 assert.equal(detail.summary.session_key,session);
 const observedIds=new Set(detail.events.map(event=>event.event_id)),shownIds=await graph.locator('.event[data-event-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.eventId));
 assert(shownIds.length>0&&shownIds.every(id=>observedIds.has(id)));
 check('approval-receipt-beside-real-event-graph',{trace_id:traceId,observed_graph_nodes:shownIds.length,observed_approval_events:detail.events.filter(event=>event.event_type.startsWith('approval.')).length});
 await shot(page,'08-approval-receipt-and-real-graph');await shell.getByRole('button',{name:'关闭面板',exact:true}).click();
 await nav(page,'settings');await scan(page,'settings');await shot(page,'09-settings');
 // Deep links carry only a locator; an unlogged page has no execution authority.
 const anonymous=await openPage();await nav(anonymous,'approvals','&request='+encodeURIComponent(denied.request_id));
 assert.equal(await work(anonymous).getByRole('button',{name:'批准本次重试',exact:true}).count(),0);check('request-deeplink-grants-no-identity');
 // Verify browser storage contains no business JWT; gateway authentication storage is separate.
 for(const context of contexts)for(const p of context.pages()){
   const persisted=await p.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));
   assert.doesNotMatch(persisted,/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
 }
 check('no-business-bearer-in-browser-storage');
 await page.reload();await page.locator('openclaw-app-shell').waitFor();await nav(page,'login');
 await work(page).getByRole('button',{name:'进入工作台',exact:true}).waitFor();check('refresh-requires-business-login');
 await login(page,'office-test');await shell.getByRole('button',{name:'退出',exact:true}).click();
 await work(page).getByRole('heading',{name:'登录演示身份',exact:true}).waitFor();
 assert.equal((await identityView(page)).user,null);assert.equal((await identityView(page)).execution_enabled,false);
 check('logout-clears-page-delegation');await shot(page,'10-logged-out');
 if(process.env.GOV_U23_LIVE==='1'){
   const {u23Checks}=await import('./lib/u23-live-checks.mjs');
   await u23Checks({page,rpc,identity,out,shot,nav,report,request:completed,live,
     localModelOnly:()=>{protectionOnly=true;},modelRequests:()=>report.model_requests??0});
 }
 await identity('disable');await nav(approver,'settings');await work(approver).getByRole('button',{name:'开启演示身份源',exact:true}).waitFor();
 assert.equal((await identity('status')).enabled,false);check('global-disable-visible-and-fail-closed');
 await shot(approver,'11-ended');
 report.passed=true;
}catch(e){report.error=secrets.reduce((text,secret)=>text.replaceAll(secret,'[REDACTED]'),String(e.message)).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED]');process.exitCode=1;if(browser){const p=browser.contexts()[0]?.pages().at(-1);await p?.screenshot({path:path.join(out,'FAILED-page.png'),fullPage:true}).catch(()=>{});}}finally{
 if(identity)try{await identity('disable');}catch{report.cleanup_error='demo-disable-failed';report.passed=false;process.exitCode=1;}
 await browser?.close();if(gateway?.pid)spawnSync('taskkill',['/PID',String(gateway.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});if(provider){provider.closeAllConnections();await new Promise(r=>provider.close(r));}
 // Remove only containers this isolated test created, verified by the unique
 // runtime directory in their workspace mount. Other local containers stay out.
 const afterContainers=spawnSync('docker',['ps','-aq'],{windowsHide:true,encoding:'utf8',timeout:10000});
 report.test_containers_cleaned=[];
 if(afterContainers.status===0)for(const id of afterContainers.stdout.trim().split(/\s+/).filter(Boolean)){
  if(initialContainers.has(id))continue;
  const inspected=spawnSync('docker',['inspect',id],{windowsHide:true,encoding:'utf8',timeout:10000});
  if(inspected.status!==0)continue;
  const container=JSON.parse(inspected.stdout)[0],marker='/.runtime/u22/'+path.basename(runtime).toLowerCase()+'/';
  if(!container.Mounts?.some(m=>m.Destination==='/workspace'&&String(m.Source).replaceAll('\\','/').toLowerCase().includes(marker)))continue;
  const removed=spawnSync('docker',['rm','-f',id],{windowsHide:true,stdio:'ignore',timeout:10000}).status===0;
  report.test_containers_cleaned.push({id,removed});if(!removed){report.passed=false;report.cleanup_error='test-container-remove-failed';process.exitCode=1;}
 }
 report.config_unchanged=sha(baseline)===sha(fs.readFileSync(configPath()));if(!report.config_unchanged){report.passed=false;process.exitCode=1;}
 report.runtime_logs=runtime;fs.writeFileSync(path.join(out,'u22-live-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,report:path.join(out,'u22-live-report.json'),error:report.error}));
}
process.exit(process.exitCode??0);
