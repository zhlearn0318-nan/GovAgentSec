import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.GOV_U7B_EVIDENCE??path.join('local-validation/u7b-notify-live',new Date().toISOString().replace(/[:.]/g,'-')));
fs.mkdirSync(out,{recursive:true});
const py=path.resolve('modules/agentguard-group2/.venv/Scripts/python.exe');
const commands=[['tool-list',process.execPath,['scripts/check_notify_tools_live.mjs']],
 ['provenance',py,['scripts/test_param_provenance.py']],['contract',py,['scripts/test_task_privilege_contract.py']],
 ['documents',py,['scripts/test_gov_document.py']],['identity',py,['scripts/test_identity_boundary.py']],
 ['behavior-demo',process.execPath,['scripts/demo_behavior_constraint.mjs']],['workspace',process.execPath,['scripts/test_workspace_ia.mjs']],
 ['protect-tool-surface',process.execPath,['scripts/test_protect_tool_surface.mjs']],
 ['sandbox-policy',process.execPath,['--test','modules/session-sandbox/test/policy.test.mjs']],
 ['sandbox-installed',process.execPath,['scripts/test_session_sandbox_installed.mjs']],
 ['live-ui',process.execPath,['scripts/test_notify_tools_live.mjs']]];
const report={passed:false,source:'u7b-local-registration-verification',production_oidc:false,checks:[]};
for(const [id,exe,args] of commands){
 const started=Date.now(),r=spawnSync(exe,args,{cwd:process.cwd(),encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:2097152,
 env:{...process.env,GOV_U7B_EVIDENCE:out,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
 fs.writeFileSync(path.join(out,id+'.log'),(r.stdout??'')+(r.stderr??''));
 report.checks.push({id,command:[exe,...args],exit_code:r.status,status:r.status===0?'PASS':'FAIL',duration_ms:Date.now()-started,error:r.error?.code});
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(id+': '+(r.status===0?'PASS':'FAIL'));
}
report.passed=report.checks.every(r=>r.status==='PASS');report.finished_at=new Date().toISOString();
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'README.md'),`# U7b 通知工具登记验收\n\n结论：${report.passed?'PASS':'FAIL'}。通知只写合成送审账本；非生产组织身份，无真实外发通道。\n\n复跑：仓库根目录执行 \`node scripts/verify_u7b_notify_live.mjs\`。当前目录含逐项日志、JSON 与真实工作台截图；演示脚本自身的链路报告路径见 behavior-demo.log。无模型聊天发送。\n\n若本目录存在 deployment.json，则记录本次配置更改前后哈希及私有备份位置；restore-steps.md 可恢复原字节。复验目录可能没有部署文件，因为验证不修改配置。\n\nU11 的按聊天 run 自动绑定契约、原生工具全量 ACL 不在本包。\n`);
console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json')}));if(!report.passed)process.exitCode=1;
