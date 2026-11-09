// U22 runs only repository tests and an isolated local gateway; no host installer.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {version,configPath,sha} from './lib/config-recovery.mjs';

const out=path.resolve(process.env.GOV_U22_EVIDENCE??'local-validation/u22-login-approval-path/'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
function hostDigest(){
  const hash=createHash('sha256');
  function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())walk(file);
    else if(entry.isFile()){hash.update(path.relative(host,file));hash.update(fs.readFileSync(file));}
  }}
  hash.update(fs.readFileSync(path.join(host,'package.json')));walk(path.join(host,'dist'));return hash.digest('hex');
}
const before=fs.readFileSync(configPath()),config=JSON.parse(before);
const report={passed:false,source:'u22-login-task-binding-approval',host_version:version(),production_oidc:false,
  started_at:new Date().toISOString(),config_before_sha256:sha(before),host_before_sha256:hostDigest(),checks:[]};
fs.writeFileSync(path.join(out,'openclaw-version.txt'),report.host_version+'\n');
fs.writeFileSync(path.join(out,'design-ref.md'),'Design: docs/U22_LOGIN_TASK_BIND_APPROVAL.md\n');
const design=fs.readFileSync('docs/U22_LOGIN_TASK_BIND_APPROVAL.md','utf8');
report.stage_a_complete=(design.split('## 阶段 A 自检')[1]?.match(/- \[x\]/g)??[]).length===10;
const run=(id,args,timeout=600000)=>{
  const result=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,timeout,maxBuffer:4194304,
    env:{...process.env,GOV_U22_EVIDENCE:out}});
  fs.writeFileSync(path.join(out,id+'.log'),(result.stdout??'')+(result.stderr??''));
  report.checks.push({id,command:[process.execPath,...args],exit_code:result.status,error:result.error?.code,passed:result.status===0});
  console.log(id+': '+(result.status===0?'PASS':'FAIL'));return result;
};
if(report.stage_a_complete){
 run('identity-session',['--test','scripts/test_u22_identity_session.mjs']);
 run('login-approval-live',['scripts/test_u22_login_approval_live.mjs'],720000);
}
else report.checks.push({id:'stage-a',passed:false,error:'DESIGN_SELF_CHECK_INCOMPLETE'});
const liveFile=path.join(out,'u22-live-report.json');
const live=fs.existsSync(liveFile)?JSON.parse(fs.readFileSync(liveFile,'utf8')):null;
report.live_report=liveFile;report.config_after_sha256=sha(fs.readFileSync(configPath()));report.host_after_sha256=hostDigest();
report.config_unchanged=report.config_before_sha256===report.config_after_sha256;
report.host_unchanged=report.host_before_sha256===report.host_after_sha256;
report.usage_wrapper_enabled=config.plugins?.entries?.['govagentsec-trace']?.config?.usageWrapper?.enabled===true;
report.finished_at=new Date().toISOString();
report.passed=report.stage_a_complete&&report.checks.every(c=>c.passed)&&live?.passed===true&&report.config_unchanged&&report.host_unchanged&&!report.usage_wrapper_enabled;
fs.writeFileSync(path.join(out,'copy-scan.md'),'# Visible business copy scan\n\n'+JSON.stringify(live?.copy_scan??{error:'No current live evidence'},null,2)+'\n');
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'DELIVERY.md'),`# U22 专项验证\n\n结论：${report.passed?'PASS':'FAIL'}。\n\n使用真实固定版本 OpenClaw、隔离 Docker 会话、本地确定性模型和合成材料，未调用外部模型。\n\n登录、当前会话绑定、越权零读取、禁自批、批准不执行、原上下文单次重试、再次拒绝见 u22-live-report.json。配置未改：${report.config_unchanged}；宿主文件未改：${report.host_unchanged}。\n\n读取计数观察固定宿主原生 readPinnedFile 的已校验文件描述符及真实字节，不冒充容器内系统调用；原读取函数与后端未替换。原生审批回执与调用图同屏核对，只显示服务端实际采集的节点；真实组织身份未接入。本脚本不启用 usage wrapper，也不调整任何身份或票据 TTL。\n`);
console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json')}));
if(!report.passed)process.exitCode=1;
