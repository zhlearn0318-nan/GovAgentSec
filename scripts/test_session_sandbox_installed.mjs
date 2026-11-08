import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {dataRoot} from '../modules/session-sandbox/constants.mjs';
import {createSrtBackend,nodeCommand,executeSpec} from '../modules/session-sandbox/backend.mjs';
import {sandboxPolicy} from '../modules/session-sandbox/policy.mjs';
const root=dataRoot(),workspace=path.join(sandboxPolicy('srt',root).workspaceRoot,'u9-deployment-smoke-'+Date.now());
mkdirSync(workspace,{recursive:true});
const backend=await createSrtBackend({workspaceDir:workspace,scopeKey:'u9-deployment'},{root});
const report={source:'real-installed-srt-backend',synthetic_data:true,workspace,passed:false};
const code=`const fs=require('fs');fs.writeFileSync('public.txt','SYNTHETIC');if(fs.readFileSync('public.txt','utf8')!=='SYNTHETIC')process.exit(2);console.log('ALLOW');try{fs.readFileSync(${JSON.stringify(path.join(root,'protected','synthetic-secret.txt'))});process.exit(3)}catch(e){console.log('DENY_READ:'+e.code)}try{fs.writeFileSync(${JSON.stringify(path.join(root,'u9-forbidden.txt'))},'SYNTHETIC');process.exit(4)}catch(e){console.log('DENY_WRITE:'+e.code)}const s=require('net').connect({host:'1.1.1.1',port:443});s.setTimeout(3000);s.once('connect',()=>{s.destroy();process.exitCode=5});s.once('error',e=>console.log('DENY_NETWORK:'+e.code));s.once('timeout',()=>{console.log('DENY_NETWORK:timeout');s.destroy()});`;
try{
  const result=await executeSpec(await backend.buildExecSpec({command:'& '+nodeCommand(code),workdir:workspace,env:{},usePty:false}));
  assert.equal(result.code,0,result.stderr.toString());const output=result.stdout.toString();
  for(const marker of ['ALLOW','DENY_READ:EPERM','DENY_WRITE:EPERM','DENY_NETWORK:'])assert(output.includes(marker),output);
  report.receipts=output.trim().split(/\r?\n/);report.passed=true;
}catch(e){report.error=e.message;process.exitCode=1;}
writeFileSync('local-validation/session-sandbox/deployment-srt-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));

