// Gateway administrators grant one exact page navigation. Panel credentials
// never reuse the gateway token or appear in durable browser storage.
import { randomBytes } from 'node:crypto';
import {requireBusinessPermission} from '../agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs';

const KEY = Symbol.for('govagentsec.ui-access.v1');
const state = globalThis[KEY] ??= { tickets: new Map(), caps: new Map() };
const PAGES = new Set([
  '/plugins/aegis-security-center/panel', '/plugins/aegis-admission/panel',
  '/plugins/aegis-admin/mcp', '/plugins/aegis-admin/reports',
  '/plugins/aegis-admin/audit', '/plugins/aegis-admin/rules', '/plugins/aegis-admin/reviews',
  '/plugins/protect-agent/panel', '/plugins/supply-chain-security/panel',
  '/plugins/agentguard-runtime-security/panel',
]);

function prune(map) {
  const now = Date.now();
  for (const [key, value] of map) if (value.expires <= now) map.delete(key);
  if (map.size >= 512) throw Error('Too many active panel credentials');
}

export async function issuePageAccess(path, bearer) {
  const url = new URL(path, 'http://local');
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') ||
      url.origin !== 'http://local' || !PAGES.has(url.pathname) || url.searchParams.has('gov_access')) {
    throw Error('不支持的管理页面');
  }
  await requireBusinessPermission(bearer, 'admission.read');
  prune(state.tickets);
  const code = randomBytes(32).toString('hex');
  state.tickets.set(code, { bearer, target: url.pathname + url.search, expires: Date.now() + 60_000 });
  url.searchParams.set('gov_access', code);
  return { url: url.pathname + url.search };
}

export async function allowPage(req, res) {
  const url = new URL(req.url, 'http://local');
  const code = url.searchParams.get('gov_access');
  url.searchParams.delete('gov_access');
  const grant = state.tickets.get(code);
  let reason = !code ? 'UI_PAGE_TOKEN_MISSING' : !grant ? 'UI_PAGE_TOKEN_INVALID' :
    grant.expires <= Date.now() ? 'UI_PAGE_TOKEN_EXPIRED' : grant.used ? 'UI_PAGE_TOKEN_USED' :
    req.method !== 'GET' || grant.target !== url.pathname + url.search ? 'UI_PAGE_TOKEN_TARGET_MISMATCH' : null;
  // Consume even a mismatched request; retain the bounded tombstone until expiry.
  if (grant) grant.used = true;
  if (!reason) {
    try {req.govIdentity = await authorizePageGrant(grant);req.govPageGrant = grant;return true;}
    catch {reason = 'UI_BUSINESS_LOGIN_REQUIRED';}
  }
  return denyPage(req, res, reason);
}

function denyPage(req, res, reason) {
  const messages = {
    UI_PAGE_TOKEN_MISSING: '未提供页面访问凭据。', UI_PAGE_TOKEN_INVALID: '页面访问凭据无效或已清理。',
    UI_PAGE_TOKEN_EXPIRED: '页面访问凭据已过期。', UI_PAGE_TOKEN_USED: '页面访问凭据已使用，不能重复访问。',
    UI_PAGE_TOKEN_TARGET_MISMATCH: '页面访问凭据与请求目标不匹配。', UI_BUSINESS_LOGIN_REQUIRED: '业务登录已失效，请到动态权限重新登录。',
  };
  const embedded = req.headers?.['sec-fetch-dest'] === 'iframe';
  res.writeHead(401, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-GovAgentSec-Reason': reason,
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
  });
  res.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>重新打开管理面板</title><style>body{margin:0;padding:28px;background:#f6f8f7;color:#233e3b;font:14px/1.7 'Segoe UI','Microsoft YaHei UI',sans-serif}main{max-width:560px;margin:40px auto;padding:24px;border:1px solid #d9e4df;border-radius:8px;background:#fff}h1{font-size:20px;margin:0 0 12px}p{margin:8px 0;color:#60736d}a{display:inline-block;margin-top:12px;padding:8px 14px;border-radius:5px;background:#1e695b;color:#fff;text-decoration:none}a:focus-visible{outline:2px solid #1e695b;outline-offset:3px}</style></head><body><main role="alert"><h1>需要重新打开此面板</h1><p>${messages[reason]}尚未读取管理数据。</p><p>请在动态权限登录后，从工作区重新打开。</p><p>原因码：<code>${reason}</code></p><p>${embedded ? '请点击页面上方的“重新加载”，或返回后重新选择此菜单。' : '请返回 OpenClaw 工作区，登录后从菜单重新打开。'}</p>${embedded ? '' : '<a href="/plugin?plugin=protect-agent&amp;id=govagentsec&amp;section=permissions">前往动态权限</a>'}</main></body></html>`);
  return false;
}

export function deny(res) {
  res.writeHead(401, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
  });
  res.end(JSON.stringify({ error: '请从已登录的 OpenClaw 工作区打开此页面' }));
  return false;
}

export function issueCapability(paths, grant) {
  if (!grant?.bearer) throw Error('BUSINESS_IDENTITY_REQUIRED');
  prune(state.caps);
  const token = randomBytes(32).toString('hex');
  state.caps.set(token, { bearer:grant.bearer, paths, expires: Date.now() + 15 * 60_000 });
  return token;
}

export async function allowCapability(req, res, permission = (req.method ?? 'GET') === 'GET' ? 'admission.read' : 'settings.manage') {
  const grant = state.caps.get(req.headers?.['x-govagentsec-panel']);
  const path = new URL(req.url, 'http://local').pathname;
  if (!grant || grant.expires <= Date.now() || !grant.paths.includes(path)) return deny(res);
  try {await authorizePageGrant(grant,permission);return true;}catch{return deny(res);}
}

export function injectCapability(html, paths, grant) {
  const token = issueCapability(paths, grant);
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

export function authorizePageGrant(grant, permission = 'admission.read') {
  if (!grant?.bearer) throw Error('BUSINESS_IDENTITY_REQUIRED');
  return requireBusinessPermission(grant.bearer,permission);
}

export function registerUiAccess(api) {
  api.registerGatewayMethod?.('govagentsec.ui.open', async ({ params, respond }) => {
    try { if(Object.keys(params??{}).some(k=>!['path','bearer'].includes(k)))throw Error('不支持的页面参数');respond(true, await issuePageAccess(params?.path,params?.bearer)); }
    catch (error) { respond(false, undefined, { code: 'INVALID_REQUEST', message: error.message }); }
  }, { scope: 'operator.read' });
}
