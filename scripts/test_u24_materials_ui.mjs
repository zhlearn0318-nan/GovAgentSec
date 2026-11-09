// Isolated browser fixture for the real components. Backend authorization is
// independently covered by test_u24_materials_reapply.py against local OPA/JWT.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
const out=path.resolve(process.argv[2]??'local-validation/u24-task-materials/'+new Date().toISOString().replace(/[:.]/g,'-')+'/ui');fs.mkdirSync(out,{recursive:true});
const report={source:'isolated-ui-fixture-real-components',synthetic:true,passed:false,external_requests:0,checks:[],screenshots:[]};
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>任务材料与审批</title><style>body{font:15px system-ui;margin:32px;background:#f5f8f6;color:#233e3b}main{max-width:1000px;margin:auto;background:white;border:1px solid #d6e2df;border-radius:10px}button{padding:9px 14px;background:white;color:#176f64;border:1px solid #c5d8d1;border-radius:5px;cursor:pointer}button:disabled{opacity:.5}fieldset{border:1px solid #c5d8d1;border-radius:6px}</style><main></main><script type="module">
import {mountDemoIdentity} from '/demo-identity.mjs';import {setTaskContext} from '/task-context.mjs';
setTaskContext({sessionKey:'agent:main:u24-ui',title:'台风应急简报'});
const officer={id:'office-test',label:'经办',roles:['office_user']};
let enabled=false,user=null,bound=false,selected=[],requests=[];window.calls=[];
const gateway={async request(method,p={}){const op=method.split('.').at(-1);calls.push({op,p:{...p,bearer:p.bearer?'[private]':undefined}});
if(op==='status')return {enabled,users:[officer],user:p.bearer?user:null,execution_enabled:!!user,expires_at:Date.now()/1000+900,requests,tasks:[],bound_sessions:bound?['agent:main:u24-ui']:[],material_selections:selected.length?{'agent:main:u24-ui':selected}:{}};
if(op==='enable'){enabled=true;return {enabled:true};}
if(op==='login'){user=officer;return {access_token:'isolated-fixture',user,expires_at:Date.now()/1000+300};}
if(op==='bind_session'){bound=true;return {status:'ok'};}
if(op==='materials')return {status:'ok',selected,materials:[{document_id:'emergency_plan',label:'公开台风预案',data_level:'public',selectable:true},{document_id:'material_inventory',label:'应急物资清单',data_level:'internal',selectable:true},{document_id:'command_contacts',label:'指挥中心联络表',data_level:'secret',selectable:false}]};
if(op==='select_materials'){selected=p.material_ids;return {status:'ok',selected};}
if(op==='task_reapply'){requests[0].renewed_request_id='new-request';requests[0].can_reapply=false;requests.push({...requests[0],request_id:'new-request',status:'pending_approval',authorization_expired:false,can_reapply:false,renewed_request_id:undefined});return {status:'pending_approval',request_id:'new-request'};}
throw Error('Unsupported fixture operation');}};
let dispose;const show=mode=>{dispose?.();dispose=mountDemoIdentity(document.querySelector('main'),gateway,()=>{},{mode,processingLocation:'本地测试模型'});};
window.addEventListener('gov-navigate',e=>show(e.detail.section));
window.fixture={show,expired(){requests=[{request_id:'old-request',requester:'office-test',scenario:'chat',session_key:'agent:main:u24-ui',status:'authorized',authorization_expired:true,authorization_expires_at:Date.now()/1000-1,can_reapply:true,target_resource:'nativefs://workspace/B/controlled.txt',execution_status:'not_started'}];show('approvals');}};
show('login');</script></html>`;
const allowed=new Set(['demo-identity.mjs','identity-session.mjs','task-context.mjs']);
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}const file=req.url.slice(1);if(!allowed.has(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join('modules/govagentsec-ui',file)));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(path.join(process.env.APPDATA,'npm/node_modules/openclaw/node_modules/playwright-core/index.mjs')));
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1200,height:950},permissions:['clipboard-read','clipboard-write']});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();report.external_requests++;return route.abort();});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 await page.evaluate(()=>fixture.show('receipts'));await page.getByText('登录业务身份后查看审批回执',{exact:true}).waitFor();
 assert.equal(await page.getByRole('combobox',{name:'审批筛选'}).count(),0);assert.equal(await page.getByRole('heading').count(),0);
 await page.getByRole('button',{name:'登录',exact:true}).click();report.checks.push('anonymous-receipts-one-line-login-no-filter');
 await page.getByRole('button',{name:'前往环境设置',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'开启演示身份源',exact:true}).count(),0);
 await page.getByRole('button',{name:'前往环境设置',exact:true}).click();await page.getByRole('button',{name:'开启演示身份源',exact:true}).click();
 await page.evaluate(()=>fixture.show('login'));await page.getByRole('button',{name:'进入工作台',exact:true}).click();
 await page.getByRole('button',{name:'以当前身份开始任务',exact:true}).click();await page.getByRole('button',{name:'确认绑定当前任务',exact:true}).click();
 await page.getByRole('checkbox',{name:'公开台风预案',exact:true}).waitFor();assert(await page.getByRole('checkbox',{name:'指挥中心联络表',exact:true}).isDisabled());
 await page.getByRole('checkbox',{name:'公开台风预案',exact:true}).check();await page.getByRole('checkbox',{name:'应急物资清单',exact:true}).check();
 await page.screenshot({path:path.join(out,'01-material-selection.png'),fullPage:true});report.screenshots.push('01-material-selection.png');
 await page.getByRole('button',{name:'确认本次只读材料',exact:true}).click();await page.getByRole('textbox',{name:'本次任务指令'}).waitFor();
 const draft=await page.getByRole('textbox',{name:'本次任务指令'}).inputValue();assert(draft.includes('emergency_plan')&&draft.includes('material_inventory'));assert(!draft.includes('command_contacts'));
 const selection=await page.evaluate(()=>calls.find(x=>x.op==='select_materials').p);assert.deepEqual(selection.material_ids,['emergency_plan','material_inventory']);assert.deepEqual(Object.keys(selection).sort(),['bearer','material_ids','session_key']);
 await page.getByRole('button',{name:'复制任务指令',exact:true}).click();await page.getByText('已复制。返回对话核对后发送，尚未发起模型调用。',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),draft);
 assert.equal(await page.evaluate(()=>calls.filter(x=>['send','invoke','resolve'].includes(x.op)).length),0);
 await page.screenshot({path:path.join(out,'02-material-task-draft.png'),fullPage:true});report.screenshots.push('02-material-task-draft.png');
 report.checks.push('environment-enable-is-settings-only','bound-session-material-picker','unauthorized-material-disabled','ID-only-selection-payload','confirmed-IDs-in-user-task-draft','copy-does-not-send-model-request');
 await page.evaluate(()=>fixture.expired());await page.getByRole('button',{name:'重新申请原动作',exact:true}).click();
 await page.locator('article[data-request-id="new-request"]').waitFor();const reapply=await page.evaluate(()=>calls.find(x=>x.op==='task_reapply').p);assert.deepEqual(Object.keys(reapply).sort(),['bearer','request_id']);assert.equal(reapply.request_id,'old-request');
 assert(await page.locator('article[data-request-id="new-request"]').getByRole('button',{name:'批准本次重试',exact:true}).isDisabled());
 await page.screenshot({path:path.join(out,'03-expired-new-request.png'),fullPage:true});report.screenshots.push('03-expired-new-request.png');
 report.checks.push('expired-request-reapply-by-ID-only','new-request-visible','requester-cannot-approve','no-browser-errors');assert.deepEqual(errors,[]);assert.equal(report.external_requests,0);report.passed=true;
}catch(e){report.error=e.message;process.exitCode=1;}finally{await browser?.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json'),error:report.error}));}
