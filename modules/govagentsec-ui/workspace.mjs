import { workspaceStyle, icon } from "/plugins/govagentsec/workspace-style.mjs";
const titles = {
  home: ["工作台", "处理待办，查看最近任务。"],
  admission: ["能力接入", "检查 Skill 与 MCP，管理已接入的能力。"],
  approvals: ["待审批", "先核对具体动作，再决定是否执行。"],
  audit: ["任务轨迹", "从一次任务追溯调用、审批和执行结果。"],
  settings: ["防护设置", "查看实际覆盖，按需调整运行策略。"],
};
export function go(section) {
  window.dispatchEvent(
    new CustomEvent("gov-navigate", { detail: { section } }),
  );
}
export function inspect(trace, tab = "process") {
  window.dispatchEvent(
    new CustomEvent("gov-inspect", { detail: { trace, tab } }),
  );
}
const node = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
function button(text, fn, cls = "") {
  const b = node("button", text, cls);
  b.onclick = fn;
  return b;
}
function chip(text, level = "") {
  return node("span", text, "chip " + level);
}
function symbol(name) {
  const e = node("span");
  e.innerHTML = icon(name);
  return e;
}
function section(title, action) {
  const box = node("section", undefined, "section");
  const header = node("div", undefined, "section-head");
  header.append(node("h2", title));
  if (action) header.append(action);
  box.append(header);
  return box;
}
function time(value) {
  return value
    ? new Date(value).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "时间未知";
}
export function defineWorkspace() {
  if (customElements.get("govagentsec-workspace")) return;
  class Workspace extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.current = "home";
      this.generation = 0;
      this.onPopState = () => {
        this.section =
          new URLSearchParams(location.search).get("section") || "home";
      };
      this.onApproval = () => {
        if (["home", "approvals"].includes(this.current)) this.render();
      };
      this.onRouteChange = (event) => {
        this.section = event.detail.section;
      };
    }
    connectedCallback() {
      window.addEventListener("popstate", this.onPopState);
      window.addEventListener("gov-approval-updated", this.onApproval);
      window.addEventListener("gov-route-change", this.onRouteChange);
      for (const key of ["client", "section", "sandboxMode"])
        if (Object.hasOwn(this, key)) {
          const value = this[key];
          delete this[key];
          this[key] = value;
        }
      this.render();
    }
    set client(value) {
      if (this.gateway === value) return;
      this.gateway = value;
      this.render();
    }
    set section(value) {
      value = titles[value] ? value : "home";
      if (value === this.current) return;
      this.current = value;
      this.render();
    }
    set sandboxMode(value) {
      this.sandbox =
        value === "trusted"
          ? "allow-scripts allow-same-origin"
          : value === "strict"
            ? ""
            : "allow-scripts";
    }
    disconnectedCallback() {
      window.removeEventListener("popstate", this.onPopState);
      window.removeEventListener("gov-approval-updated", this.onApproval);
      window.removeEventListener("gov-route-change", this.onRouteChange);
      this.generation++;
      this.cleanup?.();
    }
    async render() {
      if (!this.isConnected) return;
      const version = ++this.generation;
      this.cleanup?.();
      this.cleanup = null;
      const style = node("style", workspaceStyle),
        main = node("main", undefined, "workspace");
      const head = node("header", undefined, "heading row spread");
      const intro = node("div");
      intro.append(
        node("h1", titles[this.current][0]),
        node("p", titles[this.current][1], "muted"),
      );
      const actions = node("div", undefined, "right");
      actions.append(
        button("刷新", () => this.render(), "secondary"),
        button("返回对话", () => go("chat"), "primary"),
      );
      head.append(intro, actions);
      const body = node("div", undefined, "body");
      body.append(node("p", "正在读取本机记录…", "empty"));
      const footer = node("footer", undefined, "workspace-footer");
      footer.append(
        node("span", "政安智枢 · OpenClaw 工作区"),
        node("span", "原始证据按任务保留"),
      );
      main.append(head, body, footer);
      this.shadowRoot.replaceChildren(style, main);
      if (!this.gateway) {
        body.replaceChildren(node("p", "网关尚未连接，连接后刷新。", "empty"));
        return;
      }
      try {
        const data = await this.gateway.request(
          "govagentsec.trajectory.workspace",
          {},
        );
        if (version !== this.generation) return;
        body.replaceChildren();
        this.data = data;
        this[this.current](body, data);
        footer.lastChild.textContent =
          "更新于 " + new Date().toLocaleTimeString("zh-CN");
      } catch (e) {
        if (version === this.generation)
          body.replaceChildren(
            node("p", "工作台数据读取失败：" + e.message, "error"),
          );
      }
    }
    taskList(parent, traces) {
      if (!traces.length) {
        parent.append(
          node(
            "p",
            "暂无任务记录。返回对话发送任务后，可在这里查看过程。",
            "empty",
          ),
        );
        return;
      }
      for (const trace of traces) {
        const row = button("", () => inspect(trace), "task-row");
        const glyph = node("span", undefined, "task-icon");
        glyph.append(symbol("audit"));
        const copy = node("span", undefined, "truncate");
        copy.append(
          node("span", trace.title || "未命名任务", "title"),
          node(
            "small",
            time(trace.started_at) +
              " · " +
              (trace.tool_calls ?? trace.tool_count ?? 0) +
              " 次工具调用" +
              (trace.source === "openclaw" ? "" : " · 受控测试") +
              (trace.session_key ? "" : " · 会话未关联"),
          ),
        );
        const status =
          trace.trace_status === "complete"
            ? "记录完整"
            : trace.trace_status === "invalid"
              ? "校验异常"
              : trace.trace_status === "interrupted"
                ? "已中断"
                : "不完整";
        const state = chip(
          status,
          trace.trace_status === "invalid"
            ? "bad"
            : trace.trace_status === "complete"
              ? ""
              : "warn",
        );
        const arrow = symbol("arrow");
        arrow.className = "arrow";
        row.append(glyph, copy, state, arrow);
        parent.append(row);
      }
    }
    home(body, data) {
      const grid = node("div", undefined, "overview"),
        left = node("div"),
        side = node("aside", undefined, "side");
      if (data.approval_error)
        left.append(node("div", data.approval_error, "notice"));
      const queue = section(
        "待处理",
        button("查看全部", () => go("approvals"), "quiet"),
      );
      queue.classList.add("queue");
      if (data.pending.length) {
        for (const p of data.pending.slice(0, 2)) {
          const item = node("div", undefined, "approval");
          const r = node("div", undefined, "row spread");
          r.append(
            node("strong", p.tool || "受控动作"),
            chip("需要你的决定", "warn"),
          );
          item.append(
            r,
            node(
              "p",
              time(p.created_at) + " · " + (p.reason || "策略要求复核"),
              "muted",
            ),
            button("核对并处理", () =>
              p.trace_id
                ? inspect(
                    { trace_id: p.trace_id, session_key: p.session_key },
                    "risk",
                  )
                : go("approvals"),
            ),
          );
          queue.append(item);
        }
      } else queue.append(node("p", "当前没有待审批动作", "empty"));
      left.append(queue);
      const recent = section(
        "最近任务",
        button("全部轨迹", () => go("audit"), "quiet"),
      );
      this.taskList(
        recent,
        data.traces.filter((t) => t.source === "openclaw").slice(0, 5),
      );
      left.append(recent);
      const quick = section("开始操作");
      const shortcuts = node("div", undefined, "quick");
      for (const [name, label, target] of [
        ["chat", "继续对话", "chat"],
        ["admission", "接入 Skill / MCP", "admission"],
        ["settings", "检查防护覆盖", "settings"],
      ]) {
        const b = button(label, () => go(target));
        b.prepend(symbol(name));
        shortcuts.append(b);
      }
      quick.append(shortcuts);
      side.append(quick, this.coverage(data));
      grid.append(left, side);
      body.append(grid);
    }
    coverage(data) {
      const c = section("实际防护状态"),
        list = node("div", undefined, "coverage");
      for (const [label, desc, state, level] of [
        [
          "轨迹采集",
          "记录模型与工具事件",
          data.coverage.capture ? "已配置" : "未启用",
          data.coverage.capture ? "" : "warn",
        ],
        [
          "工具执行",
          "AgentGuard 受管调用",
          data.coverage.agentguard_configured ? "已接入" : "未接入",
          data.coverage.agentguard_configured ? "" : "warn",
        ],
        [
          "输入与回复",
          "对话检查权限",
          data.coverage.input_hooks === "configured" ? "已配置" : "未授权",
          "warn",
        ],
        ["工具返回", "检查后的强制截断", "仅观察", "warn"],
      ]) {
        const r = node("div", undefined, "coverage-row"),
          t = node("div");
        t.append(node("span", label), node("small", desc));
        r.append(t, chip(state, level));
        list.append(r);
      }
      c.append(list);
      return c;
    }
    frame(parent, url, title) {
      const f = node("iframe");
      f.className = "tool-frame";
      f.title = title;
      f.setAttribute("sandbox", this.sandbox ?? "allow-scripts");
      f.src = url;
      parent.append(f);
      return f;
    }
    admission(body, data) {
      const layout = node("div", undefined, "split"),
        inventory = node("aside", undefined, "section capabilities");
      inventory.append(
        node("h2", "已配置 MCP"),
        node("p", "配置存在不等于已通过准入", "muted"),
      );
      for (const server of data.servers) {
        const r = node("div", undefined, "cap-row"),
          line = node("div", undefined, "row");
        line.append(
          node("span", server.name, "truncate"),
          chip(server.enabled ? "启用" : "停用", server.enabled ? "" : "warn"),
        );
        r.append(line);
        inventory.append(r);
      }
      if (!data.servers.length)
        inventory.append(node("p", "暂无 MCP 配置", "empty"));
      inventory.append(button("查看已安装 Skill", () => go("skills"), "quiet"));
      const pane = node("div", undefined, "tool-pane"),
        tabs = node("div", undefined, "segmented"),
        content = node("div", undefined, "tool-pane");
      content.style.flex = "1";
      const choices = [
        [
          "Skill 安全接入",
          "/plugins/aegis-admission/panel?embed=1&workspace=1",
        ],
        ["MCP 接入", "/plugins/aegis-admin/mcp?embed=1&workspace=1"],
        ["检查报告", "/plugins/aegis-admin/reports?embed=1&workspace=1"],
      ];
      for (const [label, url] of choices) {
        const b = button(label, () => {
          for (const x of tabs.children)
            x.setAttribute("aria-pressed", String(x === b));
          content.replaceChildren();
          this.frame(content, url, label);
        });
        tabs.append(b);
      }
      pane.append(tabs, content);
      layout.append(inventory, pane);
      body.append(layout);
      tabs.firstChild.click();
    }
    approvals(body, data) {
      if (data.approval_error)
        body.append(node("div", data.approval_error, "notice"));
      const list = section("审批队列", chip(data.pending.length + " 项"));
      for (const p of data.pending) {
        const item = node("div", undefined, "approval"),
          r = node("div", undefined, "row spread");
        r.append(node("h2", p.tool || "受控动作"), chip("待审批", "warn"));
        item.append(
          r,
          node(
            "p",
            (p.reason || "策略要求复核") + " · " + time(p.created_at),
            "muted",
          ),
        );
        const details = node("details");
        details.append(
          node("summary", "查看动作参数"),
          node("pre", JSON.stringify(p.parameters ?? {}, null, 2)),
        );
        item.append(
          details,
          button("核对并处理", () => {
            if (p.trace_id)
              inspect(
                { trace_id: p.trace_id, session_key: p.session_key },
                "risk",
              );
            else {
              body.replaceChildren();
              this.frame(
                body,
                "/plugins/agentguard-runtime-security/panel?embed=1&workspace=1&section=approvals",
                "运行防护审批",
              );
            }
          }),
        );
        list.append(item);
      }
      if (!data.pending.length)
        list.append(
          node("p", "当前没有待审批动作。新的受控请求会显示在这里。", "empty"),
        );
      body.append(list);
    }
    audit(body, data) {
      const filters = node("div", undefined, "filter");
      const search = node("input");
      search.placeholder = "搜索任务内容";
      search.setAttribute("aria-label", "搜索任务");
      const type = node("select");
      type.setAttribute("aria-label", "记录状态");
      for (const [v, label] of [
        ["all", "全部状态"],
        ["complete", "完整记录"],
        ["partial", "不完整"],
        ["interrupted", "已中断"],
        ["invalid", "校验异常"],
      ]) {
        const o = node("option", label);
        o.value = v;
        type.append(o);
      }
      filters.append(
        search,
        type,
        node(
          "span",
          "最近 " + data.traces.length + " / " + data.total + " 条",
          "counter",
        ),
      );
      filters.append(
        button("运行对照与候选记录", () => go("compare"), "quiet"),
      );
      const list = section("任务记录");
      const content = node("div");
      list.append(content);
      const draw = () => {
        content.replaceChildren();
        this.taskList(
          content,
          data.traces.filter(
            (t) =>
              (type.value === "all" || t.trace_status === type.value) &&
              (t.title || "")
                .toLowerCase()
                .includes(search.value.toLowerCase()),
          ),
        );
      };
      search.oninput = draw;
      type.onchange = draw;
      body.append(filters, list);
      draw();
    }
    settings(body, data) {
      const grid = node("div", undefined, "overview");
      grid.append(this.coverage(data));
      const controls = section("配置与维护");
      const rows = node("div", undefined, "quick");
      for (const [label, url] of [
        ["输入防护策略", "/plugins/protect-agent/panel?embed=1&workspace=1"],
        [
          "运行防护与审批记录",
          "/plugins/agentguard-runtime-security/panel?embed=1&workspace=1",
        ],
        ["准入规则", "/plugins/aegis-admin/rules?embed=1&workspace=1"],
      ])
        rows.append(
          button(label, () => {
            body.replaceChildren();
            this.frame(body, url, label);
          }),
        );
      rows.append(button("OpenClaw 系统设置", () => go("config")));
      controls.append(rows);
      grid.append(controls);
      body.append(grid);
    }
  }
  customElements.define("govagentsec-workspace", Workspace);
}
export function createWorkspaceView(html) {
  defineWorkspace();
  return {
    // OpenClaw calls stop on route changes; custom-element disconnection owns cleanup.
    stop() {},
    render: ({ host, client }) =>
      html`<govagentsec-workspace
        .client=${client}
        .sandboxMode=${host.context?.config.current.embedSandboxMode}
        .section=${new URLSearchParams(location.search).get("section") ||
        "home"}
      ></govagentsec-workspace>`,
  };
}
