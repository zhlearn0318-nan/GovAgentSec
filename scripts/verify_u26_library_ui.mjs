// Real local identity RPC + repository UI; no LLM or production gateway writes.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {DemoIdentityBridge} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs';
const out=path.resolve(process.argv[2]??fs.readFileSync('.runtime/u26-evidence-path.txt','utf8').trim()+'/ui');fs.mkdirSync(out,{recursive:true});
const bridge=new DemoIdentityBridge({root:path.join(out,'worker')});
const report={passed:false,source:'real-local-jwt-opa-with-repository-ui',production_oidc:false,model_calls:0,checks:[],screenshots:[]};
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>资料与工具权限</title><style>body{font:13px/1.55 "Segoe UI Variable","Microsoft YaHei UI","Microsoft YaHei",sans-serif;margin:24px;background:#f5f7f7;color:#233e3b}main{max-width:1120px;margin:auto;background:#fff;border:1px solid #e0e7e4;border-radius:9px}button{font:inherit;padding:8px 12px;background:white;border:1px solid #e0e7e4;border-radius:6px;color:#1e695b}h2{font-size:14px}</style><main></main><script type="module">
import {mountDemoIdentity} from '/demo-identity.mjs';
const gateway={request:async(method,payload={})=>{const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:method.split('.').at(-1),payload})});if(!response.ok)throw Error('RPC_UNAVAILABLE');return response.json();}};
mountDemoIdentity(document.querySelector('main'),gateway,()=>{},{mode:'permissions'});</script></html>`;
const allowed=new Set(['status','login','revoke']);
const assets=new Set(['demo-identity.mjs','identity-session.mjs','task-context.mjs','library-summary.mjs']);
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==='/rpc'&&req.method==='POST'){
      const pieces=[];for await(const c of req)pieces.push(c);const {operation,payload}=JSON.parse(Buffer.concat(pieces));
      if(!allowed.has(operation))throw Error('OP_NOT_ALLOWED');const {bearer,...body}=payload;
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await bridge.request(operation,body,bearer)));return;
    }
    const name=req.url.slice(1);res.setHeader('Content-Type',assets.has(name)?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
    if(req.url==='/')res.end(html);else if(assets.has(name))res.end(fs.readFileSync(path.join('modules/govagentsec-ui',name)));else{res.writeHead(404);res.end();}
  }catch{res.writeHead(503);res.end('Unavailable');}
});
let browser;
try{
  await bridge.request('enable');await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
  const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+server.address().port);
  for(const [account,password,readable] of [['jingban','Demo#Jingban26',1],['shenpi','Demo#Shenpi26',2],['weihu','Demo#Weihu26',5],['admin','Demo#Admin26',5]]){
    await page.getByLabel('账号',{exact:true}).fill(account);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByRole('button',{name:'登录',exact:true}).click();
    const library=page.getByRole('region',{name:'资料与工具权限',exact:true});await library.waitFor();
    assert.equal(await library.getByText('身份可读',{exact:true}).count(),readable);
    assert.equal(await library.getByRole('region',{name:'工具库',exact:true}).locator('li').count(),10);
    assert.equal(await library.getByText('准入未通过',{exact:true}).count(),0);
    assert.equal(await library.getByText('MCP · 声明检查通过',{exact:true}).count(),5);
    assert.equal(await library.getByText('按当前账号执行 · 受控资料适配器',{exact:true}).count(),1);
    const image=account+'-libraries.png';await page.screenshot({path:path.join(out,image),fullPage:true});report.screenshots.push(image);
    report.checks.push({account,readable,tools:10});await page.getByRole('button',{name:'退出登录',exact:true}).click();
  }
  assert.deepEqual(errors,[]);report.passed=true;
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{await browser?.close();await bridge.request('disable').catch(()=>bridge.stop(true));await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
