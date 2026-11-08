import { tokens, icon } from "/plugins/govagentsec/workspace-style.mjs";
import { mountWorkbench } from "/plugins/govagentsec/workbench.mjs";
import {
  friendlySessionTitle,
  titles,
} from "/plugins/govagentsec/workspace.mjs";
const routes = [
  ["home", "工作台"],
  ["admission", "能力接入"],
  ["approvals", "待审批"],
  ["audit", "审计中心"],
  ["settings", "防护设置"],
];
const hostStyle = `
html.gov-workspace{--accent:#1e695b;--bg:#f5f7f7;--bg-elevated:#fff;--bg-content:#f5f7f7;--text:#233e3b;--muted:#70817e;--border:#e0e7e4}
html.gov-workspace:not([data-gov-section="settings"]) .update-banner{display:none}
html.gov-workspace .content{background:#f5f7f7}html.gov-workspace .update-banner.callout{padding:5px 12px;min-height:32px;background:#eef3f0;border:0;border-bottom:1px solid #e0e7e4;border-radius:0;color:#70817e;font-size:11px}html.gov-workspace .update-banner .btn{font-size:11px;padding:3px 8px}html.gov-workspace .sidebar{background:#f8faf9}html.gov-workspace .chat-thread{background:#f5f7f7}
.gov-nav{padding:8px 12px 12px;display:grid;gap:3px;border-bottom:1px solid #e0e7e4;margin-bottom:8px}.gov-nav button{display:flex;align-items:center;gap:11px;background:transparent;color:#62756d;border:0;border-radius:6px;padding:10px 12px;font:13px 'Segoe UI','Microsoft YaHei UI',sans-serif;cursor:pointer;text-align:left}.gov-nav button svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.gov-nav button[aria-current=page]{color:#1e695b;background:#e3eeea;font-weight:650}.gov-nav button:hover{background:#e9efec}.gov-nav button:focus-visible{outline:2px solid #1e695b}.gov-nav .nav-count{margin-left:auto;font:11px Consolas;color:#946224}.shell--nav-collapsed .gov-nav{padding:8px 4px}.shell--nav-collapsed .gov-nav button{padding:10px}.shell--nav-collapsed .gov-nav span{display:none}
html.gov-workspace .sidebar-nav>.nav-section__items{display:none}html.gov-workspace .sidebar-nav a[href*='plugin=protect-agent'],html.gov-workspace .sidebar-nav a[href*='plugin=govagentsec-trajectory']{display:none}html.gov-workspace .nav-section--more .nav-section__label-text{font-size:0}html.gov-workspace .nav-section--more .nav-section__label-text:after{content:'系统工具';font-size:11px}
html.gov-workspace govagentsec-chat-traces{display:none!important}html.gov-workspace .sidebar-brand__title{font-size:0!important;align-items:flex-start!important}html.gov-workspace .sidebar-brand__title>span{display:none}html.gov-workspace .sidebar-brand__title:before{content:'政安智枢';font-size:16px;font-weight:650;color:#233e3b;line-height:1.3}html.gov-workspace .sidebar-brand__title:after{content:'OpenClaw 工作区';font-size:10px;color:#70817e;line-height:1.4}
html.gov-workspace openclaw-app-topbar{padding-right:330px}html.gov-workspace openclaw-router-outlet:has(govagentsec-workspace){display:block;height:100%;min-height:0;overflow:hidden}html.gov-workspace .content:has(govagentsec-workspace){overflow:hidden;padding:0;display:flex;flex-direction:column}html.gov-workspace openclaw-plugin-page:has(govagentsec-workspace){display:contents}
@media(max-width:750px){html.gov-workspace .topbar-brand__title{display:none!important}html.gov-workspace .topbar-brand{margin-left:45px;margin-right:auto}html.gov-workspace openclaw-app-topbar{padding-right:260px}.gov-nav{grid-template-columns:1fr 1fr}}`;
export function defineShell() {
  if (customElements.get("govagentsec-shell")) return;
  class Shell extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.opened = false;
      this.sessionLabels = new WeakMap();
      this.onNavigate = (e) => this.navigate(e.detail.section);
      this.onInspect = (e) => this.open(e.detail.trace, e.detail.tab);
      this.onKey = (e) => {
        if (e.key === "Escape" && this.opened) this.close();
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "g") {
          e.preventDefault();
          this.opened ? this.close() : this.open();
        }
      };
      this.onApproval = () => this.updateBadge();
      this.onPopState = () => this.markNavigation();
      this.onResize = () => this.layout();
    }
    connectedCallback() {
      for (const key of [
        "host",
        "client",
        "sessionKey",
        "location",
        "connected",
      ])
        if (Object.hasOwn(this, key)) {
          const v = this[key];
          delete this[key];
          this[key] = v;
        }
      document.documentElement.classList.add("gov-workspace");
      if (!document.getElementById("gov-host-style")) {
        const s = document.createElement("style");
        s.id = "gov-host-style";
        s.textContent = hostStyle;
        document.head.append(s);
      }
      this.render();
      window.addEventListener("gov-navigate", this.onNavigate);
      window.addEventListener("gov-inspect", this.onInspect);
      window.addEventListener("popstate", this.onPopState);
      window.addEventListener("gov-approval-updated", this.onApproval);
      window.addEventListener("keydown", this.onKey);
      window.addEventListener("resize", this.onResize);
      this.attachNavigation();
      requestAnimationFrame(() => this.attachNavigation());
      this.timer = setInterval(() => {
        this.attachNavigation();
        if (!document.hidden) this.updateBadge();
      }, 15000);
      this.updateBadge();
    }
    set host(value) {
      this.app = value;
      if (this.isConnected) this.attachNavigation();
    }
    set client(value) {
      if (value === this.gateway) return;
      this.gateway = value;
      if (this.isConnected) {
        this.updateConnection();
        this.updateBadge();
        if (this.opened) this.open();
      }
    }
    set connected(value) {
      this.online = value;
      if (this.isConnected) this.updateConnection();
    }
    set sessionKey(value) {
      if (value === this.session) return;
      this.session = value;
      if (this.opened) this.open();
    }
    set location(value) {
      this.routeLocation = value;
      if (this.isConnected) {
        this.attachNavigation();
        this.markNavigation();
      }
    }
    render() {
      this.shadowRoot.innerHTML = `<style>${tokens}:host{display:contents}.dock{position:fixed;top:9px;right:18px;z-index:115;display:flex;gap:6px;align-items:center}.dock button{display:flex;align-items:center;gap:7px;height:34px;font-size:12px}.connection{width:6px;height:6px;border-radius:50%;background:#7a8c82}.connection.online{background:#3a8c68}.drawer{position:fixed;top:54px;right:0;bottom:0;width:min(660px,46vw);z-index:112;background:var(--surface);border-left:1px solid var(--line);box-shadow:-8px 0 30px #233e3b0b;display:flex;flex-direction:column}.drawer-head{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}.drawer-head small{display:block;color:var(--muted);font-size:11px;margin-top:2px}.drawer-body{flex:1;overflow:auto;min-height:0}@media(max-width:1100px){.drawer{width:min(660px,90vw)}}@media(max-width:750px){.dock{right:8px;top:8px}.dock button{padding:6px 8px}.dock .settings span{display:none}.drawer{width:100vw;top:52px}.dock .connection{display:none}}</style><div class="dock"><button class="audit" title="历史轨迹、同任务对比与候选记录">审计中心</button><button class="settings" title="防护设置">${icon("settings")}<span>防护设置</span></button><button class="inspect primary" aria-expanded="false" aria-controls="gov-task-inspector" title="查看当前任务 · Ctrl+Shift+G">${icon("audit")}<span>任务与轨迹</span><i class="connection"></i></button></div><section class="drawer" id="gov-task-inspector" role="region" aria-label="任务详情" hidden><header class="drawer-head"><div><h2>任务详情</h2><small>所选任务的详情 · 历史记录统一在审计中心</small></div><button class="close" aria-label="关闭面板">关闭</button></header><div class="drawer-body"></div></section>`;
      this.shadowRoot.querySelector(".audit").onclick=()=>this.navigate("audit");
      this.body = this.shadowRoot.querySelector(".drawer-body");
      this.body.attachShadow({ mode: "open" });
      this.shadowRoot.querySelector(".inspect").onclick = () =>
        this.opened ? this.close() : this.open();
      this.shadowRoot.querySelector(".settings").onclick = () =>
        this.navigate("settings");
      this.shadowRoot.querySelector(".close").onclick = () => this.close();
      this.updateConnection();
    }
    updateConnection() {
      const b = this.shadowRoot.querySelector(".inspect");
      if (!b) return;
      b.disabled = !this.gateway || !this.online;
      this.shadowRoot
        .querySelector(".connection")
        .classList.toggle("online", !!this.online);
      b.title = this.online ? "查看当前任务 · Ctrl+Shift+G" : "等待网关连接";
    }
    navigate(section) {
      this.close(false);
      if (["chat", "config"].includes(section)) {
        this.app?.navigate(section);
        return;
      }
      this.app?.navigate("plugin", {
        search: "?plugin=protect-agent&id=govagentsec&section=" + section,
      });
      window.dispatchEvent(
        new CustomEvent("gov-route-change", { detail: { section } }),
      );
    }
    attachNavigation() {
      const sidebar = this.app?.querySelector(
        "openclaw-app-sidebar .sidebar-shell__body",
      );
      if (!sidebar) return;
      if (!this.nav?.isConnected) {
        this.nav = document.createElement("nav");
        this.nav.className = "gov-nav";
        this.nav.setAttribute("aria-label", "政安智枢主导航");
        for (const [key, label] of routes) {
          const b = document.createElement("button");
          b.dataset.route = key;
          b.title = label;
          b.innerHTML = icon(key) + `<span>${label}</span>`;
          b.onclick = () => this.navigate(key);
          this.nav.append(b);
        }
        sidebar.prepend(this.nav);
      }
      this.markNavigation();
      const sessions=sidebar.querySelector('.sidebar-sessions');
      if(sessions && sessions!==this.sessionList){
        this.sessionObserver?.disconnect();this.sessionList=sessions;
        this.sessionObserver=new MutationObserver(()=>this.labelSessions());
        this.sessionObserver.observe(sessions,{subtree:true,childList:true,characterData:true});
      }
      this.labelSessions();
    }
    markNavigation() {
      const q = new URLSearchParams(location.search);
      if(q.get('plugin')==='govagentsec-trajectory' && q.get('id')==='history') {
        if(!this.legacyRedirectPending){
          this.legacyRedirectPending=true;
          queueMicrotask(()=>{this.legacyRedirectPending=false;if(this.isConnected)this.navigate('audit');});
        }
        return;
      }
      const current =
        q.get("plugin") === "protect-agent" ? q.get("section") || "home" : "";
      document.documentElement.dataset.govSection=current;
      const active =
        current === "compare"
          ? "audit"
          : current === "skills"
            ? "admission"
            : current;
      const breadcrumb = this.app?.querySelector(
        ".dashboard-header__breadcrumb-current",
      );
      if (breadcrumb && titles[current]) {
        // Preserve Lit comment boundaries; replacing textContent breaks later renders.
        const walker=document.createTreeWalker(breadcrumb,NodeFilter.SHOW_TEXT);
        let text;while((text=walker.nextNode()))if(text.data.trim()){text.data=titles[current][0];break;}
      }
      for (const b of this.nav?.children ?? [])
        b.setAttribute(
          "aria-current",
          b.dataset.route === active ? "page" : "false",
        );
    }
    labelSessions() {
      // Replace raw fallback labels only. User-renamed sessions remain untouched.
      for (const link of this.app?.querySelectorAll(
        ".sidebar-sessions a[href]",
      ) ?? []) {
        const key = new URL(link.href, location.origin).searchParams.get(
          "session",
        );
        if (!key) continue;
        const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
        let text;
        while ((text = walker.nextNode()))
          if (text.data.trim() === key || text.data.trim().startsWith('agent:') || this.sessionLabels.get(text) === text.data) {
            const label=friendlySessionTitle(key,this.workspaceData?.traces);
            this.sessionLabels.set(text,label);
            if(text.data!==label)text.data=label;
            break;
          }
      }
    }
    async updateBadge() {
      if (!this.gateway || !this.online) return;
      try {
        const data = await this.gateway.request(
          "govagentsec.trajectory.workspace",
          {},
        );
        if (!this.isConnected) return;
        this.workspaceData = data;
        this.labelSessions();
        const b = this.nav?.querySelector("[data-route=approvals]");
        if (!b) return;
        b.querySelector(".nav-count")?.remove();
        if (data.pending.length) {
          const count = document.createElement("span");
          count.className = "nav-count";
          count.textContent = String(data.pending.length);
          b.append(count);
        }
      } catch {
        /* The workspace shows the full error when opened. */
      }
    }
    async open(trace, tab = "process") {
      if (!this.gateway || !this.body) return;
      this.cleanup?.();
      if (!this.opened) this.previousFocus = document.activeElement;
      this.opened = true;
      this.shadowRoot.querySelector(".drawer").hidden = false;
      this.shadowRoot
        .querySelector(".inspect")
        .setAttribute("aria-expanded", "true");
      const generation=this.openGeneration=(this.openGeneration??0)+1;
      this.body.shadowRoot.replaceChildren(document.createTextNode('正在读取当前任务轨迹…'));
      try {
        const health=await this.gateway.request('govagentsec.trace.health',{});
        if(!health.available)throw Error('trace unavailable');
        const {mountTraceAudit}=await import('/plugins/govagentsec/trace/view.mjs');
        if(!this.opened||generation!==this.openGeneration)return;
        this.cleanup=mountTraceAudit(this.body.shadowRoot,(method,params={})=>this.gateway.request('govagentsec.trace.'+method,params),{
          sessionKey:trace?.session_key??(trace?undefined:this.session??''),traceId:trace?.trace_id,compact:true});
      }catch {
        if(!this.opened||generation!==this.openGeneration)return;
        this.cleanup = mountWorkbench(
        this.body.shadowRoot,
        this.gateway,
        trace?.session_key ?? this.session,
        {
          traceId: trace?.trace_id,
          scope: trace ? "all" : this.session ? "session" : "all",
          tab,
        },
      );
      const degraded=document.createElement('p');degraded.setAttribute('role','status');
      degraded.textContent='新轨迹插件暂不可用，当前显示旧版任务记录。请启用 govagentsec-trace 后刷新；旧记录不代表新 JSONL 采集已成功。';
      this.body.shadowRoot.prepend(degraded);
      }
      this.layout();
      this.shadowRoot.querySelector(".close").focus();
    }
    layout() {
      const main = this.app?.querySelector("main.content");
      if (!main) return;
      if (this.opened) {
        if (!this.layoutMain) {
          this.layoutMain = main;
          this.previousPadding = main.style.paddingRight;
        }
        main.style.paddingRight =
          innerWidth > 1100 && main.querySelector("openclaw-chat-pane")
            ? "min(660px,46vw)"
            : this.previousPadding;
      } else if (this.layoutMain) {
        this.layoutMain.style.paddingRight = this.previousPadding;
        this.layoutMain = null;
      }
    }
    close(focus = true) {
      if (!this.opened) return;
      this.opened = false;
      this.openGeneration=(this.openGeneration??0)+1;
      this.cleanup?.();
      this.cleanup = null;
      this.body.shadowRoot.replaceChildren();
      this.shadowRoot.querySelector(".drawer").hidden = true;
      this.shadowRoot
        .querySelector(".inspect")
        .setAttribute("aria-expanded", "false");
      this.layout();
      if (focus) {
        if (
          this.previousFocus?.isConnected &&
          this.previousFocus !== document.body
        )
          this.previousFocus.focus();
        else this.shadowRoot.querySelector(".inspect").focus();
      }
    }
    disconnectedCallback() {
      this.close(false);
      clearInterval(this.timer);
      this.sessionObserver?.disconnect();
      this.nav?.remove();
      window.removeEventListener("gov-navigate", this.onNavigate);
      window.removeEventListener("gov-inspect", this.onInspect);
      window.removeEventListener("popstate", this.onPopState);
      window.removeEventListener("gov-approval-updated", this.onApproval);
      window.removeEventListener("keydown", this.onKey);
      window.removeEventListener("resize", this.onResize);
      document.documentElement.classList.remove("gov-workspace");
      delete document.documentElement.dataset.govSection;
    }
  }
  customElements.define("govagentsec-shell", Shell);
}
