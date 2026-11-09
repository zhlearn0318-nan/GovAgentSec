import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {configPath,sha,version} from './lib/config-recovery.mjs';
const out=path.resolve(process.env.GOV_U23_EVIDENCE??'local-validation/u23-approval-graph-sandbox-fp/'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const configBefore=fs.readFileSync(configPath()),config=JSON.parse(configBefore);
const report={passed:false,source:'u23-real-openclaw-local-protection-and-private-identity-audit',host_version:version(),
 production_oidc:false,external_model_requests:0,started_at:new Date().toISOString(),checks:[]};
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
const run=(id,exe,args,options={})=>{
 const r=spawnSync(exe,args,{cwd:process.cwd(),encoding:'utf8',windowsHide:true,timeout:900000,maxBuffer:4194304,
   ...options,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8',...options.env}});
 fs.writeFileSync(path.join(out,id+'.log'),(r.stdout??'')+(r.stderr??''));
 report.checks.push({id,command:[exe,...args],exit_code:r.status,error:r.error?.code,passed:r.status===0});save();console.log(id+': '+(r.status===0?'PASS':'FAIL'));return r;
};
try{
 const design=fs.readFileSync('docs/U23_APPROVAL_GRAPH_SANDBOX_FP.md','utf8');
 if((design.split('## 阶段 A 自检')[1]?.match(/- \[x\]/g)??[]).length!==7)throw Error('U23_STAGE_A_INCOMPLETE');
 if(config.agents.defaults.sandbox.backend!=='docker')throw Error('DOCKER_DEFAULT_REQUIRED_NO_AUTOMATIC_SWITCH');
 if(config.plugins?.entries?.['govagentsec-trace']?.config?.usageWrapper?.enabled)throw Error('USAGE_WRAPPER_MUST_STAY_OFF');
 fs.writeFileSync(path.join(out,'design-ref.md'),'[阶段 A 设计](../../../docs/U23_APPROVAL_GRAPH_SANDBOX_FP.md)\n');
 fs.writeFileSync(path.join(out,'openclaw-version.txt'),report.host_version+'\n');
 run('approval-chain',process.execPath,['--test','scripts/test_u23_approval_trace.mjs']);
 run('approval-projection',path.resolve('modules/agentguard-group2/.venv/Scripts/python.exe'),['scripts/test_u23_approval_projection.py']);
 run('protect-regression',config.plugins.entries['protect-agent'].config.pythonPath,['-m','unittest','discover','-s','tests','-t','.','-q'],{cwd:path.resolve('modules/protect-agent-group1/智能体安全')});
 run('sandbox-regression',process.execPath,['--test','modules/session-sandbox/test/*.test.mjs']);
 run('protection-alert',process.execPath,['scripts/test_protection_alert.mjs']);
 run('u22-with-u23-live',process.execPath,['scripts/verify_u22_login_approval_path.mjs'],{env:{GOV_U22_EVIDENCE:path.join(out,'live'),GOV_U23_LIVE:'1'}});
 const live=JSON.parse(fs.readFileSync(path.join(out,'live/u22-live-report.json')));
 const integrity=JSON.parse(fs.readFileSync(path.join(out,'live/report.json')));
 report.live=live.u23;report.live_report='live/u22-live-report.json';report.host_unchanged=integrity.host_unchanged;
 report.external_model_requests=live.external_requests;report.screenshots=live.screenshots?.map(f=>'live/'+f);
 if(!live.passed||!integrity.passed||!live.u23?.hash_chain_valid||!live.u23?.srt_cancel_kept_docker)throw Error('U23_LIVE_INCOMPLETE');
 const rows=live.u23.fp??[];
 if(rows.filter(r=>r.decision==='ALLOW'&&r.success).length<3||rows.filter(r=>r.decision==='BLOCK'&&r.stop_confirmed&&r.model_requests===0&&r.tool_calls===0).length<2)throw Error('FP_MATRIX_INCOMPLETE');
 fs.writeFileSync(path.join(out,'fp-matrix.md'),'# 本地合成对照，真实宿主运行\n\n| 用例 | 结果 | 停止确认 | 模型调用 | 工具调用 |\n|---|---|---|---|---|\n'+rows.map(r=>`| ${r.id} | ${r.decision} | ${r.stop_confirmed} | ${r.model_requests} | ${r.tool_calls} |`).join('\n')+'\n\n历史来源声明的 tool_result 路径：'+live.u23.historical_tool_result.decision+'。旧 BLOCK 保存在阶段 A fp-historical-valid-before.json，不删除失败记录。\n');
 report.passed=report.checks.every(c=>c.passed)&&report.host_unchanged&&report.external_model_requests===0;
}catch(e){report.error=e.message;}
const after=fs.readFileSync(configPath()),current=JSON.parse(after);
report.config_before_sha256=sha(configBefore);report.config_after_sha256=sha(after);report.config_unchanged=sha(configBefore)===sha(after);
report.sandbox_backend=current.agents.defaults.sandbox.backend;report.usage_wrapper_enabled=current.plugins?.entries?.['govagentsec-trace']?.config?.usageWrapper?.enabled===true;
report.passed=report.passed&&report.config_unchanged&&report.sandbox_backend==='docker'&&!report.usage_wrapper_enabled;
report.finished_at=new Date().toISOString();
for(const [name,value] of [['hash-before.txt',report.config_before_sha256],['hash-after.txt',report.config_after_sha256]])fs.writeFileSync(path.join(out,name),value+'\n');
fs.writeFileSync(path.join(out,'sandbox-backend.json'),JSON.stringify({before:config.agents.defaults.sandbox.backend,after:report.sandbox_backend,config_unchanged:report.config_unchanged,srt_switch:'confirmation-and-cancel-only'},null,2));save();
fs.writeFileSync(path.join(out,'DELIVERY.md'),`# U23 专项交付\n\n结果：${report.passed?'PASS':'FAIL'}；详见 report.json 的命令、退出码与失败原因。\n\n审批方案 A：私有身份 worker 的已落盘审计追加到真实轨迹，申请/审批与执行分开显示。Docker 保留；srt 提示后取消，配置未改：${report.config_unchanged}。\n\n真实 OpenClaw + 本地双检测器 + loopback 确定性模型；合成输入，无外部 API 请求。非生产组织身份。\n\n局限：仅覆盖本项目原生任务 ACL 的可关联审批；历史/其他宿主审批以同屏回执核对。srt 冷启动仍慢；来源声明校准不保证所有政务材料零误报。流式回复仍无完整发送前门控。不代表新的 OS 隔离或生产发布验收。\n`);
console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json'),error:report.error}));if(!report.passed)process.exitCode=1;
