// Read-only deployment check; never enables the shared demonstration identity source.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {goWorkspace} from './lib/identity-ui.mjs';
const out=path.join(process.argv[2]??fs.readFileSync('.runtime/u25-evidence-path.txt','utf8').trim(),'deployment');fs.mkdirSync(out,{recursive:true});
const file=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json'),before=fs.readFileSync(file),config=JSON.parse(before),base='http://127.0.0.1:'+config.gateway.port;
const hash=v=>createHash('sha256').update(v).digest('hex'),host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
const report={passed:false,source:'current-gateway-readonly-no-identity-activation',checks:[],external_requests:0};let browser;
try{
 assert.equal(JSON.parse(fs.readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
 let ready=false;for(let i=0;i<60;i++){try{ready=(await fetch(base,{signal:AbortSignal.timeout(700)})).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready,'CURRENT_GATEWAY_NOT_READY');
 const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(15000);
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();report.external_requests++;return route.abort();});
 await page.goto(base+'/plugins/govagentsec/welcome#token='+encodeURIComponent(config.gateway.auth.token));await page.getByRole('button',{name:'进入工作区',exact:true}).click();
 // HTTP is available before the gateway finishes starting its sidecars.
 await page.locator('govagentsec-shell .inspect').waitFor({timeout:60000});await goWorkspace(page,'permissions');
 assert.deepEqual(await page.locator('.gov-nav button').allTextContents(),['动态权限','能力准入','审计演进','防护设置']);report.checks.push('four-entry-current-gateway');
 const work=page.locator('govagentsec-workspace');await work.getByRole('heading',{name:'登录业务身份',exact:true}).waitFor();await page.screenshot({path:path.join(out,'permissions.png'),fullPage:true});
 const rpc=(method,params={})=>page.locator('openclaw-app-shell').evaluate((el,{method,params})=>el.context.gateway.snapshot.client.request(method,params),{method,params});
 const state=await rpc('govagentsec.demoIdentity.status');assert.equal(state.enabled,false);assert.equal(state.user,null);assert.deepEqual(state.requests,[]);report.checks.push('demo-source-default-off');
 await assert.rejects(()=>rpc('govagentsec.trace.list'));report.checks.push('deployed-business-audit-guard');
 await goWorkspace(page,'audit');await work.getByRole('button',{name:'前往动态权限',exact:true}).waitFor();assert.equal(await work.locator('input[type=password]').count(),0);
 await goWorkspace(page,'settings');for(const name of ['实际防护状态','安全总览','配置与维护'])await work.getByRole('heading',{name,exact:true}).waitFor();await work.locator('input[value=docker]').waitFor();await page.screenshot({path:path.join(out,'settings.png'),fullPage:true});
 assert.deepEqual(await work.locator('[data-settings-section]').evaluateAll(nodes=>nodes.map(n=>n.dataset.settingsSection)),['overview','status','maintenance']);
 for(const label of ['输入防护策略','运行防护与审批记录'])assert.equal(await work.getByRole('button',{name:label,exact:true}).count(),0);
 await work.getByRole('heading',{name:'配置与维护',exact:true}).evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(out,'settings-maintenance.png'),fullPage:true});report.checks.push('settings-readonly-and-single-login');
 await assert.rejects(()=>rpc('govagentsec.runtime.overview',{}));report.checks.push('deployed-overview-identity-guard');
 const activation=await rpc('govagentsec.demoIdentity.activate_chat',{session_key:'agent:main:readonly-auto-preflight'});
 assert.equal(activation.reason_code,'DEMO_IDENTITY_DISABLED');report.checks.push('automatic-chat-rpc-installed-and-disabled-source-denies');
 await page.locator('openclaw-app-shell').evaluate(el=>el.navigate('chat'));
 await page.locator('openclaw-chat-pane textarea').first().waitFor();
 const shell=page.locator('govagentsec-shell');await shell.getByRole('button',{name:'资料权限',exact:true}).click();
 await shell.getByRole('region',{name:'会话身份与资料权限',exact:true}).waitFor();
 await shell.getByRole('heading',{name:'登录业务身份',exact:true}).waitFor();
 assert.equal(await shell.getByRole('button',{name:/确认绑定|选择本次材料/}).count(),0);
 await page.screenshot({path:path.join(out,'chat-identity-entry.png'),fullPage:true,animations:'disabled'});
 report.checks.push('chat-identity-entry-without-task-binding');
 assert.equal(report.external_requests,0);report.passed=true;
}catch(e){report.error=String(e.message).replaceAll(config.gateway.auth.token,'[REDACTED]');process.exitCode=1;}
finally{await browser?.close();report.config_sha256=hash(before);report.config_unchanged=hash(before)===hash(fs.readFileSync(file));if(!report.config_unchanged){report.passed=false;process.exitCode=1;}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,error:report.error,report:path.join(out,'report.json')}));}
