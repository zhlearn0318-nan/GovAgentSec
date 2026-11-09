import { tokens, icon } from "/plugins/govagentsec/workspace-style.mjs";
import { mountWorkbench } from "/plugins/govagentsec/workbench.mjs";
import { getIdentitySession } from "/plugins/govagentsec/identity-session.mjs";
import { setTaskContext } from "/plugins/govagentsec/task-context.mjs";
import { mountDemoIdentity } from "/plugins/govagentsec/demo-identity.mjs";
import {
  friendlySessionTitle,
  titles,
  normalizeSection,
} from "/plugins/govagentsec/workspace.mjs";
const routes = [
  ["permissions", "动态权限"],
  ["admission", "能力准入"],
  ["audit", "审计演进"],
  ["settings", "防护设置"],
];
const hostStyle = `
html.gov-workspace{--accent:#1e695b;--bg:#f5f7f7;--bg-elevated:#fff;--bg-content:#f5f7f7;--text:#233e3b;--muted:#70817e;--border:#e0e7e4}
html.gov-workspace:not([data-gov-section="settings"]) .update-banner{display:none}
html.gov-workspace .content{background:#f5f7f7;margin-top:48px}html.gov-workspace .update-banner.callout{padding:5px 12px;min-height:32px;background:#eef3f0;border:0;border-bottom:1px solid #e0e7e4;border-radius:0;color:#70817e;font-size:11px}html.gov-workspace .update-banner .btn{font-size:11px;padding:3px 8px}html.gov-workspace .sidebar{background:#f8faf9}html.gov-workspace .chat-thread{background:#f5f7f7}
.gov-nav{padding:8px 12px 12px;display:grid;gap:3px;border-bottom:1px solid #e0e7e4;margin-bottom:8px}.gov-nav button{display:flex;align-items:center;gap:11px;background:transparent;color:#62756d;border:0;border-radius:6px;padding:10px 12px;font:13px/1.55 'Segoe UI Variable','Microsoft YaHei UI','Microsoft YaHei',sans-serif;transition:background-color 160ms ease-out,color 160ms ease-out;cursor:pointer;text-align:left}.gov-nav button svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.gov-nav button[aria-current=page]{color:#1e695b;background:#e3eeea;font-weight:650}.gov-nav .management-link{margin-top:14px;border-top:1px solid #e0e7e4;border-radius:0;padding-top:16px}.gov-nav button:hover{background:#e9efec}.gov-nav button:focus-visible{outline:2px solid #1e695b}.gov-nav .nav-count{margin-left:auto;font:11px Consolas;color:#946224}.shell--nav-collapsed .gov-nav{padding:8px 4px}.shell--nav-collapsed .gov-nav button{padding:10px}.shell--nav-collapsed .gov-nav span{display:none}
html.gov-workspace .sidebar-nav>.nav-section__items{display:none}html.gov-workspace .sidebar-nav a[href*='plugin=protect-agent'],html.gov-workspace .sidebar-nav a[href*='plugin=govagentsec-trajectory']{display:none}html.gov-workspace .nav-section--more .nav-section__label-text{font-size:0}html.gov-workspace .nav-section--more .nav-section__label-text:after{content:'系统工具';font-size:11px}
html.gov-workspace govagentsec-chat-traces{display:none!important}html.gov-workspace .sidebar-brand__title{font-size:0!important;align-items:flex-start!important}html.gov-workspace .sidebar-brand__title>span{display:none}html.gov-workspace .sidebar-brand__title:before{content:'政安智枢';font-size:16px;font-weight:650;color:#233e3b;line-height:1.3}html.gov-workspace .sidebar-brand__title:after{content:'OpenClaw 工作区';font-size:10px;color:#70817e;line-height:1.4}
html.gov-workspace openclaw-app-topbar{padding-right:150px}html.gov-workspace openclaw-router-outlet:has(govagentsec-workspace){display:block;height:100%;min-height:0;overflow:hidden}html.gov-workspace .content:has(govagentsec-workspace){overflow:hidden;padding:0;display:flex;flex-direction:column}html.gov-workspace openclaw-plugin-page:has(govagentsec-workspace){display:contents}
@media(prefers-reduced-motion:reduce){.gov-nav button{transition:none}}@media(max-width:750px){html.gov-workspace .topbar-brand__title{display:none!important}html.gov-workspace .topbar-brand{margin-left:45px;margin-right:auto}html.gov-workspace openclaw-app-topbar{padding-right:130px}.gov-nav{grid-template-columns:1fr 1fr}}`;
export function defineShell() {
  if (customElements.get("govagentsec-shell")) return;
  class Shell extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.opened = false;
      this.sessionLabels = new WeakMap();
      this.onNavigate = (e) => this.navigate(e.detail.section, e.detail.requestId);
      this.onReturnTask = (e) => this.returnTask(e.detail.requestId);
      this.onInspect = (e) => this.open(e.detail.trace, e.detail.tab);
      this.onKey = (e) => {
        if (e.key === "Escape") { if(this.identityPanelOpen)this.closeIdentity(); else if(this.opened)this.close(); }
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
      window.addEventListener("gov-return-task", this.onReturnTask);
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
      this.bindIdentity();
      this.publishTask();
    }
    set host(value) {
      this.app = value;
      if (this.isConnected) this.attachNavigation();
    }
    set client(value) {
      if (value === this.gateway) return;
      this.gateway = value;
      if (this.isConnected) {
        this.bindIdentity();
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
      this.publishTask();
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
      this.shadowRoot.innerHTML = `<style>${tokens}:host{display:contents}.dock{position:fixed;top:9px;right:18px;z-index:115;display:flex;gap:6px;align-items:center}.dock button{display:flex;align-items:center;gap:7px;height:34px;font-size:12px}.connection{width:6px;height:6px;border-radius:50%;background:#7a8c82}.connection.online{background:#3a8c68}.identity-strip{position:fixed;top:54px;left:270px;right:18px;min-height:42px;z-index:111;background:var(--surface);border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:center;padding:5px 12px;font-size:12px}.current-task{margin-right:auto;max-width:35%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.identity-bar{display:flex;gap:8px}.identity-message{color:#b42318}.identity-panel{position:fixed;top:104px;right:18px;width:min(680px,calc(100vw - 36px));max-height:calc(100vh - 120px);overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 32px #233e3b20;z-index:114}.identity-panel[hidden]{display:none}.identity-panel header{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;border-bottom:1px solid var(--line)}.drawer-receipts{max-height:220px;overflow:auto;border-bottom:1px solid var(--line)}.drawer{position:fixed;top:104px;right:0;bottom:0;width:min(660px,46vw);z-index:112;background:var(--surface);border-left:1px solid var(--line);box-shadow:-8px 0 30px #233e3b0b;display:flex;flex-direction:column}.drawer:not([hidden]){animation:gov-drawer-in 200ms ease-out}@keyframes gov-drawer-in{from{opacity:0;transform:translateX(8px)}to{opacity:1;transform:translateX(0)}}.drawer.wide{width:min(1320px,calc(100vw - 24px))}.drawer-actions{display:flex;gap:8px}.drawer-head{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}.drawer-head small{display:block;color:var(--muted);font-size:11px;margin-top:2px}.drawer-body{flex:1;overflow:auto;min-height:0}@media(max-width:1100px){.drawer{width:min(660px,90vw)}}@media(max-width:750px){.dock{right:8px;top:8px}.dock button{padding:6px 8px}.dock .settings span{display:none}.identity-strip{left:8px;right:8px;top:52px}.current-task{display:none}.drawer{width:100vw;top:104px}.dock .connection{display:none}}</style><div class="dock"><button class="inspect primary" aria-expanded="false" aria-controls="gov-task-inspector" title="查看当前任务 · Ctrl+Shift+G">${icon("audit")}<span>查看过程</span><i class="connection"></i></button></div><div class="identity-strip"><span class="current-task"></span><div class="identity-bar" aria-label="业务身份"></div><span class="identity-message" role="status"></span></div><section class="identity-panel" role="region" aria-label="会话身份与资料权限" hidden><header><h2>身份与资料权限</h2><button class="identity-close" aria-label="关闭身份权限">关闭</button></header><div class="identity-content"></div></section><section class="drawer wide" id="gov-task-inspector" role="region" aria-label="任务详情" hidden><header class="drawer-head"><div><h2>任务详情</h2><small>本任务的执行与审批过程</small></div><div class="drawer-actions"><button class="resize-drawer" aria-pressed="true">收窄面板</button><button class="close" aria-label="关闭面板">关闭</button></div></header><div class="drawer-receipts"></div><div class="drawer-body"></div></section>`;
      this.body = this.shadowRoot.querySelector(".drawer-body");
      this.body.attachShadow({ mode: "open" });
      this.shadowRoot.querySelector(".inspect").onclick = () =>
        this.opened ? this.close() : this.open();
      this.shadowRoot.querySelector(".close").onclick = () => this.close();
      this.shadowRoot.querySelector(".resize-drawer").onclick = (event) => {
        const wide = this.shadowRoot.querySelector(".drawer").classList.toggle("wide");
        event.currentTarget.textContent = wide ? "收窄面板" : "展开查看";
        event.currentTarget.setAttribute("aria-pressed", String(wide));
        this.layout();
      };
      this.shadowRoot.querySelector(".identity-close").onclick=()=>this.closeIdentity();
      this.updateConnection();
    }
    openIdentity(){
      if(!this.gateway)return;
      this.close(false);this.identityPanelCleanup?.();
      this.identityPanelOpen=true;
      this.shadowRoot.querySelector(".identity-panel").hidden=false;
      const content=this.shadowRoot.querySelector(".identity-content");content.replaceChildren();
      this.identityPanelCleanup=mountDemoIdentity(content,this.gateway,()=>{},{mode:"chat"});
      this.shadowRoot.querySelector(".identity-close").focus();
    }
    closeIdentity(){
      this.identityPanelCleanup?.();this.identityPanelCleanup=null;this.identityPanelOpen=false;
      const panel=this.shadowRoot.querySelector(".identity-panel");if(panel)panel.hidden=true;
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
    navigate(section, requestId) {
      this.closeIdentity();
      this.close(false);
      if (["chat", "config"].includes(section)) {
        this.app?.navigate(section);
        return;
      }
      section=normalizeSection(section);
      this.app?.navigate("plugin", {
        search: "?plugin=protect-agent&id=govagentsec&section=" + encodeURIComponent(section) +
          (requestId ? '&request=' + encodeURIComponent(requestId) : ''),
      });
      window.dispatchEvent(
        new CustomEvent("gov-route-change", { detail: { section, requestId } }),
      );
    }
    publishTask() {
      setTaskContext({sessionKey: this.session || null,
        title: this.session ? friendlySessionTitle(this.session, this.workspaceData?.traces) : '尚未选择对话'});
      const label = this.shadowRoot.querySelector('.current-task');
      if(label) label.textContent = this.session ? '当前任务：'+friendlySessionTitle(this.session,this.workspaceData?.traces) : '请先选择对话';
    }
    bindIdentity() {
      this.identityCleanup?.();clearInterval(this.identityTimer);
      const bar=this.shadowRoot.querySelector('.identity-bar');
      if(!bar)return;
      bar.replaceChildren();
      const login=document.createElement('button'),logout=document.createElement('button');
      login.textContent='登录业务身份';logout.textContent='退出';logout.hidden=true;
      login.onclick=()=>this.identityPanelOpen?this.closeIdentity():this.openIdentity();
      const materials=document.createElement('button');materials.textContent='资料权限';materials.onclick=()=>this.openIdentity();
      bar.append(login,materials,logout);
      if(!this.gateway){login.disabled=true;return;}
      const identity=getIdentitySession(this.gateway);this.identity=identity;
      const draw=state=>{
        if(!state.user){if(this.opened)this.close(false);this.workspaceData=null;}
        const role=state.user?.label ?? (state.user?.roles?.includes('business_approver')?'审批':state.user?.roles?.includes('audit_reader')?'审计':'经办');
        const left=Math.max(0,Math.ceil((state.expires_at??0)-Date.now()/1000));
        login.textContent=state.user?`${role} · 演示（非生产） · ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`:'登录业务身份';
        login.setAttribute('aria-label',state.user?'当前业务身份：'+role+'，演示（非生产）':'登录业务身份');
        logout.hidden=!state.user;
        this.identityState=state;
        this.renderApprovalBadge();
        this.renderConfirmations();
      };
      this.identityCleanup=identity.subscribe(draw);
      logout.onclick=async()=>{logout.disabled=true;try{await identity.logout();this.openIdentity();}catch{login.textContent='退出未确认，请重新检查';}finally{logout.disabled=false;}};
      this.identityTimer=setInterval(()=>{draw(identity.snapshot());if(!document.hidden)void identity.refresh().catch(()=>{});},5000);
      void identity.refresh().catch(()=>{});
    }
    async returnTask(requestId) {
      if(!this.identity)return;
      try {
        await this.identity.refresh();
        const request=this.identity.snapshot().requests?.find(r=>r.request_id===requestId);
        if(!request?.session_key)throw Error('当前身份无法定位原任务');
        this.close(false);
        this.app?.navigate('chat',{search:'?session='+encodeURIComponent(request.session_key)});
      }catch {
        const status=this.shadowRoot.querySelector('.identity-message');
        if(status)status.textContent='无法返回原任务，请确认身份有效并从待审批重新打开。';
      }
    }
    renderConfirmations(){
      const pending=this.app?.querySelector('openclaw-chat-pane') && this.identityState?.requests?.some(r=>r.session_key===this.session&&r.status==='pending_approval'&&r.can_confirm_self);
      if(!pending){this.confirmCleanup?.();this.confirmCleanup=null;this.confirmHost?.remove();this.confirmHost=null;return;}
      if(this.confirmSession!==this.session){this.confirmCleanup?.();this.confirmHost?.remove();this.confirmHost=null;}
      if(this.confirmHost)return;
      this.confirmSession=this.session;
      const host=document.createElement('aside');host.setAttribute('aria-label','当前操作需要确认');host.setAttribute('aria-live','polite');
      host.style.cssText='position:fixed;right:20px;bottom:165px;z-index:113;width:min(520px,calc(100vw - 40px));max-height:55vh;overflow:auto;background:white;border:1px solid #d9b874;border-radius:12px;box-shadow:0 12px 36px #233e3b20';
      this.confirmHost=host;this.shadowRoot.append(host);
      this.confirmCleanup=mountDemoIdentity(host,this.gateway,()=>{},{mode:'confirmations',sessionKey:this.session});
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
          if(key === "settings") b.classList.add("management-link");
          b.title = label;
          b.innerHTML = icon(key==='permissions'?'approvals':key) + `<span>${label}</span>`;
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
        q.get("plugin") === "protect-agent" ? normalizeSection(q.get("section")) : "";
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
      if (breadcrumb && breadcrumb !== this.breadcrumb) {
        this.breadcrumbObserver?.disconnect();this.breadcrumb=breadcrumb;
        this.breadcrumbObserver=new MutationObserver(()=>this.markNavigation());
        this.breadcrumbObserver.observe(breadcrumb,{subtree:true,childList:true,characterData:true});
      }
      if (breadcrumb && titles[current]) {
        // Preserve Lit comment boundaries; replacing textContent breaks later renders.
        const walker=document.createTreeWalker(breadcrumb,NodeFilter.SHOW_TEXT);
        let text;while((text=walker.nextNode()))if(text.data.trim()){if(text.data!==titles[current][0])text.data=titles[current][0];break;}
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
      if(!this.identity?.snapshot().user){this.workspaceData=null;this.publishTask();this.renderApprovalBadge();return;}
      try {
        const data = await this.identity.requestGateway(
          "govagentsec.trajectory.workspace",
          {},
        );
        if (!this.isConnected) return;
        this.workspaceData = data;
        this.publishTask();
        this.labelSessions();
        this.renderApprovalBadge();
      } catch {
        /* The workspace shows the full error when opened. */
      }
    }
    renderApprovalBadge() {
      const b=this.nav?.querySelector('[data-route=permissions]');if(!b)return;
      b.querySelector('.nav-count')?.remove();
      const state=this.identityState,user=state?.execution_enabled?state.user:null;
      const mine=user?(state.requests??[]).filter(r=>r.status==='pending_approval' &&
        (user.roles?.includes('audit_reader')|| (user.roles?.includes('business_approver')?r.requester!==user.id:r.requester===user.id))):[];
      const total=mine.length+(this.workspaceData?.pending?.length??0);
      if(total){const count=document.createElement('span');count.className='nav-count';count.textContent=String(total);b.append(count);}
    }
    async open(trace, tab = "process") {
      if (!this.gateway || !this.body) return;
      if(!this.identity?.snapshot().user){this.navigate('permissions');return;}
      this.cleanup?.();
      if (!this.opened) this.previousFocus = document.activeElement;
      this.opened = true;
      this.receiptCleanup?.();
      const receipts=this.shadowRoot.querySelector('.drawer-receipts');
      const receiptSession=trace?trace.session_key:this.session;
      if(receipts){
        receipts.replaceChildren();this.receiptCleanup=null;
        if(receiptSession)this.receiptCleanup=mountDemoIdentity(receipts,this.gateway,()=>{},
          {mode:'receipts',sessionKey:receiptSession});
        else receipts.textContent='该轨迹尚未关联任务，无法定位审批回执。';
      }
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
        this.cleanup=mountTraceAudit(this.body.shadowRoot,(method,params={})=>this.identity.requestGateway('govagentsec.trace.'+method,params),{
          sessionKey:trace?.session_key??(trace?undefined:this.session??''),traceId:trace?.trace_id,compact:true,followLatest:!trace&&!!this.session});
      }catch {
        if(!this.opened||generation!==this.openGeneration)return;
        this.cleanup = mountWorkbench(
        this.body.shadowRoot,
        {request:(method,params)=>this.identity.requestGateway(method,params)},
        trace?.session_key ?? this.session,
        {
          traceId: trace?.trace_id,
          scope: trace ? "all" : this.session ? "session" : "all",
          tab,
        },
      );
      const degraded=document.createElement('p');degraded.setAttribute('role','status');
      degraded.textContent='当前采集服务暂不可用，正在显示历史记录。请稍后重试。';
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
          innerWidth > 1100 && !this.shadowRoot.querySelector(".drawer").classList.contains("wide") && main.querySelector("openclaw-chat-pane")
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
      this.receiptCleanup?.();this.receiptCleanup=null;
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
      this.confirmCleanup?.();this.confirmHost?.remove();
      this.closeIdentity();
      this.close(false);
      clearInterval(this.timer);
      clearInterval(this.identityTimer);this.identityCleanup?.();
      this.sessionObserver?.disconnect();
      this.breadcrumbObserver?.disconnect();
      this.nav?.remove();
      window.removeEventListener("gov-navigate", this.onNavigate);
      window.removeEventListener("gov-return-task", this.onReturnTask);
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
