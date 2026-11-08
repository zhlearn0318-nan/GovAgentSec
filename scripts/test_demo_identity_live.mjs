// Real Control UI + authenticated RPC + local OPA. Synthetic business actions only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const root=process.cwd(),host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
const configFile=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json');
const before=fs.readFileSync(configFile),config=JSON.parse(before);
const out=path.resolve(process.env.GOV_IDENTITY_DEMO_EVIDENCE??path.join('local-validation/identity-demo',new Date().toISOString().replace(/[:.]/g,'-')));
fs.mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={source:'real-openclaw-ui-and-local-rs256-oidc',synthetic_data:true,production_oidc:false,
  label:'演示身份源（非生产）',passed:false,host_version:JSON.parse(fs.readFileSync(path.join(host,'package.json'))).version,
  config_before_sha256:sha(before),cloud_requests:0,chat_messages_sent:0,checks:[],screenshots:[]};
let browser,page,rpc,enabledHere=false;
const shot=async(name)=>{await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});report.screenshots.push(name+'.png');};
try{
  assert.equal(report.host_version,'2026.7.1-2');
  const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
  browser=await chromium.launch({channel:'msedge',headless:true});
  page=await browser.newPage({viewport:{width:1500,height:1100}});
  const base='http://127.0.0.1:'+(config.gateway.port??18789);
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/plugin?plugin=protect-agent&id=govagentsec&section=settings#token='+encodeURIComponent(config.gateway.auth.token));
  const work=page.locator('govagentsec-workspace'),card=work.getByRole('region',{name:'演示身份源',exact:true});
  await card.getByRole('button',{name:'开启演示身份源',exact:true}).waitFor({timeout:60000});
  rpc=(method,params={})=>page.locator('openclaw-app-shell').evaluate((e,{method,params})=>
    e.context.gateway.snapshot.client.request('govagentsec.demoIdentity.'+method,params),{method,params});
  const initial=await rpc('status');assert.equal(initial.enabled,false);assert.equal(initial.default_enabled,false);
  assert.equal((await rpc('invoke',{scenario:'notice'})).reason_code,'DEMO_IDENTITY_DISABLED');
  assert.equal((await rpc('resolve',{request_id:'absent'})).reason_code,'DEMO_IDENTITY_DISABLED');
  report.checks.push({name:'default_off_execution_and_approval',passed:true});await shot('01-disabled');

  await card.getByRole('button',{name:'开启演示身份源',exact:true}).click();enabledHere=true;
  const select=card.getByRole('combobox',{name:'选择演示用户'});
  await select.waitFor();
  assert.equal(await select.locator('option').count(),4);
  await select.selectOption('office-test');
  await card.getByRole('button',{name:'建立演示会话',exact:true}).click();
  await card.getByText(/当前已验证：office-test/).waitFor();
  const banner=work.getByRole('region',{name:'业务身份状态'});
  assert.match(await banner.innerText(),/演示身份源（非生产）/);
  assert.doesNotMatch(await banner.innerText(),/组织身份已启用/);
  await shot('02-office-session');
  await card.getByRole('button',{name:'发起台风通知送审（合成）',exact:true}).click();
  await card.getByText('台风通知送审 · 待人工审批',{exact:true}).waitFor();
  const pending=(await rpc('status')).requests.find(r=>r.scenario==='notice');assert(pending);
  report.request_id=pending.request_id;
  assert.equal(await card.getByRole('button',{name:'人工确认并执行',exact:true}).isDisabled(),true);
  await shot('03-office-pending');

  // Keep access tokens inside this browser evaluation. Return only public receipts.
  const negatives=await page.locator('openclaw-app-shell').evaluate(async(e,{id,gatewayToken})=>{
    const call=(m,p={})=>e.context.gateway.snapshot.client.request('govagentsec.demoIdentity.'+m,p);
    const office=await call('login',{user:'office-test'}),finance=await call('login',{user:'finance-test'});
    return {
      self:await call('resolve',{request_id:id,bearer:'Bearer '+office.access_token,resolution:'approve'}),
      other_role:await call('resolve',{request_id:id,bearer:'Bearer '+finance.access_token,resolution:'approve'}),
      body_roles:await call('resolve',{request_id:id,bearer:'Bearer '+office.access_token,roles:['business_approver']}),
      gateway_token:await call('resolve',{request_id:id,bearer:'Bearer '+gatewayToken,resolution:'approve'}),
      tamper:await call('resolve',{request_id:id,bearer:'Bearer '+office.access_token,resource:'demo://forged'})
    };
  },{id:pending.request_id,gatewayToken:config.gateway.auth.token});
  assert.equal(negatives.self.reason_code,'D105_SELF_APPROVAL');
  assert.equal(negatives.other_role.reason_code,'A403_APPROVER_ROLE_REQUIRED');
  assert.equal(negatives.body_roles.http_status,403);
  assert.equal(negatives.gateway_token.http_status,401);
  assert.equal(negatives.tamper.http_status,403);
  assert.equal(negatives.self.counts.notices,0);assert.equal(negatives.other_role.counts.notices,0);
  report.negative_cases=negatives;
  report.checks.push({name:'self_body_roles_gateway_token_tamper_rejected_zero_effects',passed:true});

  await select.selectOption('finance-test');await card.getByRole('button',{name:'建立演示会话',exact:true}).click();
  await card.getByText(/当前已验证：finance-test/).waitFor();
  await card.getByRole('button',{name:'发起测试付款 600 元（合成）',exact:true}).click();
  await card.getByText('测试付款 · 待人工审批',{exact:true}).waitFor();await shot('04-finance-pending');
  await select.selectOption('approver-test');await card.getByRole('button',{name:'建立演示会话',exact:true}).click();
  await card.getByText(/当前已验证：approver-test/).waitFor();await shot('05-approver-session');
  const notice=card.locator('article[data-request-id="'+pending.request_id+'"]');
  await notice.getByRole('button',{name:'人工确认并执行',exact:true}).click();
  await notice.getByText('台风通知送审 · 已执行（合成）',{exact:true}).waitFor();
  const payment=(await rpc('status')).requests.find(r=>r.scenario==='payment');assert(payment);
  await card.locator('article[data-request-id="'+payment.request_id+'"]').getByRole('button',{name:'人工确认并执行',exact:true}).click();
  await card.getByText('测试付款 · 已执行（合成）',{exact:true}).waitFor();await shot('06-approved-once');
  const replay=await page.locator('openclaw-app-shell').evaluate(async(e,id)=>{
    const c=e.context.gateway.snapshot.client;
    const user=await c.request('govagentsec.demoIdentity.login',{user:'approver-test'});
    return c.request('govagentsec.demoIdentity.resolve',{request_id:id,bearer:'Bearer '+user.access_token,resolution:'approve'});
  },pending.request_id);
  assert.equal(replay.reason_code,'A409_ALREADY_RESOLVED');assert.equal(replay.status,'blocked');assert.equal(replay.executed,false);
  assert.deepEqual(replay.counts,{notices:1,payments:1});report.replay=replay;
  report.checks.push({name:'two_user_approval_and_once_only_isolated_execution',passed:true});
  const active=await rpc('status');report.evidence_id=active.evidence_id;
  await card.getByRole('button',{name:'关闭演示身份源',exact:true}).click();
  await card.getByRole('button',{name:'开启演示身份源',exact:true}).waitFor();
  assert.equal((await rpc('status')).enabled,false);
  assert.equal((await rpc('invoke',{scenario:'notice'})).reason_code,'DEMO_IDENTITY_DISABLED');
  assert.match(await banner.innerText(),/执行与审批已禁用/);await shot('07-disabled-restored');
  await page.reload();await card.getByRole('button',{name:'开启演示身份源',exact:true}).waitFor({timeout:60000});
  assert.equal((await rpc('status')).enabled,false);
  report.checks.push({name:'disable_revokes_and_reload_stays_off',passed:true});
  const auditFile=path.join(root,'.runtime/identity-demo',active.evidence_id,'identity-audit.jsonl');
  const audit=fs.readFileSync(auditFile,'utf8');
  assert.match(audit,/demo_identity.enabled/);assert.match(audit,/demo_identity.disabled/);
  assert.doesNotMatch(audit,/access_token|PRIVATE KEY|eyJ[A-Za-z0-9_-]+\./);
  fs.writeFileSync(path.join(out,'identity-audit.jsonl'),audit);
  report.checks.push({name:'audited_non_production_no_bearer_or_private_key_on_disk',passed:true});
  report.passed=true;
}catch(e){report.error=String(e.message).replaceAll(config.gateway.auth.token,'[REDACTED]');process.exitCode=1;}
finally{
  if(rpc&&enabledHere){try{const s=await rpc('disable');report.demo_disabled_after_run=s.enabled===false;}catch{report.restore_failed=true;report.passed=false;process.exitCode=1;}}
  await browser?.close();
  const after=fs.readFileSync(configFile);report.config_after_sha256=sha(after);report.config_unchanged=before.equals(after);
  if(!report.config_unchanged){report.passed=false;process.exitCode=1;}
  fs.writeFileSync(path.join(out,'live-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,error:report.error,report:path.join(out,'live-report.json')}));
}
