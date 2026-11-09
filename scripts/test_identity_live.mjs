import {identityView} from './lib/identity-ui.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const configFile=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json');
const before=readFileSync(configFile,'utf8'),config=JSON.parse(before);
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
assert.equal(JSON.parse(readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
const out=path.resolve('local-validation/identity-guardrails',new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(out,{recursive:true});
const report={passed:false,source:'live-openclaw',business_actions_attempted:false,pages:[]};
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1500,height:1000}});
  const base='http://127.0.0.1:'+(config.gateway.port??18789),posts=[];
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(evaluate|approvals\/resolve|demo\/gov-documents)/.test(r.url()))posts.push(new URL(r.url()).pathname);});
  await page.goto(base+'/plugin?plugin=protect-agent&id=govagentsec&section=home#token='+encodeURIComponent(config.gateway.auth.token));
  const workspace=page.locator('govagentsec-workspace');
  for(const section of ['home','approvals','settings']) {
    if(section!=='home')await page.locator('.gov-nav [data-route='+section+']').click();
    await page.locator('govagentsec-shell').getByRole('button',{name:'登录业务身份',exact:true}).waitFor({timeout:60000});
    const identity=await identityView(page);
    assert.equal(identity.user,null);assert.equal(identity.execution_enabled,false);
    report.pages.push({section,label:'尚未登录业务身份'});
    await page.screenshot({path:path.join(out,section+'.png'),fullPage:true});
  }
  await workspace.getByRole('button',{name:'运行防护与审批记录',exact:true}).click();
  const frame=workspace.frameLocator('iframe');
  await frame.locator('#identity-label').waitFor({timeout:30000});
  for(const id of ['run-action','run-gov-documents','approver-id','approval-note'])assert(await frame.locator('#'+id).isDisabled());
  assert.equal(await frame.locator('[data-approval="approve"]').count(),0);
  assert.deepEqual(posts,[]);
  await page.screenshot({path:path.join(out,'runtime-readonly.png'),fullPage:true});
  assert.equal(readFileSync(configFile,'utf8'),before);
  report.config_unchanged=true;report.execution_controls_disabled=true;report.passed=true;
} catch(e) {
  report.error=String(e.message).replaceAll(config.gateway.auth.token,'[REDACTED]');process.exitCode=1;
} finally {
  await browser.close();writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,report:path.join(out,'report.json')}));
}
