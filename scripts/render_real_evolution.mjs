import path from 'node:path';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=path.resolve(process.argv[2]??'');
const report=JSON.parse(readFileSync(path.join(root,'report.json'),'utf8'));
const esc=s=>String(s??'缺失').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>v===null?'缺失':Number(v).toFixed(3);
const titles={scores:'评分与筛选',compare:'轨迹对比',candidates:'候选与准入'};
const labels={success:'正常双工具',recovery:'参数错误后恢复',d004:'D004 越权阻断',pass:'安全通过',quarantine:'隔离',ollama:'本地 Ollama',missing:'证据不足，未评分',
  'heuristic-fallback':'本地启发式回退',below_topk:'同分顺序靠后，未入选',incomplete_or_invalid_trace:'轨迹事件配对缺失',enforced_security_block:'已执行安全阻断'};
const label=value=>labels[value]??value;
const table=(headers,rows)=>`<table><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const pages={
  scores:table(['真实轨迹','类型','S','Q','安全判定','TopK / 原因','评审来源'],report.records.map(r=>[r.trace_id,label(r.kind),number(r.S),number(r.Q),label(r.decision),r.selected?'入选':label(r.selection_reason),label(r.mode)]))+
    `<p>keep=0.9；T_safe=${report.selection.denominator}；floor(T_safe × keep)=${report.selection.requested_count}；实际入选 ${report.selection.selected.length} 条。<br>分母包括安全通过但 Q 缺失的记录（本批 ${report.selection.safe_missing_Q??0} 条）；安全隔离记录不在分母中。</p>`,
  compare:table(['轨迹','工具顺序','N / U / R / A_r','Q 缺失原因','隔离原因'],report.records.map(r=>[r.trace_id,r.tool_sequence.join(' → '),['N','U','R','A_r'].map(k=>`${k}=${r.quality_basis[k]??'缺失'}`).join(' / '),r.quality_reason??'无',r.decision==='quarantine'?label(r.reason):'无']))+
    '<p>失败恢复样例为参数错误后修正参数；相同工具后续成功不代表相同参数重试。judge 仍按原保守证据规则评分。</p>',
  candidates:`<h2>${esc(report.candidate.id)}</h2><p>生成器：local-common-steps-v1 · test_only=true · admission_passed ≠ release</p>`+
    table(['公共步骤','工具','来源轨迹 / 事件 hash'],report.candidate.steps.map(s=>[s.step,s.tool,s.evidence.map(e=>`${e.trace_id} / ${e.event_hash}`).join('\n')]))+
    table(['对照','联合准入状态','决策','是否发布'],[['良性候选',report.admission.status,report.admission.decision,'否'],['毒技能对照',report.poison_admission.status,report.poison_admission.decision,'否']]),
};
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
if(JSON.parse(readFileSync(path.join(host,'package.json'),'utf8')).version!=='2026.7.1-2')throw Error('fixed host required');
const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  for(const [name,body]of Object.entries(pages)){
    const dir=path.join(root,name);mkdirSync(dir,{recursive:true});
    const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>台风简报 · ${titles[name]}</title><style>body{margin:0;background:#f4f8f7;color:#203b35;font:16px 'Microsoft YaHei UI',sans-serif;padding:40px}h1{font-size:28px}p{color:#536d65;line-height:1.7}table{width:100%;border-collapse:collapse;background:white;margin:20px 0;table-layout:fixed}th,td{padding:14px;border-bottom:1px solid #d7e4df;white-space:pre-wrap;overflow-wrap:anywhere;text-align:left;font-size:14px}th{background:#dceee8}small{color:#657e76}</style><h1>台风应急简报 · ${esc(titles[name])}</h1><p>真实本地 Agent/MCP 轨迹 · loopback_static_dev 本机演示身份，非生产 OIDC<br>同任务 ${esc(report.task_key)} · 本地评审 · 候选隔离，未安装、未发布</p>${body}<small>来源：本目录 report.json / records.json / evidence；未发送外部 API。开发标定 ${esc(report.scoring.calibration_version)}，非生产准确率证明。</small></html>`;
    writeFileSync(path.join(dir,'index.html'),html);
    const page=await browser.newPage({viewport:{width:1920,height:1080}});
    await page.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
    await page.goto(pathToFileURL(path.join(dir,'index.html')).href);await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(dir,'evidence.png'),fullPage:true});await page.close();
  }
}finally{await browser.close();}
const selected=report.selection.selected[0];
const graph=spawnSync(process.execPath,['scripts/render_real_call_graph.mjs',path.join(root,'evidence'),selected.trace_id,path.join(root,'call-graph')],{encoding:'utf8',windowsHide:true,timeout:60000});
if(graph.status!==0)throw Error('call_graph_render_failed');
writeFileSync(path.join(root,'README.md'),`# 真实多轨迹演进演示\n\n${report.records.length} 条真实轨迹，任务 ${report.task_key}。本机 loopback_static_dev，非生产 OIDC。\n\nreport.json 是汇总；records.json 为原评分记录；evidence 保存原链副本加任务确认/测试评分；scores、compare、candidates、call-graph 是本地截图素材。候选位于 skill-workshop，未安装或发布。\n\n原始输入的无关/不符合多步任务要求的轨迹排除原因见 excluded。所有源事件保留原 event_hash，不生成合成事件冒充业务执行。\n`);
console.log(JSON.stringify({evidence_rendered:true,root}));
