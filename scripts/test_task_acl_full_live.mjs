import {goWorkspace,loginDemo} from './lib/identity-ui.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const out=path.resolve(process.env.GOV_ACL_FULL_EVIDENCE??'local-validation/identity-task-acl-full/'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const configFile=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json'),before=fs.readFileSync(configFile),config=JSON.parse(before);
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw'),sha=x=>createHash('sha256').update(x).digest('hex');
const report={passed:false,source:'real-openclaw-ui-binding-rpc',production_oidc:false,provider_e2e:false,chat_messages_sent:0,checks:[],screenshots:[]};
const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
let browser,rpc,enabledHere=false;
try{
  assert.equal(JSON.parse(fs.readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
  assert.equal(config.plugins.entries['agentguard-runtime-security'].hooks.allowConversationAccess,true);
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1500,height:1100}}),base='http://127.0.0.1:'+(config.gateway.port??18789);
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/chat?session=agent%3Amain%3Au11-ui#token='+encodeURIComponent(config.gateway.auth.token));
  await page.waitForFunction(()=>document.querySelector('openclaw-app-shell')?.context?.gateway?.snapshot?.client,null,{timeout:60000});
  await goWorkspace(page,'settings');
  rpc=(method,params={})=>page.locator('openclaw-app-shell').evaluate((e,{method,params})=>
    e.context.gateway.snapshot.client.request('govagentsec.demoIdentity.'+method,params),{method,params});
  const card=page.locator('govagentsec-workspace').getByRole('region',{name:'演示身份源',exact:true});
  await card.getByRole('button',{name:'开启演示身份源',exact:true}).waitFor({timeout:60000});
  assert.equal((await rpc('status')).enabled,false);
  assert.equal((await rpc('bind_session',{session_key:'agent:main:u11-ui'})).reason_code,'DEMO_IDENTITY_DISABLED');
  report.checks.push({id:'disabled-binding-deny',passed:true});
  await card.getByRole('button',{name:'开启演示身份源',exact:true}).click();enabledHere=true;
  await loginDemo(page,'office-test',{returnToSettings:false});
  await page.locator('govagentsec-workspace').getByRole('button',{name:'以当前身份开始任务',exact:true}).click();
  await page.locator('govagentsec-workspace').getByRole('button',{name:'确认绑定当前任务',exact:true}).click();
  await page.locator('govagentsec-workspace').getByRole('status').filter({hasText:'当前任务身份已绑定'}).waitFor();
  assert.equal(await page.locator('govagentsec-workspace').getByRole('textbox',{name:'绑定聊天会话'}).count(),0);
  for(const name of ['chat_start','chat_tool']){
    await assert.rejects(()=>rpc(name,{}));
  }
  report.checks.push({id:'real-ui-session-bind',passed:true},{id:'internal-hooks-not-rpc',passed:true});
  await page.screenshot({path:path.join(out,'u11-chat-binding.png'),fullPage:true});report.screenshots.push('u11-chat-binding.png');
  await goWorkspace(page,'settings');
  await card.getByRole('button',{name:'关闭演示身份源',exact:true}).click();enabledHere=false;
  await card.getByRole('button',{name:'开启演示身份源',exact:true}).waitFor();
  assert.equal((await rpc('status')).enabled,false);
  await page.screenshot({path:path.join(out,'u11-default-closed.png'),fullPage:true});report.screenshots.push('u11-default-closed.png');
  report.checks.push({id:'closed-after-test',passed:true});report.passed=true;
}catch(e){report.error=String(e.stack).replaceAll(config.gateway.auth.token,'[REDACTED]');process.exitCode=1;}
finally{
  if(enabledHere)await rpc?.('disable').catch(()=>{});
  await browser?.close();
  report.config_before_sha256=sha(before);report.config_after_sha256=sha(fs.readFileSync(configFile));
  if(report.config_before_sha256!==report.config_after_sha256){report.passed=false;process.exitCode=1;}
  fs.writeFileSync(path.join(out,'live-ui-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,report:path.join(out,'live-ui-report.json'),error:report.error}));
}
