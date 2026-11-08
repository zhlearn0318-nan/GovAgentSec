import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const file=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json'),before=readFileSync(file,'utf8'),config=JSON.parse(before);
const {chromium}=await import(pathToFileURL(path.join(process.env.APPDATA,'npm/node_modules/openclaw/node_modules/playwright-core/index.mjs')));
const out=process.env.GOV_U16_UI_EVIDENCE??'local-validation/evolution-release-gate/live-'+new Date().toISOString().replace(/[:.]/g,'-');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),report={passed:false,source:'live-openclaw-existing-workshop',confirmation_attempted:false};
try{
 const page=await browser.newPage({viewport:{width:1700,height:1100}}),base=`http://127.0.0.1:${config.gateway.port??18789}`;
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.goto(base+'/plugin?plugin=protect-agent&id=govagentsec&section=audit&tab=candidates#token='+encodeURIComponent(config.gateway.auth.token));
 await page.getByRole('heading',{name:'候选 Skill 与步骤来源'}).waitFor({timeout:60000});
 const buttons=page.getByRole('button',{name:'人工确认，仅提交复核'});await buttons.first().waitFor({timeout:60000});
 assert(await buttons.count()>=2);for(const b of await buttons.all())assert(await b.isDisabled());
 assert.match(await page.locator('.release-gate').first().innerText(),/需 OIDC/);
 const gates=await page.locator('.release-gate').allTextContents();assert(gates.some(t=>t.includes('admitted_block')));
 await page.screenshot({path:out+'/workshop-gate.png',fullPage:true});
 assert.equal(readFileSync(file,'utf8'),before);report.config_unchanged=true;report.disabled_buttons=await buttons.count();report.passed=true;
}catch(e){report.error=e.message.replaceAll(config.gateway.auth.token,'[REDACTED]');process.exitCode=1;}
finally{await browser.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
