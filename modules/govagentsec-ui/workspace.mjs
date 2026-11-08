import { workspaceStyle, icon } from "/plugins/govagentsec/workspace-style.mjs";
import { mountDemoIdentity } from "/plugins/govagentsec/demo-identity.mjs";
import {
  styles as traceStyles,
  markup as traceMarkup,
  mount as mountTraces,
} from "/plugins/govagentsec/trajectory-ui.mjs";
export const titles = {
  home: ["工作台", "处理待办，查看最近任务。"],
  admission: ["能力接入", "检查 Skill 与 MCP，管理已接入的能力。"],
  approvals: ["待审批", "先核对具体动作，再决定是否执行。"],
  audit: ["审计中心", "从一次任务追溯调用、审批和执行结果。"],
  compare: [
    "运行对照与候选记录",
    "审计中心的高级视图，对照两次运行并查看候选证据。",
  ],
  skills: ["已安装技能", "只读核对已安装能力；新能力从准入流程接入。"],
  settings: ["防护设置", "查看实际覆盖，按需调整运行策略。"],
};
export function isTestTrace(trace) {
  return (
    trace.source === "synthetic-fixture" ||
    trace.source === "controlled-validation" ||
    trace.source === "integration-test" ||
    trace.purpose === "test" ||
    /^这是合成集成测试[。:：]/u.test(trace.title ?? "")
  );
}
export function friendlySessionTitle(key, traces = []) {
  const trace = traces.find((t) => t.session_key === key && !isTestTrace(t));
  if (trace?.title) return trace.title.slice(0, 42);
  if (key === "agent:main:main") return "主会话";
  return key.startsWith("agent:") ? "未命名会话" : key;
}
export function coverageRows(coverage) {
  const runtime = coverage.runtime ?? {};
  const describe = (stage) => {
    const labels = {
      enforce: ["已启用", ""],
      observe: ["复检 / 观察", "warn"],
      disabled: ["未启用", "warn"],
      unavailable: ["不可用", "bad"],
    };
    if(runtime.service === "offline" && stage?.mode === "enforce") return ["服务离线 · 默认拒绝", "bad"];
    return labels[stage?.mode] ?? ["待核验", "warn"];
  };
  const input = describe(runtime.input),
    output = describe(runtime.output),
    results = describe(runtime.tool_results);
  const identities = {
    oidc_token: ["OIDC 就绪状态待核验", "warn"],
    loopback_static_dev: ["演示身份（非生产）", "bad"],
    disabled: ["已禁用", "warn"],
    unknown: ["待核验", "warn"],
  };
  const identity =
    identities[coverage.agentguard_identity_mode] ?? identities.unknown;
  return [
    [
      "轨迹采集",
      "记录模型与工具事件",
      coverage.capture ? "已配置" : "未启用",
      coverage.capture ? "" : "warn",
    ],
    [
      "工具执行",
      coverage.agentguard_configured
        ? "AgentGuard 受管调用；执行状态以回执为准"
        : "AgentGuard 尚未配置",
      ...identity,
    ],
    ["输入检查", runtime.input?.reason ?? "等待后端报告检查能力", ...input],
    ["回复检查", runtime.output?.reason ?? "等待后端报告检查能力", ...output],
    [
      "工具返回",
      runtime.tool_results?.reason ?? "等待后端报告控制能力",
      ...results,
    ],
  ];
}
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
      main.setAttribute("aria-label", titles[this.current][0]);
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
      body.setAttribute("aria-live", "polite");
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
        if (['home', 'approvals', 'settings'].includes(this.current)) {
          const identity = data.coverage?.business_identity;
          const demo = identity?.state === 'demo' || data.coverage?.agentguard_identity_mode === 'loopback_static_dev';
          const banner = node('section', undefined, 'notice identity-banner');
          banner.setAttribute('aria-label', '业务身份状态');
          banner.append(chip(demo ? '演示身份（非生产）' : identity?.label ?? '未配置组织身份（OIDC）', demo ? 'bad' : identity?.state === 'oidc_ready' ? '' : 'warn'),
            node('p', identity?.reason ?? '执行与审批已禁用；管理页面登录不代替业务身份。'));
          if(demo)banner.append(node('strong', '仅本机验收', 'error'));
          const help = node('details');help.append(node('summary', '如何配置组织身份'),
            node('p', '请管理员参照 docs/DELIVERY_ACCEPTANCE.md「安全边界与身份接入」配置 issuer、audience、角色和用户令牌委托，再运行 python scripts/check_identity.py 核对。此页面不提供开发身份启用开关。'));
          banner.append(help);head.after(banner);
        }
        this[this.current](body, data);
        if(['home','settings'].includes(this.current))this.sessionSandbox(body);
        if(['home','approvals','settings'].includes(this.current)){
          const banner=main.querySelector('.identity-banner');
          const original=Array.from(banner?.childNodes??[],n=>n.cloneNode(true));
          const cleanup=mountDemoIdentity(body,this.gateway,state=>{
            if(!banner)return;
            if(state.enabled)banner.replaceChildren(chip('演示身份源（非生产）','bad'),
              node('p',state.execution_enabled?'已验证非生产演示身份；聊天工具须绑定会话并通过任务 ACL，组织身份尚未接入。':state.user?'当前演示身份仅可查看台账；执行与审批已禁用。':'请选择演示用户；执行与审批已禁用。'));
            else banner.replaceChildren(...original.map(n=>n.cloneNode(true)));
          });
          const previous=this.cleanup;this.cleanup=()=>{cleanup();previous?.();};
        }
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
            : trace.trace_status === "blocked" ? "安全检查已中止"
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
        button("进入审计中心", () => go("audit"), "quiet"),
      );
      this.taskList(
        recent,
        data.traces
          .filter((t) => t.source === "openclaw" && !isTestTrace(t))
          .slice(0, 5),
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
      for (const [label, desc, state, level] of coverageRows(data.coverage)) {
        const r = node("div", undefined, "coverage-row"),
          t = node("div");
        t.append(node("span", label), node("small", desc));
        r.append(t, chip(state, level));
        list.append(r);
      }
      c.append(list);
      const warning = node('p', '其他原生及未盘点工具：未受 AgentGuard 闸门。以下为配置与最近 100 条轨迹中可见的工具，非宿主完整清单。', 'notice');
      warning.style.color = '#b42318';
      c.append(warning);
      for (const tool of data.tool_coverage ?? []) {
        const item = node('p', `${tool.name} · ${tool.managed ? '已接入受管适配器' : '未受 AgentGuard 闸门'}`);
        if (!tool.managed) item.style.color = '#b42318';
        c.append(item);
      }
      if (this.current !== "settings")
        c.append(button("检查与配置", () => go("settings"), "quiet"));
      return c;
    }
    async frame(parent, url, title) {
      const waiting = node("p", "正在认证并打开" + title + "…", "empty");
      waiting.setAttribute("role", "status");
      parent.append(waiting);
      try {
        const access = await this.gateway.request("govagentsec.ui.open", {
          path: url,
        });
        if (!parent.isConnected || !waiting.isConnected) return;
        const f = node("iframe");
        f.className = "tool-frame";
        f.title = title;
        f.setAttribute("sandbox", this.sandbox ?? "allow-scripts");
        f.src = access.url;
        waiting.replaceWith(f);
        return f;
      } catch (e) {
        if (waiting.isConnected) {
          waiting.setAttribute("role", "alert");
          waiting.textContent = "无法打开" + title + "：" + e.message;
        }
      }
    }
    subpanel(body, url, title, back = "settings") {
      body.replaceChildren();
      const bar = node("nav", undefined, "subpanel-nav");
      bar.setAttribute("aria-label", "子面板导航");
      const backButton = button(
        back === "settings" ? "返回防护设置" : "返回审批队列",
        () => this.render(),
      );
      const content = node("div", undefined, "tool-pane");
      const reload = button("重新加载", async () => {
        reload.disabled = true;
        content.replaceChildren();
        // Request a fresh credential; reusing the iframe URL would replay a
        // consumed single-use ticket. Do not prefetch that URL before loading.
        try { await this.frame(content, url, title); }
        finally { reload.disabled = false; }
      });
      reload.title = "重新认证并打开当前面板";
      bar.append(backButton, node("span", title, "muted"), reload);
      body.append(bar, content);
      reload.click();
      backButton.focus();
    }
    admission(body, data) {
      const layout = node("div", undefined, "split"),
        inventory = node("aside", undefined, "section capabilities");
      inventory.append(node("h2", "已配置 MCP"));
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
        const g = p.governance;
        if (g) {
          item.append(node('p', `任务契约 v${g.revision}：${(g.allowed_tools ?? []).join('、')}；扩权：${(g.contract_diff ?? []).join('、') || '无'}；票据 TTL ${g.ticket_ttl_seconds} 秒`));
          for (const [field, v] of Object.entries(g.provenance ?? {})) {
            const source = node('p', `参数 ${field} · ${v.source} · ${String(v.value_hash).slice(0, 12)}`);
            if (['tool_untrusted', 'unknown'].includes(v.source)) source.style.color = '#b42318';
            item.append(source);
          }
        }
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
              this.subpanel(
                body,
                "/plugins/agentguard-runtime-security/panel?embed=1&workspace=1&section=approvals",
                "运行防护审批",
                "approvals",
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
        ["blocked", "安全检查已中止"],
        ["invalid", "校验异常"],
      ]) {
        const o = node("option", label);
        o.value = v;
        type.append(o);
      }
      const source = node("select");
      source.setAttribute("aria-label", "记录范围");
      for (const [value, label] of [
        ["business", "日常任务"],
        ["test", "测试记录"],
        ["all", "全部记录"],
      ]) {
        const o = node("option", label);
        o.value = value;
        source.append(o);
      }
      filters.append(
        search,
        source,
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
              (source.value === "all" ||
                (source.value === "test" ? isTestTrace(t) : !isTestTrace(t))) &&
              (type.value === "all" || t.trace_status === type.value) &&
              (t.title || "")
                .toLowerCase()
                .includes(search.value.toLowerCase()),
          ),
        );
      };
      search.oninput = draw;
      type.onchange = draw;
      source.onchange = draw;
      body.append(filters, list);
      draw();
      this.loadTraceAudit(body, new URLSearchParams(location.search).get('tab')==='candidates'?'candidates':'graph');
    }
    async loadTraceAudit(body, initialTab) {
      const section = this.current;
      try {
        const health = await this.gateway.request('govagentsec.trace.health', {});
        if (!health.available || this.current !== section) return;
        const { mountTraceAudit } = await import('/plugins/govagentsec/trace/view.mjs');
        if (this.current !== section) return;
        this.cleanup?.();
        const legacy = node('div');
        while (body.firstChild) legacy.append(body.firstChild);
        legacy.hidden = true;
        const container = node('div'), root = container.attachShadow({mode:'open'});
        const toggle = button('查看旧版历史记录', () => { legacy.hidden = !legacy.hidden; container.hidden = !legacy.hidden;
          toggle.textContent = legacy.hidden ? '查看旧版历史记录' : '返回轨迹审计'; }, 'quiet');
        body.append(toggle, container, legacy);
        this.cleanup = mountTraceAudit(root, (method, params = {}) => this.gateway.request('govagentsec.trace.' + method, params), {initialTab, traceId:new URLSearchParams(location.search).get('trace')||undefined, initialTask:new URLSearchParams(location.search).get('task_key')||'', initialSelected:new URLSearchParams(location.search).getAll('trace_id'), onTabChange:(tab,ids)=>{const u=new URL(location.href);u.searchParams.set('section',tab==='compare'?'compare':'audit');u.searchParams.set('tab',tab);u.searchParams.delete('trace_id');for(const id of ids)u.searchParams.append('trace_id',id);history.replaceState({},'',u);}});
      } catch { /* Older installations retain their existing audit view. */ }
    }
    compare(body) {
      const nav = node("div", undefined, "filter");
      nav.append(button("返回审计中心", () => go("audit")));
      const includeTest = node("input");
      includeTest.type = "checkbox";
      includeTest.id = "compare-tests";
      const label = node("label", "包含测试记录");
      label.prepend(includeTest);
      nav.append(label);
      body.append(nav);
      const container = node("div");
      container.className = "comparison-panel";
      body.append(container);
      const root = container.attachShadow({ mode: "open" });
      const draw = () => {
        this.cleanup?.();
        root.replaceChildren();
        const style = node(
          "style",
          traceStyles +
            ":host{background:transparent}.top,.workspace,.status{display:none}.lower{margin:0 0 16px;border-color:#e0e7e4}.lower>summary{font-weight:600}.toolbar{margin:12px 0}select{max-width:44%}.compare pre{font-size:12px}",
        );
        const template = node("template");
        template.innerHTML = traceMarkup;
        root.append(style, template.content.cloneNode(true));
        root.querySelector(".lower").open = true;
        this.cleanup = mountTraces(root, async (method, params) => {
          const value = await this.gateway.request(
            "govagentsec.trajectory." + method,
            params,
          );
          if (method === "list" && !includeTest.checked)
            value.traces = value.traces.filter((t) => !isTestTrace(t));
          return value;
        });
      };
      includeTest.onchange = draw;
      draw();
      this.loadTraceAudit(body, 'compare');
    }
    async skills(body) {
      const back = button("接入新的技能", () => go("admission"), "primary");
      body.append(back);
      const list = section("已安装能力");
      body.append(list);
      try {
        const data = await this.gateway.request("skills.status", {});
        if (!list.isConnected) return;
        const skills = data.skills ?? [];
        for (const skill of skills) {
          const item = node("div", undefined, "cap-row");
          item.append(
            node("h2", skill.name || skill.skillKey || "未命名技能"),
            node("p", skill.description || "", "muted"),
            chip(
              skill.disabled ? "已停用" : skill.eligible ? "可用" : "需配置",
              skill.disabled || !skill.eligible ? "warn" : "",
            ),
          );
          list.append(item);
        }
        if (!skills.length) list.append(node("p", "暂无已安装技能", "empty"));
      } catch (e) {
        list.append(node("p", "读取技能清单失败：" + e.message, "error"));
      }
    }
    sessionSandbox(body) {
      const card=section('会话沙箱引擎');card.setAttribute('aria-label','会话沙箱引擎');
      const content=node('div');content.style.cssText='padding:16px;line-height:1.7';card.append(content);body.prepend(card);
      const load=async()=>{
        try {
          const status=await this.gateway.request('govagentsec.sandbox.status',{});
          if(!card.isConnected)return;
          content.replaceChildren(chip(`当前：${status.current==='docker'?'Docker':status.current==='srt'?'sandbox-runtime (srt)':'未启用'}`,status.mode==='all'?'':'warn'));
          content.append(node('p',status.elevated_disabled?'宿主机提权旁路已关闭':'宿主机提权旁路未关闭','muted'));
          const field=node('fieldset');field.style.cssText='display:flex;gap:18px;border:0;padding:8px 0;flex-wrap:wrap';field.append(node('legend','选择下一次运行使用的引擎'));
          for(const engine of ['docker','srt']){
            const label=node('label'),input=document.createElement('input');input.type='radio';input.name='session-sandbox-engine';input.value=engine;input.checked=status.current===engine;
            input.disabled=!status.engines[engine].ready;
            input.addEventListener('change',async()=>{
              field.querySelectorAll('input').forEach(e=>e.disabled=true);result.textContent='正在保存…';
              try {const saved=await this.gateway.request('govagentsec.sandbox.select',{engine});result.textContent='已保存。'+saved.effective;await load();}
              catch(e){result.textContent='切换未完成：'+e.message;field.querySelectorAll('input').forEach(e=>{e.disabled=!status.engines[e.value].ready;e.checked=e.value===status.current;});}
            });
            label.append(input,document.createTextNode(' '+status.engines[engine].label+(status.engines[engine].ready?' · 可用':' · 未就绪')));field.append(label);
          }
          content.append(field,node('p',status.effective,'muted'),node('p',status.scope,'muted'));
          content.append(node('p',status.engines.srt.limitation,'notice'));
          for(const engine of ['docker','srt'])if(!status.engines[engine].ready)content.append(node('p',status.engines[engine].detail,'error'));
          const result=node('p','管理员可切换。srt 为 Windows Alpha；默认使用 Docker。','muted');result.setAttribute('role','status');content.append(result);
        }catch(e){content.replaceChildren(node('p','会话沙箱状态不可用：'+e.message,'error'));}
      };
      content.append(node('p','正在核验本机引擎…','muted'));void load();
    }
    settings(body, data) {
      const grid = node("div", undefined, "overview");
      grid.append(this.coverage(data));
      const models = section('模型分工');
      const modelDetails = node('div');
      modelDetails.style.cssText = 'padding:16px;line-height:1.7;overflow-wrap:anywhere';
      const routing = data.coverage?.model_routing;
      modelDetails.append(node('h3', '会话模型（可 API）'),
        node('p', routing ? `${routing.session.current} · ${routing.session.status}` : '等待后端读取实际会话配置'),
        node('h3', '安全评审（默认本地，轨迹不出域）'),
        node('p', routing ? `${routing.review.model} · ${routing.review.endpoint} · ${routing.review.status}` : '本地评审状态尚未核验'),
        node('p', '会话 API 会接收该会话上下文。含真实公文、敏感输入的任务请显式选择本地模型；历史轨迹不用于 API 冒烟。', 'muted'),
        node('p', '配置与验收：docs/MODEL_ROUTING.md；已有会话模型覆盖需单独检查。', 'muted'));
      models.append(modelDetails);
      grid.append(models);
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
            this.subpanel(body, url, label);
          }),
        );
      rows.append(button("OpenClaw 系统设置", () => go("config")));
      controls.append(rows);
      controls.append(node('p','定制适配基线：OpenClaw 2026.7.1-2。上游更新提示集中显示于本页；升级前需核验宿主适配与安全回归。','muted'));
      controls.append(node('p','正式身份接入尚待配置组织 issuer、audience、角色与用户令牌委托。完成验证前，AgentGuard 业务执行保持停用。','muted'));
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
