import { openSync, readSync, closeSync, readFileSync, fstatSync } from 'node:fs';
import { tokens } from '../../modules/govagentsec-ui/workspace-style.mjs';
import { buildSnapshot } from '../../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/index.js';
import { runtimeOverview } from '../../modules/govagentsec-ui/runtime-overview.mjs';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const json = (value, status = 200) => Response.json(value, { status, headers });
const failure = (code, message, status) => json({ ok: false, error: { code, message } }, status);

/** Read at most 2 MiB from the audit tail; public activity never includes content or session identifiers. */
export function readActivity(path, { read: readOverride } = {}) {
  try {
    let text;
    if (readOverride) text = readOverride(path);
    else {
      const file = openSync(path, 'r');
      try {
        const buffer = Buffer.alloc(2 * 1024 * 1024);
        // Negative positioning is not supported by readSync; stat through the open descriptor.
        const { size } = fstatSync(file);
        const start = Math.max(0, size - buffer.length);
        text = buffer.subarray(0, readSync(file, buffer, 0, Math.min(size, buffer.length), start)).toString('utf8');
        if (start) text = text.slice(text.indexOf('\n') + 1);
      } finally { closeSync(file); }
    }
    return text.split('\n').flatMap(line => {
      try {
        const row = JSON.parse(line);
        if (!['ALLOW', 'REVIEW', 'BLOCK'].includes(row.decision)) return [];
        return [{ time: String(row.time ?? '').slice(0, 40), phase: String(row.phase ?? '').slice(0, 64), decision: row.decision,
          ...(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(row.riskLevel) ? { riskLevel: row.riskLevel } : {}) }];
      } catch { return []; }
    }).slice(-100).reverse();
  } catch { return []; }
}

/** Project the existing AgentGuard read model without exposing business request bodies or credentials. */
export function createRuntimeStatus({ enabled, baseUrl, auditPath, snapshot = buildSnapshot }) {
  let checkedAt = 0, cached, pending;
  return async () => {
    if (!enabled) return { enabled: false, ready: false };
    if (pending) return pending;
    if (cached && Date.now() - checkedAt < 5000) return cached;
    pending = (async () => {
      const state = await snapshot({ agentGuardBaseUrl: baseUrl, auditPath });
      const identity = state.services.dependencies.payload?.dependencies?.identity;
      const ready = state.services.dependencies.ok && state.services.dependencies.payload?.ready === true;
      const formalIdentityReady = identity?.required === true && identity?.healthy === true;
      cached = { enabled: true, ready,
        formalIdentityReady,
        overview: runtimeOverview({ ...state, services: { ...state.services, host_mcp: { ok: ready && formalIdentityReady } } }),
        counts: state.counts, evidence: state.evidence,
        requests: state.requests.map(({ tool, operation, policy_effect, status, reason_code }) => ({ tool, operation, policy_effect, status, reason_code })) };
      checkedAt = Date.now();
      return cached;
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}

/** Register workspace pages and APIs on Harness's authenticated, owner-only connection. */
export function installHarnessWorkspace(ctx, { scanSkill, runtimeStatus, activity, scanRoots, trajectory }) {
  const css = tokens.replaceAll(':host([data-dark])', ':root[data-dark]').replaceAll(':host', ':root') + read('./ui/workspace.css');
  const html = read('./ui/workspace.html').replace('<!--logo-->', () => read('../../modules/govagentsec-ui/logo.svg'))
    .replace('<!--styles-->', () => `<style>${css}</style>`)
    .replace('<!--bootstrap-->', () => `<script type="application/json" id="workspace-config">${JSON.stringify({ scanRoots, trajectoryEnabled: Boolean(trajectory) }).replaceAll('<', '\\u003c')}</script>`)
    .replace('<!--script-->', () => `<script>${read('./ui/workspace.js')}</script>`)
    .replace('<!--trajectory-script-->', () => `<script>${read('./ui/trajectory.js')}</script>`);
  let scanning = false;
  ctx.inject(['webServer', 'connection'], web => {
    web.on('webserver/index-inject', table => table.push({ kind: 'script', placement: 'body', text: read('./ui/workspace-launcher.js') }));
    const register = (path, methods, fetch, requestBody = 'buffered') => web.connection.fetch.register({ path, methods, requestBody, fetch });
    register('/api/govagentsec/workspace', ['GET'], () => new Response(html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" } }));
    register('/api/govagentsec/runtime', ['GET'], async () => {
      try { return json({ ok: true, data: { ...await runtimeStatus(), activity: activity() } }); }
      catch { return failure('RUNTIME_UNAVAILABLE', '运行时状态暂不可用，请稍后刷新。', 503); }
    });
    if (trajectory) {
      register('/api/govagentsec/trajectories', ['GET'], () => {
        try { return json({ ok: true, data: trajectory.list() }); }
        catch { return failure('TRACE_UNAVAILABLE', '轨迹暂不可用，请稍后刷新。', 503); }
      });
      register('/api/govagentsec/trace', ['GET'], request => {
        const id = new URL(request.url).searchParams.get('id');
        if (!/^dsh-[a-f0-9-]{36}$/.test(id ?? '')) return failure('INVALID_TRACE', '请选择有效的任务轨迹。', 400);
        try { return json({ ok: true, data: trajectory.detail(id) }); }
        catch { return failure('TRACE_UNAVAILABLE', '未能读取该轨迹。', 404); }
      });
      register('/api/govagentsec/evolution', ['GET'], () => {
        try { return json({ ok: true, data: trajectory.evolution() }); }
        catch { return failure('EVOLUTION_UNAVAILABLE', '候选状态暂不可用，请稍后刷新。', 503); }
      });
    }
    register('/api/govagentsec/scan', ['POST'], async request => {
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return failure('INVALID_CONTENT_TYPE', '请使用 JSON 请求。', 415);
      let body;
      try {
        const reader = request.body?.getReader();
        if (!reader) return failure('INVALID_INPUT', '请输入扫描目录。', 400);
        const chunks = []; let bytes = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 8192) { await reader.cancel(); return failure('INPUT_TOO_LARGE', '请求内容过大。', 413); }
            chunks.push(Buffer.from(part.value));
          }
        } finally { reader.releaseLock(); }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1
          || typeof body.path !== 'string' || !body.path.trim() || body.path.length > 1024) throw Error('invalid');
      } catch { return failure('INVALID_INPUT', '请输入有效的绝对目录，长度不超过 1024 字符。', 400); }
      if (scanning) return failure('SCAN_BUSY', '已有扫描正在进行，请等待完成。', 409);
      scanning = true;
      try { return json({ ok: true, data: await scanSkill(body.path.trim(), request.signal) }); }
      catch { return failure('SCAN_UNAVAILABLE', '扫描未完成。请确认目录位于允许范围、包含 SKILL.md，且没有链接或超限文件。', 503); }
      finally { scanning = false; }
    }, 'streaming');
  });
}
