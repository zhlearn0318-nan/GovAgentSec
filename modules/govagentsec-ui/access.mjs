// Gateway administrators grant one exact page navigation. Panel credentials
// never reuse the gateway token or appear in durable browser storage.
import { randomBytes } from 'node:crypto';

const KEY = Symbol.for('govagentsec.ui-access.v1');
const state = globalThis[KEY] ??= { tickets: new Map(), caps: new Map() };
const PAGES = new Set([
  '/plugins/aegis-security-center/panel', '/plugins/aegis-admission/panel',
  '/plugins/aegis-admin/mcp', '/plugins/aegis-admin/reports',
  '/plugins/aegis-admin/audit', '/plugins/aegis-admin/rules',
  '/plugins/protect-agent/panel', '/plugins/supply-chain-security/panel',
  '/plugins/agentguard-runtime-security/panel',
]);

function prune(map) {
  const now = Date.now();
  for (const [key, value] of map) if (value.expires <= now) map.delete(key);
  if (map.size >= 512) throw Error('Too many active panel credentials');
}

export function issuePageAccess(path) {
  const url = new URL(path, 'http://local');
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') ||
      url.origin !== 'http://local' || !PAGES.has(url.pathname) || url.searchParams.has('gov_access')) {
    throw Error('不支持的管理页面');
  }
  prune(state.tickets);
  const code = randomBytes(32).toString('hex');
  state.tickets.set(code, { target: url.pathname + url.search, expires: Date.now() + 60_000 });
  url.searchParams.set('gov_access', code);
  return { url: url.pathname + url.search };
}

export function allowPage(req, res) {
  const url = new URL(req.url, 'http://local');
  const code = url.searchParams.get('gov_access');
  url.searchParams.delete('gov_access');
  const grant = state.tickets.get(code);
  state.tickets.delete(code);
  if (req.method === 'GET' && grant && grant.expires > Date.now() &&
      grant.target === url.pathname + url.search) return true;
  return deny(res);
}

export function deny(res) {
  res.writeHead(401, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify({ error: '请从已登录的 OpenClaw 工作区打开此页面' }));
  return false;
}

export function issueCapability(paths) {
  prune(state.caps);
  const token = randomBytes(32).toString('hex');
  state.caps.set(token, { paths, expires: Date.now() + 15 * 60_000 });
  return token;
}

export function allowCapability(req, res) {
  const grant = state.caps.get(req.headers?.['x-govagentsec-panel']);
  const path = new URL(req.url, 'http://local').pathname;
  return grant && grant.expires > Date.now() && grant.paths.includes(path) ? true : deny(res);
}

export function injectCapability(html, paths) {
  const token = issueCapability(paths);
  return html.replace('<head>', `<head><script>(()=>{
    const request=window.fetch.bind(window),allowed=${JSON.stringify(paths)},token=${JSON.stringify(token)};
    window.fetch=(url,options={})=>{
      const target=new URL(typeof url==='string'?url:url.url,location.href);
      if(target.origin!==new URL(location.href).origin||!allowed.includes(target.pathname))return request(url,options);
      const headers=new Headers(options.headers);headers.set('X-GovAgentSec-Panel',token);
      return request(url,{...options,headers});
    };
  })();</script>`);
}

export function registerUiAccess(api) {
  api.registerGatewayMethod?.('govagentsec.ui.open', async ({ params, respond }) => {
    try { respond(true, issuePageAccess(params?.path)); }
    catch (error) { respond(false, undefined, { code: 'INVALID_REQUEST', message: error.message }); }
  }, { scope: 'operator.admin' });
}
