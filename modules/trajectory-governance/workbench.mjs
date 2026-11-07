import { styles, markup, mount } from "/plugins/govagentsec/trajectory-ui.mjs";
const labels = {
  pending: "待审批",
  pending_approval: "待审批",
  approved_executed: "已批准并执行",
  executed_isolated: "执行成功",
  blocked: "已阻断",
  rejected: "已拒绝",
  interrupted: "已中断",
  error: "处理失败",
  unverified: "未验证",
};
const el = (tag, text) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};
export function mountWorkbench(root, client, sessionKey, options = {}) {
  root.replaceChildren();
  let disposed = false,
    revision = 0,
    selection = options.traceId ?? null,
    renderedData = null,
    cleanupGraph = null;
  const style = el(
    "style",
    `:host{display:block}*{box-sizing:border-box}.wb{font:14px/1.6 'Microsoft YaHei UI',sans-serif;color:#19334b;padding:16px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}button,select,input,textarea{font:inherit;border:1px solid #cbd9e3;border-radius:6px;padding:7px 10px;background:white;color:inherit}button{cursor:pointer}button[aria-selected=true],button.primary{background:#157e73;color:white}button:focus-visible{outline:3px solid #bf923d}select{max-width:100%;min-width:0}.runs{width:100%}.muted{font-size:12px;color:#61798b}.card{border:1px solid #d3dfe7;border-radius:8px;background:white;padding:14px;margin:12px 0;overflow-wrap:anywhere}.card h3{font-size:15px;margin:0 0 8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 Consolas,monospace;background:#eef3f7;padding:12px;max-height:240px;overflow:auto}.error{color:#ac423e}.approve{display:grid;gap:8px}.approve input,.approve textarea{width:100%}[hidden]{display:none!important}`,
  );
  const box = el("div");
  box.className = "wb";
  const row = el("div");
  row.className = "row";
  const scope = el("select");
  scope.setAttribute("aria-label", "轨迹范围");
  for (const [v, t] of [
    ["session", "当前会话"],
    ["all", "全部历史"],
  ]) {
    const o = el("option", t);
    o.value = v;
    scope.append(o);
  }
  scope.value = options.scope ?? (sessionKey ? "session" : "all");
  const refreshButton = el("button", "刷新");
  const manage = el("a", "审计中心");
  manage.href = "/plugin?plugin=protect-agent&id=govagentsec&section=audit";
  manage.onclick=event=>{event.preventDefault();window.dispatchEvent(new CustomEvent("gov-navigate",{detail:{section:"audit"}}));};
  row.append(scope, refreshButton, manage);
  const message = el("p", "读取任务…");
  message.setAttribute("role", "status");
  message.className = "muted";
  const runs = el("select");
  runs.className = "runs";
  runs.setAttribute("aria-label", "选择任务运行");
  const tabs = el("div");
  tabs.className = "row";
  tabs.setAttribute("role", "tablist");
  const views = {};
  for (const [key, label] of [
    ["process", "过程"],
    ["risk", "风险与审批"],
    ["evidence", "证据"],
  ]) {
    const b = el("button", label);
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(key === (options.tab ?? "process")));
    const v = el("section");
    v.hidden = key !== (options.tab ?? "process");
    views[key] = v;
    b.onclick = () => {
      for (const button of tabs.children)
        button.setAttribute("aria-selected", String(button === b));
      for (const [k, p] of Object.entries(views)) p.hidden = k !== key;
    };
    tabs.append(b);
  }
  box.append(row, message, runs, tabs, ...Object.values(views));
  root.append(style, box);
  const api = (method, params = {}) =>
    client.request("govagentsec.trajectory." + method, params);
  function card(parent, title, text) {
    const c = el("article");
    c.className = "card";
    c.append(el("h3", title));
    if (text) c.append(el("p", text));
    parent.append(c);
    return c;
  }
  function raw(parent, title, data) {
    const d = el("details");
    d.append(el("summary", title), el("pre", JSON.stringify(data, null, 2)));
    parent.append(d);
  }
  function draw(value) {
    cleanupGraph?.();
    const graphRoot = el("div");
    views.process.replaceChildren(graphRoot);
    const shadow = graphRoot.attachShadow({ mode: "open" });
    const css = el(
      "style",
      styles +
        `.top,.status,.lower,.workspace>aside{display:none}.workspace{padding:0;display:block}.workspace>.box{border:0;padding:0}.graph-layout{grid-template-columns:1fr}.graph-scroll{height:390px}.inspector{max-height:240px}.legend{font-size:11px}`,
    );
    const t = el("template");
    t.innerHTML = markup;
    shadow.append(css, t.content.cloneNode(true));
    cleanupGraph = mount(shadow, async (method) =>
      method === "list"
        ? { traces: [value.trace.summary] }
        : method === "candidates"
          ? { candidates: [] }
          : value.trace,
    );
    views.risk.replaceChildren();
    views.evidence.replaceChildren();
    for (const [key,label] of [['input','输入检查'],['output','回复检查'],['tool_results','工具返回']]) {
      const stage=value.coverage.runtime?.[key];
      card(views.risk,label,stage?.reason??'等待后端提供实际防护状态');
    }
    if (!value.controls.length)
      card(
        views.risk,
        "本任务暂无关联审批",
        "未发现可关联的 AgentGuard 受控调用，不代表所有操作都已通过检查。",
      );
    for (const control of value.controls) {
      const c = card(
        views.risk,
        labels[control.status] || control.status,
        control.reason || control.message || "",
      );
      c.append(el("p", "来源：AgentGuard · " + control.mcp_tool));
      if (control.action) raw(c, "查看具体动作与参数", control.action);
      if (control.can_resolve) {
        const form = el("div");
        form.className = "approve";
        const actor = el("input");
        actor.placeholder = "审批人员姓名或工号";
        actor.setAttribute("aria-label", "审批人员");
        const note = el("textarea");
        note.placeholder = "审批意见";
        note.setAttribute("aria-label", "审批意见");
        form.append(actor, note);
        const instructions = el(
          "p",
          "先核对动作与参数。批准后将重新验策略，并尝试执行该动作。",
        );
        form.append(instructions);
        for (const [action, label] of [
          ["approve", "批准并执行"],
          ["reject", "拒绝"],
          ["interrupt", "中断"],
        ]) {
          const b = el("button", label);
          b.onclick = async () => {
            if (!actor.value.trim()) {
              instructions.textContent = "请填写审批人员。";
              return;
            }
            for (const x of form.querySelectorAll("button")) x.disabled = true;
            try {
              await api("resolve", {
                trace_id: value.trace.summary.trace_id,
                session_key: value.trace.summary.session_key,
                control_request_id: control.control_request_id,
                resolution: action,
                approver_id: actor.value.trim(),
                note: note.value,
              });
              await select(value.trace.summary.trace_id);
              window.dispatchEvent(new CustomEvent("gov-approval-updated"));
            } catch (e) {
              instructions.textContent = e.message;
              for (const x of form.querySelectorAll("button"))
                x.disabled = false;
            }
          };
          form.append(b);
        }
        c.append(form);
      }
      const evidence = card(
        views.evidence,
        "执行证据：" + control.mcp_tool,
        control.verified ? "调用 ID 与适配器请求已核对" : "关联未验证",
      );
      raw(evidence, "请求、策略、审批与回执", control);
    }
    card(
      views.evidence,
      "业务验收",
      value.business_result === true
        ? "通过独立任务验收"
        : value.business_result === false
          ? "任务验收未通过"
          : "没有独立业务验收结果",
    );
    const capabilities = card(
      views.evidence,
      "能力版本与准入报告",
      value.capability_evidence.reason,
    );
    if (value.capability_evidence.items?.length)
      raw(
        capabilities,
        "运行时配置摘要与准入检查记录",
        value.capability_evidence.items,
      );
    raw(views.evidence, "轨迹标识与完整性", value.trace.summary);
  }
  async function select(id) {
    message.className = "muted";
    const current = ++revision;
    if (selection !== id) {
      renderedData = null;
      for (const view of Object.values(views)) view.replaceChildren();
      cleanupGraph?.();
    }
    selection = id;
    try {
      const value = await api("task", {
        trace_id: id,
        ...(scope.value === "session" ? { session_key: sessionKey } : {}),
      });
      if (!disposed && revision === current) {
        // Unchanged polling results must preserve selected graph nodes and details.
        const serialized = JSON.stringify(value);
        if (serialized !== renderedData) {
          draw(value);
          renderedData = serialized;
        }
        message.textContent =
          (scope.value === "session" ? "当前会话" : "全部历史") +
          " · " +
          value.trace.events.length +
          " 个事件" +
          (value.controls.some((c) => c.can_resolve) ? " · 有待审批动作" : "");
      }
    } catch (e) {
      if (!disposed && current === revision) {
        message.textContent = e.message;
        message.className = "error";
      }
    }
  }
  async function refresh() {
    const current = ++revision;
    try {
      if (scope.value === "session" && !sessionKey)
        throw new Error("宿主未提供当前会话标识；可切换全部历史查看。");
      const data = await api(
        "list",
        scope.value === "session" ? { session_key: sessionKey } : {},
      );
      if (disposed || current !== revision) return;
      runs.replaceChildren();
      for (const r of data.traces) {
        const o = el(
          "option",
          (r.title || r.task_id || r.run_id) +
            " · " +
            new Date(r.started_at).toLocaleString(),
        );
        o.value = r.trace_id;
        runs.append(o);
      }
      runs.hidden = !data.traces.length;
      tabs.hidden = !data.traces.length;
      if (!data.traces.length) {
        selection = null;
        renderedData = null;
        cleanupGraph?.();
        for (const v of Object.values(views)) v.replaceChildren();
        message.textContent =
          "本会话暂无已关联记录。新任务将自动采集；旧记录可在全部历史中查看。";
        return;
      }
      runs.value = data.traces.some((r) => r.trace_id === selection)
        ? selection
        : data.traces[0].trace_id;
      await select(runs.value);
    } catch (e) {
      if (!disposed && current === revision) message.textContent = e.message;
    }
  }
  scope.onchange = () => {
    selection = null;
    refresh();
  };
  runs.onchange = () => select(runs.value);
  refreshButton.onclick = refresh;
  const extraStyle = el(
    "style",
    ':host{--ink:var(--text,#233e3b)}.wb{font:13px/1.55 "Segoe UI","Microsoft YaHei UI",sans-serif;padding:16px;color:var(--ink)}.row{gap:6px}button,select,input,textarea{border-radius:6px}button[aria-selected=true]{background:#e3eeeb;color:#155b50;border-color:#c8dcd5}.card{border-radius:7px;box-shadow:none}.card p{margin:6px 0}.runs{font-size:12px}.muted{font-size:12px}',
  );
  root.append(extraStyle);
  refresh();
  const timer = setInterval(() => {
    if (
      !document.hidden &&
      !root.activeElement?.matches("input,textarea") &&
      !views.risk.contains(root.activeElement)
    )
      refresh();
  }, 10000);
  return () => {
    disposed = true;
    ++revision;
    clearInterval(timer);
    cleanupGraph?.();
  };
}
