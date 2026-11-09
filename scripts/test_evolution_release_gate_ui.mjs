import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,cpSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {registerTrace} from '../modules/govagentsec-trace/register.mjs';
const input=path.resolve(process.argv[2]??'local-validation/real-evolution/2026-11-07-multi-trace-final');
const out=path.resolve('local-validation/evolution-release-gate',new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(out,{recursive:true});cpSync(path.join(input,'evidence/traces'),path.join(out,'traces'),{recursive:true});
cpSync(path.join(input,'skill-workshop'),path.join(out,'skill-workshop'),{recursive:true});
const source=JSON.parse(readFileSync(path.join(input,'report.json')));
// Isolated historical fixture: populate the new snapshot only in the test copy; never rewrite source evidence.
const records=JSON.parse(readFileSync(path.join(input,'records.json')));
for(const id of [source.candidate.id,source.poison_admission.id]){const file=path.join(out,'skill-workshop',id,'candidate.json'),c=JSON.parse(readFileSync(file));
 c.generation={...c.generation,task_key:source.task_key,selection:source.selection,assessment_snapshot:records};writeFileSync(file,JSON.stringify(c,null,2));}
const methods=new Map(),loader=path.join(out,'loader');mkdirSync(loader);
registerTrace({pluginConfig:{dataDir:out},config:{agents:{defaults:{workspace:out}},skills:{load:{extraDirs:[loader]}}},logger:{warn(){}},on(){},registerHttpRoute(){},registerGatewayMethod(n,f,o){methods.set(n,{f,o});}});
assert.equal(methods.get('govagentsec.trace.confirmReview').o.scope,'operator.admin');
let client=null;const calls=[],report={passed:false,input,source:'real-evidence-copy-with-test-auth-context',installed:false};
const server=createServer(async(req,res)=>{
 try{const u=new URL(req.url,'http://local');
 if(u.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<html lang="zh-CN"><meta charset="utf-8"><main></main><script type="module">import{mountTraceAudit}from'/view.mjs';mountTraceAudit(document.querySelector('main').attachShadow({mode:'open'}),async(m,p={})=>{const r=await fetch('/rpc',{method:'POST',body:JSON.stringify({m,p})});const v=await r.json();if(!v.ok)throw Error(v.error);return v.data;},{initialTab:'candidates'});</script>`);return;}
 if(u.pathname==='/rpc'){let body='';for await(const b of req)body+=b;const {m,p}=JSON.parse(body);calls.push(m);assert(!/install|publish/i.test(m));const fn=methods.get('govagentsec.trace.'+m);assert(fn);await fn.f({params:p,client,respond:(ok,data,error)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok,data,error}));}});return;}
 if(['/view.mjs','/view-model.mjs','/usage.mjs'].includes(u.pathname)){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(path.join('modules/govagentsec-trace',u.pathname.slice(1))));return;}
 res.writeHead(404);res.end();}catch{res.writeHead(500);res.end('{}');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const {chromium}=await import(pathToFileURL(path.join(process.env.APPDATA,'npm/node_modules/openclaw/node_modules/playwright-core/index.mjs')));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1700,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.address().port;await page.goto(url);
 // Candidate UI displays names, locate through known unique name.
 const benign=page.locator('.candidate').filter({hasText:'typhoon-brief-evidence-candidate'});
 const poison=page.locator('.candidate').filter({hasText:'typhoon-poison-rejection-control'});
 await benign.getByText('参与轨迹 6',{exact:false}).waitFor();
 assert(await benign.getByRole('button',{name:'人工确认，仅提交复核'}).isDisabled());
 assert(await poison.getByRole('button',{name:'人工确认，仅提交复核'}).isDisabled());
 assert.match(await benign.innerText(),/安全通过 4 · 隔离 2/);assert.match(await benign.innerText(),/准入通过/);assert.match(await poison.innerText(),/准入阻断/);
 await page.screenshot({path:path.join(out,'gate-disabled.png'),fullPage:true});
 // Trusted handler-context simulation, explicitly not a production identity integration.
 client={isDeviceTokenAuth:true,connect:{role:'operator',scopes:['operator.admin'],device:{id:'a'.repeat(64)}}};
 await page.reload();await benign.getByText('参与轨迹 6',{exact:false}).waitFor();
 assert(await poison.getByRole('button',{name:'人工确认，仅提交复核'}).isDisabled());
 // Real historical candidate is test_only. A verified administrator still cannot turn it into production evidence.
 assert(await benign.getByRole('button',{name:'人工确认，仅提交复核'}).isDisabled());
 let confirmation;
 await methods.get('govagentsec.trace.confirmReview').f({params:{candidate_id:source.candidate.id,artifact_hash:source.candidate.artifact_hash},client,
   respond:ok=>{confirmation=ok;}});
 assert.equal(confirmation,false);assert.equal(await benign.getByText('复核回执：',{exact:false}).count(),0);assert.equal(readdirSync(loader).length,0);
 assert.equal(JSON.parse(readFileSync(path.join(out,'skill-workshop',source.candidate.id,'candidate.json'))).status,'admission_passed');
 assert(!calls.some(m=>/install|publish/i.test(m)));assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(out,'gate-test-only-no-confirm.png'),fullPage:true});
 report.passed=true;report.checks=['identity_disabled','six_scores_topk_quarantine','allow_block','block_not_confirmable','test_only_not_confirmable_even_by_admin','workshop_state_preserved','no_install_api','loader_empty'];report.calls=[...new Set(calls)];
}catch(e){report.error=e.message;process.exitCode=1;}
finally{await browser.close();await new Promise(r=>server.close(r));writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,report:path.join(out,'report.json')}));}
