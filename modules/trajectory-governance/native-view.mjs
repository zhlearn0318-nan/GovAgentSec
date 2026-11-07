// Loaded as a first-class OpenClaw view: uses the authenticated gateway client.
import { mountWorkbench } from "/plugins/govagentsec/workbench.mjs";
import { styles, markup, mount } from "/plugins/govagentsec/trajectory-ui.mjs";
function ensureView() {
  class TrajectoryView extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = styles;
      const template = document.createElement("template");
      template.innerHTML = markup;
      this.shadowRoot.append(style, template.content.cloneNode(true));
    }
    set client(value) {
      if (value === this.gatewayClient) return;
      this.cleanup?.();
      this.gatewayClient = value;
      if (value)
        this.cleanup = mount(this.shadowRoot, (method, params = {}) =>
          value.request("govagentsec.trajectory." + method, params),
        );
    }
    disconnectedCallback() {
      this.cleanup?.();
      this.gatewayClient = null;
    }
  }
  if (!customElements.get("govagentsec-trajectory-view"))
    customElements.define("govagentsec-trajectory-view", TrajectoryView);
}
export function createView(html) {
  ensureView();
  return {
    stop() {}, // Host lifecycle contract; disconnectedCallback owns cleanup.
    render: ({ client }) =>
      html`<govagentsec-trajectory-view
        .client=${client}
      ></govagentsec-trajectory-view>`,
  };
}

// Session-bound, non-modal task drawer; chat remains usable while open.
export function defineChatEntry() {
  if (customElements.get("govagentsec-chat-traces")) return;
  class ChatTraces extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = `
:host{display:block;flex:none}:host([hidden]){display:none}[hidden]{display:none!important}
.entry{position:fixed;right:24px;bottom:112px;z-index:100}.entry button{background:#157e73;color:white;border:0;box-shadow:0 4px 18px #10294226}
button{font:13px 'Microsoft YaHei UI',sans-serif;cursor:pointer;border:1px solid #ccd9df;border-radius:7px;padding:10px 14px;color:#225e60;background:#fff}button:focus-visible{outline:3px solid #c6953f;outline-offset:2px}
.drawer{box-sizing:border-box;position:fixed;right:0;top:55px;bottom:0;width:min(720px,48vw);z-index:110;background:#f2f6fa;color:#19334b;border-left:1px solid #cbd9e3;box-shadow:-8px 0 28px #10294214;overflow:auto}
.head{position:sticky;top:0;z-index:2;background:white;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #d3dfe7;font:15px 'Microsoft YaHei UI',sans-serif}
@media(max-width:900px){.drawer{width:100vw;top:0}.entry{right:12px;bottom:130px}}
`;
      const bar = document.createElement("div");
      bar.className = "entry";
      this.button = document.createElement("button");
      this.button.textContent = "任务与轨迹";
      this.button.setAttribute("aria-expanded", "false");
      this.button.onclick = () => this.open();
      bar.append(this.button);
      this.drawer = document.createElement("section");
      this.drawer.className = "drawer";
      this.drawer.hidden = true;
      this.drawer.setAttribute("role", "region");
      this.drawer.setAttribute("aria-label", "任务详情");
      const head = document.createElement("div");
      head.className = "head";
      const title = document.createElement("strong");
      title.textContent = "任务详情";
      this.closeButton = document.createElement("button");
      this.closeButton.textContent = "关闭面板";
      this.closeButton.onclick = () => this.close();
      head.append(title, this.closeButton);
      this.body = document.createElement("div");
      this.body.attachShadow({ mode: "open" });
      this.drawer.append(head, this.body);
      this.shadowRoot.append(style, bar, this.drawer);
      this.onEscape = (e) => {
        if (e.key === "Escape" && !this.drawer.hidden) {
          e.preventDefault();
          this.close();
        }
      };
    }
    connectedCallback() {
      for (const key of ["client", "enabled", "sessionKey"])
        if (Object.hasOwn(this, key)) {
          const value = this[key];
          delete this[key];
          this[key] = value;
        }
      document.addEventListener("keydown", this.onEscape);
    }
    set enabled(value) {
      this.hidden = !value;
      if (!value) this.close(false);
    }
    set client(value) {
      if (this.gatewayClient === value) return;
      this.gatewayClient = value;
      if (!this.drawer.hidden) this.renderTask();
    }
    set sessionKey(value) {
      if (value === this.currentSession) return;
      this.currentSession = value;
      if (!this.drawer.hidden) this.renderTask();
    }
    renderTask() {
      this.cleanup?.();
      this.body.shadowRoot.replaceChildren();
      if (this.gatewayClient)
        this.cleanup = mountWorkbench(
          this.body.shadowRoot,
          this.gatewayClient,
          this.currentSession,
        );
    }
    open() {
      if (!this.gatewayClient) return;
      this.drawer.hidden = false;
      this.button.setAttribute("aria-expanded", "true");
      this.button.hidden = true;
      const pane = this.closest("openclaw-chat-pane");
      if (pane && innerWidth > 900) {
        this.pane = pane;
        this.oldPadding = pane.style.paddingRight;
        pane.style.paddingRight = "min(720px, 48vw)";
      }
      this.renderTask();
      this.closeButton.focus();
    }
    close(focus = true) {
      this.cleanup?.();
      this.cleanup = null;
      this.body.shadowRoot.replaceChildren();
      this.drawer.hidden = true;
      this.button.hidden = false;
      this.button.setAttribute("aria-expanded", "false");
      if (this.pane) {
        this.pane.style.paddingRight = this.oldPadding;
        this.pane = null;
      }
      if (focus) this.button.focus();
    }
    disconnectedCallback() {
      document.removeEventListener("keydown", this.onEscape);
      this.close(false);
    }
  }
  customElements.define("govagentsec-chat-traces", ChatTraces);
}
