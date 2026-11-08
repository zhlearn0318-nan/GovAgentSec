import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { UsageParser, upstreamUsage, headerKey, correlationKey } from '../protocol.mjs';
import { createUsageWrapper } from '../server.mjs';
import { fixtureUpstream } from './fixtures/upstream.mjs';

test('JSON and fragmented SSE extract only actual counters; missing, invalid, conflict and truncation are explicit', () => {
  assert.deepEqual(upstreamUsage({ prompt_tokens: 0, completion_tokens: 8, prompt_cache_hit_tokens: 2 }), { input: 0, output: 8, cacheRead: 2 });
  assert.equal(upstreamUsage({ prompt_tokens: '12' }), null);
  for (const [body, expected] of [
    ['{"usage":{"prompt_tokens":12,"completion_tokens":8}}', { input: 12, output: 8 }], ['{}', null], ['{broken', null],
  ]) { const p = new UsageParser(false); p.feed(Buffer.from(body)); assert.deepEqual(p.finish().usage, expected); }
  const p = new UsageParser(true), sse = 'data: {"choices":[{"text":"中文"}]}\r\n\r\ndata: {"usage":{"prompt_tokens":12,"completion_tokens":8}}\r\n\r\ndata: [DONE]\r\n\r\n';
  for (const b of Buffer.from(sse)) p.feed(Buffer.from([b]));
  assert.deepEqual(p.finish().usage, { input: 12, output: 8 });
  const truncated = new UsageParser(true); truncated.feed(Buffer.from('data: {"usage":{"prompt_tokens":1}}\n\n'));
  assert.equal(truncated.finish().usage, null);
  const conflict = new UsageParser(true); conflict.feed(Buffer.from('data: {"usage":{"prompt_tokens":1}}\n\ndata: {"usage":{"prompt_tokens":2}}\n\ndata: [DONE]\n\n'));
  assert.equal(conflict.finish().token_missing_reason, 'usage_wrapper_conflicting_usage');
  const large = new UsageParser(false, 5); large.feed(Buffer.from('123456')); assert.equal(large.finish().usage, null);
});

test('W3C key validation rejects missing and all-zero IDs', () => {
  assert.equal(headerKey('00-' + 'a'.repeat(32) + '-' + 'b'.repeat(16) + '-01'), 'a'.repeat(32) + '/' + 'b'.repeat(16));
  assert.equal(correlationKey({ traceId: '0'.repeat(32), spanId: 'b'.repeat(16) }), null);
  assert.equal(headerKey('not-a-header'), null);
});

test('proxy preserves bytes, handles concurrent spans, errors, auth, TTL and duplicate span ambiguity', async t => {
  const upstream = await fixtureUpstream(), key = randomBytes(32).toString('hex');
  const wrapper = createUsageWrapper({ upstreams: { deepseek: upstream.url }, controlKey: key, timeoutMs: 120, ttlMs: 500 });
  const port = await wrapper.listen(0), root = 'http://127.0.0.1:' + port;
  t.after(async () => { await wrapper.close(); await upstream.close(); });
  const traceId = 'a'.repeat(32), span = i => i.toString(16).padStart(16, '0');
  const query = async i => { const r = await fetch(root + '/usage/' + traceId + '/' + span(i), { headers: { 'x-gov-usage-key': key } }); return { status: r.status, body: await r.json() }; };
  const post = (i, model, stream = false, suffix = '/chat/completions') => fetch(root + '/deepseek' + suffix, {
    method: 'POST', headers: { authorization: 'Bearer synthetic-only', traceparent: `00-${traceId}-${span(i)}-01`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, stream, messages: [{ role: 'user', content: 'SYNTHETIC_BODY_SENTINEL' }] }) });
  const results = await Promise.all([post(1, 'normal'), post(2, 'other', true, '/v1/chat/completions')]);
  assert.ok((await results[0].text()).includes('合成回放完成'));
  assert.ok((await results[1].text()).includes('[DONE]'));
  assert.equal((await query(1)).body.usage.input, 12); assert.equal((await query(2)).body.usage.input, 23);
  assert.equal(upstream.requests[0].headers.traceparent, undefined);
  assert.equal(upstream.requests[0].headers['x-gov-usage-key'], undefined);
  assert.equal(JSON.parse(upstream.requests[0].raw).messages[0].content, 'SYNTHETIC_BODY_SENTINEL');
  await (await post(3, 'no-usage', true)).text(); assert.equal((await query(3)).body.usage, null);
  await (await post(4, 'invalid')).text(); assert.equal((await query(4)).body.usage, null);
  const err = await post(5, 'error'); assert.equal(err.status, 429); assert.equal(err.headers.get('retry-after'), '2'); await err.text();
  assert.equal((await query(5)).body.usage, null);
  const timeout = await post(6, 'timeout'); assert.equal(timeout.status, 504); await timeout.text();
  await (await post(1, 'normal')).text(); assert.equal((await query(1)).body.token_missing_reason, 'usage_wrapper_ambiguous');
  assert.equal((await fetch(root + '/usage/' + traceId + '/' + span(1))).status, 403);
  assert.equal((await fetch(root + '/usage/' + traceId + '/' + span(1), { headers: { 'x-gov-usage-key': 'é'.repeat(64) } })).status, 403);
  assert.equal((await fetch(root + '/health', { headers: { origin: 'https://example.invalid' } })).status, 403);
  const redirect = await post(7, 'redirect'); assert.equal(redirect.status, 307); await redirect.text();
  assert.equal((await fetch(root + '/deepseek/responses', { method: 'POST' })).status, 404);
  await new Promise(r => setTimeout(r, 510)); assert.equal((await query(2)).status, 404);
  await (await post(2, 'other')).text(); assert.equal((await query(2)).body.token_missing_reason, 'usage_wrapper_ambiguous', 'TTL cannot make an SDK retry appear unique');
  assert.ok(!JSON.stringify((await query(3)).body).includes('SYNTHETIC_BODY_SENTINEL'));
});
