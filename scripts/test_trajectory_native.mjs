import {chromium} from 'file:///C:/Users/23684/AppData/Roaming/npm/node_modules/openclaw/node_modules/playwright-core/index.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const c=JSON.parse(readFileSync(process.env.USERPROFILE+'/.openclaw/openclaw.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:18789/#token='+encodeURIComponent(c.gateway.auth.token));
 await page.getByRole('button',{name:'更多',exact:true}).click();
 const tab=page.getByRole('link',{name:'历史调用轨迹',exact:true});await tab.waitFor({timeout:45000});const href=await tab.getAttribute('href');await tab.click();
 await page.waitForFunction(()=>document.querySelector('govagentsec-trajectory-view')?.shadowRoot?.querySelectorAll('.graph-node').length>0,{},{timeout:30000});
 const view=page.locator('govagentsec-trajectory-view');assert.ok((await view.locator('#status').innerText()).includes('当前登录连接'));
 assert.equal(await view.locator('#token').isVisible(),false);
 assert.ok(await view.locator('#runs button').count()>=3);await view.locator('#runs button').filter({hasText:'purchase-holdout-c'}).click();await view.locator('.graph-node[data-kind="tool"]').first().click();
 assert.ok((await view.locator('#inspector').textContent()).includes('调用 ID'));
 await page.screenshot({path:'local-validation/trajectory-native-desktop.png',fullPage:true});
 await page.reload();await view.locator('.graph-node').first().waitFor({timeout:30000});
 assert.deepEqual(errors,[]);
 const report={passed:true,href,checks:['native sidebar','authenticated RPC','no token re-entry','graph and inspector','reload history','no script errors']};
 writeFileSync('local-validation/trajectory-native-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close()}
