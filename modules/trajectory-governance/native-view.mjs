// Loaded as a first-class OpenClaw view: uses the authenticated gateway client.
import { styles, markup, mount } from '/plugins/govagentsec/trajectory-ui.mjs';
function ensureView() {
 class TrajectoryView extends HTMLElement {
  constructor(){ super();this.attachShadow({mode:'open'});const style=document.createElement('style');style.textContent=styles;const template=document.createElement('template');template.innerHTML=markup;this.shadowRoot.append(style,template.content.cloneNode(true)); }
  set client(value){if(value===this.gatewayClient)return;this.cleanup?.();this.gatewayClient=value;if(value)this.cleanup=mount(this.shadowRoot,(method,params={})=>value.request('govagentsec.trajectory.'+method,params));}
  disconnectedCallback(){this.cleanup?.();this.gatewayClient=null;}
 }
 if(!customElements.get('govagentsec-trajectory-view'))customElements.define('govagentsec-trajectory-view',TrajectoryView);
}
export function createView(html) {
 ensureView();
 return {render:({client})=>html`<govagentsec-trajectory-view .client=${client}></govagentsec-trajectory-view>`};
}

// The chat entry opens the same authenticated view without navigating away.
export function defineChatEntry() {
 ensureView();
 if(customElements.get('govagentsec-chat-traces'))return;
 class ChatTraces extends HTMLElement {
  constructor(){
   super();this.attachShadow({mode:'open'});
   const style=document.createElement('style');style.textContent=`
:host{display:block;flex:none}:host([hidden]){display:none} .entry{position:fixed;right:24px;bottom:112px;z-index:100;display:flex;justify-content:flex-end;padding:0}.entry button{background:#157e73;color:#fff;border-color:#157e73;padding:11px 17px;font-weight:600;box-shadow:0 4px 18px #10294226}.entry button:hover{background:#11675e}
button{font:13px 'Microsoft YaHei UI',sans-serif;cursor:pointer;border:1px solid #ccd9df;border-radius:7px;padding:7px 12px;color:#225e60;background:#fff}
button:hover{background:#edf7f4}button:focus-visible{outline:3px solid #c6953f;outline-offset:2px}
dialog{padding:0;border:1px solid #cbd9e3;border-radius:12px;width:min(1400px,94vw);height:90vh;max-height:90vh;background:#f2f6fa;color:#19334b;box-shadow:0 18px 70px #152d4940}
dialog::backdrop{background:#10294266}.head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;background:white;padding:12px 20px;border-bottom:1px solid #d3dfe7;font:14px 'Microsoft YaHei UI',sans-serif}.head small{color:#647b8d}.body{min-width:0}
@media(max-width:720px){.entry{right:12px;bottom:130px}.entry button{padding:9px 12px}dialog{width:98vw;height:94vh;max-height:94vh}.head{padding:10px}.head small{display:none}}
`;
   const bar=document.createElement('div');bar.className='entry';
   this.button=document.createElement('button');this.button.textContent='历史调用轨迹';this.button.setAttribute('aria-haspopup','dialog');this.button.setAttribute('aria-expanded','false');this.button.onclick=()=>this.open();bar.append(this.button);
   this.dialog=document.createElement('dialog');this.dialog.setAttribute('aria-label','历史调用轨迹');
   const head=document.createElement('div');head.className='head';const title=document.createElement('span');title.textContent='历史调用轨迹';const hint=document.createElement('small');hint.textContent='查看已采集的历史运行 · 关闭后继续当前对话';
   const close=document.createElement('button');close.textContent='关闭轨迹';close.onclick=()=>this.dialog.close();head.append(title,hint,close);
   this.body=document.createElement('div');this.body.className='body';this.dialog.append(head,this.body);
   this.dialog.addEventListener('close',()=>{this.body.replaceChildren();this.button.setAttribute('aria-expanded','false');this.button.focus()});
   this.shadowRoot.append(style,bar,this.dialog);
  }
  connectedCallback(){for(const key of ['client','enabled'])if(Object.hasOwn(this,key)){const value=this[key];delete this[key];this[key]=value}}
  set enabled(value){this.hidden=!value;if(!value&&this.dialog.open)this.dialog.close()}
  set client(value){this.gatewayClient=value;const view=this.body.firstElementChild;if(view)view.client=value}
  open(){if(!this.gatewayClient)return;const view=document.createElement('govagentsec-trajectory-view');this.body.replaceChildren(view);view.client=this.gatewayClient;this.dialog.showModal();this.button.setAttribute('aria-expanded','true')}
  disconnectedCallback(){this.dialog.close();this.body.replaceChildren()}
 }
 customElements.define('govagentsec-chat-traces',ChatTraces);
}
