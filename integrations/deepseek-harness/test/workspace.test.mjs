import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Script } from 'node:vm';
import { installHarnessWorkspace, readActivity, createRuntimeStatus } from '../workspace.mjs';

function mount(options = {}) {
  const routes = new Map(), hooks = new Map();
  installHarnessWorkspace({ inject(deps, apply) {
    assert.deepEqual(deps, ['webServer', 'connection']);
    apply({ on: (name, fn) => hooks.set(name, fn), connection: { fetch: { register(route) { routes.set(route.path, route); } } } });
  } }, { scanSkill: async path => ({ decision: 'ALLOW', target: path, installed: false }),
    runtimeStatus: async () => ({ enabled: false }), activity: () => [], scanRoots: ['D:/allowed'], ...options });
  return { routes, hooks };
}
const scanRequest = (body, headers = { 'Content-Type': 'application/json' }) => new Request('http://localhost/api/govagentsec/scan', { method: 'POST', headers, body: JSON.stringify(body) });

test('healthy infrastructure does not claim that formal business identity is ready', async () => {
  for (const required of [false, true]) {
    const runtime = createRuntimeStatus({ enabled: true, snapshot: async () => ({ services: { dependencies: { ok: true, payload: { ready: true, dependencies: { identity: { required, healthy: true } } } } }, requests: [] }) });
    const status = await runtime();
    assert.equal(status.ready, true);
    assert.equal(status.formalIdentityReady, required);
    assert.equal(status.overview.components[2].ready, required);
    assert.equal(status.overview.evidence, null);
  }
});

test('full workspace uses owner-only Harness Fetch routes and injects a chat-preserving launcher', async () => {
  const { routes, hooks } = mount();
  assert.equal(routes.size, 3);
  const page = await routes.get('/api/govagentsec/workspace').fetch();
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'self'/);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const html = await page.text();
  for (const title of ['防护过程', '输入防护', '运行时安全', '供应链安全']) assert.ok(html.includes(title));
  assert.ok(!html.includes('19171'));
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Script(match[1]);
  const rows = [];
  hooks.get('webserver/index-inject')(rows);
  for (const row of rows.filter(row => row.kind === 'script')) new Script(row.text);
  assert.ok(rows.some(row => row.text.includes('showModal')));
});

test('scan rejects invalid, oversized, and non-JSON input before touching the scanner', async () => {
  let calls = 0;
  const { routes } = mount({ scanSkill: async () => { calls++; } });
  const route = routes.get('/api/govagentsec/scan');
  for (const body of [{}, { path: 'x', extra: true }, { path: 42 }, { path: 'x'.repeat(1025) }, { path: '  ' }]) {
    assert.equal((await route.fetch(scanRequest(body))).status, 400);
  }
  assert.equal((await route.fetch(scanRequest({ path: 'x' }, { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal((await route.fetch(scanRequest({ path: 'x'.repeat(9000) }))).status, 413);
  assert.equal(calls, 0);
});

test('scan preserves scanner decisions, serializes scans, and hides internal failure details', async () => {
  let release;
  const { routes } = mount({ scanSkill: path => new Promise(resolve => { release = () => resolve({ decision: 'BLOCK', target: path, installed: false }); }) });
  const route = routes.get('/api/govagentsec/scan');
  const first = route.fetch(scanRequest({ path: 'D:/allowed/package' }));
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await route.fetch(scanRequest({ path: 'D:/allowed/other' }))).status, 409);
  release();
  assert.equal((await (await first).json()).data.decision, 'BLOCK');
  const failed = mount({ scanSkill: async () => { throw Error('private-token'); } }).routes.get('/api/govagentsec/scan');
  const response = await failed.fetch(scanRequest({ path: 'D:/outside' }));
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('private-token'));
});

test('activity exposes only bounded metadata and ignores malformed audit lines', () => {
  const rows = readActivity('unused', { read: () => ['broken', ...Array.from({ length: 120 }, () => JSON.stringify({ time: '2026-11-07', phase: 'input', decision: 'BLOCK', session: 'private-id', text: 'private-text' }))].join('\n') });
  assert.equal(rows.length, 100);
  assert.deepEqual(rows[0], { time: '2026-11-07', phase: 'input', decision: 'BLOCK' });
  assert.ok(!JSON.stringify(rows).includes('private'));
});

test('workspace scan-root configuration cannot break out of the JSON bootstrap', async () => {
  const attack = '</script><script>throw Error("injected")</script>';
  const { routes } = mount({ scanRoots: [attack] });
  const html = await (await routes.get('/api/govagentsec/workspace').fetch()).text();
  const value = html.match(/<script type="application\/json" id="workspace-config">([\s\S]*?)<\/script>/)[1];
  assert.ok(!value.includes('<'));
  assert.deepEqual(JSON.parse(value).scanRoots, [attack]);
});

test('trajectory routes stay on the owner connection and reject malformed identifiers', async () => {
  let reads = 0;
  const { routes } = mount({ trajectory: { list: () => [{ trace_id: 'dsh-' + 'a'.repeat(36) }],
    detail: id => { reads++; return { summary: { trace_id: id }, integrity: { valid: true } }; },
    evolution: () => ({ automaticPublish: false, calibrated: false, candidates: [] }) } });
  assert.equal(routes.size, 6);
  const list = await routes.get('/api/govagentsec/trajectories').fetch();
  assert.equal(list.headers.get('cache-control'), 'no-store');
  assert.equal((await list.json()).data.length, 1);
  const detail = routes.get('/api/govagentsec/trace');
  for (const id of ['', '../installation.json', 'x'.repeat(300)]) {
    assert.equal((await detail.fetch(new Request('http://localhost/api/govagentsec/trace?id=' + encodeURIComponent(id)))).status, 400);
  }
  assert.equal(reads, 0);
  assert.equal((await detail.fetch(new Request('http://localhost/api/govagentsec/trace?id=dsh-' + 'a'.repeat(36)))).status, 200);
  assert.equal(reads, 1);
  assert.equal((await (await routes.get('/api/govagentsec/evolution').fetch()).json()).data.automaticPublish, false);
  for (const path of ['/api/govagentsec/trajectories', '/api/govagentsec/trace', '/api/govagentsec/evolution']) assert.deepEqual(routes.get(path).methods, ['GET']);
});
