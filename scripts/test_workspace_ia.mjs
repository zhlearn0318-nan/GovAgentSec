import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {identityStatus} from '../modules/govagentsec-ui/identity-status.mjs';
import {modelRoutingStatus} from '../modules/model-routing/routing.mjs';
const {chromium}=await import(pathToFileURL(process.env.APPDATA+'/npm/node_modules/openclaw/node_modules/playwright-core/index.mjs').href);
const repo=process.cwd();const files={
 'demo-identity.mjs':'modules/govagentsec-ui/demo-identity.mjs','identity-session.mjs':'modules/govagentsec-ui/identity-session.mjs','task-context.mjs':'modules/govagentsec-ui/task-context.mjs',
 'workspace.mjs':'modules/govagentsec-ui/workspace.mjs','shell.mjs':'modules/govagentsec-ui/shell.mjs','workspace-style.mjs':'modules/govagentsec-ui/workspace-style.mjs','trajectory-ui.mjs':'modules/trajectory-governance/ui.mjs','graph.mjs':'modules/trajectory-governance/graph.mjs','workbench.mjs':'modules/trajectory-governance/workbench.mjs',
};
// Explicit sources and exact probe text distinguish fixtures from user work in the same session.
const traces=[
 {trace_id:'1'.repeat(32),session_key:'agent:main:dashboard:gov-workbench-fixture',source:'openclaw',title:'真实用户报账任务',trace_status:'complete',tool_count:1,started_at:'2026-11-05T08:00:00Z'},
 {trace_id:'2'.repeat(32),session_key:'agent:main:dashboard:gov-workbench-fixture',source:'openclaw',title:'这是合成集成测试。仅查询公告',trace_status:'complete',tool_count:1,started_at:'2026-11-05T07:00:00Z'},
 {trace_id:'3'.repeat(32),source:'controlled-validation',title:'purchase-holdout-a',trace_status:'complete',tool_count:1,started_at:'2026-11-05T06:00:00Z'},
];
const fixture={traces,total:3,pending:[],servers:[],coverage:{capture:true,agentguard_configured:true,agentguard_identity_mode:'disabled',runtime:{service:'online',input:{mode:'enforce',reason:'输入检查已接通'},output:{mode:'enforce',reason:'回复检查已接通'},tool_results:{mode:'observe',reason:'当前只记录检查结果'}}}};
fixture.tool_coverage=[{name:'exec',managed:false,observed:true},{name:'agentguard-notices__submit_emergency_notice',managed:true,observed:true}];
fixture.coverage.model_routing=modelRoutingStatus({agents:{defaults:{model:{primary:'ollama/qwen3:8b'}}},models:{providers:{ollama:{api:'ollama',baseUrl:'http://127.0.0.1:11434'}}}});
const consumedTickets=new Set();
let runtimeIdentity=identityStatus('disabled');let runtimeOffline=false;const runtimePosts=[];
const server=createServer((req,res)=>{const u=new URL(req.url,'http://localhost');res.setHeader('Content-Type','text/html; charset=utf-8');
 if(u.pathname==='/runtime-fixture'){res.end(readFileSync('modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/ui/panel.html','utf8').replaceAll('__AGENTGUARD_PAGE_TOKEN__','fixture-only'));return;}
 if(u.pathname.startsWith('/plugins/agentguard-runtime-security/api/')){
  res.setHeader('Content-Type','application/json');
  if(req.method==='POST'){runtimePosts.push(u.pathname);res.writeHead(403);res.end('{}');return;}
  if(runtimeOffline){res.writeHead(503);res.end('{}');return;}
  res.end(JSON.stringify({identity:runtimeIdentity,approvals:[{status:'pending',tool:'file.read',subject_id:'fixture-requester',control_request_id:'fixture-id'}]}));return;
 }
 if(u.pathname==='/fixture'){res.end(`<!doctype html><html lang="zh-CN"><head><style>body{margin:0}#host{padding-top:54px}openclaw-app-sidebar{position:fixed;left:0;top:54px;bottom:0;width:220px;display:block;overflow:auto}.content{margin-left:220px;padding-top:50px}.dashboard-header__breadcrumb-current{position:fixed;top:14px;left:240px}</style></head><body><div id="host"><div class="dashboard-header__breadcrumb-current">插件</div><openclaw-app-sidebar><div class="sidebar-shell__body"><div class="sidebar-sessions"><a href="/chat?session=agent%3Amain%3Adashboard%3Agov-workbench-fixture">agent:main:dashboard:gov-workbench-fixture</a></div><section id="protect-agent-guard">输入防护链</section></div></openclaw-app-sidebar><main class="content"><govagentsec-workspace></govagentsec-workspace></main><govagentsec-shell></govagentsec-shell></div><script type="module">
 import {defineWorkspace,coverageRows,isTestTrace} from '/plugins/govagentsec/workspace.mjs';import {defineShell} from '/plugins/govagentsec/shell.mjs';
 window.fixture=${JSON.stringify(fixture)};window.rpcCalls=[];window.helpers={coverageRows,isTestTrace};window.panelGrantSeq=0;
 const gateway={request:async(method,params)=>{rpcCalls.push({method,params});if(method==='govagentsec.demoIdentity.status'){const state=fixture.identity??{enabled:false,available:true,user:null,users:[],requests:[],execution_enabled:false};return params?.bearer?state:{...state,user:null,requests:[],execution_enabled:false};}if(method==='govagentsec.demoIdentity.login')return {access_token:'fixture-private-only',expires_at:Math.floor(Date.now()/1000)+300,user:fixture.identity.user};if(method.endsWith('.workspace'))return fixture;if(method.endsWith('.list'))return {traces:fixture.traces};if(method.endsWith('.candidates'))return {candidates:[]};if(method.endsWith('.detail'))return {summary:fixture.traces.find(t=>t.trace_id===params.trace_id),events:[]};if(method==='govagentsec.ui.open'){if(window.rejectNextGrant){window.rejectNextGrant=false;throw Error('登录已失效，请重新登录');}return {url:'/embedded?gov_access=test-ticket-'+(++window.panelGrantSeq)};}if(method==='skills.status')return {skills:[{name:'办公技能',description:'只读清单',eligible:true}]};throw Error('Unexpected method '+method);}};
 window.fixtureGateway=gateway;const host=document.querySelector('#host'),work=host.querySelector('govagentsec-workspace'),shell=host.querySelector('govagentsec-shell');host.navigate=(route,options)=>{history.pushState({},'',route==='plugin'?'/fixture'+options.search:'/'+route);shell.location={search:location.search};};
 work.client=gateway;work.sandboxMode='sandboxed';work.section=new URLSearchParams(location.search).get('section')||'home';shell.host=host;shell.client=gateway;shell.connected=true;shell.sessionKey=fixture.traces[0].session_key;
 defineWorkspace();defineShell();
 </script></body></html>`);return;}
 if(u.pathname==='/embedded'){const ticket=u.searchParams.get('gov_access');if(!ticket||consumedTickets.has(ticket)){res.writeHead(401);res.end('<h1>访问凭据已失效</h1>');return;}consumedTickets.add(ticket);res.end('<html lang="zh-CN"><body><h1>受保护设置面板</h1><button>设置操作</button></body></html>');return;}
 const file=files[u.pathname.split('/').at(-1)];if(file){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(readFileSync(path.join(repo,file)));return;}res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch({channel:'msedge',headless:true});const checks=[];
try{const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/fixture?plugin=protect-agent&id=govagentsec&section=compare');const work=page.locator('govagentsec-workspace');await work.getByRole('heading',{name:'运行对照与候选记录',exact:true}).waitFor();await work.getByRole('combobox',{name:'左侧运行'}).locator('option').nth(1).waitFor({state:'attached'});assert.equal(await work.getByRole('combobox',{name:'左侧运行'}).locator('option').count(),2);checks.push('compare deep link renders comparison and defaults to non-test records');
 await page.locator('.gov-nav [data-route=audit]').click();await work.getByRole('heading',{name:'审计与改进',exact:true}).waitFor();assert.equal(await work.locator('.task-row').count(),1);assert.ok((await work.locator('.task-row').textContent()).includes('真实用户报账任务'));await work.getByRole('combobox',{name:'记录范围'}).selectOption('test');assert.equal(await work.locator('.task-row').count(),2);await work.getByRole('combobox',{name:'记录范围'}).selectOption('all');assert.equal(await work.locator('.task-row').count(),3);checks.push('test filter preserves real user tasks in a test-named session');
 await work.getByRole('button',{name:'运行对照与候选记录',exact:true}).click();assert.equal(new URL(page.url()).searchParams.get('section'),'compare');await work.getByRole('heading',{name:'运行对照与候选记录',exact:true}).waitFor();assert.equal(await page.locator('.gov-nav [data-route=audit]').getAttribute('aria-current'),'page');checks.push('compare button and direct URL share a route and audit highlight');
 await page.locator('.gov-nav [data-route=settings]').click();await work.getByRole('heading',{name:'防护设置',exact:true}).waitFor();assert.ok(await work.getByText('exec · 未接入受管适配器',{exact:true}).isVisible());assert.equal(await work.getByText('exec · 未接入受管适配器',{exact:true}).evaluate(e=>getComputedStyle(e).color),'rgb(180, 35, 24)');await work.getByRole('heading',{name:'会话模型（可 API）',exact:true}).waitFor();await work.getByRole('heading',{name:'安全评审（默认本地，轨迹不出域）',exact:true}).waitFor();mkdirSync('local-validation/workspace-ia',{recursive:true});await page.screenshot({path:'local-validation/workspace-ia/model-routing-settings.png'});assert.equal(await page.locator('.gov-nav [data-route=settings]').getAttribute('aria-current'),'page');assert.equal(await page.locator('.dashboard-header__breadcrumb-current').textContent(),'防护设置');
 for(const label of ['输入防护策略','运行防护与审批记录','准入规则']){
  await work.getByRole('button',{name:label,exact:true}).click();const frame=work.locator('iframe');await frame.waitFor();
  assert.equal(await frame.getAttribute('sandbox'),'allow-scripts');const oldUrl=await frame.getAttribute('src');assert.ok(oldUrl.includes('gov_access='));
  await work.frameLocator('iframe').getByRole('heading',{name:'受保护设置面板'}).waitFor();
  const callsBefore=await page.evaluate(()=>rpcCalls.filter(c=>c.method==='govagentsec.ui.open').length);
  await work.getByRole('button',{name:'重新加载',exact:true}).click();
  await work.frameLocator('iframe').getByRole('heading',{name:'受保护设置面板'}).waitFor();
  assert.notEqual(await frame.getAttribute('src'),oldUrl);
  assert.equal(await page.evaluate(()=>rpcCalls.filter(c=>c.method==='govagentsec.ui.open').length),callsBefore+1);
  await work.getByRole('button',{name:'返回防护设置'}).click();await work.getByRole('heading',{name:'实际防护状态'}).waitFor();
 }checks.push('all settings subpanels retain one-step return and reload with a fresh single-use grant');
 await page.evaluate(()=>window.rejectNextGrant=true);await work.getByRole('button',{name:'准入规则',exact:true}).click();
 await work.getByRole('alert').getByText('无法打开准入规则：登录已失效，请重新登录').waitFor();
 assert.equal(await work.locator('iframe').count(),0);await work.getByRole('button',{name:'重新加载',exact:true}).click();
 await work.frameLocator('iframe').getByRole('heading',{name:'受保护设置面板'}).waitFor();
 await work.getByRole('button',{name:'返回防护设置'}).click();checks.push('failed page authentication stays recoverable without a retry loop');
 assert.equal(await page.locator('#protect-agent-guard').isVisible(),true);const rows=await page.evaluate(()=>helpers.coverageRows(fixture.coverage));assert.deepEqual(rows.find(r=>r[0]==='工具执行').slice(2),['已禁用','warn']);assert.deepEqual(rows.find(r=>r[0]==='输入检查').slice(2),['已启用','']);assert.deepEqual(rows.find(r=>r[0]==='工具返回').slice(2),['复检 / 观察','warn']);checks.push('coverage comes from runtime modes; disabled identity is never connected');
 await page.locator('.gov-nav [data-route=admission]').click();await work.getByRole('button',{name:'查看已安装 Skill'}).click();await work.getByRole('heading',{name:'已安装技能',exact:true}).waitFor();await work.getByRole('heading',{name:'办公技能'}).waitFor();assert.equal(new URL(page.url()).pathname,'/fixture');assert.equal(await work.getByText('ClawHub').count(),0);checks.push('installed skills are read-only inside the governed workspace');
 assert.equal(await page.locator('.sidebar-sessions a').textContent(),'真实用户报账任务');assert.ok(await page.locator('govagentsec-shell').getByRole('button',{name:'查看过程',exact:true}).isVisible());checks.push('friendly session title and distinct current-task inspector');
 await page.locator('#host').evaluate(e=>e.classList.add('shell--nav-collapsed'));
 assert.ok(await page.locator('govagentsec-shell').getByRole('button',{name:'查看过程',exact:true}).isVisible());
 assert.ok(await page.locator('govagentsec-shell').getByRole('button',{name:'查看过程',exact:true}).isVisible());
 await page.reload();await page.locator('govagentsec-shell').getByRole('button',{name:'查看过程',exact:true}).waitFor();
 checks.push('persistent topbar audit and task entries survive sidebar collapse and refresh');
 await page.locator('.sidebar-sessions a').evaluate(e=>e.firstChild.data='agent:main:dashboard:gov-workbench-fixture');
 await page.waitForFunction(()=>document.querySelector('.sidebar-sessions a').textContent==='真实用户报账任务');
 checks.push('session label stays friendly after host rerender');
 const version={ok:true,payload:{oidc_enabled:true}},ready={ok:true,payload:{ready:true,dependencies:{identity:{healthy:true}}}};
 for(const identity of [identityStatus('disabled'),identityStatus('loopback_static_dev'),identityStatus('oidc',version,ready),identityStatus('oidc',version,{ok:false})]){
  await page.evaluate(i=>{fixture.coverage.business_identity=i;},identity);
  for(const route of ['home','approvals','settings']){
   await page.locator('.gov-nav [data-route='+route+']').click();
   await page.locator('govagentsec-shell').getByRole('button',{name:'登录业务身份',exact:true}).waitFor();
   const button=work.getByRole('button',{name:'以当前身份开始任务',exact:true});
   if(await button.count())assert(await button.isDisabled());
  }
 }
 assert(!(await page.evaluate(()=>rpcCalls)).some(c=>/\.resolve$|\.invoke$|\.evaluate$/.test(c.method)));
 checks.push('identity badges and read-only guardrails on home, approvals and settings in four states');
 await page.evaluate(async()=>{
  const user={id:'fixture-office',roles:['office_user']};
  fixture.identity={enabled:true,user,users:[user],execution_enabled:true,expires_at:Math.floor(Date.now()/1000)+900,
   requests:['a','b'].map(id=>({request_id:'fixture-request-'+id,requester:user.id,scenario:'chat',status:'pending_approval',
    reason_code:'P014_RESOURCE_OUTSIDE_TASK',session_key:fixture.traces[0].session_key,run_id:'run-'+id,action:'read',
    target_resource:'nativefs://workspace/B/controlled.txt',resource_prefixes:['nativefs://workspace/A/']})),tasks:[],audit:[]};
  const {getIdentitySession}=await import('/plugins/govagentsec/identity-session.mjs');
  await getIdentitySession(window.fixtureGateway).login(user.id);
  window.dispatchEvent(new CustomEvent('gov-navigate',{detail:{section:'approvals',requestId:'fixture-request-a'}}));
 });
 const focused=id=>work.locator('article[data-request-id="fixture-request-'+id+'"][data-focused="true"]');
 await focused('a').waitFor();assert.equal(await focused('b').count(),0);
 await focused('a').getByText('涉及材料：工作区/B/controlled.txt',{exact:true}).waitFor();
 await focused('a').getByText('原只读范围：工作区/A/',{exact:true}).waitFor();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('gov-navigate',{detail:{section:'approvals',requestId:'fixture-request-b'}})));
 await focused('b').waitFor();assert.equal(await focused('a').count(),0);
 await page.goBack();await focused('a').waitFor();assert.equal(await focused('b').count(),0);
 await page.goForward();await focused('b').waitFor();assert.equal(await focused('a').count(),0);
 checks.push('same-section request deep links and browser history focus the exact approval');
 await page.locator('.dashboard-header__breadcrumb-current').evaluate(el=>{el.textContent='插件';});
 await page.locator('.dashboard-header__breadcrumb-current').getByText('待审批',{exact:true}).waitFor({timeout:2000});
 checks.push('breadcrumb recovers immediately when the host rewrites its label');
 const shell=page.locator('govagentsec-shell');
 await shell.evaluate(el=>el.open(fixture.traces[0]));
 await shell.locator('.drawer-receipts article[data-request-id="fixture-request-a"]').waitFor();
 await shell.evaluate(el=>el.open(fixture.traces[2]));
 await shell.getByText('该轨迹尚未关联任务，无法定位审批回执。',{exact:true}).waitFor();
 assert.equal(await shell.locator('.drawer-receipts article').count(),0);
 await shell.getByRole('button',{name:'关闭面板',exact:true}).click();
 checks.push('unassociated trace never inherits current-session approval receipts');
 const panel=await browser.newPage();panel.on('pageerror',e=>errors.push(e.message));
 for(const identity of [identityStatus('disabled'),identityStatus('loopback_static_dev'),identityStatus('oidc',version,ready)]){
  runtimeIdentity=identity;await panel.goto(base+'/runtime-fixture');
  await panel.locator('#identity-label').getByText(identity.label,{exact:true}).waitFor();
  for(const id of ['run-action','run-gov-documents','approver-id','approval-note'])assert(await panel.locator('#'+id).isDisabled());
  assert.equal(await panel.locator('[data-approval="approve"]').count(),0);
 }
 runtimeOffline=true;await panel.locator('#refresh').click();
 await panel.locator('#system-state').getByText(/读取失败/).waitFor();
 assert(await panel.locator('#run-action').isDisabled());assert(await panel.locator('#run-gov-documents').isDisabled());assert.deepEqual(runtimePosts,[]);
 await panel.close();checks.push('runtime panel never enables execution, self-approval or demo controls, including refresh failure');
 await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement!==document.body));assert.deepEqual(errors,[]);checks.push('keyboard path and no script errors');mkdirSync('local-validation/workspace-ia',{recursive:true});await page.screenshot({path:'local-validation/workspace-ia/settings-and-skills.png'});writeFileSync('local-validation/workspace-ia/report.json',JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
