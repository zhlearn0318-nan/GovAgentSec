// Sequential acceptance: shared live demo identity is never tested concurrently.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const out=path.resolve(process.env.GOV_ACL_FULL_EVIDENCE??'local-validation/identity-task-acl-full/'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const design=fs.readFileSync('docs/IDENTITY_TASK_ACL_DESIGN.md','utf8').split('## 全量覆盖（U11）')[1]??'';
const report={passed:false,source:'u11-local-acceptance',started_at:new Date().toISOString(),production_oidc:false,external_trace_transfer:false,
  stage_a:{passed:(design.match(/- \[x\]/g)??[]).length===6},no_scope_policy:'A-hard-deny',checks:[]};
const py=path.resolve('modules/agentguard-group2/.venv/Scripts/python.exe');
const commands=[
 ['u7b-live',process.execPath,['scripts/check_notify_tools_live.mjs']],
 ['u10-regression',process.execPath,['scripts/verify_identity_task_acl.mjs']],
 ['host-acl',process.execPath,['scripts/test_identity_task_acl_full.mjs']],
 ['failure-boundaries',py,['scripts/test_chat_acl_failures.py']],
 ['protect-tool-surface',process.execPath,['scripts/test_protect_tool_surface.mjs']],
 ['sandbox-policy',process.execPath,['--test','modules/session-sandbox/test/policy.test.mjs']],
 ['live-ui',process.execPath,['scripts/test_task_acl_full_live.mjs']],
];
if(!report.stage_a.passed)throw Error('U11 stage A incomplete');
for(const [id,exe,args] of commands){
 const r=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:2097152,
  env:{...process.env,GOV_ACL_FULL_EVIDENCE:out,GOV_U7B_EVIDENCE:out,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
 fs.writeFileSync(path.join(out,id+'.log'),(r.stdout??'')+(r.stderr??''));
 report.checks.push({id,command:[exe,...args],exit_code:r.status,passed:r.status===0,error:r.error?.code});
 if(id==='u10-regression'&&r.status===0){
   const result=JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1));
   report.u10_report=result.report;
   fs.copyFileSync(result.report,path.join(out,'u10-report.json'));
 }
 console.log(id+': '+(r.status===0?'PASS':'FAIL'));
 if(id==='u7b-live'&&r.status!==0)break;
}
const read=name=>fs.existsSync(path.join(out,name))?JSON.parse(fs.readFileSync(path.join(out,name))):null;
report.host=read('hook-report.json');report.ui=read('live-ui-report.json');
report.passed=report.checks.length===commands.length&&report.checks.every(c=>c.passed)&&report.host?.passed&&report.ui?.passed;
report.limitations=['No external model/provider E2E; installed host dispatcher uses synthetic turns.',
 'Native file execution is instrumented real filesystem I/O; existing U9 engines are not replaced.',
 'Write/exec remain denied for the demonstration office role by existing OPA role policy.',
 'Unknown tools, delegation, apply_patch, process, network and MCP status lookup fail closed.',
 'MCP retains its downstream identity/OPA checks; upstream permit is not a downstream execution receipt.'];
report.finished_at=new Date().toISOString();
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'README.md'),`# U11 本地验收\n\n结论：${report.passed?'PASS':'FAIL'}（本文所列边界）。演示身份源（非生产）；没有外部模型请求。\n\n复跑：\`node scripts/verify_identity_task_acl_full.mjs\`；另跑 U10 \`node scripts/verify_identity_task_acl.mjs\`。\n\n- report.json：总报告，包含逐命令退出码。\n- hook-report.json：真实固定宿主 dispatcher + 本地 JWT/OPA/票据；合成 turn，真实计数文件读取，不是模型 E2E。\n- live-ui-report.json、两张 u11-*.png：真实 OpenClaw 页面身份绑定、内部 hook 不开放 RPC、关闭恢复。\n- worker/：脱敏本地审计，不能当作生产组织审计。\n- deployment.json（若有）：唯一配置变化、私有备份路径与前后 SHA-256。\n\n无 scope 硬拒绝。路径仅支持显式 /workspace 路径；写/执行受原角色硬拒绝；网络/未知工具拒绝。批准只授权原会话原动作单次重试，不自动执行，也不扩大基础 scope。完整模型聊天 E2E 不在本次证据中。\n`);
console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json')}));if(!report.passed)process.exitCode=1;
