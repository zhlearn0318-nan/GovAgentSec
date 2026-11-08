import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,readdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {LAYERS,summarize,checkDocs,executeCheck,runProcess,saveReport} from './verify_zhengan.mjs';
const temp=()=>mkdtempSync(path.join(os.tmpdir(),'zhengan-verify-'));
const check={id:'fixture',layer:LAYERS[0],required:true,executable:process.execPath,args:['-e','process.exit(0)']};

test('failure wins over skipped; optional Live exclusion never disguises a required skip',()=>{
  const pass={...check,status:'pass'},skip={...check,status:'skipped',reason:'missing dependency'};
  assert.equal(summarize([pass,{...skip,required:false}]).exit_code,0);
  assert.equal(summarize([pass,skip]).exit_code,2);
  assert.equal(summarize([skip,{...check,status:'fail'}]).exit_code,1);
  assert.equal(summarize([skip]).layers[0].status,'skipped');
});
test('missing dependencies and unselected Live commands are never launched',async()=>{
  const root=temp();let launched=0;
  const options={root,out:root,live:false,timeoutMs:1000,run:async()=>{launched++;},dependency:async()=> '网关未启动'};
  const missing=await executeCheck(check,options);assert.equal(missing.status,'skipped');assert.equal(missing.reason,'网关未启动');
  const live=await executeCheck({...check,live:true,required:false},options);assert.match(live.reason,/-Live/);assert.equal(launched,0);
});
test('actual child failure, startup error and timeout produce nonzero reports and logs',async()=>{
  const root=temp(),options={root,out:root,live:false,timeoutMs:250,dependency:async()=>null};
  for(const [args,exit] of [[['-e','console.error("synthetic failure");process.exit(7)'],7],[['-e','setInterval(()=>{},1000)'],124]]) {
    const item=await executeCheck({...check,args},options);assert.equal(item.status,'fail');assert.equal(item.exit_code,exit);
    assert.equal(summarize([item]).exit_code,1);
    saveReport(root,{...summarize([item]),checks:[item],repository:root,reproduce:item.command,live_requested:false});
    assert.equal(JSON.parse(readFileSync(path.join(root,'report.json'))).exit_code,1);
    assert.match(readFileSync(path.join(root,'report.md'),'utf8'),/失败/);
  }
  const missing=await runProcess(path.join(root,'missing.exe'),[],{cwd:root,timeoutMs:250});assert.equal(missing.error,'ENOENT');
});
test('subtest skip remains incomplete, not passed',async()=>{
  const root=temp();const item=await executeCheck({...check,args:['-e','console.log("OK (skipped=1)")']},{root,out:root,timeoutMs:3000,live:false,dependency:async()=>null});
  assert.equal(item.status,'skipped');assert.equal(summarize([item]).exit_code,2);
  const normal=await executeCheck({...check,args:['-e','console.log("✔ verify required skip behavior\\nℹ skipped 0")']},{root,out:root,timeoutMs:3000,live:false,dependency:async()=>null});
  assert.equal(normal.status,'pass');
});
test('docs checker requires actual four-layer table, existing links and maintenance entry',()=>{
  const root=temp();mkdirSync(path.join(root,'docs'));
  writeFileSync(path.join(root,'docs/README.md'),'四层能力');assert.throws(()=>checkDocs(root),/四层表缺少/);
  writeFileSync(path.join(root,'docs/README.md'),LAYERS.slice(0,4).map(l=>'| '+l+' | [说明](page.md) |').join('\n')+'\nVerify-ZhengAn.ps1');
  assert.throws(()=>checkDocs(root),/不存在/);writeFileSync(path.join(root,'docs/page.md'),'local fixture');
  assert.throws(()=>checkDocs(root),/MAINTENANCE/);writeFileSync(path.join(root,'docs/MAINTENANCE.md'),'Verify-ZhengAn.ps1');
  assert.match(checkDocs(root),/均有效/);
});

test('PowerShell wrapper preserves exit 1 for failures and exit 2 for missing Node',async()=>{
  assert.equal(process.platform,'win32','This repository acceptance launcher targets Windows');
  const root=temp();mkdirSync(path.join(root,'scripts'));
  for(const file of ['Verify-ZhengAn.ps1','verify_zhengan.mjs'])copyFileSync(new URL('./'+file,import.meta.url),path.join(root,'scripts',file));
  const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/Verify-ZhengAn.ps1')];
  // Deliberately empty fixture repository: checks fail; the real workspace is untouched.
  const failed=await runProcess(powershell,args,{cwd:root,timeoutMs:30000});assert.equal(failed.exit_code,1,failed.stderr);
  const reportRoot=path.join(root,'local-validation/verify');
  const first=JSON.parse(readFileSync(path.join(reportRoot,readdirSync(reportRoot)[0],'report.json'),'utf8').replace(/^\uFEFF/,''));
  assert.equal(first.exit_code,1);
  const env={...process.env};for(const k of Object.keys(env))if(k.toLowerCase()==='path')delete env[k];env.PATH='';
  const unavailable=await runProcess(powershell,args,{cwd:root,timeoutMs:30000,env});assert.equal(unavailable.exit_code,2,unavailable.stderr);
  const reports=readdirSync(reportRoot).map(dir=>JSON.parse(readFileSync(path.join(reportRoot,dir,'report.json'),'utf8').replace(/^\uFEFF/,'')));
  assert(reports.some(r=>r.exit_code===2&&r.layers.length===5));
});
