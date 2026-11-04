import {chromium} from 'file:///C:/Users/23684/AppData/Roaming/npm/node_modules/openclaw/node_modules/playwright-core/index.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const c=JSON.parse(readFileSync(process.env.USERPROFILE+'/.openclaw/openclaw.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18789/#token='+encodeURIComponent(c.gateway.auth.token));
 const entry=page.locator('govagentsec-chat-traces');const button=entry.getByRole('button',{name:'任务与轨迹',exact:true});await button.waitFor({timeout:45000});
 assert.ok(await button.evaluate(el=>{const r=el.getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight&&r.top>=0}));
 const draft=page.locator('textarea').first();await draft.fill('轨迹入口验证草稿（不发送）');const url=page.url();
 await button.click();const dialog=entry.getByRole('region',{name:'任务详情'});await dialog.waitFor();await dialog.getByRole('combobox',{name:'轨迹范围'}).selectOption('all');await dialog.locator('.graph-node').first().waitFor({timeout:15000});
 assert.equal(await dialog.getByRole('combobox',{name:'轨迹范围'}).inputValue(),'all');assert.equal(page.url(),url);
 await page.screenshot({path:'local-validation/trajectory-chat-open.png'});
 await dialog.getByRole('button',{name:'关闭面板',exact:true}).click();assert.equal(await dialog.isVisible(),false);assert.equal(await draft.inputValue(),'轨迹入口验证草稿（不发送）');
 await button.click();await dialog.getByRole('combobox',{name:'轨迹范围'}).selectOption('all');await dialog.locator('.graph-node').first().waitFor();await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert.equal(await button.evaluate(el=>el.getRootNode().activeElement===el),true);
 await draft.fill('');await page.screenshot({path:'local-validation/trajectory-chat-entry.png'});
 await page.setViewportSize({width:390,height:844});await button.click();await dialog.getByRole('combobox',{name:'轨迹范围'}).selectOption('all');await dialog.locator('.graph-node').first().waitFor();assert.ok(await dialog.evaluate(e=>e.getBoundingClientRect().width<=innerWidth));
 await dialog.getByRole('button',{name:'关闭面板',exact:true}).click();
 assert.deepEqual(errors,[]);const report={passed:true,checks:['chat entry','authenticated graph in drawer','no navigation','draft preserved','close and Escape','focus restored','mobile drawer','no script errors']};writeFileSync('local-validation/trajectory-chat-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close()}
