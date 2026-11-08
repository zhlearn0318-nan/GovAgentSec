import http from 'node:http';
import https from 'node:https';
import { timingSafeEqual } from 'node:crypto';
import { UsageParser, headerKey } from './protocol.mjs';

export function createUsageWrapper({ upstreams, controlKey, timeoutMs = 120000, ttlMs = 300000, maxRecords = 1000, maxKeys = 100000 }) {
  if (!/^[a-f0-9]{64}$/.test(controlKey ?? '')) throw Error('CONTROL_KEY_REQUIRED');
  const routes = new Map(Object.entries(upstreams).map(([name, base]) => {
    const url = new URL(base);
    if (!/^[a-z0-9-]+$/.test(name) || url.username || url.password || url.search || url.hash
      || !(url.protocol === 'https:' || url.protocol === 'http:' && url.hostname === '127.0.0.1')) throw Error('INVALID_UPSTREAM');
    return [name, url];
  }));
  const records = new Map(), seen = new Set();
  const counters = { requests: 0, unassociated: 0, expired: 0, ambiguous: 0 };
  const prune = () => { for (const [key, row] of records) if (row.expires <= Date.now()) { records.delete(key); counters.expired++; } };
  const auth = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(Buffer.from(value), Buffer.from(controlKey));
  const json = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
  const server = http.createServer((req, res) => {
    // Browsers on unrelated origins cannot use this as a local credential/metadata oracle.
    if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.origin || !/^127\.0\.0\.1:\d+$/.test(req.headers.host ?? '')) return json(res, 403, { error: 'LOCAL_ONLY' });
    prune();
    if (req.method === 'GET' && req.url === '/health') return json(res, 200, { service: 'govagentsec-usage-wrapper', ready: true });
    if (req.url?.startsWith('/usage/') || req.url === '/shutdown') {
      if (!auth(req.headers['x-gov-usage-key'])) return json(res, 403, { error: 'UNAUTHORIZED' });
      if (req.method === 'POST' && req.url === '/shutdown') {
        json(res, 200, { stopped: true }); server.close(); server.closeAllConnections(); return;
      }
      const key = req.url.slice(7);
      if (req.method !== 'GET' || !/^[a-f0-9]{32}\/[a-f0-9]{16}$/.test(key)) return json(res, 400, { error: 'INVALID_KEY' });
      const row = records.get(key);
      return json(res, !row ? 404 : row.pending ? 202 : 200, row ? { key, usage: row.usage,
        token_missing_reason: row.reason, pending: row.pending } : { error: 'UNAVAILABLE' });
    }
    const match = /^\/([a-z0-9-]+)(\/(?:v1\/)?chat\/completions)$/.exec(req.url ?? '');
    if (req.method !== 'POST' || !match || !routes.has(match[1])) return json(res, 404, { error: 'UNSUPPORTED_ENDPOINT' });
    if (typeof req.headers.authorization !== 'string' || !/^Bearer \S+$/.test(req.headers.authorization)) return json(res, 401, { error: 'AUTHORIZATION_REQUIRED' });
    const base = routes.get(match[1]), target = new URL(base);
    target.pathname = base.pathname.replace(/\/$/, '') + match[2];
    const key = headerKey(req.headers.traceparent);
    counters.requests++;
    let row;
    if (key) {
      // Retain bounded ID-only tombstones after usage expires: a late SDK retry
      // must never look like a new unique call. At capacity, stop collecting new keys.
      const duplicate = seen.has(key), full = !duplicate && seen.size >= maxKeys;
      if (records.size >= maxRecords && !records.has(key)) records.delete(records.keys().next().value);
      row = records.get(key) ?? { expires: Date.now() + ttlMs };
      Object.assign(row, { pending: !duplicate && !full, usage: null, ambiguous: duplicate || full,
        reason: duplicate ? 'usage_wrapper_ambiguous' : full ? 'usage_wrapper_capture_limit' : null });
      records.set(key, row);
      if (duplicate) counters.ambiguous++; else if (!full) seen.add(key);
    } else counters.unassociated++;
    const complete = (usage, reason) => { if (row && !row.ambiguous) { row.pending = false; row.usage = usage; row.reason = reason; } };
    // Do not forward traceparent, cookies, control credentials, proxy or hop-by-hop headers.
    const headers = { authorization: req.headers.authorization, 'content-type': req.headers['content-type'] ?? 'application/json', accept: req.headers.accept ?? '*/*' };
    const transport = target.protocol === 'https:' ? https : http;
    const upstream = transport.request(target, { method: 'POST', headers }, response => {
      const forwarded = {};
      const hop = new Set(['connection', 'transfer-encoding', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'upgrade', 'set-cookie', 'location']);
      for (const h of String(response.headers.connection ?? '').split(',')) hop.add(h.trim().toLowerCase());
      for (const [name, value] of Object.entries(response.headers)) if (!hop.has(name)) forwarded[name] = value;
      res.writeHead(response.statusCode, forwarded);
      const parser = new UsageParser(String(response.headers['content-type']).includes('text/event-stream'));
      response.on('data', bytes => { try { parser.feed(bytes); } catch { parser.fail('usage_wrapper_parse_error'); } });
      response.on('end', () => {
        clearTimeout(timer);
        if (response.statusCode < 200 || response.statusCode >= 300) complete(null, 'usage_wrapper_upstream_error');
        else { const result = parser.finish(); complete(result.usage, result.token_missing_reason); }
      });
      response.on('error', () => { clearTimeout(timer); complete(null, 'usage_wrapper_incomplete_stream'); res.destroy(); });
      response.pipe(res);
    });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; upstream.destroy(); }, timeoutMs); timer.unref();
    upstream.on('error', () => {
      clearTimeout(timer); complete(null, timedOut ? 'usage_wrapper_timeout' : 'usage_wrapper_upstream_error');
      if (!res.headersSent) json(res, timedOut ? 504 : 502, { error: timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE' }); else res.destroy();
    });
    req.on('error', () => upstream.destroy());
    res.on('close', () => { if (!res.writableFinished) { complete(null, 'usage_wrapper_client_aborted'); upstream.destroy(); } });
    req.pipe(upstream);
  });
  return { server, counters,
    listen: (port = 18792) => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve(server.address().port)); }),
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
