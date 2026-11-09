import {loginDemo} from './lib/identity-ui.mjs';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import net from 'node:net';
import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {configPath,sha,version} from './lib/config-recovery.mjs';
import {hostWorkspace} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/chat-acl.mjs';
const out=path.resolve(process.env.GOV_U14_EVIDENCE??'local-validation/u14-judge-chat-acl/'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});version();const baseline=fs.readFileSync(configPath()),live=JSON.parse(baseline);
const runtime=path.resolve('.runtime/u14',randomUUID());fs.mkdirSync(runtime,{recursive:true});
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw'),session='agent:main:u14-'+randomUUID();
const report={passed:false,source:'real-openclaw-chat-local-deterministic-provider',synthetic_model:true,production_oidc:false,external_requests:0,checks:[],screenshots:[],session};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const freePort=async()=>{const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
let gateway,browser,provider,rpc,identity;const credentials={};
const check=(id,detail={})=>report.checks.push({id,passed:true,...detail});
try{
 const gatewayPort=await freePort(),modelPort=await freePort();const base='http://127.0.0.1:'+gatewayPort;
 // No prompt/response logging. Fixed synthetic action after each new user turn.
 provider=http.createServer(async(req,res)=>{
  if(req.url!=='/v1/chat/completions'){res.writeHead(404);res.end();return;}
  try{
   const pieces=[];for await(const p of req)pieces.push(p);const body=JSON.parse(Buffer.concat(pieces));
   const messages=body.messages??[],lastUser=messages.findLastIndex(m=>m.role==='user');
   const didTool=messages.slice(lastUser+1).some(m=>m.role==='tool');
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
 assert.equal(pluginPaths.length,pluginIds.length);pluginPaths.push(path.resolve('scripts/fixtures/u14-read-counter'));
 const entries=Object.fromEntries(pluginIds.map(id=>[id,structuredClone(live.plugins.entries[id])]));
 entries['govagentsec-session-sandbox'].config.dataDir=path.join(runtime,'sandbox');
 for(const id of ['govagentsec-trajectory','govagentsec-trace'])entries[id].config.dataDir=path.join(runtime,id);
 for(const key of ['auditPath','statusPath','approvalPath'])entries['agentguard-runtime-security'].config[key]=path.join(runtime,key+'.json');
 entries['u14-read-counter']={enabled:true,hooks:{allowConversationAccess:true}};
 const config={gateway:{mode:'local',port:gatewayPort,bind:'loopback',auth:{mode:'token',token:randomUUID()},controlUi:{...live.gateway.controlUi,allowedOrigins:[base]}},
  models:{mode:'replace',providers:{'u14-local':{baseUrl:'http://127.0.0.1:'+modelPort+'/v1',apiKey:'synthetic-local-only',api:'openai-completions',models:[{id:'u14-fixture',name:'U14 本地确定性夹具',reasoning:false,input:['text'],contextWindow:128000,maxTokens:4096,cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}]}}},
  agents:{defaults:{model:{primary:'u14-local/u14-fixture',fallbacks:[]},workspace:path.join(runtime,'agent'),skipBootstrap:true,
   sandbox:{...live.agents.defaults.sandbox,backend:'srt',workspaceRoot:path.join(runtime,'workspaces')}}},
  tools:{profile:'coding',deny:['exec','process','write','edit','apply_patch','web_fetch','web_search','browser','sessions_spawn'],sandbox:{tools:{allow:['read'],deny:[]}}},
  plugins:{allow:[...pluginIds,'u14-read-counter'],load:{paths:pluginPaths},entries}};
 const cfg=path.join(runtime,'openclaw.json');fs.writeFileSync(cfg,JSON.stringify(config,null,2));
 const workspace=await hostWorkspace(config,{sessionKey:session,agentId:'main',workspaceDir:config.agents.defaults.workspace});
 for(const dir of ['A','B']){fs.mkdirSync(path.join(workspace,dir),{recursive:true});fs.writeFileSync(path.join(workspace,dir,'controlled.txt'),'SYNTHETIC DATA. Stock count: 3.');}
 const stdout=fs.openSync(path.join(runtime,'gateway.log'),'w'),stderr=fs.openSync(path.join(runtime,'gateway-error.log'),'w');
 gateway=spawn(process.execPath,[path.join(host,'dist/index.js'),'gateway','--port',String(gatewayPort)],{cwd:process.cwd(),windowsHide:true,
  env:{...process.env,OPENCLAW_CONFIG_PATH:cfg,OPENCLAW_STATE_DIR:path.join(runtime,'state'),OPENCLAW_NO_RESPAWN:'1'},stdio:['ignore',stdout,stderr]});
 for(let i=0;i<90;i++){if(gateway.exitCode!==null)throw Error('ISOLATED_GATEWAY_EXIT_'+gateway.exitCode);try{const r=await fetch(base,{signal:AbortSignal.timeout(1000)});if(r.ok)break;}catch{}await delay(1000);}
 const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1500,height:1000}});await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const page=await context.newPage();await page.goto(base+'/chat?session='+encodeURIComponent(session)+'#token='+encodeURIComponent(config.gateway.auth.token));
 await page.waitForFunction(()=>document.querySelector('openclaw-app-shell')?.context?.gateway?.snapshot?.client,null,{timeout:60000});
 rpc=(m,p={})=>page.locator('openclaw-app-shell').evaluate((el,{m,p})=>el.context.gateway.snapshot.client.request(m,p),{m,p});
 identity=(m,p={})=>rpc('govagentsec.demoIdentity.'+m,p);
 await identity('enable');for(const user of ['office-test','approver-test'])credentials[user]='Bearer '+(await identity('login',{user})).access_token;
 assert.equal((await identity('bind_session',{session_key:session,bearer:credentials['office-test']})).status,'ok');
 const settings=await context.newPage();await settings.goto(base+'/plugin?plugin=protect-agent&id=govagentsec&section=settings');
 const card=settings.locator('govagentsec-workspace').getByRole('region',{name:'演示身份源',exact:true});await card.waitFor({timeout:60000});
 assert.match(await card.innerText(),/演示（非生产）/);assert.doesNotMatch(await card.innerText(),/组织身份已启用/);
 await settings.screenshot({path:path.join(out,'01-honest-badge.png'),fullPage:true});report.screenshots.push('01-honest-badge.png');check('honest-badge');
 const run=async(message)=>{const id=randomUUID();await rpc('chat.send',{sessionKey:session,agentId:'main',message,thinking:'off',deliver:false,idempotencyKey:id,timeoutMs:360000});
  const deadline=Date.now()+360000;while(Date.now()<deadline){const c=await rpc('u14.counter');report.last_counter=c;if(c.ends.some(e=>e.run_id===id)){assert.equal(c.ends.find(e=>e.run_id===id).success,true);await delay(400);return c;}await delay(1000);}throw Error('CHAT_AGENT_END_TIMEOUT');};
 const shot=async(name)=>{if(/denied|replay/.test(name)){const button=page.locator('.chat-tool-msg-summary').last();await button.click();await delay(200);}
  await page.screenshot({path:path.join(out,name),fullPage:true});report.screenshots.push(name);};
 let counter=await run('U14 合成回归任务：只允许读取 /workspace/A/controlled.txt。执行一次读取并报告真实工具回执。');
 let state=await identity('status',{bearer:credentials['office-test']}),task=state.tasks.at(-1),denied=state.requests.at(-1);
 assert(task.task_id&&/^[a-f0-9]{64}$/.test(task.scope_digest));check('chat-scope',{task_id:task.task_id,scope_digest:task.scope_digest});
 assert.equal(denied.reason_code,'P014_RESOURCE_OUTSIDE_TASK');assert.equal(counter.reads,0);check('deny-out-of-scope',{read_count:counter.reads});await shot('02-chat-denied.png');
 assert.equal((await identity('task_escalate',{request_id:denied.request_id,bearer:credentials['office-test']})).status,'pending_approval');
 await loginDemo(settings,'approver-test');
 await settings.screenshot({path:path.join(out,'03-approval-queue.png'),fullPage:true});report.screenshots.push('03-approval-queue.png');
 assert.equal((await identity('resolve',{request_id:denied.request_id,resolution:'approve',bearer:credentials['office-test']})).reason_code,'D105_SELF_APPROVAL');check('self-approve-deny');
 await card.getByRole('button',{name:'批准本次重试',exact:true}).click();
 await card.getByRole('status').filter({hasText:'已批准，等待原任务重试'}).waitFor();
 assert.equal((await rpc('u14.counter')).reads,0);check('approve-does-not-read');
 counter=await run('重试刚批准的原动作，报告真实工具回执。');assert(counter.reads>0);assert.equal(counter.completed,counter.reads);
 const successfulReads=counter.tool_results.filter(t=>t.tool==='read'&&t.success).length;assert.equal(successfulReads,1);
 const allowedReads=counter.reads;check('approve-once',{read_count:allowedReads,successful_tool_calls:successfulReads});await shot('04-chat-once.png');
 counter=await run('再次重试同一个原动作，报告真实工具回执。');assert.equal(counter.reads,allowedReads);assert.equal(counter.completed,allowedReads);
 assert.equal(counter.tool_results.filter(t=>t.tool==='read'&&t.success).length,1);
 state=await identity('status',{bearer:credentials['office-test']});const replay=state.audit.findLast(x=>x.event==='chat.tool_gate');
 assert.equal(replay.status,'blocked');assert.match(replay.reason_code,/^G20[46]_/);check('replay-reject',{read_count:counter.reads,reason_code:replay.reason_code,expiry_precedes_ledger_check:replay.reason_code==='G204_TICKET_EXPIRED'});await shot('05-chat-replay.png');
 report.passed=true;
}catch(e){report.error=String(e.message).replaceAll(live.gateway.auth.token,'[REDACTED]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED]');process.exitCode=1;if(browser){const p=browser.contexts()[0]?.pages().at(-1);await p?.screenshot({path:path.join(out,'FAILED-page.png'),fullPage:true}).catch(()=>{});}}finally{
 if(identity)try{await identity('disable');}catch{report.cleanup_error='demo-disable-failed';report.passed=false;process.exitCode=1;}
 await browser?.close();if(gateway?.pid)spawnSync('taskkill',['/PID',String(gateway.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});if(provider){provider.closeAllConnections();await new Promise(r=>provider.close(r));}
 report.config_unchanged=sha(baseline)===sha(fs.readFileSync(configPath()));if(!report.config_unchanged){report.passed=false;process.exitCode=1;}
 report.runtime_logs=runtime;fs.writeFileSync(path.join(out,'chat-live-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,report:path.join(out,'chat-live-report.json'),error:report.error}));
}
process.exit(process.exitCode??0);
