// Real UI + private local identity worker + OPA. Synthetic files, no model calls.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {DemoIdentityBridge,registerDemoIdentity} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs';

const output=path.resolve(process.argv[2]??'local-validation/document-import/'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(output,{recursive:true});
const bridge=new DemoIdentityBridge({root:path.join(output,'worker'),personalConfirmation:true});
globalThis[Symbol.for('govagentsec.demoIdentity.bridge')]=bridge;
const handlers=new Map();registerDemoIdentity({registerGatewayMethod:(name,handler)=>handlers.set(name,handler)});
const nonce=randomUUID();
const modules=new Set(['demo-identity.mjs','identity-session.mjs','library-summary.mjs']);
const allowed=new Set(['status','login','revoke','document_import','document_delete']);
const report={source:'real-components-local-jwt-opa-import-ui',synthetic:true,external_model_calls:0,passed:false,checks:[]};
let browser,base;
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==='/rpc'&&req.method==='POST'){
      if(req.headers['x-test-nonce']!==nonce||req.headers.origin!==base){res.writeHead(403).end();return;}
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>400000){res.writeHead(413).end();return;}}
      const {method,params}=JSON.parse(raw);const operation=method.replace('govagentsec.demoIdentity.','');
      if(!allowed.has(operation)){res.writeHead(403).end();return;}
      let result,success;
      await handlers.get(method)({params,respond:(ok,value)=>{success=ok;result=value;}});
      if(!success){res.writeHead(503).end();return;}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
    }
    if(req.url==='/'){
      res.setHeader('Content-Type','text/html;charset=utf-8');
      res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>资料导入测试</title><style>body{font:15px system-ui;margin:24px;background:#f4f7f6;color:#233e3b}main{max-width:1120px;margin:auto;background:white;border:1px solid #d6e2df;border-radius:10px}button{padding:9px 14px;border:1px solid #c5d8d1;border-radius:6px;background:white;color:#27695e;cursor:pointer}button:disabled{opacity:.5;cursor:default}.primary{background:#356c61;color:white}</style><main></main><script type="module">
import {mountDemoIdentity} from '/demo-identity.mjs';
const gateway={async request(method,params={}){const r=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json','x-test-nonce':${JSON.stringify(nonce)}},body:JSON.stringify({method,params})});if(!r.ok)throw Error('RPC failed');return r.json();}};
mountDemoIdentity(document.querySelector('main'),gateway,()=>{},{mode:'permissions'});
</script></html>`);return;
    }
    const name=req.url.slice(1);
    if(!modules.has(name)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join('modules/govagentsec-ui',name)));
  }catch{res.writeHead(500).end('Test server failed');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
try{
  assert.equal((await bridge.request('enable')).enabled,true);
  const {chromium}=await import(pathToFileURL(path.join(process.env.APPDATA,'npm/node_modules/openclaw/node_modules/playwright-core/index.mjs')));
  browser=await chromium.launch({channel:'msedge',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:1000},permissions:['clipboard-read','clipboard-write']});
  let external=0;await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():(external++,route.abort()));
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);
  await page.getByLabel('账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('Demo#Admin26');
  await page.getByRole('button',{name:'登录',exact:true}).click();
  const library=page.getByRole('region',{name:'内部资料库',exact:true});
  await library.getByRole('button',{name:'导入资料',exact:true}).click();
  await page.getByLabel('选择文件',{exact:true}).setInputFiles({name:'应急资料.txt',mimeType:'text/plain',buffer:Buffer.from('合成数据：新区应急储备物资，共20套。')});
  await page.getByLabel('资料名称',{exact:true}).fill('新区应急资料');
  await page.getByLabel('保密等级',{exact:true}).selectOption('secret');
  assert.equal(await page.getByLabel('保密等级',{exact:true}).locator('option').count(),4);
  // Status polling must not remove a selected file or typed title.
  await page.waitForTimeout(5500);
  assert.equal(await page.getByLabel('资料名称',{exact:true}).inputValue(),'新区应急资料');
  await page.screenshot({path:path.join(output,'01-import-form.png'),fullPage:true});
  await page.getByRole('button',{name:'确认导入',exact:true}).click();
  await page.getByText('已导入「新区应急资料」。',{exact:false}).waitFor();
  const row=library.locator('li').filter({hasText:'新区应急资料'});
  assert.match(await row.innerText(),/秘密 · 已导入/);assert.match(await row.innerText(),/身份可读/);
  const documentId=(await row.innerText()).match(/doc_[0-9a-f]{32}/)?.[0];assert.ok(documentId);
  assert.equal(await library.getByRole('button',{name:'复制读取指令'}).count(),0);
  page.once('dialog',dialog=>dialog.dismiss());
  await row.getByRole('button',{name:'删除资料',exact:true}).click();
  assert.equal(await row.count(),1);
  await page.screenshot({path:path.join(output,'02-imported-secret.png'),fullPage:true});
  report.checks.push('admin_import_secret','four_levels','poll_preserves_file_form','registry_refresh','delete_cancel_preserves_document');
  await page.getByRole('button',{name:'切换账号',exact:true}).click();
  await page.getByLabel('账号',{exact:true}).fill('jingban');await page.getByLabel('密码',{exact:true}).fill('Demo#Jingban26');
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await library.getByRole('button',{name:'导入资料',exact:true}).waitFor();
  assert.equal(await library.getByRole('button',{name:'导入资料',exact:true}).isDisabled(),true);
  assert.match(await library.locator('li').filter({hasText:'新区应急资料'}).innerText(),/无权读取/);
  assert.equal(await row.getByRole('button',{name:'删除资料',exact:true}).isDisabled(),true);
  await page.screenshot({path:path.join(output,'03-low-clearance.png'),fullPage:true});
  report.checks.push('account_switch_changes_authority','low_clearance_cannot_import_or_read');
  await page.getByRole('button',{name:'切换账号',exact:true}).click();
  await page.getByLabel('账号',{exact:true}).fill('admin');await page.getByLabel('密码',{exact:true}).fill('Demo#Admin26');
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await row.getByRole('button',{name:'删除资料',exact:true}).waitFor();
  page.once('dialog',dialog=>dialog.accept());
  await row.getByRole('button',{name:'删除资料',exact:true}).click();
  await page.getByText('资料已删除。',{exact:true}).waitFor();
  assert.equal(await row.count(),0);assert.equal(await library.locator('li').count(),3);
  await page.screenshot({path:path.join(output,'04-deleted.png'),fullPage:true});
  report.checks.push('low_clearance_cannot_delete','admin_confirm_delete_refreshes_list','builtin_documents_preserved');
  assert.deepEqual(errors,[]);assert.equal(external,0);
  report.passed=true;report.external_requests=external;
}catch(error){report.error=error.message;throw error;}
finally{
  await browser?.close();await bridge.request('disable').catch(()=>bridge.stop(true));
  await new Promise(r=>server.close(r));fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({passed:report.passed,report:path.join(output,'report.json')}));
}
