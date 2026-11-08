// Real local UI/RPC switching. No chat.send, cloud model or trace upload.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {HOST} from '../modules/session-sandbox/constants.mjs';
import {sandboxPolicy} from '../modules/session-sandbox/policy.mjs';
const file=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json');
const config=JSON.parse(readFileSync(file));
const out=path.resolve('local-validation/session-sandbox',new Date().toISOString().replace(/[:.]/g,'-'),'ui');mkdirSync(out,{recursive:true});
const {chromium}=await import(pathToFileURL(path.join(HOST,'node_modules/playwright-core/index.mjs')));
const browser=await chromium.launch({channel:'msedge',headless:true});
const report={source:'real-openclaw-ui-and-authenticated-rpc',host_version:JSON.parse(readFileSync(path.join(HOST,'package.json'))).version,passed:false,chat_messages_sent:0,switches:[]};
let page,rpc;
try{
  page=await browser.newPage({viewport:{width:1500,height:1050}});
  const base='http://127.0.0.1:'+(config.gateway.port??18789);
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  await page.goto(base+'/plugin?plugin=protect-agent&id=govagentsec&section=settings#token='+encodeURIComponent(config.gateway.auth.token));
  const card=page.locator('govagentsec-workspace [aria-label="会话沙箱引擎"]');
  await card.getByText('当前：Docker',{exact:true}).waitFor({timeout:60000});
  rpc=(method,params={})=>page.locator('openclaw-app-shell').evaluate((e,{method,params})=>e.context.gateway.snapshot.client.request(method,params),{method,params});
  for(const engine of ['srt','docker']){
    await card.locator('input[value="'+engine+'"]').check();
    await card.getByText(engine==='docker'?'当前：Docker':'当前：sandbox-runtime (srt)',{exact:true}).waitFor({timeout:30000});
    const status=await rpc('govagentsec.sandbox.status');assert.equal(status.current,engine);assert.equal(status.mode,'all');assert.equal(status.elevated_disabled,true);
    const saved=JSON.parse(readFileSync(file));assert.equal(saved.agents.defaults.sandbox.backend,engine);assert.equal(saved.tools.exec.host,'sandbox');
    assert.equal(saved.agents.defaults.sandbox.workspaceRoot,sandboxPolicy(engine,saved.plugins.entries['govagentsec-session-sandbox'].config.dataDir).workspaceRoot);
    for(const key of ['gateway','models','plugins','hooks'])assert.deepEqual(saved[key],config[key],key+' unexpectedly changed');
    await card.scrollIntoViewIfNeeded();await card.screenshot({path:path.join(out,engine+'.png')});
    report.switches.push({engine,ui_visible:true,saved:true,ready:status.engines[engine].ready});
    if(process.argv.includes('--probe')){
      const {probeEngine}=await import('../modules/session-sandbox/probe.mjs');
      const evidence=await probeEngine(engine,path.join(out,engine));
      report.switches.at(-1).isolation_probe_passed=evidence.passed;
      assert(evidence.passed,evidence.error);
    }
  }
  await assert.rejects(()=>rpc('govagentsec.sandbox.select',{engine:'host'}));
  await assert.rejects(()=>rpc('govagentsec.sandbox.select',{engine:'docker',elevated:true}));
  await page.reload();await card.getByText('当前：Docker',{exact:true}).waitFor({timeout:60000});
  const root=config.plugins.entries['govagentsec-session-sandbox'].config.dataDir;
  const audit=readFileSync(path.join(root,'switch-audit.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l));
  assert.deepEqual(audit.filter(e=>e.event==='engine.switch.applied').slice(-2).map(e=>e.engine),['srt','docker']);
  report.audit_verified=true;report.protected_config_unchanged=true;report.final_engine='docker';report.passed=true;
}catch(e){report.error=String(e.message).replaceAll(config.gateway.auth.token,'[REDACTED]');process.exitCode=1;}
finally{
  // Restore safe default even if the browser assertion failed midway.
  if(rpc){try{const s=await rpc('govagentsec.sandbox.status');if(s.current!=='docker')await rpc('govagentsec.sandbox.select',{engine:'docker'});}catch{report.restore_failed=true;report.passed=false;process.exitCode=1;}}
  await browser.close();writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,report:path.join(out,'report.json')}));
}
