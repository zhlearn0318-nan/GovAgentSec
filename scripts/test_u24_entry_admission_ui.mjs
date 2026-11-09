// UI interaction fixtures only; policy decisions are tested separately with real Aegis analyzers.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {renderWelcomePage} from '../modules/govagentsec-ui/welcome.mjs';
import {renderMcpPage} from '../modules/aegis/demo_web/openclaw_plugin/aegis-admission-ui/admin_pages.js';
const out=path.resolve(process.env.GOV_U24_UI_EVIDENCE??'local-validation/u24-entry-admission/'+new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(out,{recursive:true});
const calls=[],checks=[],errors=[];let decision='ALLOW',saved=false,externalRequests=0;
const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/welcome'){res.end(renderWelcomePage());return;}
  if(u.pathname==='/mcp'){res.end(renderMcpPage('fixture-only',{canManage:true}));return;}
  if(u.pathname==='/plugin'){res.end('<h1>Fixture host destination</h1>');return;}
  if(u.pathname==='/plugins/aegis-admin/api'){
    const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));calls.push(body);
    saved=body.operation==='admit_mcp'&&decision==='ALLOW';res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ok:true,data:{decision,saved,reason:'UI fixture decision',config_sha256:'f'.repeat(64),duration_ms:21,finding_rule_ids:decision==='BLOCK'?['FIXTURE_BLOCK']:[]}}));return;
  }res.writeHead(404);res.end();
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(path.join(process.env.APPDATA,'npm/node_modules/openclaw/node_modules/playwright-core/index.mjs')));
let browser;const report={passed:false,source:'isolated-ui-fixture-real-renderers',synthetic:true,checks};
try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1366,height:900}});
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();externalRequests++;return route.abort();});
  await page.goto(base+'/welcome#token=local-fixture-secret');await page.getByRole('heading',{name:'政安纵深',exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'');assert(!await page.locator('body').innerText().then(t=>t.includes('local-fixture-secret')));
  assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage})),'{}');
  await page.screenshot({path:path.join(out,'01-welcome.png')});await page.getByRole('button',{name:'进入工作区',exact:true}).click();
  await page.waitForURL('**/plugin?**');assert.equal(new URL(page.url()).searchParams.get('section'),'login');assert.equal(new URL(page.url()).hash,'#token=local-fixture-secret');checks.push('entry fixed same-origin destination; token fragment stripped from entry and never stored');
  await page.goto(base+'/mcp');await page.getByLabel('服务器名称').fill('internal-docs');await page.getByLabel('服务地址').fill('https://example.test/mcp');await page.getByLabel('允许调用的工具').fill('search, read_document');
  assert.equal(await page.getByRole('button',{name:'确认保存配置'}).isVisible(),false);
  await page.getByRole('button',{name:'检查配置',exact:true}).click();await page.getByText('检查通过，尚未保存。请确认后继续。',{exact:true}).waitFor();
  assert.equal(calls.length,1);assert.equal(calls[0].operation,'preview_mcp');assert.equal(saved,false);assert.deepEqual(calls[0].request.server.toolFilter.include,['search','read_document']);checks.push('preview is separate from save; template produces exact tool names');
  await page.screenshot({path:path.join(out,'02-mcp-preview.png')});
  await page.getByLabel('服务器名称').fill('edited-docs');assert.equal(await page.getByRole('button',{name:'确认保存配置'}).isVisible(),false);checks.push('editing invalidates checked payload');
  await page.getByRole('button',{name:'检查配置',exact:true}).click();await page.getByRole('button',{name:'确认保存配置'}).click();await page.getByText('配置已保存。服务连接仍待验证。',{exact:true}).waitFor();
  assert.equal(calls.at(-1).operation,'admit_mcp');assert.equal(calls.at(-1).request.name,'edited-docs');assert.equal(saved,true);checks.push('explicit save re-enters existing admission operation');
  decision='BLOCK';await page.getByLabel('服务器名称').fill('blocked-docs');await page.getByRole('button',{name:'检查配置',exact:true}).click();await page.getByText('检查未通过，未保存配置。',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'确认保存配置'}).isVisible(),false);assert.equal(calls.filter(c=>c.operation==='admit_mcp').length,1);checks.push('BLOCK exposes no save action');
  await page.getByLabel('服务地址').fill('http://example.test/mcp');const n=calls.length;await page.getByRole('button',{name:'检查配置',exact:true}).click();await page.getByText('请输入 HTTPS 服务地址。',{exact:true}).waitFor();assert.equal(calls.length,n);checks.push('simple form rejects insecure remote before submit');
  assert.deepEqual(errors,[]);assert.equal(externalRequests,0);report.passed=true;
}catch(e){report.error=e.message;process.exitCode=1;}finally{report.external_requests=externalRequests;report.page_errors=errors;writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();await new Promise(r=>server.close(r));console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json'),error:report.error}));}
