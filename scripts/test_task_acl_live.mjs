import {identityView,loginDemo} from './lib/identity-ui.mjs';
// Real browser -> existing authenticated OpenClaw RPC -> U4b verifier/U7/OPA/adapters.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root=process.cwd(),host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
const configFile=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json');
const before=fs.readFileSync(configFile),config=JSON.parse(before);
const out=path.resolve(process.env.GOV_IDENTITY_ACL_EVIDENCE??path.join('local-validation/identity-task-acl',new Date().toISOString().replace(/[:.]/g,'-')));
fs.mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={source:'real-openclaw-ui-rs256-opa-task-acl',synthetic_data:true,production_oidc:false,
  label:'演示身份源（非生产）',passed:false,host_version:JSON.parse(fs.readFileSync(path.join(host,'package.json'))).version,
  config_before_sha256:sha(before),external_requests_blocked:0,chat_messages_sent:0,checks:[],screenshots:[]};
let browser,page,rpc,enabledHere=false;
const shot=async(name)=>{await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});report.screenshots.push(name+'.png');};
try{
  assert.equal(report.host_version,'2026.7.1-2');
  const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
  browser=await chromium.launch({channel:'msedge',headless:true});
  page=await browser.newPage({viewport:{width:1500,height:1100}});
  const base='http://127.0.0.1:'+(config.gateway.port??18789);
  await page.route('**/*',r=>{
    if(new URL(r.request().url()).origin===base)return r.continue();
    report.external_requests_blocked++;return r.abort();
  });
  await page.goto(base+'/plugin?plugin=protect-agent&id=govagentsec&section=settings#token='+encodeURIComponent(config.gateway.auth.token));
  const work=page.locator('govagentsec-workspace'),card=work.getByRole('region',{name:'演示身份源',exact:true});
  await card.getByRole('button',{name:'开启演示身份源',exact:true}).waitFor({timeout:60000});
  rpc=(method,params={})=>page.locator('openclaw-app-shell').evaluate((e,{method,params})=>
    e.context.gateway.snapshot.client.request('govagentsec.demoIdentity.'+method,params),{method,params});
  assert.equal((await rpc('status')).enabled,false);
  assert.equal((await rpc('task_create',{})).reason_code,'DEMO_IDENTITY_DISABLED');
  report.checks.push({name:'default_disabled',passed:true});await shot('01-default-disabled');
  await card.getByRole('button',{name:'开启演示身份源',exact:true}).click();enabledHere=true;
  const select=card.getByRole('combobox',{name:'选择演示用户'});
  const login=user=>loginDemo(page,user);
  await login('office-test');
  assert.equal(await select.locator('option').count(),4);
  const banner=page.locator('govagentsec-shell').locator('.identity-bar');
  assert.match(await banner.innerText(),/演示（非生产）/);
  assert.doesNotMatch(await banner.innerText(),/组织身份已启用/);
  await shot('02-office-identity');
  await card.getByRole('combobox',{name:'任务绑定目录'}).selectOption('A');
  await card.getByRole('button',{name:'创建只读任务',exact:true}).click();
  const task=card.locator('article[data-task-id]');await task.waitFor();
  report.task_id=await task.getAttribute('data-task-id');
  const available=task;
  assert.equal(await available.getByRole('button',{name:'读取 emergency_plan',exact:true}).count(),1);
  assert.match(await available.innerText(),/emergency_plan/);
  assert.equal(await available.getByRole('button',{name:'读取 material_inventory',exact:true}).count(),0);
  await shot('03-task-a-only');
  await task.getByRole('button',{name:'读取 emergency_plan',exact:true}).click();
  await card.getByText('材料读取申请 · 已执行（合成）',{exact:true}).waitFor();
  await task.getByRole('button',{name:'尝试读取目录 B（未授权演示）',exact:true}).click();
  await card.getByText('材料读取申请 · 已阻断',{exact:true}).waitFor();
  const denied=(await identityView(page)).requests.find(r=>r.document_id==='material_inventory');
  assert.equal(denied.reason_code,'P014_RESOURCE_OUTSIDE_TASK');report.denied=denied;
  await shot('04-directory-b-denied');
  const record=card.locator('article[data-request-id="'+denied.request_id+'"]');
  await record.getByRole('button',{name:'申请一次性扩权',exact:true}).click();
  await record.getByText('材料读取申请 · 需审批',{exact:true}).waitFor();
  assert(await record.getByRole('button',{name:'批准并执行一次',exact:true}).isDisabled());
  // Tokens remain inside browser memory; only sanitized receipts cross to the report.
  report.negatives=await page.locator('openclaw-app-shell').evaluate(async(e,{id,gatewayToken})=>{
    const c=(m,p={})=>e.context.gateway.snapshot.client.request('govagentsec.demoIdentity.'+m,p);
    const o=await c('login',{user:'office-test'}),bearer='Bearer '+o.access_token;
    return {self:await c('resolve',{request_id:id,bearer,resolution:'approve'}),
      forged:await c('task_escalate',{request_id:id,bearer,roles:['business_approver']}),
      gateway:await c('task_create',{directory:'A',bearer:'Bearer '+gatewayToken})};
  },{id:denied.request_id,gatewayToken:config.gateway.auth.token});
  assert.equal(report.negatives.self.reason_code,'D105_SELF_APPROVAL');
  assert.equal(report.negatives.self.read_count,1);
  assert.equal(report.negatives.forged.http_status,403);assert.equal(report.negatives.gateway.http_status,401);
  report.checks.push({name:'A_visible_B_hard_deny_no_read_self_forgery_gateway_rejected',passed:true});
  await shot('05-explicit-approval-pending');
  await login('approver-test');
  await record.getByRole('button',{name:'批准并执行一次',exact:true}).click();
  await record.getByText('材料读取申请 · 已执行（合成）',{exact:true}).waitFor();
  await shot('06-approved-once');
  report.replay=await page.locator('openclaw-app-shell').evaluate(async(e,id)=>{
    const c=(m,p={})=>e.context.gateway.snapshot.client.request('govagentsec.demoIdentity.'+m,p);
    const a=await c('login',{user:'approver-test'});
    return c('resolve',{request_id:id,bearer:'Bearer '+a.access_token,resolution:'approve'});
  },denied.request_id);
  assert.equal(report.replay.reason_code,'A409_ALREADY_RESOLVED');assert.equal(report.replay.executed,false);
  assert.equal(report.replay.read_count,2);
  report.checks.push({name:'one_approval_one_B_read_replay_blocked',passed:true});
  await login('auditor-test');
  assert(await card.getByRole('button',{name:'创建只读任务',exact:true}).isDisabled());
  assert.equal((await identityView(page)).user.id,'auditor-test');
  assert((await identityView(page)).audit.length>0);
  await shot('07-auditor-readonly-ledger');
  report.checks.push({name:'auditor_identity_retained_readonly_ledger',passed:true});
  const active=await identityView(page);report.evidence_id=active.evidence_id;
  await card.getByRole('button',{name:'关闭演示身份源',exact:true}).click();
  await card.getByRole('button',{name:'开启演示身份源',exact:true}).waitFor();
  assert.equal((await rpc('status')).enabled,false);
  assert.equal((await rpc('task_read',{})).reason_code,'DEMO_IDENTITY_DISABLED');
  assert.equal((await identityView(page)).execution_enabled,false);await shot('08-disabled-restored');
  report.checks.push({name:'disable_restores_fail_closed',passed:true});
  const audit=fs.readFileSync(path.join(root,'.runtime/identity-demo',active.evidence_id,'identity-audit.jsonl'),'utf8');
  for(const expected of ['P014_RESOURCE_OUTSIDE_TASK','D105_SELF_APPROVAL','A409_ALREADY_RESOLVED','demo_identity.disabled'])assert(audit.includes(expected));
  assert.doesNotMatch(audit,/access_token|PRIVATE KEY|eyJ[A-Za-z0-9_-]+\.|document_content/);
  fs.writeFileSync(path.join(out,'identity-audit.jsonl'),audit);
  report.receipts=audit.trim().split('\n').map(JSON.parse).filter(e=>e.task_id===report.task_id);
  const deniedReceipt=report.receipts.find(e=>e.reason_code==='P014_RESOURCE_OUTSIDE_TASK');
  assert.equal(deniedReceipt.read_count,1);
  const executed=report.receipts.filter(e=>e.executed===true);
  assert.equal(executed.length,2);assert.equal(executed[1].read_count,2);
  assert.equal(executed[0].scope_digest,executed[1].scope_digest);
  report.checks.push({name:'audit_same_task_scope_unchanged_read_count_1_to_2',passed:true});
  report.passed=true;
}catch(e){report.error=String(e.message).replaceAll(config.gateway.auth.token,'[REDACTED]');process.exitCode=1;}
finally{
  if(rpc&&enabledHere){try{report.demo_disabled_after_run=(await rpc('disable')).enabled===false;}catch{report.restore_failed=true;report.passed=false;process.exitCode=1;}}
  await browser?.close();
  const after=fs.readFileSync(configFile);report.config_after_sha256=sha(after);report.config_unchanged=before.equals(after);
  if(!report.config_unchanged){report.passed=false;process.exitCode=1;}
  fs.writeFileSync(path.join(out,'live-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,error:report.error,report:path.join(out,'live-report.json')}));
}
