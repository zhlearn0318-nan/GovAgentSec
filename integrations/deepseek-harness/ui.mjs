import { readFileSync } from 'node:fs';

const sharedStyles = readFileSync(new URL('../../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/ui/styles.css', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./ui/styles.css', import.meta.url), 'utf8');
const script = readFileSync(new URL('./ui/panel.js', import.meta.url), 'utf8');

// Only the server reads the sidecar credential. Polling uses Harness's existing
// authenticated owner connection, never a second browser-visible bearer token.
export function createReadinessProbe(config, {
  fetchImpl = fetch, now = Date.now,
  readToken = () => readFileSync(config.tokenFile, 'utf8').trim(),
} = {}) {
  let checkedAt = -Infinity;
  let pending;
  let status = 'starting';
  return async () => {
    if (pending) return pending;
    if (now() - checkedAt < 5000) return { status, mode: config.mode };
    pending = (async () => {
      try {
        const response = await fetchImpl(`${config.baseUrl}/readyz`, {
          headers: { Authorization: `Bearer ${readToken()}` },
          redirect: 'error', signal: AbortSignal.timeout(2000),
        });
        status = response.ok && (await response.json()).ready === true ? 'ready' : 'unavailable';
      } catch {
        status = 'unavailable';
      }
      checkedAt = now();
      return { status, mode: config.mode };
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}

export function installHarnessUi(ctx, { guardEvents, serviceStatus }) {
  ctx.inject(['webServer', 'connection'], web => {
    web.on('webserver/index-inject', table => {
      table.push({ kind: 'style', text: sharedStyles + '\n' + styles });
      table.push({ kind: 'script', placement: 'body', text: script });
    });
    web.connection.fetch.register({
      path: '/api/govagentsec/state', methods: ['GET'], requestBody: 'buffered',
      async fetch() {
        let service;
        try { service = await serviceStatus(); } catch { /* Show a safe unavailable state. */ }
        return Response.json({
          ...guardEvents.snapshot(),
          service: {
            status: ['starting', 'ready', 'unavailable'].includes(service?.status) ? service.status : 'unavailable',
            mode: ['real', 'baseline'].includes(service?.mode) ? service.mode : null,
          },
        }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      },
    });
  });
}
