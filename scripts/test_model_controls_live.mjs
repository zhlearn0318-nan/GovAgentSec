// Local browser verification only. No chat.send and no cloud request.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
const config=JSON.parse(readFileSync(path.join(process.env.USERPROFILE,'.openclaw/openclaw.json')));
const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
const out=path.resolve('local-validation/model-controls');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={source:'live-openclaw-ui',chat_messages_sent:0};
try {
  const page=await browser.newPage({viewport:{width:1450,height:1000}});
  const base='http://127.0.0.1:'+(config.gateway.port??18789);
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/chat#token='+encodeURIComponent(config.gateway.auth.token));
  await page.locator('.chat-controls__combined-model-option').first().waitFor({state:'attached',timeout:60000});
  await page.locator('summary[data-chat-model-select]').click();
  await page.waitForTimeout(5000);
  const options=page.locator('[data-chat-model-option]');
  report.models=await options.evaluateAll(es=>es.map(e=>e.getAttribute('data-chat-model-option')));
  assert(report.models.includes('deepseek/deepseek-flash'));
  assert(report.models.includes('deepseek/deepseek-v4-pro'));
  assert(await page.locator('[data-chat-model-provider="ollama"]').count());
  assert(!(await page.locator('[data-chat-thinking-slider]').isDisabled()));
  assert(await page.locator('[data-chat-speed-option="on"]').isDisabled());
  await page.screenshot({path:path.join(out,'model-menu.png')});
  await page.locator('summary[data-chat-model-select]').click();
  // A dedicated empty session avoids altering an existing user's preferences.
  const key='agent:main:dashboard:model-controls-smoke';
  await page.locator('openclaw-chat-pane').evaluate((e,key)=>e.onPaneSessionChange(e.paneId,key),key);
  await page.waitForFunction(key=>document.querySelector('openclaw-chat-pane')?.state?.sessionKey===key,key);
  await page.waitForFunction(()=>{const s=document.querySelector('openclaw-chat-pane')?.state;return s?.connected&&!s.chatLoading&&!s.chatModelsLoading&&s.chatModelCatalog?.length>=3;});
  await page.waitForTimeout(1500);
  report.switches=[];
  for(const [model,thinking] of [['deepseek-v4-pro','high'],['deepseek-flash','low']]) {
    const menu=page.locator('details.chat-controls__model');
    if(!(await menu.evaluate(e=>e.open)))await menu.locator('summary').click();
    await page.locator('[data-chat-model-provider="deepseek"]').click();
    await page.locator(`[data-chat-model-option="deepseek/${model}"]`).click();
    const slider=page.locator('[data-chat-thinking-slider]');
    const values=(await slider.getAttribute('data-chat-thinking-values')).split(',');
    assert(values.includes(thinking));
    await slider.fill(String(values.indexOf(thinking)));
    await menu.getByRole('button',{name:'保存',exact:true}).click();
    await page.waitForFunction(({model,thinking})=>{
      const s=document.querySelector('openclaw-chat-pane')?.state;
      const row=s?.sessionsResult?.sessions?.find(r=>r.key===s.sessionKey);
      return row?.model===model&&row?.thinkingLevel===thinking;
    },{model,thinking},{timeout:30000});
    await page.reload();
    await page.locator('summary[data-chat-model-select]').waitFor({timeout:60000});
    await page.waitForFunction(({model,thinking})=>{
      const s=document.querySelector('openclaw-chat-pane')?.state;
      const row=s?.sessionsResult?.sessions?.find(r=>r.key===s.sessionKey);
      return row?.model===model&&row?.thinkingLevel===thinking;
    },{model,thinking},{timeout:30000});
    await page.waitForTimeout(1000);
    report.switches.push({model,thinking,saved_and_reloaded:true});
  }
  await page.locator('summary[data-chat-model-select]').click();
  await page.screenshot({path:path.join(out,'saved-flash-low.png')});
  report.passed=true;
  console.log(JSON.stringify(report));
}catch(e){report.error=String(e.message).replaceAll(config.gateway.auth.token,'[REDACTED]');process.exitCode=1;console.log(report.error);}
finally{await browser.close();writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
