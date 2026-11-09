// Isolated browser fixture for the real components. Backend authorization is
// independently covered by test_u24_materials_reapply.py against local OPA/JWT.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const out=path.resolve(process.argv[2]??'local-validation/u24-task-materials/'+new Date().toISOString().replace(/[:.]/g,'-')+'/ui');fs.mkdirSync(out,{recursive:true});
const report={source:'isolated-ui-fixture-real-components',synthetic:true,passed:false,external_requests:0,checks:[],screenshots:[]};
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>任务材料与审批</title><style>body{font:15px system-ui;margin:32px;background:#f5f8f6;color:#233e3b}main{max-width:1000px;margin:auto;background:white;border:1px solid #d6e2df;border-radius:10px}button{padding:9px 14px;background:white;color:#176f64;border:1px solid #c5d8d1;border-radius:5px;cursor:pointer}button:disabled{opacity:.5}fieldset{border:1px solid #c5d8d1;border-radius:6px}</style><main></main><script type="module">
import {mountDemoIdentity} from '/demo-identity.mjs';import {setTaskContext} from '/task-context.mjs';
import {getIdentitySession} from '/identity-session.mjs';
setTaskContext({sessionKey:'agent:main:u24-ui',title:'台风应急简报'});
const officer={id:'approver-test',label:'中级主管',tier:2,tier_label:'中级主管',roles:['office_user']};
let enabled=false,user=null,bound=false,selected=[],requests=[];window.calls=[];
const gateway={async request(method,p={}){const op=method.split('.').at(-1);calls.push({op,p:{...p,...(p.password?{password:'[private]'}:{}),bearer:p.bearer?'[private]':undefined}});
if(op==='status')return {enabled,users:[officer],user:p.bearer?user:null,permission_summary:{tier:2,tier_label:'中级主管',clearance_label:'内部',material_ids:['emergency_plan','material_inventory'],tool_families:['受控文档'],can_approve:false,can_edit_rules:false,can_switch_sandbox:false},execution_enabled:!!user,expires_at:Date.now()/1000+900,requests,tasks:[],bound_sessions:bound?['agent:main:u24-ui']:[],material_selections:selected.length?{'agent:main:u24-ui':selected}:{}};
if(op==='enable'){enabled=true;return {enabled:true};}
if(op==='login'){if(p.account!=='shenpi'||p.password!=='Demo#Shenpi26')return {status:'blocked'};user=officer;return {access_token:'isolated-fixture',user,expires_at:Date.now()/1000+300};}
if(op==='bind_session'){bound=true;return {status:'ok'};}
if(op==='materials')return {status:'ok',selected,materials:[{document_id:'emergency_plan',label:'公开台风预案',data_level:'public',selectable:true},{document_id:'material_inventory',label:'应急物资清单',data_level:'internal',selectable:true},{document_id:'command_contacts',label:'指挥中心联络表',data_level:'secret',selectable:false}]};
if(op==='select_materials'){selected=p.material_ids;return {status:'ok',selected};}
if(op==='resolve'){const request=requests.find(r=>r.request_id===p.request_id);if(!request?.can_confirm_self||request.status!=='pending_approval')throw Error('Not actionable');Object.assign(request,{status:p.resolution==='approve'?'authorized':'rejected',execution_status:p.resolution==='approve'?'succeeded':'not_started',can_confirm_self:false});return {status:request.status};}
if(op==='task_reapply'){requests[0].renewed_request_id='new-request';requests[0].can_reapply=false;requests.push({...requests[0],request_id:'new-request',status:'pending_approval',authorization_expired:false,can_reapply:false,renewed_request_id:undefined});return {status:'pending_approval',request_id:'new-request'};}
throw Error('Unsupported fixture operation');}};
let dispose;const show=(mode,options={})=>{dispose?.();dispose=mountDemoIdentity(document.querySelector('main'),gateway,()=>{},{mode,processingLocation:'本地测试模型',...options});};
window.addEventListener('gov-navigate',e=>show(e.detail.section));
window.fixture={show,expired(){requests=[{request_id:'old-request',requester:'approver-test',scenario:'chat',session_key:'agent:main:u24-ui',status:'authorized',authorization_expired:true,authorization_expires_at:Date.now()/1000-1,can_reapply:true,target_resource:'nativefs://workspace/B/controlled.txt',execution_status:'not_started'}];show('permissions');}};
window.fixture.mixed=async()=>{
 const base={requester:'approver-test',scenario:'chat',session_key:'agent:main:u24-ui',document_id:'material_inventory',execution_status:'not_started'};
 requests=[
 {...base,request_id:'pending-self',status:'pending_approval',can_confirm_self:true},
 {...base,request_id:'pending-other',requester:'another-user',status:'pending_approval'},
 {...base,request_id:'successful',status:'authorized',execution_status:'succeeded',authorization_consumed_at:Date.now()/1000},
 {...base,request_id:'rejected',status:'rejected'},
 {...base,request_id:'expired',status:'authorized',authorization_expired:true},
 {...base,request_id:'confirmation-timeout',status:'pending_approval',can_confirm_self:true,confirmation_expires_at:Date.now()/1000-1},
 {...base,request_id:'failed',status:'authorized',execution_status:'failed'},
 {...base,request_id:'blocked',status:'blocked'},
 {...base,request_id:'other-receipt',requester:'another-user',status:'rejected'}];
 await getIdentitySession(gateway).refresh();show('permissions');
};
window.fixture.clearRequests=async()=>{requests=[];await getIdentitySession(gateway).refresh();show('permissions');};
show('permissions');</script></html>`;
const allowed=new Set(['library-summary.mjs','demo-identity.mjs','identity-session.mjs','task-context.mjs']);
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}const file=req.url.slice(1);if(!allowed.has(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join('modules/govagentsec-ui',file)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(path.join(process.env.APPDATA,'npm/node_modules/openclaw/node_modules/playwright-core/index.mjs')));
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1200,height:950},permissions:['clipboard-read','clipboard-write']});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();report.external_requests++;return route.abort();});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 await page.evaluate(()=>fixture.show('receipts'));await page.getByText('先到动态权限登录',{exact:true}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'审批筛选'}).count(),0);assert.equal(await page.getByRole('heading').count(),0);
 await page.getByRole('button',{name:'去动态权限登录',exact:true}).click();report.checks.push('anonymous-receipts-one-line-login-no-filter');
 await page.getByRole('button',{name:'前往防护设置',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'开启演示身份源',exact:true}).count(),0);
 await page.getByRole('button',{name:'前往防护设置',exact:true}).click();await page.getByRole('button',{name:'开启演示身份源',exact:true}).click();
 for(const mode of ['audit','admission','settings','receipts']){
  await page.evaluate(mode=>fixture.show(mode),mode);
  assert.equal(await page.locator('input[name="account"],input[name="password"]').count(),0);
 }
 report.checks.push('only-permissions-has-account-password-form');
 await page.getByRole('button',{name:'去动态权限登录',exact:true}).click();
 await page.getByRole('textbox',{name:'账号',exact:true}).fill('shenpi');await page.getByLabel('密码',{exact:true}).fill('wrong-password');await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByText('登录失败，请检查账号、密码或账号是否已启用。',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('密码',{exact:true}).inputValue(),'');report.checks.push('wrong-password-denied-and-input-cleared');
 await page.screenshot({path:path.join(out,'00-permissions-login.png'),fullPage:true});report.screenshots.push('00-permissions-login.png');
 await page.getByLabel('密码',{exact:true}).fill('Demo#Shenpi26');await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('region',{name:'当前员工',exact:true}).waitFor();assert.equal(await page.locator('input[type="password"]').count(),0);
 await page.getByText('材料：内部',{exact:true}).waitFor();await page.getByText('权限级别：中级主管（2级）',{exact:true}).waitFor();report.checks.push('server-permission-summary-and-no-second-login');
 assert.equal(await page.getByRole('button',{name:/绑定|选择本次材料|确认本次只读材料/}).count(),0);
 assert.equal(await page.getByRole('checkbox').count(),0);
 await page.getByText('当前账号自动用于此工作区的所有对话，资料按身份权限检查，无需逐个绑定或选材。',{exact:true}).waitFor();
 await page.evaluate(()=>fixture.show('chat'));
 await page.getByRole('region',{name:'资料与工具权限',exact:true}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'审批筛选'}).count(),0);
 assert.equal(await page.evaluate(()=>calls.filter(x=>['bind_session','select_materials','send','invoke','resolve'].includes(x.op)).length),0);
 await page.screenshot({path:path.join(out,'01-automatic-material-permissions.png'),fullPage:true});report.screenshots.push('01-automatic-material-permissions.png');
 report.checks.push('no-manual-binding','no-material-checkboxes','chat-readonly-permission-view','viewing-permissions-does-not-send-or-mutate');
 await page.evaluate(()=>fixture.expired());await page.getByRole('button',{name:'重新申请原动作',exact:true}).click();
 await page.locator('article[data-request-id="new-request"]').waitFor();const reapply=await page.evaluate(()=>calls.find(x=>x.op==='task_reapply').p);assert.deepEqual(Object.keys(reapply).sort(),['bearer','request_id']);assert.equal(reapply.request_id,'old-request');
 assert(await page.locator('article[data-request-id="new-request"]').getByRole('button',{name:'批准本次重试',exact:true}).isDisabled());
 await page.screenshot({path:path.join(out,'03-expired-new-request.png'),fullPage:true});report.screenshots.push('03-expired-new-request.png');
 report.checks.push('expired-request-reapply-by-ID-only','new-request-visible','requester-cannot-approve');
 await page.evaluate(()=>fixture.mixed());
 const pending=page.getByRole('region',{name:'待审批',exact:true}),receipts=page.getByRole('region',{name:'执行回执',exact:true});
 await pending.getByRole('button',{name:'允许一次',exact:true}).waitFor();
 await page.getByRole('combobox',{name:'审批筛选'}).selectOption('all');
 assert.equal(await pending.locator('article').count(),2);assert.equal(await receipts.locator('article').count(),7);
 assert.equal(await receipts.getByRole('button',{name:/允许一次|批准|^拒绝$/}).count(),0);
 await receipts.getByText('确认已超时',{exact:false}).waitFor();
 await page.getByRole('combobox',{name:'审批筛选'}).selectOption('pending');
 assert.equal(await pending.locator('article').count(),1);assert.equal(await receipts.locator('article').count(),7);
 await page.getByRole('combobox',{name:'回执筛选'}).selectOption('mine');
 assert.equal(await receipts.locator('article').count(),6);assert.equal(await pending.locator('article').count(),1);
 await page.screenshot({path:path.join(out,'04-pending-and-receipts.png'),fullPage:true});report.screenshots.push('04-pending-and-receipts.png');
 await pending.getByRole('button',{name:'允许一次',exact:true}).click();
 await receipts.locator('[data-request-id="pending-self"]').waitFor();assert.equal(await pending.locator('article').count(),0);
 await page.evaluate(()=>fixture.show('permissions',{requestId:'successful'}));
 assert.equal(await pending.locator('[data-request-id="successful"]').count(),0);assert.equal(await receipts.locator('[data-request-id="successful"][data-focused="true"]').count(),1);
 await page.evaluate(()=>fixture.mixed());await page.evaluate(()=>fixture.show('confirmations',{requestId:'successful'}));
 assert.equal(await page.locator('article').count(),1);assert.equal(await page.getByRole('region',{name:'执行回执',exact:true}).count(),0);
 await page.getByRole('button',{name:'拒绝',exact:true}).click();assert.equal(await page.locator('article').count(),0);
 await page.evaluate(()=>fixture.show('receipts',{sessionKey:'agent:main:u24-ui'}));
 await receipts.locator('[data-request-id="pending-self"]').waitFor();assert.equal(await receipts.getByRole('button',{name:/允许一次|批准|^拒绝$/}).count(),0);
 await page.evaluate(()=>fixture.show('receipts',{sessionKey:'different-session'}));assert.equal(await page.locator('article').count(),0);
 await page.evaluate(()=>fixture.clearRequests());
 await pending.getByText('当前没有符合筛选条件的待审批事项。',{exact:true}).waitFor();
 await receipts.getByText('当前没有符合筛选条件的执行回执。',{exact:true}).waitFor();
 report.checks.push('pending-and-receipts-separated','independent-visibility-filters','receipts-have-no-approval-buttons','approve-moves-request-to-receipts','completed-deep-link-stays-in-receipts','chat-only-actionable-pending','reject-removes-chat-card','session-filter-preserved','both-empty-states','no-browser-errors');assert.deepEqual(errors,[]);assert.equal(report.external_requests,0);report.passed=true;
}catch(e){report.error=e.message;process.exitCode=1;}finally{await browser?.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json'),error:report.error}));}
