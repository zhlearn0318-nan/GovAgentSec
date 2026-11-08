import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {version,configPath,sha} from './config-recovery.mjs';
export function evidence(slug){
 const out=path.resolve('local-validation',slug,new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(out,{recursive:true});
 const report={source:slug,started_at:new Date().toISOString(),host_version:version(),production_oidc:false,checks:[],config_before_sha256:sha(fs.readFileSync(configPath()))};
 const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 return {out,report,run(id,exe,args,env={}){
   const r=spawnSync(exe,args,{cwd:process.cwd(),encoding:'utf8',windowsHide:true,timeout:600000,maxBuffer:4194304,
     env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',...env}});
   fs.writeFileSync(path.join(out,id+'.log'),(r.stdout??'')+(r.stderr??''));
   report.checks.push({id,command:[exe,...args],exit_code:r.status,passed:r.status===0,error:r.error?.code});save();console.log(id+': '+(r.status===0?'PASS':'FAIL'));
   return r;
 },finish(extra={}){
   Object.assign(report,extra);report.finished_at=new Date().toISOString();report.config_after_sha256=sha(fs.readFileSync(configPath()));
   report.config_unchanged=report.config_before_sha256===report.config_after_sha256;
   report.passed=report.checks.length>0&&report.checks.every(c=>c.passed)&&report.config_unchanged&&extra.valid!==false;save();
   fs.writeFileSync(path.join(out,'README.md'),`# ${slug}\n\n${report.passed?'PASS':'FAIL'}；配置未修改：${report.config_unchanged}。\n\nreport.json 与逐命令日志记录实际退出码；合成测试不冒充生产身份/模型 E2E。源码与限制见对应 docs 设计文档。\n`);
   console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json')}));if(!report.passed)process.exitCode=1;return report;
 }};
}
export const python=path.resolve('modules/agentguard-group2/.venv/Scripts/python.exe');
