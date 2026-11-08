// Real local MCP -> HTTP -> OPA -> ticket -> adapter, viewed through the shipping panel handler.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import plugin,{buildSnapshot} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/index.js';
import {issuePageAccess} from '../modules/govagentsec-ui/access.mjs';
import {toolCoverage} from '../modules/trajectory-governance/task-links.mjs';

const root=process.cwd(),out=path.resolve('local-validation/behavior-constraint',new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(out,{recursive:true});
const configFile=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json');
const configHash=()=>createHash('sha256').update(readFileSync(configFile)).digest('hex');
const before=configHash();
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
assert.equal(JSON.parse(readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
const report={passed:false,source:'real-local-http-mcp-opa-panel',data:'synthetic',identity:'loopback_static_dev-not-production-OIDC',host_session:false};
const child=spawn(path.join(root,'modules/agentguard-group2/.venv/Scripts/python.exe'),['-u','scripts/lib/behavior_constraint_live.py',out],
  {cwd:root,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'}});
let stderr='',browser,server;
child.stderr.setEncoding('utf8');child.stderr.on('data',x=>stderr=(stderr+x).slice(-12000));
const exit=new Promise(resolve=>child.once('exit',resolve));
try {
  const ready=await new Promise((resolve,reject)=>{
    let buffer='';const timeout=setTimeout(()=>reject(Error('MCP startup timeout')),45000);
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
      buffer+=chunk;if(buffer.includes('\n')){clearTimeout(timeout);try{resolve(JSON.parse(buffer.split('\n')[0]));}catch(e){reject(e);}}
    });
    child.once('error',reject);child.once('exit',code=>{clearTimeout(timeout);reject(Error('MCP service exited '+code+': '+stderr));});
  });
  const cfg={agentGuardBaseUrl:ready.base,auditPath:path.join(out,'state/enforcement_audit.jsonl'),statusPath:path.join(out,'status.json'),identityMode:'loopback_static_dev'};
  let handler;plugin.register({pluginConfig:cfg,registerHttpRoute:r=>handler=r.handler});
  server=createServer((req,res)=>Promise.resolve(handler(req,res)).catch(()=>{res.statusCode=500;res.end('panel failure');}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1700,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const grant=issuePageAccess('/plugins/agentguard-runtime-security/panel?section=approvals');
  await page.goto(base+grant.url);
  await page.locator('.task-contract').first().waitFor({timeout:20000});
  const body=await page.locator('#approval-rows').innerText();
  assert.match(body,/tool_untrusted/);assert.match(body,/notification.submit/);assert.match(body,/票据 TTL 30 秒/);
  assert.match(await page.locator('#identity-label').innerText(),/演示身份（非生产）/);
  assert.equal(await page.locator('[data-approval="approve"]').count(),0);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,'pending-provenance-contract.png'),fullPage:true});
  const snapshot=await buildSnapshot(cfg);
  writeFileSync(path.join(out,'panel-snapshot.json'),JSON.stringify(snapshot,null,2));
  const coverage=toolCoverage({mcp:{servers:{'agentguard-notices':{toolFilter:{include:['submit_emergency_notice']}}}}},['exec','agentguard-notices__submit_emergency_notice']);
  assert.equal(coverage.find(x=>x.name==='exec').managed,false);
  assert.equal(coverage.find(x=>x.name==='agentguard-notices__submit_emergency_notice').managed,true);
  Object.assign(report,JSON.parse(readFileSync(ready.report)),{passed:true,panel_passed:true,approval_execution_disabled:true,tool_coverage:coverage});
} catch(e) {report.passed=false;report.error=String(e.message);process.exitCode=1;}
finally {
  await browser?.close();if(server)await new Promise(r=>server.close(r));
  child.stdin.end('\n');
  const timer=setTimeout(()=>child.kill(),10000);const code=await exit;clearTimeout(timer);
  report.service_exit_code=code;
  report.gateway_config_unchanged=configHash()===before;
  if(code!==0||!report.gateway_config_unchanged){report.passed=false;process.exitCode=1;}
  writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  writeFileSync(path.join(out,'README.md'),'# U7 本机真实链路演示\n\n数据和身份均为合成；真实 MCP/HTTP/OPA/票据/隔离账本/正式面板代码，非 OpenClaw 模型会话。\n\n复跑：在仓库根目录执行 `node scripts/demo_behavior_constraint.mjs`。面板只读，审批由显式本地测试身份完成，非生产 OIDC。\n');
  console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json')}));
}
