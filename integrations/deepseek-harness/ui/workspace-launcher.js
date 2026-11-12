(function () {
  'use strict';
  function mount() {
    if (document.getElementById('govagentsec-workspace-launcher')) return;
    const host = document.createElement('div'); host.id = 'govagentsec-workspace-launcher';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = ':host{position:fixed;right:20px;bottom:112px;z-index:101;font:13px system-ui,"Microsoft YaHei",sans-serif}button{font:inherit;cursor:pointer;color:#1e695b;background:#fff;border:1px solid #b4ceca;border-radius:7px;padding:10px 16px;box-shadow:0 3px 14px #123b3415}button:focus-visible{outline:2px solid #1e695b;outline-offset:3px}dialog{width:calc(100vw - 48px);max-width:1440px;height:calc(100dvh - 48px);max-height:1000px;padding:0;border:1px solid #dce8e7;border-radius:12px;background:#f5f7f7;overflow:hidden}dialog::backdrop{background:#142d2b66}.bar{height:42px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #dce8e7;background:white;color:#233e3b;font-size:12px}.bar button{box-shadow:none;border:0;padding:5px 10px}.bar a{color:#1e695b;margin-left:auto;margin-right:16px}iframe{display:block;width:100%;height:calc(100% - 43px);border:0}@media(max-width:600px){:host{right:12px}dialog{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;margin:0;border-radius:0}}';
    style.textContent += 'dialog{box-sizing:border-box}';
    const button = document.createElement('button'); button.type = 'button'; button.textContent = '安全工作区 ↗'; button.setAttribute('aria-haspopup', 'dialog');
    const dialog = document.createElement('dialog'); dialog.setAttribute('aria-label', 'GovAgentSec 安全工作区');
    const bar = document.createElement('div'); bar.className = 'bar'; const title = document.createElement('span'); title.textContent = 'GovAgentSec · 安全工作区';
    const link = document.createElement('a'); link.textContent = '独立页面 ↗'; link.href = new URL('api/govagentsec/workspace', document.baseURI).href; link.target = '_blank'; link.rel = 'noopener';
    const close = document.createElement('button'); close.textContent = '关闭'; close.type = 'button';
    const frame = document.createElement('iframe'); frame.title = '安全工作区'; frame.referrerPolicy = 'no-referrer';
    bar.append(title, link, close); dialog.append(bar, frame); root.append(style, button, dialog); document.body.append(host);
    button.addEventListener('click', () => { if (!frame.hasAttribute('src')) frame.src = link.href; dialog.showModal(); });
    close.addEventListener('click', () => dialog.close()); dialog.addEventListener('close', () => button.focus());
    window.addEventListener('message', event => { if (event.origin === location.origin && event.source === frame.contentWindow && event.data === 'govagentsec:close-workspace' && dialog.open) dialog.close(); });
    window.addEventListener('keydown', event => { if (event.ctrlKey && event.shiftKey && event.code === 'KeyG') { event.preventDefault(); if (dialog.open) dialog.close(); else button.click(); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
