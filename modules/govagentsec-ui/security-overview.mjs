// Direct workspace rendering of the original AgentGuard overview: the five
// audit metrics, six control stages and runtime components share its snapshot.
const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const count = value => Number.isFinite(value) && value >= 0 ? String(value) : '—';

export const overviewStyle = `
.workspace[data-page=settings]>.heading{padding:10px 24px 8px}.workspace[data-page=settings] .settings-grid{gap:10px}
.security-overview{padding:8px 16px;display:grid;gap:8px}
.security-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.security-metric{border-left:3px solid var(--line);padding:5px 10px;background:var(--paper);border-radius:4px;min-width:0}
.security-metric.allow{border-color:var(--accent)}.security-metric.review{border-color:var(--warn)}.security-metric.deny{border-color:var(--danger)}
.security-metric span,.security-metric small{display:block;color:var(--muted);font-size:11px}.security-metric strong{display:block;font-size:23px;line-height:1.25;font-weight:650;font-variant-numeric:tabular-nums}
.security-metric.allow strong{color:var(--accent)}.security-metric.review strong{color:var(--warn)}.security-metric.deny strong{color:var(--danger)}
.security-runtime{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:20px;align-items:start}
.security-pipeline{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));list-style:none;padding:0;margin:8px 0 0;gap:12px}
.security-pipeline li{position:relative;min-width:0}.security-pipeline li:not(:last-child):after{content:'';position:absolute;left:32px;right:-6px;top:13px;border-top:1px solid var(--line)}
.security-pipeline b{display:grid;place-items:center;width:27px;height:27px;border:1px solid var(--line);border-radius:50%;color:var(--accent);font-size:10px;background:var(--soft)}
.security-pipeline strong{display:block;margin-top:5px;font-size:11px}.security-pipeline small{display:block;color:var(--muted);font-size:10px}
.security-health{display:grid;gap:3px;margin-top:7px}.security-health-row{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:11px;min-height:22px}
.security-overview-note{font-size:11px;color:var(--muted);display:flex;align-items:center;gap:10px;flex-wrap:wrap}.security-overview-note[role=alert]{color:var(--danger)}
.tool-coverage-details{margin:0 16px 8px;font-size:11px}.tool-coverage-details p{overflow-wrap:anywhere;margin-top:4px;color:var(--muted)}
@media(max-width:850px){.security-runtime{grid-template-columns:1fr}.security-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:560px){.security-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.security-pipeline{grid-template-columns:repeat(3,minmax(0,1fr));row-gap:12px}.security-pipeline li:nth-child(3):after{display:none}}
`;

function render(container, data, status, navigate) {
  const metrics = element('div', undefined, 'security-metrics');
  const c = data?.counts ?? {}, e = data?.evidence ?? {};
  for (const [key,label,value,note,tone] of [
    ['total','累计受控请求',count(c.total),'按请求去重',''],
    ['allow','自动允许',count(c.allow),'已隔离执行 '+count(c.executed_isolated)+' 次','allow'],
    ['review','需人工审批',count(c.require_approval),'策略要求审批的请求','review'],
    ['deny','策略阻断',count(c.deny),'被策略拒绝的请求','deny'],
    ['evidence','审计字段覆盖',Number.isFinite(e.coverage_percent)?count(e.coverage_percent)+'%':'—',count(e.complete)+' / '+count(e.total)+' 条记录',''],
  ]) {
    const item = element('article',undefined,'security-metric '+tone);
    item.dataset.metric = key;
    item.append(element('span',label),element('strong',value),element('small',note));
    metrics.append(item);
  }
  const runtime = element('div',undefined,'security-runtime'), path = element('div');
  path.append(element('h3','模型到工具的强制控制路径'));
  const stages = element('ol',undefined,'security-pipeline');stages.setAttribute('aria-label','受管工具执行路径');
  [['候选动作','模型与工具'],['可信身份','主体与上下文'],['OPA 三态','允许 / 审批 / 拒绝'],['绑定审批','任务与动作摘要'],['一次票据','短时签发与核销'],['隔离执行','业务结果与回执']].forEach(([label,detail],index)=>{
    const item=element('li');item.append(element('b',String(index+1).padStart(2,'0')),element('strong',label),element('small',detail));stages.append(item);
  });
  path.append(stages);
  const health=element('div');health.append(element('h3','运行组件'));
  const rows=element('div',undefined,'security-health'),services=data?.services;
  for(const [label,value] of [['AgentGuard 网关',services?.agentguard?.available],['OPA 与签票依赖',services?.dependencies?.available]]){
    const row=element('div',undefined,'security-health-row');row.append(element('span',label),element('span',value===true?'正常':value===false?'不可用':'待核验','chip '+(value===true?'':value===false?'bad':'warn')));rows.append(row);
  }
  const records=services?.openclaw_mcp?.records,recordRow=element('div',undefined,'security-health-row');
  recordRow.append(element('span','OpenClaw / MCP'),element('span',Number.isFinite(records)?records>0?'已记录 '+records+' 次':'暂无调用记录':'待核验','chip '+(records>0?'':'warn')));rows.append(recordRow);
  health.append(rows);runtime.append(path,health);
  const note=element('div',undefined,'security-overview-note');note.dataset.overviewState=status;
  if(status==='login'){
    note.append(element('span','登录后查看本机运行指标。'));const login=element('button','前往动态权限');login.onclick=()=>navigate('permissions');note.append(login);
  }else if(status==='error'){
    note.setAttribute('role','alert');note.textContent='安全总览暂不可用，请刷新重试。';
  }else if(status==='loading')note.textContent='正在读取本机运行记录…';
  else note.textContent=(c.total===0?'暂无受控请求记录。':'指标来自 AgentGuard 受管调用记录。')+' '+(data.generated_at?'更新于 '+new Date(data.generated_at).toLocaleTimeString('zh-CN',{hour12:false}):'更新时间不可得。');
  container.replaceChildren(metrics,runtime,note);
}

export function mountSecurityOverview(parent, identity, navigate) {
  const container=element('div',undefined,'security-overview');parent.append(container);
  let disposed=false;
  const user=identity?.snapshot().user;
  render(container,null,user?'loading':'login',navigate);
  if(user)identity.requestGateway('govagentsec.runtime.overview').then(data=>{
    if(!disposed&&container.isConnected)render(container,data,'ready',navigate);
  }).catch(()=>{if(!disposed&&container.isConnected)render(container,null,'error',navigate);});
  return ()=>{disposed=true;};
}
