import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {HOST,sdk,SRT_VERSION,SRT_LIMIT} from './constants.mjs';
import {createSrtBackend,nodeCommand} from './backend.mjs';
import {applySandboxPolicy} from './policy.mjs';
export async function probeEngine(engine,out) {
  assert(['docker','srt'].includes(engine));mkdirSync(out,{recursive:true});
  const root=path.join(out,'runtime'),input=path.join(out,'input');mkdirSync(input,{recursive:true});
  mkdirSync(path.join(root,'protected'),{recursive:true});
  const secret=path.join(root,'protected','secret.txt');writeFileSync(secret,'SYNTHETIC DENIED');
  const sessionKey=`agent:main:dashboard:u9-${engine}-${Date.now()}`;
  const config=applySandboxPolicy({agents:{defaults:{workspace:input}},skills:{allowBundled:[]}},engine,root);
  const report={source:'real-openclaw-sandbox-context',synthetic_data:true,engine,session_key:sessionKey,
    host_version:'2026.7.1-2',srt_version:engine==='srt'?SRT_VERSION:undefined,limitations:engine==='srt'?[SRT_LIMIT]:[],passed:false,checks:[]};
  let context,undo=()=>{};
  try {
    assert.equal(JSON.parse(readFileSync(path.join(HOST,'package.json'))).version,'2026.7.1-2');
    const {registerSandboxBackend}=await sdk();undo=registerSandboxBackend('srt',{factory:p=>createSrtBackend(p,{root}),resolveWorkdir:p=>p.workspaceDir});
    const {o:resolveSandboxContext}=await import(pathToFileURL(path.join(HOST,'dist/sandbox-DtTssSMH.js')));
    context=await resolveSandboxContext({config,sessionKey,workspaceDir:input});
    assert(context?.enabled);assert.equal(context.backendId,engine);
    report.runtime_id=context.runtimeId;report.workspace=context.workspaceDir;
    const run=async code=>{
      const cmd=engine==='srt'?nodeCommand(code):`node -e "eval(Buffer.from('${Buffer.from(code).toString('base64')}','base64').toString())"`;
      return await context.backend.runShellCommand({script:cmd,allowFailure:true});
    };
    const {r:createExecTool}=await import(pathToFileURL(path.join(HOST,'dist/bash-tools-DHyGpWCr.js')));
    const nativeExec=createExecTool({host:'sandbox',cwd:context.workspaceDir,config,sessionKey,allowBackground:false,timeoutSec:180,notifyOnExit:false,
      sandbox:{containerName:context.containerName,workspaceDir:context.workspaceDir,containerWorkdir:context.containerWorkdir,
        workdirValidation:context.backend.workdirValidation,validateWorkdir:context.backend.validateWorkdir?.bind(context.backend),
        workdirRoots:context.backend.workdirRoots,env:context.backend.env??context.docker.env,buildExecSpec:context.backend.buildExecSpec.bind(context.backend)}});
    const started=Date.now();const exec=await nativeExec.execute('u9-exec',{command:engine==='srt'?"Write-Output 'EXEC_ISOLATED_OK'":"printf 'EXEC_ISOLATED_OK'",workdir:context.containerWorkdir});
    report.exec_duration_ms=Date.now()-started;assert.equal(exec.details?.exitCode,0,JSON.stringify(exec));assert.match(JSON.stringify(exec.content),/EXEC_ISOLATED_OK/);
    report.checks.push({name:'native_exec_tool',result:'allow'});
    // Fixed host mounts workspaceAccess=none read-only. Writes belong to tmpfs.
    const allowedPath=engine==='docker'?'/tmp/allowed.txt':'allowed.txt';
    const allowed=await run(`const fs=require('fs');const p=${JSON.stringify(allowedPath)};fs.writeFileSync(p,'SYNTHETIC PUBLIC');if(fs.readFileSync(p,'utf8')!=='SYNTHETIC PUBLIC')process.exit(2);console.log('ALLOW');`);
    assert.equal(allowed.code,0,allowed.stderr.toString());assert.match(allowed.stdout.toString(),/ALLOW/);
    report.checks.push({name:'allowed_read_write',result:'allow',location:engine==='docker'?'container /tmp tmpfs':'isolated session workspace'});
    const protectedPath=engine==='srt'?secret:'/host-protected/secret.txt';
    const denied=await run(`try{require('fs').readFileSync(${JSON.stringify(protectedPath)});console.log('UNEXPECTED_READ');process.exitCode=2}catch(e){console.log('DENY_READ:'+e.code)}`);
    assert.equal(denied.code,0,denied.stderr.toString());assert.match(denied.stdout.toString(),/DENY_READ:/);
    assert.equal(readFileSync(secret,'utf8'),'SYNTHETIC DENIED');
    report.checks.push({name:'protected_read',result:'deny',receipt:denied.stdout.toString().trim()});
    const outside=engine==='srt'?path.join(out,'outside.txt'):'/outside.txt';
    const write=await run(`try{require('fs').writeFileSync(${JSON.stringify(outside)},'SYNTHETIC');console.log('UNEXPECTED_WRITE');process.exitCode=2}catch(e){console.log('DENY_WRITE:'+e.code)}`);
    assert.equal(write.code,0);assert.match(write.stdout.toString(),/DENY_WRITE:/);
    report.checks.push({name:'outside_write',result:'deny',receipt:write.stdout.toString().trim()});
    const network=await run(`const s=require('net').connect({host:'1.1.1.1',port:443});s.setTimeout(3000);s.once('connect',()=>{console.log('UNEXPECTED_NETWORK');s.destroy();process.exitCode=2});s.once('error',e=>console.log('DENY_NETWORK:'+e.code));s.once('timeout',()=>{console.log('DENY_NETWORK:timeout');s.destroy()});`);
    assert.equal(network.code,0);assert.match(network.stdout.toString(),/DENY_NETWORK:/);
    report.checks.push({name:'non_allowlisted_network',result:'deny',receipt:network.stdout.toString().trim()});
    // The file tool bridge must enforce the same session boundary.
    writeFileSync(path.join(context.workspaceDir,'public-fixture.txt'),'SYNTHETIC PUBLIC');
    assert.equal((await context.fsBridge.readFile({filePath:path.join(context.containerWorkdir,'public-fixture.txt')})).toString(),'SYNTHETIC PUBLIC');
    await assert.rejects(()=>context.fsBridge.readFile({filePath:engine==='srt'?secret:'/host-protected/secret.txt'}));
    report.checks.push({name:'file_tool_bridge',result:'inside-allow/outside-deny'});
    report.passed=true;
  }catch(e){report.error=String(e.message).slice(0,2500);}
  finally {
    if(context?.backendId==='docker'){
      const {command}=await import('./service.mjs');
      const inspect=await command('docker',['inspect',context.runtimeId,'--format','{{json .HostConfig}}']);
      if(inspect.ok){const h=JSON.parse(inspect.output);report.hardening={network:h.NetworkMode,readonly_root:h.ReadonlyRootfs,cap_drop:h.CapDrop,privileged:h.Privileged,memory:h.Memory,pids:h.PidsLimit,binds:h.Binds};
        if(h.NetworkMode!=='none'||!h.ReadonlyRootfs||h.Privileged||!h.CapDrop.includes('ALL')){report.passed=false;report.error='Docker hardening mismatch';}}
      await command('docker',['rm','-f',context.runtimeId]);
    }
    undo();writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
  return report;
}
