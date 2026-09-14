(function mountProtectAgentUi() {
  "use strict";

  if (window.__protectAgentUiMounted) return;
  window.__protectAgentUiMounted = true;

  const STATE_URL = "/protect-agent/ui/state";
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
      steps: STEP_DEFINITIONS.map((step) => ({ ...step, status: received.get(step.id) })),
    };
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

  function ensureMounted() {
    const sidebarBody = document.querySelector(".sidebar-shell__body");
    const sessions = sidebarBody?.querySelector(".sidebar-sessions");
    if (!sidebarBody || !sessions || panel.parentElement === sidebarBody) return;
    sessions.insertAdjacentElement("afterend", panel);
  }

  function render(snapshot) {
    panel.dataset.status = snapshot.status;
    const activeStep = snapshot.steps.find((step) => step.status === "active");
    const summary = snapshot.status === "idle"
      ? "等待新消息"
      : snapshot.status === "allowed"
        ? "本轮检查已通过"
        : snapshot.status === "blocked"
          ? "已拦截高风险请求"
          : activeStep
            ? `正在检查 · ${activeStep.label}`
            : "正在监控工具调用";
    summaryText.textContent = summary;
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
      row.querySelector(".protect-guard__step-state").textContent = stateLabels[step.status];
    }
    footerValue.textContent = snapshot.riskScore === null
      ? "等待运行"
      : `风险 ${Math.round(snapshot.riskScore * 100)}%${snapshot.riskLevel ? ` · ${snapshot.riskLevel}` : ""}`;
  }

  let polling = false;
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const response = await fetch(STATE_URL, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("state unavailable");
      const snapshot = normalizeSnapshot(await response.json());
      if (!snapshot) throw new Error("invalid state");
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
