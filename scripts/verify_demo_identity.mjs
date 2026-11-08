// One command, local evidence, explicit nonzero exit on any missing/failed check.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=process.cwd(),out=path.resolve('local-validation/identity-demo',new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const py=path.join(root,'modules/agentguard-group2/.venv/Scripts/python.exe');
const report={source:'u4b-local-demo-identity-verification',production_oidc:false,started_at:new Date().toISOString(),checks:[]};
const checks=[
 ['identity-boundary',py,['scripts/test_identity_boundary.py']],
 ['demo-identity',py,['scripts/test_demo_identity.py']],
 ['demo-rpc',process.execPath,['scripts/test_demo_identity_rpc.mjs']],
 ['panel-access',process.execPath,['scripts/test_panel_access.mjs']],
 ['workspace',process.execPath,['scripts/test_workspace_ia.mjs']],
 ['trajectory-routing',process.execPath,['--test',...fs.readdirSync('modules/trajectory-governance/test').filter(n=>n.endsWith('.test.mjs')).map(n=>'modules/trajectory-governance/test/'+n)]],
 ['identity-live',process.execPath,['scripts/test_identity_live.mjs']],
 ['demo-live',process.execPath,['scripts/test_demo_identity_live.mjs']],
 ['gov-documents',py,['scripts/test_gov_document.py']],
 ['task-contract',py,['scripts/test_task_privilege_contract.py']],
 ['provenance',py,['scripts/test_param_provenance.py']],
];
for(const [id,exe,args] of checks){
 const started=Date.now();
 const r=spawnSync(exe,args,{cwd:root,windowsHide:true,encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024,
   env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',GOV_IDENTITY_DEMO_EVIDENCE:out}});
 const log=path.join(out,id+'.log');fs.writeFileSync(log,(r.stdout??'')+(r.stderr??''));
 report.checks.push({id,command:[exe,...args],exit_code:r.status,status:r.status===0?'PASS':'FAIL',duration_ms:Date.now()-started,log,error:r.error?.code});
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(id+': '+(r.status===0?'PASS':'FAIL'));
}
report.passed=report.checks.every(c=>c.status==='PASS');report.finished_at=new Date().toISOString();
report.live_report=path.join(out,'live-report.json');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'README.md'),`# U4b 演示身份源证据\n\n结论：${report.passed?'PASS':'FAIL'}；非生产 OIDC。\n\n运行：\`node scripts/verify_demo_identity.mjs\`\n\n- report.json：命令、退出码及日志。\n- live-report.json：真实 OpenClaw 页面、角色分权、拒绝路径、恢复配置哈希。\n- 01—07 PNG：关闭、选人、经办发起、财务送审、处长身份、一次执行、关闭恢复。\n- identity-audit.jsonl：本轮启停与身份操作回执，不包含 Bearer/私钥。\n\n组织 OIDC 未接；当前为演示身份源，校验路径与生产同源。\n`);
console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json')}));
if(!report.passed)process.exitCode=1;
