// Real repository UI components with an explicitly synthetic, isolated RPC fixture.
// This checks navigation and presentation; backend authorization is tested separately.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const evidence=fs.readFileSync('.runtime/u25-evidence-path.txt','utf8').trim();
const out=path.resolve(process.argv[2]??path.join(evidence,'workspace-ui'));
fs.mkdirSync(out,{recursive:true});
const report={source:'synthetic-rpc-fixture-real-repository-ui',synthetic:true,passed:false,checks:[],screenshots:[],external_requests:0};
const files={
 'library-summary.mjs':'modules/govagentsec-ui/library-summary.mjs','demo-identity.mjs':'modules/govagentsec-ui/demo-identity.mjs','identity-session.mjs':'modules/govagentsec-ui/identity-session.mjs','task-context.mjs':'modules/govagentsec-ui/task-context.mjs',
 'security-overview.mjs':'modules/govagentsec-ui/security-overview.mjs','workspace.mjs':'modules/govagentsec-ui/workspace.mjs','shell.mjs':'modules/govagentsec-ui/shell.mjs','workspace-style.mjs':'modules/govagentsec-ui/workspace-style.mjs',
 'trajectory-ui.mjs':'modules/trajectory-governance/ui.mjs','graph.mjs':'modules/trajectory-governance/graph.mjs','workbench.mjs':'modules/trajectory-governance/workbench.mjs',
 'view.mjs':'modules/govagentsec-trace/view.mjs','view-model.mjs':'modules/govagentsec-trace/view-model.mjs','usage.mjs':'modules/govagentsec-trace/usage.mjs',
};
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>U25 隔离界面夹具</title><style>body{margin:0}#host{padding-top:54px}openclaw-app-sidebar{position:fixed;left:0;top:54px;bottom:0;width:220px;display:block}.content{margin-left:220px;padding-top:50px}.dashboard-header__breadcrumb-current{position:fixed;top:14px;left:240px}</style><div id="host"><div class="dashboard-header__breadcrumb-current">插件</div><openclaw-app-sidebar><div class="sidebar-shell__body"><div class="sidebar-sessions"><a href="/chat?session=agent:main:ui-fixture">合成测试任务</a></div></div></openclaw-app-sidebar><main class="content"><govagentsec-workspace></govagentsec-workspace></main><govagentsec-shell></govagentsec-shell></div><script type="module">
import {defineWorkspace} from '/plugins/govagentsec/workspace.mjs';import {defineShell} from '/plugins/govagentsec/shell.mjs';
const users={
 jingban:{id:'office-test',account:'jingban',label:'基础经办',tier:1,tier_label:'基础经办',roles:['office_user']},
 shenpi:{id:'approver-test',account:'shenpi',label:'中级主管',tier:2,tier_label:'中级主管',roles:['office_user','business_approver']},
 weihu:{id:'maintenance-test',account:'weihu',label:'高级管理员',tier:3,tier_label:'高级管理员',roles:['office_user','business_approver','workspace_maintainer','security_admin','finance_operator']}
};
const passwords={jingban:'Demo#Jingban26',shenpi:'Demo#Shenpi26',weihu:'Demo#Weihu26'};
const permissions=u=>u?({tier:u.tier,tier_label:u.tier_label,clearance_label:['','公开','内部','秘密'][u.tier],material_ids:['emergency_plan','material_inventory',...(u.tier>=2?['duty_contacts']:[]),...(u.tier===3?['command_contacts','protected_resource']:[])],tool_families:['file.read',...(u.tier===3?['file.write','shell.execute','payment.transfer']:[])],can_approve:u.tier>=2,can_edit_rules:u.tier===3,can_switch_sandbox:u.tier===3,can_assess:u.tier>=2}):null;
const rows=['a','b'].map(id=>({request_id:'fixture-'+id,requester:'office-test',scenario:'chat',session_key:'agent:main:ui-fixture',status:'pending_approval',execution_status:'not_started',reason_code:'P014_RESOURCE_OUTSIDE_TASK',target_resource:'nativefs://workspace/B/synthetic.txt'}));
const traces=[];function addTrace(id){const timestamp=new Date().toISOString(),types=['run.started','model.started','model.ended','tool.started','tool.ended','run.ended'];const events=types.map((event_type,i)=>({event_type,event_id:id+'-'+i,trace_id:id,sequence:i+1,timestamp:new Date(Date.parse(timestamp)+i).toISOString(),parent_event_id:i?id+'-'+(i-1):null,payload:event_type.startsWith('tool.')?{tool:'read_gov_document',transport:'mcp'}:event_type.startsWith('model.')?{model:'synthetic-ui-model'}:{}}));const summary={trace_id:id,title:'合成测试运行 '+id,source:'ui-fixture',trace_status:'complete',timestamp,started_at:timestamp,session_key:'agent:main:ui-fixture',task_key:'fixture',task_confirmed:true,missing_fields:[],metrics:{steps:1,duration_ms:5,input_tokens:null,output_tokens:null}};traces.unshift({summary,events,integrity:{valid:true,errors:[]}});}
addTrace('fixture-run-1');const tokens=new Map();let sequence=0,engine='docker';window.calls=[];
const coverage={capture:true,agentguard_configured:true,agentguard_identity_mode:'loopback_static_dev',runtime:{service:'online',input:{mode:'enforce'},output:{mode:'observe',reason:'复检 / 观察'},tool_results:{mode:'enforce'}}};
const workspace=u=>({traces:u?traces.map(t=>t.summary):[],pending:[],servers:[],total:u?traces.length:0,tool_coverage:[],coverage});
const gateway={async request(method,p={}){calls.push({method,keys:Object.keys(p),path:p.path,has_bearer:!!p.bearer});const u=tokens.get(p.bearer)??null;
if(method==='govagentsec.demoIdentity.status')return {enabled:true,available:true,expires_at:Math.floor(Date.now()/1000)+900,users:Object.values(users),user:u,execution_enabled:!!u,permission_summary:permissions(u),requests:u?rows:[],tasks:[],bound_sessions:[]};
if(method==='govagentsec.demoIdentity.login'){tokens.delete(p.bearer);if(!users[p.account]||passwords[p.account]!==p.password)return {status:'blocked'};const token='synthetic-private-'+(++sequence);tokens.set('Bearer '+token,users[p.account]);return {access_token:token,user:users[p.account],expires_at:Math.floor(Date.now()/1000)+300};}
if(method==='govagentsec.demoIdentity.revoke'){tokens.delete(p.bearer);return {status:'ok'};}
if(method==='govagentsec.trajectory.workspace')return workspace(u);
if(method==='govagentsec.trace.health')return {available:true};
if(method==='govagentsec.sandbox.status')return {current:engine,mode:'all',elevated_disabled:true,effective:'用于下次运行',scope:'本地隔离夹具',engines:{docker:{label:'Docker',ready:true},srt:{label:'srt',ready:true,limitation:'合成环境状态'}}};
if(!u)throw Error('BUSINESS_LOGIN_REQUIRED');
if(method==='govagentsec.runtime.overview'){if(fixture.overviewFailure)throw Error('SYNTHETIC_OVERVIEW_UNAVAILABLE');return fixture.overview;}
if(method==='govagentsec.trace.historyPacks')return {packs:[]};if(method==='govagentsec.trace.list')return {traces:traces.map(t=>t.summary)};
if(method==='govagentsec.trace.detail')return traces.find(t=>t.summary.trace_id===p.trace_id);if(method==='govagentsec.trace.candidates')return {candidates:[]};
if(method==='govagentsec.ui.open'){if(!p.path.startsWith('/plugins/aegis-')&&!permissions(u).can_switch_sandbox)throw Error('当前身份无配置权限');return {url:'/embedded?kind='+encodeURIComponent(p.path)+'&readonly='+String(!permissions(u).can_edit_rules)};}
if(method==='govagentsec.sandbox.select'){if(!permissions(u).can_switch_sandbox)throw Error('NO_PERMISSION');engine=p.engine;return {effective:'已切换合成夹具状态'};}
if(method==='skills.status')return {skills:[]};throw Error('Unsupported fixture method '+method);}};
window.fixture={gateway,addTrace,rows,coverage,overview:{generated_at:new Date().toISOString(),counts:{total:12,allow:7,require_approval:3,deny:2,executed_isolated:6},evidence:{complete:10,total:12,coverage_percent:83},services:{agentguard:{available:true},dependencies:{available:true},openclaw_mcp:{records:8}}}};const host=document.querySelector('#host'),work=host.querySelector('govagentsec-workspace'),shell=host.querySelector('govagentsec-shell');
host.navigate=(route,options)=>{history.pushState({},'',route==='plugin'?'/fixture'+options.search:'/'+route);shell.location={search:location.search};};
work.client=gateway;work.sandboxMode='sandboxed';work.section=new URLSearchParams(location.search).get('section')||'permissions';shell.host=host;shell.client=gateway;shell.connected=true;shell.sessionKey='agent:main:ui-fixture';defineWorkspace();defineShell();
</script></html>`;
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://local');
 if(u.pathname==='/fixture'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}
 if(u.pathname==='/embedded'){res.setHeader('Content-Type','text/html;charset=utf-8');const readOnly=u.searchParams.get('readonly')==='true';res.end('<html lang="zh-CN"><h1>隔离合成面板</h1><p>'+ (readOnly?'只读':'可编辑')+'</p><button '+(readOnly?'disabled':'')+'>保存规则</button></html>');return;}
 const file=files[u.pathname.split('/').at(-1)];if(file){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));return;}res.writeHead(404);res.end();
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(path.join(process.env.APPDATA,'npm/node_modules/openclaw/node_modules/playwright-core/index.mjs')));let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{if(new URL(r.request().url()).origin===base)return r.continue();report.external_requests++;return r.abort();});
 const work=page.locator('govagentsec-workspace'),shell=page.locator('govagentsec-shell');
 const check=s=>report.checks.push(s),shot=async n=>{await page.screenshot({path:path.join(out,n+'.png')});report.screenshots.push(n+'.png');};
 const go=async(section,requestId)=>{await page.evaluate(detail=>window.dispatchEvent(new CustomEvent('gov-navigate',{detail})),{section,requestId});await page.waitForFunction(expected=>document.querySelector('govagentsec-workspace').current===expected,({home:'permissions',login:'permissions',approvals:'permissions'}[section]??section));};
 const login=async account=>{await go('permissions');const change=work.getByRole('button',{name:'切换账号',exact:true});if(await change.count())await change.click();await work.getByLabel('账号',{exact:true}).fill(account);await work.getByLabel('密码',{exact:true}).fill({jingban:'Demo#Jingban26',shenpi:'Demo#Shenpi26',weihu:'Demo#Weihu26'}[account]);await work.getByRole('button',{name:'登录',exact:true}).click();await work.getByRole('region',{name:'当前员工',exact:true}).waitFor();};
 await page.goto(base+'/fixture?section=home');await work.getByRole('heading',{name:'动态权限',exact:true}).waitFor();
 assert.deepEqual(await page.locator('.gov-nav button').evaluateAll(es=>es.map(e=>[e.dataset.route,e.querySelector('span')?.textContent])),[['permissions','动态权限'],['admission','能力准入'],['audit','演进审计'],['overview','安全总览'],['settings','防护设置']]);check('five-exact-main-entries');
 for(const section of ['home','login','approvals']){await go(section);await work.getByRole('heading',{name:'动态权限',exact:true}).waitFor();assert.equal(await work.locator('input[name="password"]').count(),1);}
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.method==='govagentsec.trace.list').length),0);check('legacy-entry-aliases-use-single-login-without-audit-data');
 for(const section of ['audit','admission','overview','settings']){await go(section);await work.getByRole('heading',{name:{audit:'演进审计',admission:'能力准入',overview:'安全总览',settings:'防护设置'}[section],level:1,exact:true}).waitFor();assert.equal(await work.locator('input[name="password"]').count(),0);}
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.method==='govagentsec.runtime.overview').length),0);check('anonymous-overview-no-private-rpc');check('no-extra-login-forms');await go('permissions');await work.getByText('演示账号说明（非生产）',{exact:true}).click();
 const accountRows=await work.getByRole('table',{name:'演示账号'}).locator('tr').allTextContents();assert.equal(accountRows.length,6);for(const account of ['admin','weihu','shenpi','jingban','shenji'])assert.equal(accountRows.filter(row=>row.includes(account)).length,1);check('highest-admin-three-execution-tiers-and-read-only-auditor');await shot('01-only-login');
 await login('jingban');await shell.getByRole('button',{name:/当前业务身份：基础经办/}).waitFor();await work.getByText('权限级别：基础经办（1级）',{exact:true}).waitFor();await shot('02-permissions');
 await go('approvals','fixture-a');await work.locator('[data-request-id="fixture-a"][data-focused="true"]').waitFor();await go('approvals','fixture-b');await work.locator('[data-request-id="fixture-b"][data-focused="true"]').waitFor();
 await page.goBack();await work.locator('[data-request-id="fixture-a"][data-focused="true"]').waitFor();await page.goForward();await work.locator('[data-request-id="fixture-b"][data-focused="true"]').waitFor();check('request-deep-links-back-forward-focus-exact-request');
 assert(await work.locator('[data-request-id="fixture-b"]').getByRole('button',{name:'批准本次重试',exact:true}).isDisabled());check('requester-cannot-self-approve');
 await go('settings');await work.getByRole('heading',{name:'配置与维护',exact:true}).waitFor();assert.deepEqual(await work.locator('[data-settings-section]').evaluateAll(nodes=>nodes.map(n=>n.dataset.settingsSection)),['maintenance']);await shot('10-maintenance-only');
 assert.equal(await work.getByRole('button',{name:'准入规则',exact:true}).count(),0);assert.equal(await work.getByRole('button',{name:'OpenClaw 系统设置',exact:true}).count(),0);assert(await work.locator('input[value="srt"]').isDisabled());
 for(const removed of ['输入防护策略','运行防护与审批记录'])assert.equal(await work.getByRole('button',{name:removed,exact:true}).count(),0);
 await work.getByText('Docker 与 srt：优缺点与适用场景',{exact:true}).click();
 for(const title of ['Docker · 默认引擎','srt · Windows 原生引擎'])await work.getByRole('heading',{name:title,exact:true}).waitFor();
 await work.getByText(/不能直接运行依赖 Windows/).waitFor();await work.getByText(/文件读取隔离不如独立容器完整/).waitFor();
 check('engine-comparison-explains-benefits-limitations-and-use-cases');await shot('11-engine-comparison');
 assert.equal(await work.locator('iframe').count(),0);await page.locator('.gov-nav button[data-route=overview]').click();await work.getByRole('heading',{name:'安全总览',level:1,exact:true}).waitFor();assert.equal(await page.locator('.gov-nav button[aria-current=page]').getAttribute('data-route'),'overview');await work.locator('[data-overview-state=ready]').waitFor();await work.locator('[data-runtime-summary]').getByText(/会话沙箱：Docker/).waitFor();assert.equal(await work.getByRole('heading',{name:'配置与维护',exact:true}).count(),0);
 assert.deepEqual(await work.locator('[data-settings-section]').evaluateAll(nodes=>nodes.map(n=>n.dataset.settingsSection)),['overview','status']);
 const positions=await work.locator('[data-settings-section]').evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom})));
 assert(positions[0].bottom<=positions[1].top);assert(positions[1].top<900,'protection status heading must enter first screen');await page.goBack();await work.getByRole('heading',{name:'防护设置',exact:true}).waitFor();await page.goForward();await work.getByRole('heading',{name:'安全总览',level:1,exact:true}).waitFor();await work.locator('[data-overview-state=ready]').waitFor();
 assert.equal(await work.locator('[data-metric=total] strong').innerText(),'12');assert.equal(await work.locator('[data-metric=evidence] strong').innerText(),'83%');assert.equal(await work.locator('.security-pipeline li').count(),6);
 const toolChip=work.locator('.coverage-row').filter({has:page.getByText('工具执行',{exact:true})}).locator('.chip');
 const replyChip=work.locator('.coverage-row').filter({has:page.getByText('回复检查',{exact:true})}).locator('.chip');
 assert.equal(await toolChip.innerText(),'演示身份');assert.equal(await replyChip.innerText(),'已启用');
 for(const chip of [toolChip,replyChip])assert.deepEqual(await chip.evaluate(e=>[getComputedStyle(e).color,getComputedStyle(e).backgroundColor]),['rgb(30, 105, 91)','rgb(233, 241, 238)']);
 assert(!await work.locator('[data-settings-section=status]').innerText().then(t=>/非生产|复检\s*[/／]|观察/.test(t)));check('overview-separated-from-maintenance-and-history-navigation');await shot('08-security-overview');
 await page.evaluate(()=>{fixture.originalOverview=fixture.overview;fixture.overview={};fixture.coverage.runtime.service='offline';});await go('overview');await work.locator('[data-overview-state=ready]').waitFor();
 assert.equal(await work.locator('[data-metric=total] strong').innerText(),'—');assert.match(await work.locator('.coverage-row').filter({has:page.getByText('回复检查',{exact:true})}).innerText(),/服务离线/);check('missing-overview-and-offline-runtime-not-faked');
 await page.evaluate(()=>{fixture.overviewFailure=true;fixture.coverage.runtime.output={mode:'disabled'};fixture.coverage.runtime.service='online';});await go('overview');await work.locator('[data-overview-state=error]').waitFor();assert.equal(await work.locator('[data-metric=total] strong').innerText(),'—');assert.match(await work.locator('.coverage-row').filter({has:page.getByText('回复检查',{exact:true})}).innerText(),/未启用/);check('overview-error-and-disabled-check-remain-explicit');
 await page.evaluate(()=>{fixture.overviewFailure=false;fixture.overview=fixture.originalOverview;fixture.coverage.runtime.output={mode:'observe'};});check('overview-metrics-and-protection-preserve-real-state');
 await login('shenpi');await work.getByText('权限级别：中级主管（2级）',{exact:true}).waitFor();await work.getByText('材料：内部',{exact:true}).waitFor();await go('admission');await work.frameLocator('iframe').getByRole('heading',{name:'隔离合成面板'}).waitFor();
 for(const label of ['Skill 安全接入','MCP 接入','检查报告','人工复核','准入规则'])await work.getByRole('button',{name:label,exact:true}).waitFor();await work.getByRole('button',{name:'准入规则',exact:true}).click();await work.frameLocator('iframe').getByText('只读',{exact:true}).waitFor();assert(await work.frameLocator('iframe').getByRole('button',{name:'保存规则',exact:true}).isDisabled());check('middle-tier-admission-rules-read-only-fixture');await shot('03-admission');
 await go('audit');await work.getByRole('heading',{name:'演进审计',exact:true}).waitFor();await work.locator('.event').first().waitFor();await shot('04-audit');check('audit-inherits-business-session');
 await login('shenpi');await work.getByRole('combobox',{name:'审批筛选',exact:true}).selectOption('pending');assert(await work.locator('[data-request-id="fixture-a"]').getByRole('button',{name:'批准本次重试',exact:true}).isEnabled());await shot('05-other-approver');check('other-approver-action-enabled-with-separate-execution-state');
 await login('weihu');await work.getByText('权限级别：高级管理员（3级）',{exact:true}).waitFor();await work.getByText('材料：秘密',{exact:true}).waitFor();
 await page.evaluate(()=>fixture.rows.push({...fixture.rows[0],request_id:'fixture-admin-self',requester:'maintenance-test'}));await go('permissions');await work.getByRole('combobox',{name:'审批筛选',exact:true}).selectOption('mine');assert(await work.locator('[data-request-id="fixture-admin-self"]').getByRole('button',{name:'批准本次重试',exact:true}).isDisabled());check('highest-tier-cannot-self-approve');await shot('07-highest-tier');
 await go('settings');await work.getByRole('heading',{name:'配置与维护',exact:true}).waitFor();assert.equal(await work.getByRole('button',{name:'OpenClaw 系统设置',exact:true}).count(),0);assert.equal(await work.locator('[data-overview-state]').count(),0);await work.locator('input[value="srt"]').click();await work.getByRole('alertdialog',{name:'确认切换 srt'}).waitFor();assert.equal(await page.evaluate(()=>calls.filter(c=>c.method==='govagentsec.sandbox.select').length),0);await work.getByRole('button',{name:'保留当前引擎',exact:true}).click();check('srt-cold-start-confirmation-cancel-does-not-write');await shot('06-settings');
 await go('admission');await work.getByRole('button',{name:'准入规则',exact:true}).click();await work.frameLocator('iframe').getByText('可编辑',{exact:true}).waitFor();assert(await work.frameLocator('iframe').getByRole('button',{name:'保存规则',exact:true}).isEnabled());check('maintenance-rule-editor-available-fixture');
 await shell.getByRole('button',{name:'查看过程',exact:true}).click();await shell.locator('section[aria-label="轨迹审计"][data-trace-id="fixture-run-1"]').waitFor();
 await page.evaluate(()=>fixture.addTrace('fixture-run-2'));await shell.locator('section[aria-label="轨迹审计"][data-trace-id="fixture-run-2"]').waitFor();check('process-drawer-follows-latest-run');await shot('09-process-drawer');await page.emulateMedia({reducedMotion:'reduce'});assert((await shell.locator('.drawer').evaluate(el=>parseFloat(getComputedStyle(el).animationDuration)))<0.001);assert((await page.locator('.gov-nav button').first().evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration)))<0.001);check('reduced-motion-disables-drawer-and-navigation-animation');await page.emulateMedia({reducedMotion:'no-preference'});await shell.getByRole('button',{name:'关闭面板',exact:true}).click();
 await shell.getByRole('button',{name:'退出',exact:true}).click();await shell.getByLabel('账号',{exact:true}).waitFor();await shell.getByRole('button',{name:'登录业务身份',exact:true}).waitFor();await go('audit');assert.equal(await work.locator('.event').count(),0);await work.getByRole('button',{name:'前往动态权限',exact:true}).waitFor();check('header-logout-clears-global-delegation-and-audit');
 assert.equal(report.external_requests,0);assert.deepEqual(errors,[]);report.page_errors=errors;report.passed=true;
}catch(error){report.error=error.message;process.exitCode=1;await browser?.contexts()[0]?.pages()[0]?.screenshot({path:path.join(out,'FAILED.png')}).catch(()=>{});}
finally{await browser?.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,error:report.error,report:path.join(out,'report.json')}));}
