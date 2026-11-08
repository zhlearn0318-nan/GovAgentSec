// U10 acceptance, local only. Failed or missing checks always produce nonzero exit.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),out=path.resolve('local-validation/identity-task-acl',new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const py=path.join(root,'modules/agentguard-group2/.venv/Scripts/python.exe');
const design=fs.readFileSync('docs/IDENTITY_TASK_ACL_DESIGN.md','utf8');
const report={source:'u10-local-identity-task-acl',production_oidc:false,started_at:new Date().toISOString(),
 stage_a:{passed:(design.split('## 全量覆盖（U11）')[0].match(/- \[x\]/g)??[]).length===6,design:'docs/IDENTITY_TASK_ACL_DESIGN.md'},checks:[]};
const checks=[
 ['identity-boundary',py,['scripts/test_identity_boundary.py']],
 ['identity-prerequisites','python',['scripts/check_identity.py']],
 ['task-contract',py,['scripts/test_task_privilege_contract.py']],
 ['provenance',py,['scripts/test_param_provenance.py']],
 ['identity-task-acl',py,['scripts/test_identity_task_acl.py']],
 ['demo-identity',py,['scripts/test_demo_identity.py']],
 ['demo-rpc',process.execPath,['scripts/test_demo_identity_rpc.mjs']],
 ['gov-documents',py,['scripts/test_gov_document.py']],
 ['panel-access',process.execPath,['scripts/test_panel_access.mjs']],
 ['workspace',process.execPath,['scripts/test_workspace_ia.mjs']],
 ['identity-live',process.execPath,['scripts/test_identity_live.mjs']],
 ['task-acl-live',process.execPath,['scripts/test_task_acl_live.mjs']],
];
for(const [id,exe,args] of checks){
 const started=Date.now();
 const r=spawnSync(exe,args,{cwd:root,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024,
   env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',GOV_IDENTITY_ACL_EVIDENCE:out}});
 const log=path.join(out,id+'.log');fs.writeFileSync(log,(r.stdout??'')+(r.stderr??''));
 report.checks.push({id,command:[exe,...args],exit_code:r.status,status:r.status===0?'PASS':'FAIL',duration_ms:Date.now()-started,log,error:r.error?.code});
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(id+': '+(r.status===0?'PASS':'FAIL'));
}
report.passed=report.stage_a.passed&&report.checks.every(c=>c.status==='PASS');report.finished_at=new Date().toISOString();
report.live_report=path.join(out,'live-report.json');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'README.md'),`# U10 本地验收证据\n\n结论：${report.passed?'PASS':'FAIL'}；演示身份源（非生产）。\n\n复跑：\`node scripts/verify_identity_task_acl.mjs\`（仓库根目录；OpenClaw 2026.7.1-2 网关已运行并加载本仓库插件）。\n\n- report.json：阶段 A、必跑及回归命令、退出码与日志。\n- live-report.json：真实 UI → JWT → OPA → U7 → 票据 → 隔离文档回执；合成业务数据。\n- 01—08 PNG：默认关闭、选人、目录 A、B 拒绝、申请、批准、审计、关闭恢复。\n- identity-audit.jsonl：脱敏台账，无正文/访问令牌/秘密票据。\n\n目录是 registry 的逻辑 URI 树，不是任意主机文件系统。生产组织 OIDC 未接；不声称全部聊天工具已有任务 ACL。\n`);
console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json')}));
if(!report.passed)process.exitCode=1;
