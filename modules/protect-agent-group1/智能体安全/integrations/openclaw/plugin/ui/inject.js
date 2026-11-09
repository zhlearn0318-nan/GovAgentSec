(function mountProtectAgentUi() {
  "use strict";

  if (window.__protectAgentUiMounted) return;
  window.__protectAgentUiMounted = true;

  const STYLE_URL = "/protect-agent/ui/styles.css";
  const VALID_RUN_STATUSES = new Set(["idle", "running", "allowed", "blocked"]);
  const VALID_STEP_STATUSES = new Set([
    "pending",
    "active",
    "passed",
    "monitoring",
    "review",
    "blocked",
    "skipped",
    "error",
  ]);
  const STEP_DEFINITIONS = [
    { id: "input", label: "输入安全检查", detail: "边界校验 · PIGuard · Qwen3Guard" },
    { id: "policy", label: "风险策略决策", detail: "风险合并与策略执行" },
    { id: "tools", label: "工具与外部内容", detail: "权限、参数与返回内容" },
    { id: "output", label: "模型输出复检", detail: "敏感信息与越权行为" },
  ];
  const STEP_LABELS = new Map(STEP_DEFINITIONS.map((step) => [step.id, step]));
  const INCIDENT_KINDS = new Map([
    ["security_block", "安全检查未通过"],
    ["check_unavailable", "安全检查暂不可用"],
    ["unsupported", "当前结果类型无法检查"],
    ["tool_error", "工具执行遇到错误"],
    ["approval_pending", "等待操作确认"],
    ["approval_requested", "核对操作确认"],
    ["task_denied", "任务权限未通过"],
    ["approval_denied", "操作未获批准"],
  ]);
  const PHASE_LABELS = { input: "输入检查", tools: "工具调用", tool_results: "工具返回检查", output: "回复检查" };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function ensureStyles() {
    if (document.querySelector("link[data-protect-agent-ui]")) return;
    const link = element("link");
    link.rel = "stylesheet";
    link.href = STYLE_URL;
    link.dataset.protectAgentUi = "true";
    document.head.append(link);
  }

  function normalizeSnapshot(value) {
    if (!value || typeof value !== "object" || value.version !== "1") return null;
    if (!VALID_RUN_STATUSES.has(value.status) || !Array.isArray(value.steps)) return null;
    const received = new Map();
    for (const step of value.steps.slice(0, STEP_DEFINITIONS.length)) {
      if (!step || !STEP_LABELS.has(step.id) || !VALID_STEP_STATUSES.has(step.status)) continue;
      received.set(step.id, step.status);
    }
    if (received.size !== STEP_DEFINITIONS.length) return null;
    const riskScore = typeof value.riskScore === "number" && Number.isFinite(value.riskScore)
      ? Math.max(0, Math.min(1, value.riskScore))
      : null;
    const riskLevel = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(value.riskLevel)
      ? value.riskLevel
      : null;
    return {
      status: value.status,
      riskLevel,
      riskScore,
      incident: normalizeIncident(value.incident),
      steps: STEP_DEFINITIONS.map((step) => ({ ...step, status: received.get(step.id) })),
    };
  }

  function normalizeIncident(value) {
    if (!value || !INCIDENT_KINDS.has(value.kind)) return null;
    return {
      kind: value.kind,
      phase: PHASE_LABELS[value.phase] ?? "防护检查",
      reasonCode: typeof value.reasonCode === "string" && /^[a-zA-Z0-9_.:-]{1,80}$/.test(value.reasonCode) ? value.reasonCode : "",
      // Messages come from the guard's fixed incident descriptions, never raw tool output.
      message: typeof value.message === "string" ? value.message.slice(0,240) : "",
      stopConfirmed: value.stopConfirmed === true,
      runEnded: value.runEnded === true,
      toolCallId: typeof value.toolCallId === 'string' ? value.toolCallId : null,
      pluginId: typeof value.pluginId === 'string' ? value.pluginId : 'protect-agent',
    };
  }

  async function verifyApproval(snapshot, client, sessionKey) {
    const incident = snapshot.incident;
    if (!['approval_requested', 'approval_pending'].includes(incident?.kind)) return;
    // An old persisted warning is not evidence of a live approval request.
    if (snapshot.status === 'allowed' || incident.runEnded || incident.stopConfirmed) {
      snapshot.incident = null;
      return;
    }
    incident.kind = 'approval_requested';
    incident.message = '未找到当前工具的有效确认请求。请查看任务权限状态；本提示不表示正在等待审批。';
    if (!incident.toolCallId) return;
    try {
      const requests = await client.request('plugin.approval.list', {});
      const pending = Array.isArray(requests) && requests.find(item =>
        item.request?.sessionKey === sessionKey && item.request?.toolCallId === incident.toolCallId &&
        item.request?.pluginId === incident.pluginId && item.expiresAtMs > Date.now());
      if (pending) {
        incident.kind = 'approval_pending';
        incident.message = '网关已创建当前操作的确认请求，请在 OpenClaw 确认卡片中选择“允许一次”或“拒绝”。超时后本次工具调用将被拒绝。';
      }
    } catch {
      incident.message = '暂时无法核对网关审批状态，尚未确认有可处理的确认卡片。请检查网关连接。';
    }
  }

  function createStepRow(definition) {
    const row = element("li", "protect-guard__step");
    row.dataset.stepId = definition.id;
    const marker = element("span", "protect-guard__marker", "·");
    marker.setAttribute("aria-hidden", "true");
    const copy = element("span", "protect-guard__step-copy");
    copy.append(
      element("strong", "", definition.label),
      element("small", "", definition.detail),
    );
    row.append(marker, copy, element("span", "protect-guard__step-state", "等待"));
    return row;
  }

  function createPanel() {
    const panel = element("section", "protect-guard");
    panel.id = "protect-agent-guard";
    panel.dataset.status = "idle";
    panel.setAttribute("aria-label", "防护过程");

    const toggle = element("button", "protect-guard__summary");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-controls", "protect-agent-guard-body");
    const icon = element("span", "protect-guard__shield", "◆");
    icon.setAttribute("aria-hidden", "true");
    const summaryCopy = element("span", "protect-guard__summary-copy");
    summaryCopy.append(
      element("span", "protect-guard__eyebrow", "输入防护链"),
      element("strong", "protect-guard__summary-text", "等待新消息"),
    );
    const connection = element("span", "protect-guard__connection", "连接中");
    connection.prepend(element("i"));
    const chevron = element("span", "protect-guard__chevron", "⌃");
    chevron.setAttribute("aria-hidden", "true");
    toggle.append(icon, summaryCopy, connection, chevron);

    const body = element("div", "protect-guard__body");
    body.hidden = false;
    body.id = "protect-agent-guard-body";
    const track = element("span", "protect-guard__track");
    track.setAttribute("aria-hidden", "true");
    const list = element("ol", "protect-guard__steps");
    list.setAttribute("aria-live", "polite");
    for (const definition of STEP_DEFINITIONS) list.append(createStepRow(definition));
    const footer = element("footer", "protect-guard__footer");
    footer.append(element("span", "", "真实插件链路"), element("strong", "", "等待运行"));
    body.append(track, list, footer);
    panel.append(toggle, body);

    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      body.hidden = expanded;
    });
    return panel;
  }

  const panel = createPanel();
  const summaryText = panel.querySelector(".protect-guard__summary-text");
  const connection = panel.querySelector(".protect-guard__connection");
  const list = panel.querySelector(".protect-guard__steps");
  const footerValue = panel.querySelector(".protect-guard__footer strong");
  const alert = element("section", "protect-alert");
  alert.id = "protect-agent-alert";
  alert.hidden = true;
  alert.setAttribute("role", "alert");
  alert.setAttribute("aria-atomic", "true");
  const alertTitle = element("strong", "protect-alert__title");
  const alertMessage = element("p", "protect-alert__message");
  const alertDetail = element("p", "protect-alert__detail");
  const alertAction = element("p", "protect-alert__action");
  alert.append(alertTitle, alertMessage, alertDetail, alertAction);
  let activeSession = null;
  let lastAlertKey = "";

  function syncSession() {
    const key = document.querySelector("openclaw-app-shell")?.activeSessionKey ?? null;
    if (key !== activeSession) {
      activeSession = key;
      alert.hidden = true;
      lastAlertKey = "";
      render({status:"idle",riskLevel:null,riskScore:null,incident:null,
        steps:STEP_DEFINITIONS.map(step=>({...step,status:"pending"}))});
    }
    return key;
  }

  function ensureMounted() {
    syncSession();
    const sidebarBody = document.querySelector(".sidebar-shell__body");
    const sessions = sidebarBody?.querySelector(".sidebar-sessions");
    if (sidebarBody && sessions && panel.parentElement !== sidebarBody) sessions.insertAdjacentElement("afterend", panel);
    const panes = [...document.querySelectorAll("openclaw-chat-pane")];
    const pane = panes.find(item=>item.sessionKey===activeSession) ?? panes.find(item=>item.active===true);
    const thread = pane?.querySelector(".chat-thread");
    if (thread && alert.nextElementSibling !== thread) thread.insertAdjacentElement("beforebegin", alert);
    else if (!thread && alert.isConnected) alert.remove();
  }

  function renderIncident(snapshot) {
    const incident = snapshot.incident;
    const fallback = !incident && (snapshot.status === "blocked" || snapshot.steps.some(step=>step.status==="error"));
    if (!incident && !fallback) {
      alert.hidden = true;
      lastAlertKey = "";
      return;
    }
    const key = JSON.stringify({incident,fallback,status:snapshot.status});
    // Updating live-region text on each poll repeats screen-reader announcements.
    if (key === lastAlertKey) return;
    lastAlertKey = key;
    const toolError = incident?.kind === "tool_error";
    const approvalPending = incident?.kind === "approval_pending";
    const approvalRequested = incident?.kind === "approval_requested";
    const taskDenied = incident?.kind === "task_denied";
    alert.dataset.kind = incident?.kind ?? "unconfirmed";
    alertTitle.textContent = incident?.stopConfirmed ? "当前任务已停止"
      : taskDenied ? "工具调用已阻断 · 任务权限未通过"
      : approvalRequested ? "尚未确认审批请求"
      : approvalPending ? "等待操作确认" : toolError ? "工具执行出错" : "防护异常 · 尚未确认任务停止";
    alertMessage.textContent = incident?.message || (incident ? INCIDENT_KINDS.get(incident.kind) : "检测到阻断或异常记录，但没有任务停止确认。");
    alertDetail.textContent = incident ? `${incident.phase} · ${INCIDENT_KINDS.get(incident.kind)}${incident.reasonCode ? ` · 原因代码：${incident.reasonCode}` : ""}` : "请查看当前任务的防护决策和执行记录。";
    alertAction.textContent = incident?.stopConfirmed
      ? "本次运行已结束。可在“当前任务”查看原因，处理后重新发送消息。"
      : taskDenied ? (incident.runEnded ? '本轮运行已结束。请在“动态权限”中处理后重新发送消息。' : '本次工具没有执行；Agent 仍可能生成说明。请在“动态权限”中检查当前任务绑定。')
      : approvalRequested ? "此提示不是确认卡片，也不代表操作已获准。"
      : approvalPending ? "请处理 OpenClaw 的操作确认卡片；当前等待时间不属于模型推理。" : toolError ? "这是工具执行错误，不代表已发现安全攻击；任务可能继续处理。"
        : "若仍在生成，请先使用对话的停止按钮。可在“当前任务”查看处理记录。";
    alert.hidden = false;
  }

  function render(snapshot) {
    panel.dataset.status = snapshot.status;
    const activeStep = snapshot.steps.find((step) => step.status === "active");
    const summary = snapshot.status === "idle"
      ? "等待新消息"
      : snapshot.status === "allowed"
        ? "本轮检查已通过"
        : snapshot.incident?.stopConfirmed
          ? "当前任务已停止"
        : snapshot.incident?.kind === "tool_error"
          ? "工具执行出错"
        : snapshot.incident?.kind === "task_denied"
          ? "工具调用已阻断"
        : snapshot.status === "blocked"
          ? "检测已阻断 · 停止未确认"
          : activeStep
            ? `正在检查 · ${activeStep.label}`
            : "正在监控工具调用";
    summaryText.textContent = summary;
    renderIncident(snapshot);
    list.setAttribute("aria-busy", String(snapshot.status === "running"));

    const stateLabels = {
      pending: "等待",
      active: "检查中",
      passed: "通过",
      monitoring: "监控中",
      review: "待确认",
      blocked: "拦截",
      skipped: "跳过",
      error: "异常",
    };
    const markers = { passed: "✓", review: "?", blocked: "!", error: "!", skipped: "–" };
    for (const step of snapshot.steps) {
      const row = list.querySelector(`[data-step-id="${step.id}"]`);
      row.dataset.status = step.status;
      row.querySelector(".protect-guard__marker").textContent = markers[step.status] ?? "·";
      row.querySelector(".protect-guard__step-state").textContent = step.id === "input" && step.status === "passed" ? "已检查" : stateLabels[step.status];
    }
    footerValue.textContent = snapshot.incident && snapshot.incident.kind !== "security_block"
      ? INCIDENT_KINDS.get(snapshot.incident.kind)
      : snapshot.riskScore === null
      ? "等待运行"
      : `风险 ${Math.round(snapshot.riskScore * 100)}%${snapshot.riskLevel ? ` · ${snapshot.riskLevel}` : ""}`;
  }

  let polling = false;
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const host=document.querySelector('openclaw-app-shell');
      const sessionKey=syncSession();
      const gateway=host?.context?.gateway.snapshot;
      if(!gateway?.connected || !sessionKey) throw new Error('not authenticated');
      const snapshot=normalizeSnapshot(await gateway.client.request('govagentsec.protection.state',{sessionKey}));
      if (syncSession() !== sessionKey) return;
      if (!snapshot) throw new Error("invalid state");
      await verifyApproval(snapshot, gateway.client, sessionKey);
      if (syncSession() !== sessionKey) return;
      connection.lastChild.textContent = "在线";
      panel.dataset.connection = "online";
      render(snapshot);
    } catch {
      connection.lastChild.textContent = "离线";
      panel.dataset.connection = "offline";
    } finally {
      polling = false;
      window.setTimeout(poll, document.hidden ? 2_500 : 650);
    }
  }

  ensureStyles();
  ensureMounted();
  new MutationObserver(ensureMounted).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  poll();
})();
