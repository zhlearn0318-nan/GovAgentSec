// Browser regression for visible, session-scoped protection incidents.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const root='modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/ui/';
const {chromium}=await import(pathToFileURL(process.env.APPDATA+'/npm/node_modules/openclaw/node_modules/playwright-core/index.mjs').href);
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/fixture'){
    res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="zh-CN"><head><style>body{margin:0;background:#f5f7f7;color:#263e39}openclaw-app-shell{display:flex;min-height:100vh;font-family:sans-serif}.sidebar-shell__body{width:250px;background:#fff}openclaw-chat-pane{display:flex;flex:1;flex-direction:column}.chat-thread{flex:1;padding:24px}textarea{margin:16px;padding:16px}</style></head><body><openclaw-app-shell><aside class="sidebar-shell__body"><div class="sidebar-sessions">会话</div></aside><openclaw-chat-pane><div class="chat-thread">制作报账模板</div><textarea aria-label="消息">保留的草稿</textarea></openclaw-chat-pane></openclaw-app-shell><script>
window.makeState=(incident=null,status='running')=>({version:'1',status,riskScore:incident?.kind==='security_block'?0.9:null,riskLevel:incident?.kind==='security_block'?'CRITICAL':null,incident,steps:['input','policy','tools','output'].map(id=>({id,status:id==='tools'&&incident?'blocked':'passed'}))});
window.states={a:makeState(),b:makeState(null,'idle')};window.approvals=[];window.calls=[];window.host=document.querySelector('openclaw-app-shell');window.pane=document.querySelector('openclaw-chat-pane');host.activeSessionKey='a';pane.sessionKey='a';pane.active=true;
host.context={gateway:{snapshot:{connected:true,client:{request:async(method,params)=>{if(method==='plugin.approval.list'){if(window.approvalError)throw Error('unavailable');return approvals;}calls.push(params.sessionKey);if(window.holdNext){window.holdNext=false;return await new Promise(resolve=>window.release=()=>resolve(states[params.sessionKey]));}return states[params.sessionKey];}}}}};
window.switchSession=key=>{host.activeSessionKey=key;pane.sessionKey=key;document.querySelector('.chat-thread').textContent='会话 '+key;};
</script><script src="/protect-agent/ui/inject.js"></script></body></html>`);return;
  }
  const file=pathname.endsWith('/inject.js')?'inject.js':pathname.endsWith('/styles.css')?'styles.css':null;
  if(file){res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/css');res.end(readFileSync(root+file));return;}
  res.writeHead(404);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true}),checks=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');const alert=page.locator('#protect-agent-alert');
 await page.waitForFunction(()=>calls.length>0);assert.equal(await alert.isVisible(),false);
 await page.evaluate(()=>states.a=makeState({kind:'security_block',phase:'tool_results',reasonCode:'RISK_CRITICAL',message:'工具返回含有危险指令，已停止本次运行。',stopConfirmed:true,at:Date.now()},'blocked'));
 await alert.getByText('当前任务已停止',{exact:true}).waitFor();assert.ok(await alert.isVisible());assert.equal(await alert.getAttribute('role'),'alert');assert.match(await alert.innerText(),/工具返回检查.*RISK_CRITICAL/);assert.equal(await page.locator('textarea').inputValue(),'保留的草稿');
 await page.waitForTimeout(1400);assert.ok(await alert.isVisible());checks.push('confirmed stop is visible in conversation, persists and preserves draft');
 await page.evaluate(()=>states.a.incident.stopConfirmed=false);await alert.getByText('防护异常 · 尚未确认任务停止',{exact:true}).waitFor();assert.ok(!(await alert.innerText()).includes('当前任务已停止'));checks.push('unconfirmed stop never claims task stopped');
 await page.evaluate(()=>states.a=makeState({kind:'unsupported',phase:'tool_results',reasonCode:'UNSUPPORTED_RESULT',message:'当前返回类型暂不支持安全检测。',stopConfirmed:true} ,'blocked'));
 await page.waitForFunction(()=>document.querySelector('#protect-agent-alert').dataset.kind==='unsupported');assert.match(await alert.innerText(),/无法检查/);assert.ok(!(await page.locator('.protect-guard__footer').innerText()).includes('CRITICAL'));checks.push('unsupported result is a capability warning, not critical attack');
 await page.evaluate(()=>states.a=makeState({kind:'tool_error',phase:'tools',reasonCode:'TOOL_EXECUTION_ERROR',message:'工具执行失败，请检查参数。',stopConfirmed:false}));
 await alert.getByText('工具执行出错',{exact:true}).waitFor();assert.match(await alert.innerText(),/不代表已发现安全攻击/);checks.push('ordinary tool errors remain distinct from security blocks');
 await page.evaluate(()=>states.a=makeState({kind:'approval_requested',phase:'tools',reasonCode:'APPROVAL_REQUIRED',toolCallId:'call-a',pluginId:'protect-agent',message:'核对确认请求',stopConfirmed:false}));
 await alert.getByText('尚未确认审批请求',{exact:true}).waitFor();assert.doesNotMatch(await alert.innerText(),/等待操作确认|60 秒|请处理 OpenClaw/);checks.push('approval intention alone never claims a card exists');
 await page.evaluate(()=>approvals=[{id:'approval-a',request:{sessionKey:'a',toolCallId:'call-a',pluginId:'protect-agent'},expiresAtMs:Date.now()+60000}]);
 await alert.getByText('等待操作确认',{exact:true}).waitFor();assert.match(await alert.innerText(),/不属于模型推理/);checks.push('only live matching gateway request enables waiting state');
 for(const mismatch of ['sessionKey','toolCallId','pluginId']){
   await page.evaluate(key=>approvals[0].request[key]='other',mismatch);
   await alert.getByText('尚未确认审批请求',{exact:true}).waitFor();
   await page.evaluate(()=>approvals[0].request={sessionKey:'a',toolCallId:'call-a',pluginId:'protect-agent'});
   await alert.getByText('等待操作确认',{exact:true}).waitFor();
 }
 checks.push('another session, tool call or plugin cannot confirm this approval');
 await page.evaluate(()=>approvals[0].expiresAtMs=Date.now()-1);await alert.getByText('尚未确认审批请求',{exact:true}).waitFor();checks.push('expired approval no longer displays waiting');
 await page.evaluate(()=>approvalError=true);await page.waitForFunction(()=>document.querySelector('#protect-agent-alert').textContent.includes('暂时无法核对'));checks.push('approval RPC failure is visible without fabricated pending state');
 await page.evaluate(()=>{approvalError=false;states.a=makeState({kind:'task_denied',phase:'tools',reasonCode:'P001_CONTRACT_REQUIRED',message:'请在动态权限中绑定当前任务',stopConfirmed:false},'blocked');});
 await alert.getByText('工具调用已阻断 · 任务权限未通过',{exact:true}).waitFor();assert.match(await alert.innerText(),/绑定当前任务/);assert.doesNotMatch(await alert.innerText(),/等待操作确认|请处理 OpenClaw/);checks.push('ACL denial displays binding guidance, not native approval instructions');
 await page.evaluate(()=>states.a.incident.runEnded=true);await page.waitForFunction(()=>document.querySelector('#protect-agent-alert').textContent.includes('本轮运行已结束'));checks.push('terminal ACL denial does not claim a pending wait');
 await page.evaluate(()=>states.a=makeState({kind:'approval_pending',phase:'tools',reasonCode:'APPROVAL_REQUIRED',stopConfirmed:false},'allowed'));
 await page.waitForFunction(()=>document.querySelector('#protect-agent-alert').hidden);checks.push('legacy terminal approval warning is suppressed');
 await page.evaluate(()=>{states.a=makeState({kind:'security_block',phase:'tool_results',reasonCode:'RISK_CRITICAL',message:'旧会话阻断记录',stopConfirmed:true},'blocked');holdNext=true;});
 await page.waitForFunction(()=>typeof release==='function');await page.evaluate(()=>switchSession('b'));assert.equal(await alert.isVisible(),false);await page.evaluate(()=>release());await page.waitForTimeout(800);assert.equal(await alert.isVisible(),false);assert.equal(await page.locator('.protect-guard__summary-text').textContent(),'等待新消息');checks.push('switching session clears old alert and discards late response');
 await page.evaluate(()=>{switchSession('a');states.a=makeState(null,'blocked');});await alert.getByText('防护异常 · 尚未确认任务停止',{exact:true}).waitFor();assert.match(await alert.innerText(),/没有任务停止确认/);checks.push('legacy BLOCK never implies confirmed task termination');
 await page.setViewportSize({width:640,height:780});await page.locator('.sidebar-shell__body').evaluate(e=>e.style.display='none');assert.ok(await alert.isVisible());assert.ok((await alert.boundingBox()).width<=640);checks.push('warning remains visible with hidden sidebar on mobile');
 assert.deepEqual(errors,[]);const out=process.env.GOV_APPROVAL_EVIDENCE??'local-validation/protection-alert';mkdirSync(out,{recursive:true});await page.screenshot({path:out+'/mobile.png'});writeFileSync(out+'/ui-report.json',JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
