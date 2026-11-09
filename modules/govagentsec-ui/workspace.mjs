import { workspaceStyle, icon } from "/plugins/govagentsec/workspace-style.mjs";
import { mountDemoIdentity } from "/plugins/govagentsec/demo-identity.mjs";
import { librarySummary } from "/plugins/govagentsec/library-summary.mjs";
import { getIdentitySession } from "/plugins/govagentsec/identity-session.mjs";
import { mountSecurityOverview, overviewStyle } from "/plugins/govagentsec/security-overview.mjs";
import {
  styles as traceStyles,
  markup as traceMarkup,
  mount as mountTraces,
} from "/plugins/govagentsec/trajectory-ui.mjs";
export const titles = {
  permissions: ["动态权限", "查看当前身份权限，处理权限申请。"],
  login: ["政安纵深 / GovAgentSec", "让每次智能体行动有授权、有记录、可追溯。"],
  home: ["工作台", "确认本次材料与权限，继续处理任务。"],
  admission: ["能力准入", "检查 Skill 与 MCP，核对报告、复核申请和准入规则。"],
  approvals: ["待审批", "先核对具体动作，再决定是否执行。"],
  audit: ["审计演进", "查看任务过程，评估同类运行并整理候选技能。"],
  compare: [
    "运行对照与候选记录",
    "任务轨迹的高级视图，对照两次运行并查看候选证据。",
  ],
  skills: ["已安装技能", "只读核对已安装能力；新能力从准入流程接入。"],
  settings: ["防护设置", "查看实际覆盖，按需调整运行策略。"],
};
export const normalizeSection = value => ['home','login','approvals'].includes(value) ? 'permissions' : titles[value] ? value : 'permissions';
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
  if (trace?.task_key === 'typhoon-emergency-brief') return '台风应急简报';
  if (trace?.title && !['Agent 运行','未命名任务'].includes(trace.title)) return trace.title.slice(0, 42);
  if (trace?.started_at) return '任务 · '+time(trace.started_at);
  if (key === "agent:main:main") return "主会话";
  return key.startsWith("agent:") ? "未命名会话" : key;
}
export function coverageRows(coverage, {settings = false} = {}) {
  const runtime = coverage.runtime ?? {};
  const describe = (stage, kind) => {
    const labels = {
      enforce: ["已启用", ""],
      observe: ["复检 / 观察", "warn"],
      disabled: ["未启用", "warn"],
      unavailable: ["不可用", "bad"],
    };
    if(runtime.service === "offline" && ['enforce','observe'].includes(stage?.mode)) return [stage.mode==='enforce'?"服务离线 · 默认拒绝":"服务离线", "bad"];
    if(settings && kind === 'output' && stage?.mode === 'observe')return ['已启用',''];
    return labels[stage?.mode] ?? ["待核验", "warn"];
  };
  const input = describe(runtime.input),
    output = describe(runtime.output, 'output'),
    results = describe(runtime.tool_results);
  const identities = {
    oidc_token: ["OIDC 就绪状态待核验", "warn"],
    loopback_static_dev: settings ? ["演示身份", ""] : ["演示身份（非生产）", "bad"],
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
    ["回复检查", settings && ['enforce','observe'].includes(runtime.output?.mode) ? '检查回复内容并记录检测结果' : runtime.output?.reason ?? "等待后端报告检查能力", ...output],
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
      this.current = "permissions";
      this.generation = 0;
      this.onPopState = () => {
        const search = new URLSearchParams(location.search);
        this.onRouteChange({detail:{section:search.get('section') || 'home',requestId:search.get('request')}});
      };
      this.onApproval = () => {
        if (this.current === 'permissions') this.render();
      };
      this.onRouteChange = (event) => {
        const section = normalizeSection(event.detail.section);
        this.requestId = event.detail.requestId || null;
        if (section === this.current) this.render();
        else this.section = section;
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
      this.identityCleanup?.();
      this.gateway = value;
      if(value){
        this.identity=getIdentitySession(value);
        let previous=JSON.stringify([this.identity.snapshot().user,this.identity.snapshot().execution_enabled]);
        this.identityCleanup=this.identity.subscribe(state=>{const next=JSON.stringify([state.user,state.execution_enabled]);if(next!==previous){previous=next;this.render();}});
      }
      this.render();
    }
    set section(value) {
      value = normalizeSection(value);
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
      this.identityCleanup?.();
    }
    async render() {
      if (!this.isConnected) return;
      const version = ++this.generation;
      this.cleanup?.();
      this.cleanup = null;
      const style = node("style", workspaceStyle + overviewStyle),
        main = node("main", undefined, "workspace");
      main.setAttribute("aria-label", titles[this.current][0]);
      main.dataset.page=this.current;
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
        node("span", "政安纵深 · OpenClaw 工作区"),
        node("span", "原始证据按任务保留"),
      );
      main.append(head, body, footer);
      this.shadowRoot.replaceChildren(style, main);
      if (!this.gateway) {
        body.replaceChildren(node("p", "网关尚未连接，连接后刷新。", "empty"));
        return;
      }
      if (this.current === 'permissions') {
        body.replaceChildren();
        this.cleanup=mountDemoIdentity(body,this.gateway,()=>{},{mode:'permissions',requestId:this.requestId ?? new URLSearchParams(location.search).get('request')});
        return;
      }
      if(this.current!=='settings'&&!this.identity?.snapshot().user){
        body.replaceChildren(node('p','先到动态权限登录，再查看此页面。','empty'),button('前往动态权限',()=>go('permissions'),'primary'));return;
      }
      try {
        const data = this.identity?.snapshot().user
          ? await this.identity.requestGateway('govagentsec.trajectory.workspace',{})
          : await this.gateway.request('govagentsec.trajectory.workspace',{});
        if (version !== this.generation) return;
        body.replaceChildren();
        this.data = data;
        this[this.current](body, data);
        footer.lastChild.textContent =
          "更新于 " + new Date().toLocaleTimeString("zh-CN");
      } catch (e) {
        if (version === this.generation)
          body.replaceChildren(
            node("p", "页面暂不可用，请检查身份与服务状态后重试。", "error"),button('前往动态权限',()=>go('permissions')),
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
          node("span", trace.task_key==='typhoon-emergency-brief'?'台风应急简报':trace.title&&trace.title!=='Agent 运行'?trace.title:'任务 · '+time(trace.started_at), "title"),
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
        "其他受控动作",
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
      } else queue.append(node("p", "其他受控队列暂无待处理动作", "empty"));
      if(data.pending.length) left.append(queue);
      const recent = section(
        "最近任务",
        button("进入任务轨迹", () => go("audit"), "quiet"),
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
      const coverage = node('details', undefined, 'coverage-details');
      coverage.append(node('summary', '查看防护状态'),this.coverage(data));
      side.append(quick, coverage);
      grid.append(left, side);
      body.append(grid);
    }
    coverage(data) {
      const c = section("实际防护状态"),
        list = node("div", undefined, "coverage");
      for (const [label, desc, state, level] of coverageRows(data.coverage, {settings:this.current==='settings'})) {
        const r = node("div", undefined, "coverage-row"),
          t = node("div");
        t.append(node("span", label), node("small", desc));
        r.append(t, chip(state, level));
        list.append(r);
      }
      c.append(list);
      const warning = node('p', '受管适配器与任务权限分别检查。聊天自动应用当前业务身份，原生工具仍须通过任务权限检查；未识别工具默认拒绝。', 'notice');
      c.append(warning);
      const tools=data.tool_coverage ?? [];
      let toolList=c;
      if(this.current==='settings'&&tools.length){
        const details=node('details',undefined,'tool-coverage-details'),missing=tools.filter(tool=>!tool.managed).length;
        const summary=node('summary',`工具接入详情 · ${tools.length} 项${missing?' · '+missing+' 项未接入':''}`);
        if(missing)summary.style.color='#b42318';
        details.append(summary);c.append(details);toolList=details;
      }
      for (const tool of tools) {
        const item = node('p', `${tool.name} · ${tool.managed ? '已接入受管适配器' : '未接入受管适配器'}`);
        if (!tool.managed) item.style.color = '#b42318';
        toolList.append(item);
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
        const access = await this.identity.requestGateway("govagentsec.ui.open", {
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
      inventory.append(librarySummary(this.identity.snapshot().permission_summary,{toolsOnly:true}),node("h2", "已接入服务"));
      for (const server of data.servers) {
        const r = node("div", undefined, "cap-row"),
          line = node("div", undefined, "row");
        line.append(
          node("span", server.name, "truncate"),
          chip(server.enabled ? "配置启用" : "已停用", server.enabled ? "" : "warn"),
        );
        r.append(line);
        r.append(node('small','服务连接：尚未核验'),node('small','使用权限：按当前任务检查'));
        const receipt=server.admission;
        r.append(node('small',receipt?.status==='matching_record'
          ? `配置匹配检查记录 #${receipt.sequence} · ${String(receipt.decision).toUpperCase()}`
          : receipt?.status==='unavailable'?'检查记录暂不可读':'本配置尚无匹配检查记录'));
        if(receipt?.status==='matching_record')r.append(node('small','请在检查报告核对完整性与安装结果'));
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
        ["人工复核", "/plugins/aegis-admin/reviews?embed=1&workspace=1"],
        ["准入规则", "/plugins/aegis-admin/rules?embed=1&workspace=1"],
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
      pane.append(button('返回当前任务',()=>go('home'),'quiet'));
      layout.append(inventory, pane);
      body.append(layout);
      tabs.firstChild.click();
    }
    approvals(body, data) {
      if (data.approval_error)
        body.append(node("div", data.approval_error, "notice"));
      const legacy = node("details");legacy.append(node("summary", "其他受控动作"));
      const list = section("其他审批队列", chip(data.pending.length + " 项"));
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
          details.append(node('p', `任务契约 v${g.revision}：${(g.allowed_tools ?? []).join('、')}；扩权：${(g.contract_diff ?? []).join('、') || '无'}；票据 TTL ${g.ticket_ttl_seconds} 秒`));
          for (const [field, v] of Object.entries(g.provenance ?? {})) {
            const source = node('p', `参数 ${field} · ${v.source} · ${String(v.value_hash).slice(0, 12)}`);
            if (['tool_untrusted', 'unknown'].includes(v.source)) source.style.color = '#b42318';
            details.append(source);
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
      legacy.append(list);
      body.append(legacy);
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
        this.cleanup = mountTraceAudit(root, (method, params = {}) => this.identity.requestGateway('govagentsec.trace.' + method, params), {initialTab, traceId:new URLSearchParams(location.search).get('trace')||undefined, initialTask:new URLSearchParams(location.search).get('task_key')||'', initialSelected:new URLSearchParams(location.search).getAll('trace_id'), onTabChange:(tab,ids)=>{const u=new URL(location.href);u.searchParams.set('section',tab==='compare'?'compare':'audit');u.searchParams.set('tab',tab);u.searchParams.delete('trace_id');for(const id of ids)u.searchParams.append('trace_id',id);history.replaceState({},'',u);}});
      } catch { /* Older installations retain their existing audit view. */ }
    }
    compare(body) {
      const nav = node("div", undefined, "filter");
      nav.append(button("返回任务轨迹", () => go("audit")));
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
          const value = await this.identity.requestGateway(
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
              skill.disabled ? "已停用" : skill.eligible ? "运行依赖就绪" : "需配置",
              skill.disabled || !skill.eligible ? "warn" : "",
            ),
          );
          item.append(node('p','准入记录：尚未关联本版本回执；任务权限在使用时检查。','muted'));
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
          const summary=this.shadowRoot.querySelector('[data-runtime-summary]');
          if(summary)summary.textContent=`会话沙箱：${status.current==='docker'?'Docker':status.current==='srt'?'srt':'未启用'} · 演示身份源：${this.identity?.snapshot().enabled?'已启用':'未启用'}`;
          content.append(node('p',status.elevated_disabled?'宿主机提权旁路已关闭':'宿主机提权旁路未关闭','muted'));
          const field=node('fieldset');field.style.cssText='display:flex;gap:18px;border:0;padding:8px 0;flex-wrap:wrap';field.append(node('legend','选择下一次运行使用的引擎'));
          for(const engine of ['docker','srt']){
            const label=node('label'),input=document.createElement('input');input.type='radio';input.name='session-sandbox-engine';input.value=engine;input.checked=status.current===engine;
            input.disabled=!status.engines[engine].ready||!this.identity?.snapshot().permission_summary?.can_switch_sandbox;
            input.addEventListener('change',async()=>{
              if(engine==='srt'){
                field.querySelectorAll('input').forEach(e=>{e.disabled=true;e.checked=e.value===status.current;});
                const confirm=node('section');confirm.setAttribute('role','alertdialog');confirm.setAttribute('aria-label','确认切换 srt');
                confirm.className='notice';
                confirm.append(node('p','首次/冷启动可能数十秒至数分钟，可能超过业务委托期限。'),
                  node('p','等待来自执行环境准备，不代表模型一直在推理。切换仅用于新运行；不会自动重试或续期。'));
                const yes=node('button','确认切换 srt'),cancel=node('button','保留当前引擎');
                yes.type=cancel.type='button';confirm.append(yes,cancel);content.append(confirm);cancel.focus();
                const accepted=await new Promise(resolve=>{yes.onclick=()=>resolve(true);cancel.onclick=()=>resolve(false);confirm.onkeydown=e=>{if(e.key==='Escape')resolve(false);};});
                confirm.remove();if(!card.isConnected)return;
                if(!accepted){field.querySelectorAll('input').forEach(e=>{e.disabled=!status.engines[e.value].ready;});input.focus();return;}
              }
              field.querySelectorAll('input').forEach(e=>e.disabled=true);result.textContent='正在保存…';
              try {const saved=await this.identity.requestGateway('govagentsec.sandbox.select',{engine});result.textContent='已保存。'+saved.effective;await load();}
              catch(e){result.textContent='切换未完成：'+e.message;field.querySelectorAll('input').forEach(e=>{e.disabled=!status.engines[e.value].ready;e.checked=e.value===status.current;});}
            });
            label.append(input,document.createTextNode(' '+status.engines[engine].label+(status.engines[engine].ready?' · 可用':' · 未就绪')));field.append(label);
          }
          content.append(field,node('p',status.effective,'muted'));
          const technical=node('details');technical.append(node('summary','查看执行环境说明'),node('p',status.scope,'muted'),node('p',status.engines.srt.limitation,'muted'));content.append(technical);
          if(status.current==='srt')content.append(node('p','srt 首次/冷启动可能数十秒至数分钟，可能超过业务委托期限。请等待执行环境就绪；到期需重新申请。','notice'));
          for(const engine of ['docker','srt'])if(!status.engines[engine].ready)content.append(node('p','执行环境尚未就绪，请等待准备完成或联系管理员检查。'+status.engines[engine].detail,'error'));
          const result=node('p','切换仅影响新运行。','muted');result.setAttribute('role','status');content.append(result);
        }catch(e){content.replaceChildren(node('p','执行环境暂不可用，请联系管理员检查后重试。','error'));}
      };
      content.append(node('p','执行环境准备中，请稍候。','muted'));void load();
    }
    settings(body, data) {
      const grid = node("div", undefined, "settings-grid");
      const overview=section('安全总览');overview.dataset.settingsSection='overview';grid.append(overview);
      const disposeOverview=mountSecurityOverview(overview,this.identity,go);
      const actual=this.coverage(data),runtimeSummary=node('p','正在读取执行环境…','muted');
      actual.dataset.settingsSection='status';runtimeSummary.dataset.runtimeSummary='true';actual.append(runtimeSummary);grid.append(actual);
      const controls = section("配置与维护");controls.classList.add("settings-controls");
      controls.dataset.settingsSection='maintenance';
      const rows = node("div", undefined, "quick");
      const configButton=button("OpenClaw 系统设置", () => go("config"));
      configButton.disabled=!this.identity?.snapshot().permission_summary?.can_switch_sandbox;
      rows.append(configButton);
      controls.append(rows);
      if(!this.identity?.snapshot().user)controls.append(button('前往动态权限登录',()=>go('permissions')));
      const maintenance=node('div',undefined,'settings-maintenance-content');controls.append(maintenance);
      const sandboxHost=node('div');maintenance.append(sandboxHost);this.sessionSandbox(sandboxHost);
      const identityHost=node('div');maintenance.append(identityHost);
      const disposeIdentity=mountDemoIdentity(identityHost,this.gateway,()=>{},{mode:'settings',routing:data.coverage?.model_routing});
      this.cleanup=()=>{disposeOverview();disposeIdentity();};
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
        "permissions"}
      ></govagentsec-workspace>`,
  };
}
