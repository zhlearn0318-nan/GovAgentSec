import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const file=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json'),raw=fs.readFileSync(file),c=JSON.parse(raw);
const out=path.resolve(process.env.GOV_U7B_EVIDENCE??path.join('local-validation/u7b-notify-live',new Date().toISOString().replace(/[:.]/g,'-')));
fs.mkdirSync(out,{recursive:true});
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
const report={passed:false,source:'real-openclaw-workspace-tool-coverage',chat_messages_sent:0,production_oidc:false};
let browser;
try{
 assert.equal(JSON.parse(fs.readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
 const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1500,height:1100}});
 const base='http://127.0.0.1:'+(c.gateway.port??18789);
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await page.goto(base+'/plugin?plugin=protect-agent&id=govagentsec&section=settings#token='+encodeURIComponent(c.gateway.auth.token));
 const work=page.locator('govagentsec-workspace');await work.getByRole('heading',{name:'实际防护状态',exact:true}).waitFor({timeout:60000});
 report.tool_coverage=await page.locator('openclaw-app-shell').evaluate(async e=>{
   const w=await e.context.gateway.snapshot.client.request('govagentsec.trajectory.workspace',{});
   return w.tool_coverage;
 });
 assert.equal(report.tool_coverage.find(t=>t.name==='agentguard-notices__submit_emergency_notice')?.managed,true);
 const label=work.getByText(/agentguard-notices__submit_emergency_notice/);await label.first().scrollIntoViewIfNeeded();
 assert(await label.first().isVisible());await page.screenshot({path:path.join(out,'notify-tool-coverage.png')});
 report.passed=true;
}catch(e){report.error=String(e.message).replaceAll(c.gateway.auth.token,'[REDACTED]');process.exitCode=1;}
finally{await browser?.close();report.config_unchanged=fs.readFileSync(file).equals(raw);if(!report.config_unchanged){report.passed=false;process.exitCode=1;}
fs.writeFileSync(path.join(out,'ui-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,error:report.error,report:path.join(out,'ui-report.json')}));}
