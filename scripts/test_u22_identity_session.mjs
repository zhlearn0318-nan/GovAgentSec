import test from 'node:test';
import assert from 'node:assert/strict';
import { getIdentitySession } from '../modules/govagentsec-ui/identity-session.mjs';
import { getTaskContext, setTaskContext, subscribeTaskContext } from '../modules/govagentsec-ui/task-context.mjs';

function fixture() {
  let enabled = true, tokenNumber = 0;
  const tokens = new Map(), calls = [], now = Math.floor(Date.now() / 1000);
  const users = [{ id: 'officer', roles: ['office_user'] }, { id: 'approver', roles: ['business_approver'] }];
  const config = { sourceExpiry: now + 900, delegationExpiry: now + 300, fail: '', gate: null };
  const gateway = { async request(method, payload = {}) {
    const operation = method.split('.').at(-1); calls.push({ operation, payload: structuredClone(payload) });
    if (config.gate?.operation === operation) await config.gate.wait;
    if (operation === config.fail) throw Error('PRIVATE_TRANSPORT_DETAIL');
    if (operation === 'status') {
      const user = enabled ? tokens.get(payload.bearer) ?? null : null;
      return { enabled, user, users, execution_enabled: !!user, expires_at: config.sourceExpiry,
        requests: user ? [{ request_id: 'request-1', requester: 'officer', status: 'authorized', execution_status: 'not_started' }] : [],
        audit: [{ bearer: 'PRIVATE_AUDIT_BEARER', safe: 'kept' }], access_token: 'PRIVATE_STATUS_TOKEN' };
    }
    if (operation === 'login') {
      tokens.delete(payload.bearer);
      const user = users.find(item => item.id === payload.user), token = `PRIVATE_TOKEN_${++tokenNumber}`;
      tokens.set(`Bearer ${token}`, user);
      return { access_token: token, user, expires_at: config.delegationExpiry };
    }
    if (operation === 'revoke') { tokens.delete(payload.bearer); return { status: 'ok' }; }
    if (operation === 'enable') { enabled = true; return { enabled: true }; }
    if (operation === 'disable') { enabled = false; tokens.clear(); return { enabled: false }; }
    if (!tokens.has(payload.bearer)) throw Error('SERVER_REJECTED');
    return { status: 'ok', user: tokens.get(payload.bearer).id, nested: { ticket: 'PRIVATE_TICKET', safe: 'kept' } };
  } };
  return { gateway, calls, config, tokens };
}

test('route mounts share one session; gateway instances do not share delegation', async () => {
  const first = fixture(), second = fixture(), session = getIdentitySession(first.gateway);
  assert.equal(getIdentitySession(first.gateway), session);
  await session.login('officer');
  const unsubscribe = session.subscribe(() => {}); await session.refresh(); unsubscribe();
  assert.equal(getIdentitySession(first.gateway).snapshot().user.id, 'officer');
  assert.equal(getIdentitySession(second.gateway).snapshot().user, null);
  assert.equal(first.calls.filter(call => call.operation === 'revoke').length, 0);
});

test('public state and results omit credentials and are independent copies', async () => {
  const { gateway } = fixture(), session = getIdentitySession(gateway), seen = [];
  const unsubscribe = session.subscribe(value => seen.push(value));
  const login = await session.login('officer'), reply = await session.request('bind_session', { session_key: 'exact-session' });
  const state = session.snapshot(); state.user.id = 'changed'; state.requests.length = 0;
  assert.equal(session.snapshot().user.id, 'officer'); assert.equal(session.snapshot().requests.length, 1);
  assert.equal(JSON.stringify({ seen, login, reply, state }).includes('PRIVATE_'), false);
  assert.equal(reply.nested.safe, 'kept');
  unsubscribe();
});

test('source and delegation expiries use the earlier server-provided timestamp', async () => {
  const { gateway, config } = fixture(), session = getIdentitySession(gateway);
  await session.login('officer'); assert.equal(session.snapshot().expires_at, config.delegationExpiry);
  config.sourceExpiry = config.delegationExpiry - 10; await session.refresh();
  assert.equal(session.snapshot().expires_at, config.sourceExpiry);
  config.sourceExpiry = Math.floor(Date.now() / 1000) - 1; await session.refresh();
  assert.equal(session.snapshot().execution_enabled, false); assert.equal(session.snapshot().user, null);
  await assert.rejects(session.request('invoke', {}), /DEMO_DELEGATION_REQUIRED/);
});

test('payload cannot supply or replace credentials or call lifecycle operations', async () => {
  const { gateway, calls } = fixture(), session = getIdentitySession(gateway); await session.login('officer');
  for (const payload of [{ bearer: 'fake' }, { Authorization: 'fake' }, { access_token: 'fake' }, null, []]) {
    await assert.rejects(session.request('resolve', payload), /DEMO_UNTRUSTED_FIELD/);
  }
  await assert.rejects(session.request('login', {}), /DEMO_UNTRUSTED_FIELD/);
  assert.equal(calls.some(call => call.operation === 'resolve'), false);
  await session.request('resolve', { request_id: 'r1', resolution: 'reject' });
  assert.equal(calls.find(call => call.operation === 'resolve').payload.bearer, 'Bearer PRIVATE_TOKEN_1');
});

test('queued old-identity action cannot execute as a new identity or discard it', async () => {
  const { gateway, config, calls } = fixture(), session = getIdentitySession(gateway); await session.login('officer');
  let release; config.gate = { operation: 'login', wait: new Promise(resolve => { release = resolve; }) };
  const switching = session.login('approver');
  const rejected = assert.rejects(session.request('resolve', { request_id: 'old' }), /DEMO_DELEGATION_REQUIRED/);
  release(); await switching; await rejected;
  assert.equal(session.snapshot().user.id, 'approver');
  assert.equal(calls.some(call => call.operation === 'resolve'), false);
  assert.equal(calls.filter(call => call.operation === 'login')[1].payload.bearer, 'Bearer PRIVATE_TOKEN_1');
});

test('concurrent refresh calls coalesce without parallel RPC and preserve authorization/execution distinction', async () => {
  const { gateway, calls } = fixture(), session = getIdentitySession(gateway); await session.login('officer');
  const before = calls.length, one = session.refresh(), two = session.refresh(); assert.equal(one, two); await one;
  assert.equal(calls.length, before + 1);
  const row = session.snapshot().requests[0]; assert.equal(row.status, 'authorized'); assert.equal(row.execution_status, 'not_started');
});

test('poll failure clears local capability without claiming remote revocation', async () => {
  const { gateway, config, calls, tokens } = fixture(), session = getIdentitySession(gateway); await session.login('officer');
  config.fail = 'status'; await assert.rejects(session.refresh(), /^Error: DEMO_STATUS_UNAVAILABLE$/);
  assert.equal(session.snapshot().execution_enabled, false); assert.equal(session.snapshot().available, false);
  assert.equal(session.snapshot().user, null); assert.equal(tokens.size, 1);
  assert.equal(calls.some(call => call.operation === 'revoke'), false);
  await assert.rejects(session.request('resolve'), /DEMO_DELEGATION_REQUIRED/);
});

test('logout revokes before clearing, and failed revoke leaves no local execution', async () => {
  const ok = fixture(), session = getIdentitySession(ok.gateway); await session.login('officer'); await session.logout();
  assert.equal(ok.tokens.size, 0); assert.equal(session.snapshot().user, null);
  const failed = fixture(), other = getIdentitySession(failed.gateway); await other.login('officer'); failed.config.fail = 'revoke';
  await assert.rejects(other.logout(), /DEMO_LOGOUT_UNCONFIRMED/);
  assert.equal(other.snapshot().execution_enabled, false); assert.equal(failed.tokens.size, 1);
  assert.equal(other.snapshot().delegation_reason, 'DEMO_LOGOUT_UNCONFIRMED');
});

test('disable is global only when explicitly invoked and refresh cannot restore a token', async () => {
  const { gateway, tokens, calls } = fixture(), session = getIdentitySession(gateway); await session.login('officer');
  await session.disable(); assert.equal(tokens.size, 0); assert.equal(session.snapshot().enabled, false);
  await session.enable(); await session.refresh(); assert.equal(session.snapshot().user, null);
  assert.equal(calls.filter(call => call.operation === 'disable').length, 1);
});

test('task context has no guessed session, publishes exact changes, and does not expose mutable state', () => {
  setTaskContext(); assert.deepEqual(getTaskContext(), { sessionKey: '', title: '' });
  const seen = [], unsubscribe = subscribeTaskContext(value => seen.push(value));
  setTaskContext({ sessionKey: 'agent:main:exact', title: '当前任务' });
  getTaskContext().sessionKey = 'fake'; assert.equal(getTaskContext().sessionKey, 'agent:main:exact');
  setTaskContext({ sessionKey: 'agent:main:second', title: '第二个任务' });
  assert.equal(seen.at(-1).sessionKey, 'agent:main:second');
  setTaskContext({ title: '无会话时不保留标题' }); assert.deepEqual(seen.at(-1), { sessionKey: '', title: '' });
  unsubscribe();
});
