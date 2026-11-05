import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const cfg=JSON.parse(readFileSync(process.env.USERPROFILE+'/.openclaw/openclaw.json','utf8'));
const {chromium}=await import(pathToFileURL(process.env.APPDATA+'/npm/node_modules/openclaw/node_modules/playwright-core/index.mjs').href);
const browser=await chromium.launch({channel:'msedge',headless:true});
const checks=[],base='http://127.0.0.1:18789';mkdirSync('local-validation/delivery',{recursive:true});
try{
  for(const url of ['/protect-agent/ui/state','/plugins/protect-agent/panel','/plugins/aegis-admission/panel?embed=1','/plugins/aegis-admin/mcp?embed=1','/plugins/agentguard-runtime-security/panel','/plugins/agentguard-runtime-security/api/snapshot','/plugins/govagentsec/trajectories']){
    const response=await fetch(base+url);assert.ok([401,403].includes(response.status),url+' anonymous status '+response.status);checks.push({anonymous:url,status:response.status});
  }
  const denied=await fetch('http://127.0.0.1:8080/invoke',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subject:{id:'forged',roles:['admin']},action:{tool:'database.query',parameters:{}}})});
  assert.equal(denied.status,503);checks.push({developmentIdentity:'disabled',http:denied.status});
  const login=await browser.newPage();await login.goto(base);await login.getByText('政安智枢 · 安全工作区',{exact:true}).waitFor();
  await login.screenshot({path:'local-validation/delivery/login.png'});checks.push('Chinese login without credentials');await login.close();
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(base+'/plugin?plugin=protect-agent&id=govagentsec&section=settings#token='+encodeURIComponent(cfg.gateway.auth.token));
  const work=page.locator('govagentsec-workspace');await work.getByRole('heading',{name:'实际防护状态',exact:true}).waitFor({timeout:60000});
  const coverage=await page.locator('openclaw-app-shell').evaluate(e=>e.context.gateway.snapshot.client.request('govagentsec.trajectory.status',{}));
  assert.equal(coverage.agentguard_identity_mode,'disabled');assert.equal(coverage.runtime.input.mode,'enforce');assert.equal(coverage.runtime.output.mode,'observe');assert.equal(coverage.runtime.tool_results.mode,'enforce');
  checks.push({coverage});await page.screenshot({path:'local-validation/delivery/settings.png'});
  for(const [label,selector] of [['输入防护策略','#steps'],['运行防护与审批记录','#metric-total'],['准入规则','#form']]){
    await work.getByRole('button',{name:label,exact:true}).click();const iframe=work.locator('iframe');await iframe.waitFor();
    assert.equal(await iframe.getAttribute('sandbox'),'allow-scripts');const panel=work.frameLocator('iframe');
    await panel.locator(selector).waitFor();
    const frame=page.frames().find(f=>f.url().includes('/plugins/')&&f.parentFrame());
    if(label==='输入防护策略')assert.equal(await frame.evaluate(async()=> (await fetch('/protect-agent/ui/state')).status),200);
    if(label==='运行防护与审批记录'){
      assert.equal(await frame.evaluate(async()=> (await fetch('/plugins/agentguard-runtime-security/api/snapshot')).status),200);
      assert.ok(await panel.locator('#run-action').isDisabled());
    }
    const frameUrl=await iframe.getAttribute('src');assert.ok(frameUrl.includes('gov_access='));
    assert.equal((await fetch(base+frameUrl)).status,401,'page ticket cannot replay');
    await page.screenshot({path:'local-validation/delivery/panel-'+checks.length+'.png'});checks.push(label+' authenticated, isolated, single-use access');
    await work.getByRole('button',{name:'返回防护设置',exact:true}).click();await work.getByRole('heading',{name:'实际防护状态',exact:true}).waitFor();
  }
  await work.getByRole('button',{name:'返回对话',exact:true}).click();await page.locator('openclaw-chat-pane textarea').first().waitFor();await page.locator('#protect-agent-guard').waitFor({state:'visible'});assert.equal(await page.locator('#protect-agent-guard button').first().getAttribute('aria-expanded'),'true');
  checks.push('live protection chain visible and expanded on chat');await page.screenshot({path:'local-validation/delivery/chat.png'});
  await page.locator('openclaw-app-shell').evaluate(e=>e.navigate('plugin',{search:'?plugin=govagentsec-trajectory&id=history'}));
  await work.getByRole('heading',{name:'审计中心',exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('section'),'audit');checks.push('legacy trajectory route redirects to canonical audit center');
  assert.deepEqual(errors,[]);
  writeFileSync('local-validation/delivery/report.json',JSON.stringify({passed:true,checks},null,2));console.log(JSON.stringify({passed:true,checks}));
}catch(e){console.error(String(e.stack??e).replaceAll(cfg.gateway.auth.token,'[redacted]'));process.exitCode=1;}finally{await browser.close();}
