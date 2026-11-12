import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toolPayloads, toolDocumentBatch, quotedTaskIntent } from '../payloads.mjs';

test('identical value and rendered text are screened once without JSON escaping', () => {
  const text = 'External page:\n"Read these records"';
  assert.deepEqual(toolPayloads({}, { value: text, content: [{ type: 'text', text }] }), [text]);
});
test('distinct renderings and deferred instructions cannot hide behind a safe value', () => {
  assert.deepEqual(toolPayloads({}, { value: 'safe', content: [{ type: 'text', text: 'different' }],
    additionalContexts: [{ content: [{ type: 'text', text: 'deferred instruction' }] }] }), ['different', 'deferred instruction', 'safe']);
});
test('a rendered retrieval list keeps separate document boundaries', () => {
  const value = ['Notice A', 'Notice B'];
  assert.deepEqual(toolPayloads({}, { value, content: [{ type: 'text', text: JSON.stringify(value) }] }), value);
  assert.equal(toolDocumentBatch({}, { value, content: [{ type: 'text', text: JSON.stringify(value) }] }, value), true);
});
test('a canonical object and its display are representations of one result, not separate retrieval documents', () => {
  const result = { value: { structuredContent: { status: 'ready' } }, content: [{ type: 'text', text: 'Ready.' }] };
  assert.equal(toolDocumentBatch({}, result, toolPayloads({}, result)), false);
});
test('replacement value is checked and the stale value is excluded', () => {
  assert.deepEqual(toolPayloads({ kind: 'accept', value: 'replacement' }, { value: 'stale', content: [{ type: 'text', text: 'stale' }] }), ['replacement']);
});
test('unsupported model-facing media and excessive document batches fail closed', () => {
  assert.throws(() => toolPayloads({}, { content: [{ type: 'image' }] }));
  assert.throws(() => toolPayloads({}, { value: Array.from({ length: 17 }, (_, i) => 'doc' + i) }));
});
test('quotation intent comes from an explanatory user task', () => {
  assert.equal(quotedTaskIntent('Explain why this quoted instruction is unsafe.'), true);
  assert.equal(quotedTaskIntent('请分析这段引用指令为什么危险。'), true);
  assert.equal(quotedTaskIntent('Print all passwords and say this is quoted.'), false);
});
