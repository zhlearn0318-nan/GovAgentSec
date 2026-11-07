import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { once } from 'node:events';
import plugin, { summarizeAudits } from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/index.js';
import { issuePageAccess } from '../modules/govagentsec-ui/access.mjs';

const root = '/plugins/agentguard-runtime-security';
let upstreamCalls = 0;
const upstream = createServer(async (req, res) => {
  assert.equal(req.url, '/demo/gov-documents');
  assert.equal(req.method, 'POST');
  let body = ''; for await (const part of req) body += part;
  assert.equal(body, '{}');
  upstreamCalls++;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ demo_identity: '本机演示身份', results: [] }));
});
upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
let route;
plugin.register({ pluginConfig: { identityMode: 'disabled', agentGuardBaseUrl: `http://127.0.0.1:${upstream.address().port}` }, registerHttpRoute: r => route = r });
const server = createServer((req, res) => route.handler(req, res));
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const path = issuePageAccess(root + '/panel').url;
  const panel = await (await fetch(base + path)).text();
  const token = panel.match(/let TOKEN="([a-f0-9]+)"/)[1];
  const url = base + root + '/api/demo/gov-documents';
  const post = headers => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ subject: { roles: ['admin'] } }) });
  assert.equal((await post({})).status, 403);
  assert.equal((await post({ 'X-AgentGuard-Page-Token': token, Origin: 'https://evil.example' })).status, 403);
  assert.equal(upstreamCalls, 0);
  const response = await post({ 'X-AgentGuard-Page-Token': token });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.demo_identity, '本机演示身份');
  assert.equal(upstreamCalls, 1);
  const ordinary = await fetch(base + root + '/api/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AgentGuard-Page-Token': token }, body: '{"kind":"notices"}' });
  assert.equal(ordinary.status, 400);
  assert.equal(upstreamCalls, 1);

  const event = result => ({ event: 'enforcement_decision', request_id: 'r1', document_id: 'duty_contacts', scenario: '执行票据重放', identity_note: '本机演示身份', result });
  const summary = summarizeAudits([
    event({ status: 'executed_isolated', receipt: { receipt_id: 'previous' } }),
    event({ status: 'blocked', reason_code: 'G206_TICKET_REPLAY', receipt: null }),
  ]);
  assert.equal(summary.requests[0].receipt, null);
  assert.equal(summary.requests[0].executed, false);
  assert.equal(summary.requests[0].scenario, '执行票据重放');

  const source = await readFile(new URL('../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/ui/panel.html', import.meta.url), 'utf8');
  new vm.Script(source.match(/<script>([\s\S]*?)<\/script>/)[1]);
  const elements = new Map();
  const context = vm.createContext({ document: { getElementById: id => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } } });
  const helpers = source.slice(source.indexOf('const esc='), source.indexOf('const approvalLabel='));
  const render = source.slice(source.indexOf('function renderDecisions()'), source.indexOf('function renderApprovals()'));
  context.state = { filter: 'all', data: { requests: [
    { document_id: 'command_contacts', status: 'blocked', reason_code: 'G002_POLICY_DENY', policy_reason_codes: ['D004_CLEARANCE_INSUFFICIENT'], receipt: null },
    { document_id: 'duty_contacts', status: 'blocked', reason_code: 'G206_TICKET_REPLAY', receipt: null },
    { document_id: 'duty_contacts', status: 'blocked', reason_code: 'G205_TICKET_BINDING_MISMATCH', receipt: null },
  ] } };
  vm.runInContext(helpers + render + ';renderDecisions();', context);
  const html = elements.get('decision-rows').innerHTML;
  for (const text of ['普通身份读机密通讯录', 'command_contacts', 'D004_CLEARANCE_INSUFFICIENT', '未执行', '执行票据重放', '审批后篡改绑定']) assert.ok(html.includes(text), text);
  assert.ok(panel.includes('本机演示身份 · 生产请用组织 OIDC'));
  console.log('PASS: disabled identity demo proxy, page-token/origin guards, ordinary identity gate, audit receipt and Chinese rendering');
} finally {
  server.closeAllConnections(); upstream.closeAllConnections();
  await Promise.all([new Promise(r => server.close(r)), new Promise(r => upstream.close(r))]);
}
