// Local gateway/UI smoke only. Creates and denies its own synthetic approval;
// does not send an Agent turn, execute a tool or touch another user's approval.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const out=process.env.GOV_APPROVAL_EVIDENCE??'local-validation/approval-lifecycle';
fs.mkdirSync(out,{recursive:true});
const configFile=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json');
const before=fs.readFileSync(configFile),cfg=JSON.parse(before),base='http://127.0.0.1:'+cfg.gateway.port;
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
assert.equal(JSON.parse(fs.readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={passed:false,source:'real-local-gateway-native-approval-synthetic-request',agent_turns:0,tool_executions:0,external_requests:0};
const session='agent:main:dashboard:approval-ui-smoke-'+randomUUID(),callId=randomUUID();
let page,requester,requestId;
const rpc=(method,params={})=>page.locator('openclaw-app-shell').evaluate((el,{method,params})=>el.context.gateway.snapshot.client.request(method,params),{method,params});
try{
 const context=await browser.newContext({viewport:{width:1400,height:900}});
 await context.route('**/*',r=>{if(new URL(r.request().url()).origin===base)return r.continue();report.external_requests++;return r.abort();});
 page=await context.newPage();page.setDefaultTimeout(20000);
 await page.goto(base+'/chat?session='+encodeURIComponent(session)+'#token='+encodeURIComponent(cfg.gateway.auth.token));
 await page.waitForFunction(()=>document.querySelector('openclaw-app-shell')?.context?.gateway.snapshot.connected,{},{timeout:60000});
 const sessions=await rpc('sessions.list',{limit:1000});
 report.active_runs=(sessions.sessions??[]).filter(s=>s.hasActiveRun===true||s.status==='running').length;
 if(!process.argv.includes('--preflight')){
   // The fixed host excludes the requesting connection from approval delivery.
   // Use another connection in this same isolated browser/device context.
   requester=await page.context().newPage();
   await requester.goto(base+'/chat?session='+encodeURIComponent(session));
   await requester.waitForFunction(()=>document.querySelector('openclaw-app-shell')?.context?.gateway.snapshot.connected,{},{timeout:60000});
   await requester.locator('openclaw-app-shell').evaluate((el,{session,callId})=>{
     window.approvalSmoke=el.context.gateway.snapshot.client.request('plugin.approval.request',{
       pluginId:'protect-agent',title:'合成测试：操作确认卡片',description:'仅验证确认界面，不执行文件或命令。',
       toolName:'approval_ui_smoke',toolCallId:callId,sessionKey:session,
       allowedDecisions:['allow-once','deny'],timeoutMs:60000,twoPhase:true
     }).then(value=>window.approvalSmokeResult={value},error=>window.approvalSmokeResult={error:String(error.message)});
   },{session,callId});
   const card=page.locator('openclaw-modal-dialog').filter({hasText:'合成测试：操作确认卡片'});
   await card.waitFor({state:'visible'});
   const pending=await rpc('plugin.approval.list');
   const own=pending.find(x=>x.request?.sessionKey===session&&x.request?.toolCallId===callId);
   assert(own);requestId=own.id;
   assert.equal(own.request.pluginId,'protect-agent');
   await page.screenshot({path:path.join(out,'native-confirmation-card.png')});
   await card.getByRole('button',{name:/^(拒绝|Deny)$/}).click();
   await card.waitFor({state:'hidden'});
   assert(!(await rpc('plugin.approval.list')).some(x=>x.id===requestId));
   report.native_card_visible=true;report.own_request_denied=true;
 }
 assert.equal(report.external_requests,0);report.passed=true;
}catch(e){
 report.error=String(e.message).replaceAll(cfg.gateway.auth.token,'[REDACTED]');
 report.request_error=await requester?.evaluate(()=>window.approvalSmokeResult?.error??null).catch(()=>null);
 if(page)await page.screenshot({path:path.join(out,'live-failure.png')}).catch(()=>{});
 process.exitCode=1;
}
finally{
 if(!requestId && page){
   const requests=await rpc('plugin.approval.list').catch(()=>[]);
   requestId=requests.find(x=>x.request?.sessionKey===session&&x.request?.toolCallId===callId)?.id;
 }
 if(requestId)await rpc('plugin.approval.resolve',{id:requestId,decision:'deny'}).catch(()=>{});
 await browser.close();
 report.config_sha256=createHash('sha256').update(before).digest('hex');
 report.config_unchanged=before.equals(fs.readFileSync(configFile));
 if(!report.config_unchanged){report.passed=false;process.exitCode=1;}
 const file=path.join(out,process.argv.includes('--preflight')?'preflight.json':'live-card-report.json');
 fs.writeFileSync(file,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
