import {spawn} from 'node:child_process';
import {existsSync,readFileSync,readdirSync,mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const LAYERS=['行为护栏','权限闸门','过程台账','经验自演进','文档索引'];
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const statusLabel={pass:'通过',fail:'失败',skipped:'跳过',incomplete:'未完成'};
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
export function reproduce(executable,args) { return '& '+[executable,...args].map(quote).join(' '); }

export function checkDocs(root) {
  const index=path.join(root,'docs/README.md');
  if(!existsSync(index))throw Error('缺少 docs/README.md');
  const text=readFileSync(index,'utf8');
  for(const layer of LAYERS.slice(0,4)) {
    const row=text.split(/\r?\n/).find(line=>line.startsWith('| '+layer+' |'));
    if(!row)throw Error('四层表缺少：'+layer);
    const links=[...row.matchAll(/\]\(([^)]+)\)/g)];
    if(!links.length)throw Error(layer+' 缺少文档链接');
    for(const [,href] of links)if(!existsSync(path.resolve(root,'docs',href.split('#')[0])))throw Error('文档链接不存在：'+href);
  }
  for(const file of ['docs/README.md','docs/MAINTENANCE.md']) {
    if(!existsSync(path.join(root,file))||!readFileSync(path.join(root,file),'utf8').includes('Verify-ZhengAn.ps1'))throw Error(file+' 未挂一键验收入口');
  }
  return '四层表、表内文档链接和两处验收入口均有效';
}

// Optional -Live omissions are informational. Missing selected dependencies are not success.
export function summarize(checks) {
  const selected=checks.filter(c=>c.required);
  const status=selected.some(c=>c.status==='fail')?'fail':selected.some(c=>c.status!=='pass')?'incomplete':'pass';
  return {status,exit_code:status==='fail'?1:status==='incomplete'?2:0,
    layers:LAYERS.map(name=>{
      const items=checks.filter(c=>c.layer===name),required=items.filter(c=>c.required);
      return {name,status:required.some(c=>c.status==='fail')?'fail':required.some(c=>c.status!=='pass')?'skipped':'pass',
        passed:items.filter(c=>c.status==='pass').length,failed:items.filter(c=>c.status==='fail').length,
        skipped:items.filter(c=>c.status==='skipped').length,
        reasons:items.filter(c=>c.status!=='pass').map(c=>({id:c.id,reason:c.reason}))};
    })};
}

export function runProcess(executable,args,{cwd,timeoutMs,env=process.env}) {
  return new Promise(resolve=>{
    const child=spawn(executable,args,{cwd,env,windowsHide:true,shell:false});
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    let stdout='',stderr='',timedOut=false,done=false;
    // Bounded logs: these scripts print synthetic test metadata, never gateway credentials.
    child.stdout.on('data',b=>{stdout=(stdout+b.toString('utf8')).slice(-2_000_000);});
    child.stderr.on('data',b=>{stderr=(stderr+b.toString('utf8')).slice(-2_000_000);});
    const finish=result=>{if(done)return;done=true;clearTimeout(timer);resolve({...result,stdout,stderr,timed_out:timedOut});};
    const timer=setTimeout(()=>{
      timedOut=true;
      if(process.platform==='win32') {
        const kill=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
        kill.on('error',()=>child.kill());
        kill.on('close',code=>{if(code!==0)child.kill();});
      } else child.kill('SIGKILL');
    },timeoutMs);
    child.on('error',e=>finish({exit_code:null,error:e.code??'SPAWN_FAILED'}));
    child.on('close',code=>finish({exit_code:timedOut?124:code}));
  });
}

function suite(root,folder) {
  const files=existsSync(path.join(root,folder))?readdirSync(path.join(root,folder)).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>folder+'/'+f):[];
  return files.length?files:[folder+'/__missing_suite.test.mjs'];
}
export function plan(root,live) {
  const py='modules/agentguard-group2/.venv/Scripts/python.exe';
  const host=path.join(process.env.APPDATA??'','npm/node_modules/openclaw');
  const browserFiles=[path.join(host,'node_modules/playwright-core/index.mjs')];
  const node=(id,layer,args,extra={})=>({id,layer,executable:process.execPath,args,required:true,...extra});
  return [
    node('result-and-stop',LAYERS[0],['--test','scripts/test_result_guard.mjs','scripts/test_runtime_stop.mjs']),
    node('protect-plugin',LAYERS[0],['--test',...suite(root,'modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/test')]),
    node('protect-tool-surface',LAYERS[0],['scripts/test_protect_tool_surface.mjs'],{dependencies:[py]}),
    ...['test_gov_document.py','test_gov_document_panel.py','test_identity_boundary.py','test_param_provenance.py','test_task_privilege_contract.py'].map(file=>({id:file.slice(5,-3),layer:LAYERS[1],executable:path.join(root,py),args:['scripts/'+file],required:true,dependencies:[py]})),
    node('panel-boundaries',LAYERS[1],['--test','scripts/test_panel_access.mjs']),
    node('trace-core',LAYERS[2],['--test',...suite(root,'modules/govagentsec-trace/test')]),
    {id:'model-routing',layer:LAYERS[2],executable:path.join(root,py),args:['scripts/check_model_routing.py'],required:true,dependencies:[py]},
    node('workspace-ui',LAYERS[2],['scripts/test_workspace_ia.mjs'],{dependencies:browserFiles,browser:true,artifacts:['local-validation/workspace-ia/report.json','local-validation/workspace-ia/settings-and-skills.png']}),
    node('evolution-and-lifecycle',LAYERS[3],['--test',...suite(root,'modules/trajectory-governance/test'),'scripts/test_real_evolution.mjs']),
    node('verification-runner',LAYERS[4],['--test','scripts/test_verify_zhengan.mjs']),
    {id:'docs-index',layer:LAYERS[4],required:true,internal:'docs',executable:process.execPath,args:['scripts/verify_zhengan.mjs','--docs-only']},
    // Installed-wrapper check uses synthetic local output. Live UI checks only read existing data.
    node('host-result-wrapper',LAYERS[0],['scripts/test_result_guard_host.mjs'],{live:true,required:live,dependencies:[path.join(host,'package.json')]}),
    node('live-identity',LAYERS[1],['scripts/test_identity_live.mjs'],{live:true,required:live,dependencies:browserFiles,browser:true,gateway:true}),
    node('live-trace-ui',LAYERS[2],['scripts/test_trace_workspace_live.mjs'],{live:true,required:live,dependencies:browserFiles,browser:true,gateway:true,artifacts:['local-validation/trace-ui/u2-live/report.json','local-validation/trace-ui/u2-live/task-drawer.png','local-validation/trace-ui/u2-live/compare-deep-link.png','local-validation/trace-ui/u2-live/real-orphan.png']}),
    node('live-candidate-gate',LAYERS[3],['scripts/test_evolution_release_gate_live.mjs'],{live:true,required:live,dependencies:browserFiles,browser:true,gateway:true,artifacts:['local-validation/evolution-release-gate/live/report.json','local-validation/evolution-release-gate/live/workshop-gate.png']}),
  ];
}

async function dependencyReason(check,root) {
  for(const file of check.dependencies??[])if(!existsSync(path.resolve(root,file)))return '缺少依赖：'+file;
  if(check.browser) {
    const edge=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA].filter(Boolean).some(p=>existsSync(path.join(p,'Microsoft/Edge/Application/msedge.exe')));
    if(!edge)return '缺少本机 Microsoft Edge；离线界面测试不自动下载浏览器';
  }
  if(check.gateway) {
    const file=path.join(process.env.USERPROFILE??'','.openclaw/openclaw.json');
    if(!existsSync(file))return '缺少本机 OpenClaw 配置';
    let cfg;try{cfg=JSON.parse(readFileSync(file,'utf8'));}catch{return '本机 OpenClaw 配置不可解析';}
    if(!cfg.gateway?.auth?.token)return '现有 live 脚本需要网关 token 登录配置；不创建凭据';
    try{const r=await fetch('http://127.0.0.1:'+(cfg.gateway.port??18789)+'/',{signal:AbortSignal.timeout(3000),redirect:'error'});if(!r.ok)return '网关返回 HTTP '+r.status;}
    catch{return '本机 OpenClaw 网关未启动或不可达';}
  }
  return null;
}

export async function executeCheck(check,{root,out,live,timeoutMs,env,run=runProcess,dependency=dependencyReason}) {
  const started=Date.now(),base={id:check.id,layer:check.layer,required:check.required,live:!!check.live,command:reproduce(check.executable,check.args)};
  if(check.live&&!live)return {...base,status:'skipped',reason:'未启用 -Live：现网检查不在本次范围内',duration_ms:0};
  const missing=await dependency(check,root);
  if(missing)return {...base,status:'skipped',reason:missing,duration_ms:Date.now()-started};
  const log=path.join(out,check.id+'.log');
  try {
    let result;
    if(check.internal==='docs')result={exit_code:0,stdout:checkDocs(root),stderr:''};
    else result=await run(check.executable,check.args,{cwd:root,timeoutMs,env});
    writeFileSync(log,(result.stdout??'')+'\n'+(result.stderr??''),'utf8');
    const skippedTests=/^ok .*# SKIP\b|^\s*(?:ℹ|#)\s*skipped [1-9]\d*\b|^OK \(.*skipped=[1-9]\d*\b/im.test(result.stdout+'\n'+result.stderr);
    const status=result.exit_code!==0||result.timed_out?'fail':skippedTests?'skipped':'pass';
    const reason=result.timed_out?'子测试超时，已终止子进程树':result.error?'子进程启动失败：'+result.error:status==='fail'?'子测试非零退出，详见日志':skippedTests?'子测试报告跳过项，不能宣称完整通过':'检查通过';
    const artifacts=[];
    for(const source of check.artifacts??[])if(existsSync(path.join(root,source))) {
      // Only preserve fresh artifacts, never a stale report from a prior run.
      const {statSync}=await import('node:fs');
      if(statSync(path.join(root,source)).mtimeMs<started-1000)continue;
      const target=path.join(out,check.id+'-'+path.basename(source));copyFileSync(path.join(root,source),target);artifacts.push(path.basename(target));
    }
    return {...base,status,reason,exit_code:result.exit_code,duration_ms:Date.now()-started,log:path.basename(log),artifacts};
  }catch(e){writeFileSync(log,String(e.message));return {...base,status:'fail',reason:'检查异常，详见日志',exit_code:1,duration_ms:Date.now()-started,log:path.basename(log)};}
}

export function saveReport(out,report) {
  writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  const cell=s=>String(s??'').replaceAll('|','／').replaceAll('\n',' ');
  const md=['# 政安纵深四层验收',`\n结果：**${statusLabel[report.status]}**；退出码 ${report.exit_code}；范围：${report.live_requested?'离线 + 现网只读检查':'离线必跑子集'}。`,
    '\n固定 OpenClaw 2026.7.1-2；本报告是已列测试的汇总，不代表生产 OIDC、模型准确率或全部系统验收。未运行新 Agent 会话或云模型。',
    '\n## 分层结果','\n| 层 | 状态 | 通过 / 失败 / 跳过 |','| --- | --- | --- |',
    ...report.layers.map(l=>`| ${l.name} | ${statusLabel[l.status]} | ${l.passed} / ${l.failed} / ${l.skipped} |`),
    '\n## 检查明细','\n| 检查 | 状态 | 原因 | 日志 |','| --- | --- | --- | --- |',
    ...report.checks.map(c=>`| ${c.id} | ${statusLabel[c.status]} | ${cell(c.reason)} | ${c.log?'['+c.log+']('+c.log+')':'—'} |`),
    '\n## 复现','\n```powershell',`Set-Location ${quote(report.repository)}`,report.reproduce,'```',
    ...report.checks.map(c=>`\n### ${c.id}\n\n\`\`\`powershell\n${c.command}\n\`\`\``),
    '\n子测试中任何失败均退出 1；必跑项缺依赖或内部跳过退出 2。未指定 -Live 的跳过不影响离线结论。详细过程和证据路径见 report.json。',''];
  writeFileSync(path.join(out,'report.md'),md.join('\n'));
}

async function main() {
  const args=process.argv.slice(2);
  if(args.includes('--docs-only')){console.log(checkDocs(ROOT));return;}
  const live=args.includes('--live'),timeoutIndex=args.indexOf('--timeout');
  const timeout=timeoutIndex<0?180:Number(args[timeoutIndex+1]);
  if(!Number.isInteger(timeout)||timeout<10||timeout>1800)throw Error('timeout 必须为 10～1800 秒');
  const out=path.join(ROOT,'local-validation/verify',new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid);
  mkdirSync(out,{recursive:true});mkdirSync(path.join(out,'temp'));
  const env={...process.env,TEMP:path.join(out,'temp'),TMP:path.join(out,'temp'),PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1',NO_COLOR:'1'};
  const checks=[],report={schema_version:1,source:'local-test-execution',repository:ROOT,started_at:new Date().toISOString(),live_requested:live,
    openclaw_expected:'2026.7.1-2',reproduce:'powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\Verify-ZhengAn.ps1'+(live?' -Live':'')+' -TimeoutSeconds '+timeout,checks};
  const hostPackage=path.join(process.env.APPDATA??'','npm/node_modules/openclaw/package.json');
  if(existsSync(hostPackage)) {
    try{report.openclaw_detected=JSON.parse(readFileSync(hostPackage,'utf8')).version;}catch{report.openclaw_detected='unreadable';}
    if(report.openclaw_detected!==report.openclaw_expected) {
      checks.push({id:'host-version',layer:LAYERS[4],required:true,status:'fail',reason:'已安装宿主与固定版本不一致；未执行测试或升级',command:report.reproduce});
      for(const c of plan(ROOT,live))checks.push({id:c.id,layer:c.layer,required:c.required,status:'skipped',reason:'固定版本预检失败',command:reproduce(c.executable,c.args)});
    }
  } else report.openclaw_detected='not-installed';
  if(!checks.length)for(const check of plan(ROOT,live)) {
    console.log('检查：'+check.layer+' / '+check.id);
    checks.push(await executeCheck(check,{root:ROOT,out,live,timeoutMs:timeout*1000,env}));
    Object.assign(report,summarize(checks));saveReport(out,report);
    console.log(statusLabel[checks.at(-1).status]+'：'+checks.at(-1).reason);
  }
  Object.assign(report,summarize(checks),{finished_at:new Date().toISOString()});saveReport(out,report);
  console.log(JSON.stringify({status:report.status,exit_code:report.exit_code,report:path.join(out,'report.json')}));
  process.exitCode=report.exit_code;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1;});
