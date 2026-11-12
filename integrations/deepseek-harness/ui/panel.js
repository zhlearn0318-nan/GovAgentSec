(function mountHarnessGuard() {
  'use strict';
  const ID = 'govagentsec-harness-guard';
  const definitions = [
    ['input', '输入安全检查', '边界校验 · PIGuard · Qwen3Guard'],
    ['policy', '风险策略决策', '输入检测结果与放行策略'],
    ['tools', '工具与外部内容', '参数审查 · 原生审批 · 返回内容检测'],
    ['output', '模型输出复检', '发送前检查文本与思考内容'],
  ];
  const labels = { pending: '等待', active: '检查中', passed: '通过', monitoring: '监控中', review: '待审批', blocked: '拦截', skipped: '跳过', error: '异常' };
  function node(tag, className, text) {
    const value = document.createElement(tag);
    value.className = className;
    if (text !== undefined) value.textContent = text;
    return value;
  }
  function mount() {
    if (document.getElementById(ID)) return;
    const panel = node('details', 'protect-guard');
    panel.id = ID;
    panel.open = !matchMedia('(max-width: 600px)').matches;
    panel.dataset.status = 'idle';
    panel.setAttribute('aria-label', 'GovAgentSec 防护过程');
    const summary = node('summary', 'protect-guard__summary');
    const copy = node('span', 'protect-guard__summary-copy');
    const status = node('strong', 'protect-guard__summary-text', '等待新消息');
    status.setAttribute('role', 'status');
    copy.append(node('span', 'protect-guard__eyebrow', 'GovAgentSec · 防护过程'), status);
    const connection = node('span', 'protect-guard__connection', '连接中');
    const chevron = node('span', 'protect-guard__chevron', '⌃');
    chevron.setAttribute('aria-hidden', 'true');
    summary.append(node('span', 'protect-guard__shield'), copy, connection, chevron);
    const body = node('div', 'protect-guard__body');
    const list = node('ol', 'protect-guard__steps');
    const rows = new Map();
    for (const [id, title, detail] of definitions) {
      const row = node('li', 'protect-guard__step');
      row.dataset.stepId = id;
      const marker = node('span', 'protect-guard__marker', '·');
      marker.setAttribute('aria-hidden', 'true');
      const text = node('span', 'protect-guard__step-copy');
      text.append(node('strong', '', title), node('small', '', detail));
      const state = node('span', 'protect-guard__step-state', '等待');
      row.append(marker, text, state);
      list.append(row);
      rows.set(id, { row, marker, state });
    }
    const footer = node('footer', 'protect-guard__footer');
    const risk = node('strong', '', '等待运行');
    footer.append(node('span', '', '最近活动 · 全部会话'), risk);
    const notice = node('p', 'protect-guard__notice', '等待防护服务状态');
    body.append(list, footer, notice);
    panel.append(summary, body);
    document.body.append(panel);

    function render(snapshot) {
      if (snapshot?.version !== '1' || !['idle', 'running', 'allowed', 'blocked'].includes(snapshot.status)
          || !Array.isArray(snapshot.steps) || snapshot.steps.length !== definitions.length
          || new Set(snapshot.steps.map(step => step?.id)).size !== definitions.length
          || snapshot.steps.some(step => !rows.has(step?.id) || !Object.hasOwn(labels, step.status))) throw Error('Invalid state');
      panel.dataset.status = snapshot.status;
      const active = snapshot.steps.find(step => step.status === 'active');
      const review = snapshot.steps.some(step => step.status === 'review');
      const error = snapshot.steps.some(step => step.status === 'error');
      const nextStatus = snapshot.status === 'blocked' ? (error ? '检查异常 · 操作已阻止' : '安全策略已拦截')
        : review ? '工具操作等待审批'
          : snapshot.status === 'allowed' ? '本次输出检查已通过'
            : snapshot.status === 'idle' ? '等待新消息'
              : active ? `正在检查 · ${definitions.find(([id]) => id === active.id)[1]}` : '等待模型与工具活动';
      if (status.textContent !== nextStatus) status.textContent = nextStatus;
      for (const step of snapshot.steps) {
        const { row, marker, state } = rows.get(step.id);
        row.dataset.status = step.status;
        marker.textContent = ({ passed: '✓', review: '?', blocked: '!', error: '!', skipped: '–' })[step.status] ?? '·';
        state.textContent = labels[step.status];
      }
      risk.textContent = typeof snapshot.riskScore === 'number' && Number.isFinite(snapshot.riskScore)
        ? `风险 ${Math.round(Math.max(0, Math.min(1, snapshot.riskScore)) * 100)}%`
        : ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(snapshot.riskLevel) ? `风险 ${snapshot.riskLevel}` : '等待检测结果';
      const service = snapshot.service;
      const ready = service?.status === 'ready';
      connection.textContent = ready ? (service.mode === 'baseline' ? '规则基线就绪' : '防护模型就绪')
        : service?.status === 'starting' ? '模型启动中' : '防护服务不可用';
      panel.dataset.connection = ready ? 'online' : 'offline';
      notice.textContent = !ready ? '防护服务尚未就绪，相关操作将被阻止。'
        : service.mode === 'baseline' ? '当前为规则基线模式，未加载真实防护模型。'
          : '显示当前进程最近的检查活动；工具审批请在 Harness 中处理。';
    }
    let stopped = false;
    let timer;
    const lifetime = new AbortController();
    async function poll() {
      try {
        const response = await fetch(new URL('api/govagentsec/state', document.baseURI), {
          credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
          signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(5000)]),
        });
        if (!response.ok) throw Error('Unavailable');
        render(await response.json());
      } catch {
        connection.textContent = '状态连接中断';
        panel.dataset.connection = 'offline';
        notice.textContent = '无法获取实时状态，请检查 Harness 连接。';
      } finally {
        if (!stopped) timer = setTimeout(poll, document.hidden ? 5000 : 800);
      }
    }
    window.addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); lifetime.abort(); }, { once: true });
    poll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
