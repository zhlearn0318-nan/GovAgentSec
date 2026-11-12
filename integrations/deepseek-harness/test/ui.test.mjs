import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Script } from 'node:vm';
import { installHarnessUi, createReadinessProbe } from '../ui.mjs';
import { createGuardEventStore } from '../../../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/guard-events.mjs';

test('Harness injects a collapsible panel and registers state through the authenticated owner API', async () => {
  const hooks = new Map();
  const routes = [];
  const guardEvents = createGuardEventStore();
  guardEvents.beginRun('private-session-id');
  installHarnessUi({ inject(deps, apply) {
    assert.deepEqual(deps, ['webServer', 'connection']);
    apply({ on: (name, handler) => hooks.set(name, handler), connection: { fetch: { register: route => routes.push(route) } } });
  } }, { guardEvents, serviceStatus: async () => ({ status: 'ready', mode: 'real', token: 'private-token' }) });
  assert.equal(routes.length, 1);
  assert.equal(routes[0].path, '/api/govagentsec/state');
  assert.deepEqual(routes[0].methods, ['GET']);
  const response = await routes[0].fetch(new Request('http://localhost/api/govagentsec/state'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const state = await response.json();
  assert.equal(state.status, 'running');
  assert.deepEqual(state.service, { status: 'ready', mode: 'real' });
  assert.ok(!JSON.stringify(state).includes('private'));
  const injections = [];
  hooks.get('webserver/index-inject')(injections);
  assert.ok(injections.some(row => row.kind === 'style' && row.text.includes('.protect-guard')));
  for (const row of injections.filter(row => row.kind === 'script')) new Script(row.text);
});

test('unknown and failed service statuses never look ready', async () => {
  for (const serviceStatus of [async () => ({ status: 'unexpected', mode: 'unexpected' }), async () => { throw Error('private'); }]) {
    let route;
    installHarnessUi({ inject(_deps, apply) {
      apply({ on() {}, connection: { fetch: { register: value => { route = value; } } } });
    } }, { guardEvents: createGuardEventStore(), serviceStatus });
    const state = await (await route.fetch()).json();
    assert.equal(state.service.status, 'unavailable');
    assert.equal(state.service.mode, null);
  }
});

test('readiness probes use server-side bearer auth, deduplicate polling, and notice a dead service', async () => {
  let now = 0;
  let calls = 0;
  const probe = createReadinessProbe({ baseUrl: 'http://127.0.0.1:19172', mode: 'real', tokenFile: 'server-only' }, {
    now: () => now, readToken: () => 'private-token',
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'http://127.0.0.1:19172/readyz');
      assert.equal(options.headers.Authorization, 'Bearer private-token');
      if (calls > 1) throw Error('private failure');
      return Response.json({ ready: true });
    },
  });
  const initial = await Promise.all([probe(), probe(), probe()]);
  assert.equal(calls, 1);
  assert.ok(initial.every(value => value.status === 'ready'));
  now = 6000;
  assert.equal((await probe()).status, 'unavailable');
  assert.equal(calls, 2);
  assert.ok(!JSON.stringify(initial).includes('private-token'));
});
