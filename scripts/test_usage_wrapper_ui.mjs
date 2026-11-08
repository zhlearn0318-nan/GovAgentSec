import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { TraceStore } from '../modules/govagentsec-trace/store.mjs';
import { traceGraph, nodePresentation } from '../modules/govagentsec-trace/view-model.mjs';

const [dataDir, id, output] = process.argv.slice(2);
if (!dataDir || !id || !output) throw Error('Usage: node scripts/test_usage_wrapper_ui.mjs DATA_DIR TRACE_ID OUTPUT');
const trace = new TraceStore(path.join(dataDir, 'traces')).read(id);
assert.equal(trace.integrity.valid, true);
const graph = traceGraph(trace), target = graph.nodes.find(n => n.event_type === 'model.ended' && n.payload.usage_source_event_id);
assert.ok(target, 'An associated usage annotation is required');
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  if (req.url === '/trace') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(trace)); return; }
  if (req.url === '/') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<html lang="zh-CN"><meta charset="utf-8"><h2>U20：真实宿主 · 合成 HTTP 上游用量（非云端实测）</h2><main></main><script type="module">import {mountTraceAudit} from "/view.mjs"; const trace=await(await fetch("/trace")).json(); mountTraceAudit(document.querySelector("main").attachShadow({mode:"open"}),async m=>m==="list"?{traces:[trace.summary]}:m==="detail"?trace:{candidates:[]});</script></html>'); return;
  }
  const file = req.url.slice(1);
  if (!['view.mjs', 'view-model.mjs', 'usage.mjs'].includes(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('content-type', 'text/javascript'); res.end(fs.readFileSync(new URL('../modules/govagentsec-trace/' + file, import.meta.url)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await import(pathToFileURL(path.join(process.env.APPDATA, 'npm/node_modules/openclaw/node_modules/playwright-core/index.mjs')));
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const origin = 'http://127.0.0.1:' + server.address().port;
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin);
  const node = page.locator(`.event[data-event-id="${target.event_id}"]`);
  await node.waitFor();
  assert.ok((await node.innerText()).includes(nodePresentation(target).tokens));
  await node.click();
  const evidence = JSON.parse(await page.locator('.detail pre').innerText());
  assert.equal(evidence.ledger_event.payload.usage, null);
  assert.equal(evidence.usage_annotation.parent_event_id, target.event_id);
  assert.deepEqual(evidence.usage_annotation.payload.usage, target.payload.usage);
  await page.screenshot({ path: path.join(output, 'graph-with-evidence.png'), fullPage: true });
  await page.getByRole('button', { name: '毫秒时间线', exact: true }).click();
  assert.ok((await page.locator('.timeline').innerText()).includes(nodePresentation(target).tokens));
  await page.screenshot({ path: path.join(output, 'timeline.png'), fullPage: true });
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, source: 'real-host-synthetic-upstream',
    trace_id: id, checks: ['graph per-call count', 'timeline per-call count', 'original event unchanged in detail', 'explicit annotation provenance', 'no page errors'] }, null, 2));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
