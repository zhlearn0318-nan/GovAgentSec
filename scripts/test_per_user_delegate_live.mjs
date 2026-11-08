import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {configPath,sha,version} from './lib/config-recovery.mjs';
const out=path.resolve(process.env.GOV_DELEGATE_EVIDENCE??'local-validation/u13-per-user-delegate/'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});version();const raw=fs.readFileSync(configPath()),c=JSON.parse(raw);
const {chromium}=await import(pathToFileURL(path.join(process.env.APPDATA,'npm/node_modules/openclaw/node_modules/playwright-core/index.mjs')));
const r={passed:false,source:'real-openclaw-delegation-ui',production_oidc:false,screenshots:[]};let browser,rpc,enabled=false;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1500,height:1100}}),base='http://127.0.0.1:'+(c.gateway.port??18789);page.setDefaultTimeout(20000);
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 await page.goto(base+'/plugin?plugin=protect-agent&id=govagentsec&section=settings#token='+encodeURIComponent(c.gateway.auth.token));
 rpc=(m,p={})=>page.locator('openclaw-app-shell').evaluate((e,{m,p})=>e.context.gateway.snapshot.client.request('govagentsec.demoIdentity.'+m,p),{m,p});
 const card=page.locator('govagentsec-workspace').getByRole('region',{name:'演示身份源',exact:true});
 await card.waitFor({timeout:60000});
 r.initial_enabled=(await rpc('status')).enabled;
 if(!r.initial_enabled){
   await card.getByRole('button',{name:'开启演示身份源',exact:true}).waitFor({timeout:60000});
   enabled=true;await card.getByRole('button',{name:'开启演示身份源',exact:true}).click();
 }
 await card.getByRole('combobox',{name:'选择演示用户'}).selectOption('office-test');await card.getByRole('button',{name:'建立演示会话',exact:true}).click();
 await card.getByText(/当前委托：office-test.*DEMO_DELEGATION_ACTIVE/).waitFor();
 assert(!await card.getByRole('button',{name:'发起台风通知送审（合成）',exact:true}).isDisabled());
 await page.screenshot({path:path.join(out,'delegate-active.png'),fullPage:true});r.screenshots.push('delegate-active.png');
 await card.getByRole('button',{name:'关闭当前委托',exact:true}).click();
 await card.getByText(/当前委托：无.*DEMO_DELEGATION_REQUIRED/).waitFor();
 assert(await card.getByRole('button',{name:'发起台风通知送审（合成）',exact:true}).isDisabled());
 await page.screenshot({path:path.join(out,'delegate-revoked.png'),fullPage:true});r.screenshots.push('delegate-revoked.png');
 r.rpc=await page.locator('openclaw-app-shell').evaluate(async el=>{
   const call=(m,p={})=>el.context.gateway.snapshot.client.request('govagentsec.demoIdentity.'+m,p);
   const a=await call('login',{user:'office-test'}),old='Bearer '+a.access_token;
   const fresh=await call('login',{user:'approver-test',bearer:old});
   const denied=await call('invoke',{scenario:'notice',bearer:old});
   await call('revoke',{bearer:'Bearer '+fresh.access_token});
   return {old_token_reason:denied.reason_code,old_token_status:denied.status};
 });assert.equal(r.rpc.old_token_reason,'DEMO_DELEGATION_REVOKED');r.passed=true;
}catch(err){r.error=err.message.replaceAll(c.gateway.auth.token,'[REDACTED]');process.exitCode=1;}finally{
 try{if(enabled)await rpc('disable');r.final_enabled=rpc?(await rpc('status')).enabled:null;}
 catch{r.final_enabled=null;r.cleanup_error='final identity state unavailable';}
 r.global_state_preserved=typeof r.initial_enabled==='boolean'&&r.initial_enabled===r.final_enabled;await browser?.close();r.config_unchanged=sha(raw)===sha(fs.readFileSync(configPath()));
 if(!r.config_unchanged||!r.global_state_preserved){r.passed=false;process.exitCode=1;}fs.writeFileSync(path.join(out,'delegate-live-report.json'),JSON.stringify(r,null,2));
 console.log(JSON.stringify({passed:r.passed,report:path.join(out,'delegate-live-report.json'),error:r.error}));
}
