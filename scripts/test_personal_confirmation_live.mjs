import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import net from 'node:net';
import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {randomUUID} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {configPath,sha,version} from './lib/config-recovery.mjs';
import {hostWorkspace} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/chat-acl.mjs';
import {goWorkspace,identityView,loginDemo} from './lib/identity-ui.mjs';
import {parsePluginConfig} from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/client.mjs';
const out=path.resolve(process.env.GOV_PERSONAL_EVIDENCE??'local-validation/personal-confirmation/'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});version();const baseline=fs.readFileSync(configPath()),live=JSON.parse(baseline);
const runtime=path.resolve('.runtime/u22',randomUUID());fs.mkdirSync(runtime,{recursive:true});
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw'),session='agent:main:u22-'+randomUUID();
const report={passed:false,source:'real-openclaw-current-identity-and-personal-confirmation',sandbox:'docker',read_observation:'host-validated-native-file-bridge',synthetic_model:true,production_oidc:false,external_requests:0,checks:[],screenshots:[],session};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const freePort=async()=>{const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
let gateway,browser,provider,rpc,identity;const credentials={},secrets=[live.gateway.auth.token],initialContainers=new Set();
let protectionOnly=false,modelTool='gov_read_document',modelArgs={document_id:'emergency_plan'};
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
   const calls=[{index:0,id:'call_'+randomUUID().replaceAll('-',''),type:'function',function:{name:modelTool,arguments:JSON.stringify(modelArgs)}}];
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
  tools:{profile:'coding',alsoAllow:['gov_read_document'],elevated:{enabled:false},deny:['exec','process','write','edit','apply_patch','web_fetch','web_search','browser','sessions_spawn'],sandbox:{tools:{allow:['read','gov_read_document'],deny:[]}}},
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
 rpc=(m,params={})=>call(page,m,m.startsWith('govagentsec.trace.')?{...params,bearer:credentials['auditor-test']}:params);
 identity=(m,params={})=>{if(m==='login'&&params.user){const accounts={'office-test':['jingban','Demo#Jingban26'],'approver-test':['shenpi','Demo#Shenpi26'],'maintenance-test':['weihu','Demo#Weihu26'],'auditor-test':['shenji','Demo#Shenji26']};const [account,password]=accounts[params.user];params={account,password};}return rpc('govagentsec.demoIdentity.'+m,params);};
 const nav=goWorkspace;
 const work=p=>p.locator('govagentsec-workspace');
 const shot=async(p,name)=>{await p.screenshot({path:path.join(out,name+'.png'),fullPage:true,animations:'disabled'});report.screenshots.push(name+'.png');};
 const scan=async(p,label)=>{
   await work(p).getByRole('region',{name:'演示身份源',exact:true}).waitFor();
   await work(p).getByText('正在读取本机记录…',{exact:true}).waitFor({state:'hidden'});
   const visible=await work(p).evaluate(el=>el.shadowRoot?.querySelector('main')?.innerText??'');
   const shell=await p.locator('govagentsec-shell').evaluate(el=>el.shadowRoot?.querySelector('.identity-strip')?.innerText??'');
   assert(visible.trim().length>50,label+' workspace copy is empty');assert(shell.trim().length>10,label+' identity strip is empty');
   const banned=(visible+'\n'+shell).match(/\bU\d+\b|\bPASS\b|\bFAIL\b|\bPARTIAL\b|本轮验收|仅本机验收|工程自检/g)??[];
   report.copy_scan??=[];report.copy_scan.push({page:label,workspace_characters:visible.trim().length,shell_characters:shell.trim().length,violations:[...new Set(banned)]});assert.deepEqual(banned,[],label+' has engineering copy');
 };
 const login=async(p,user)=>{await loginDemo(p,user,{returnToSettings:false});};
 const status=()=>identity('status',{bearer:credentials['auditor-test']});
 await nav(page,'login');
 const initial=await identity('status');assert.equal(initial.enabled,false);
 assert.equal((await identity('invoke',{scenario:'notice'})).reason_code,'DEMO_IDENTITY_DISABLED');
 await scan(page,'login');await shot(page,'01-login');
 await nav(page,'settings');await work(page).getByRole('button',{name:'开启演示身份源',exact:true}).click();
 await work(page).getByRole('button',{name:'去动态权限登录',exact:true}).click();
 const loginAccount=async(account,password)=>{
   await nav(page,'permissions');
   if((await identityView(page)).user)await work(page).getByRole('button',{name:'切换账号',exact:true}).click();
   await work(page).getByLabel('账号',{exact:true}).fill(account);await work(page).getByLabel('密码',{exact:true}).fill(password);
   await work(page).getByRole('button',{name:'登录',exact:true}).click();await work(page).getByRole('region',{name:'当前员工',exact:true}).waitFor();
 };
 await loginAccount('admin','Demo#Admin26');
 for(const user of ['maintenance-test','auditor-test'])credentials[user]='Bearer '+(await identity('login',{user})).access_token;
 const send=async(message)=>{
   const before=(await rpc('u14.counter')).ends.length;
   await page.locator('openclaw-app-shell').evaluate((el,session)=>el.navigate('chat',{search:'?session='+encodeURIComponent(session)}),session);
   const input=page.locator('openclaw-chat-pane textarea').first();await input.waitFor();await input.fill(message);await input.press('Enter');return before;
 };
 const ended=async (before,requireSuccess=true)=>{
   const deadline=Date.now()+120000;
   while(Date.now()<deadline){const c=await rpc('u14.counter');if(c.ends.length>before){report.last_counter=c;await identityView(page,'refresh');report.last_receipts=(await identityView(page)).requests;if(requireSuccess)assert(c.ends.at(-1).success);return c;}await delay(500);}throw Error('AGENT_END_TIMEOUT');
 };
 for(const doc of ['emergency_plan','material_inventory','duty_contacts','command_contacts','protected_resource']){
   modelArgs={document_id:doc};const before=await send('读取本次受管合成资料并简短说明结果。');await ended(before);
   await identityView(page,'refresh');const rows=(await identityView(page)).requests;
   report.document_receipts=rows.map(r=>({document_id:r.document_id,status:r.status,execution_status:r.execution_status,reason_code:r.reason_code}));
   assert(rows.some(r=>r.execution_status==='succeeded'&&r.document_id===doc),doc+' not executed');
   check('admin-read-'+doc);
 }
 await page.locator('govagentsec-shell').getByRole('button',{name:'资料权限',exact:true}).click();await shot(page,'admin-all-documents');
 await page.locator('govagentsec-shell').getByRole('button',{name:'关闭身份权限',exact:true}).click();
 await loginAccount('shenpi','Demo#Shenpi26');modelTool='read';
 let expectedReads=(await rpc('u14.counter')).reads;
 for(const [offset,resolution,location] of [[1,'approve','chat'],[2,'approve','permissions'],[3,'reject','chat'],[4,'timeout','chat']]){
   modelArgs={path:'/workspace/B/controlled.txt',offset};
   const before=await send('本次任务范围为 /workspace/B/first.txt 与 /workspace/B/second.txt，请读取本次合成工作区资料。');
   const shell=page.locator('govagentsec-shell'),card=shell.getByRole('complementary',{name:'当前操作需要确认',exact:true});
   await card.waitFor();assert.equal((await rpc('u14.counter')).reads,expectedReads);
   await shot(page,'confirmation-'+offset+'-'+location);
   if(location==='permissions'){
     await nav(page,'permissions');await work(page).getByRole('combobox',{name:'审批筛选',exact:true}).selectOption('pending');
     await work(page).getByRole('button',{name:'允许一次',exact:true}).click();
   }else if(resolution!=='timeout')await card.getByRole('button',{name:resolution==='approve'?'允许一次':'拒绝',exact:true}).click();
   const result=await ended(before,resolution==='approve');
   if(resolution==='approve'){
     // The fixed native read tool performs two pinned reads internally. Count
     // actual tool completions separately from filesystem calls.
     assert.equal(result.tool_results.filter(r=>r.run_id===result.ends.at(-1).run_id&&r.tool==='read').length,1);
     assert.equal(result.reads-expectedReads,2);expectedReads=result.reads;
   }
   assert.equal(result.reads,expectedReads);check(location+'-'+resolution+'-read-count',{reads:result.reads});
 }
 await identity('disable',{bearer:credentials['maintenance-test']});
 report.read_count=expectedReads;
 report.passed=true;
}catch(e){report.error=secrets.reduce((text,secret)=>text.replaceAll(secret,'[REDACTED]'),String(e.message)).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED]');process.exitCode=1;if(browser){const p=browser.contexts()[0]?.pages().at(-1);await p?.screenshot({path:path.join(out,'FAILED-page.png'),fullPage:true,animations:'disabled'}).catch(()=>{});}}finally{
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
