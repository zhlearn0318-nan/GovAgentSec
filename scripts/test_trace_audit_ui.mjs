import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { registerTrace } from '../modules/govagentsec-trace/register.mjs';
import { traceGraph, graphLanes } from '../modules/govagentsec-trace/view-model.mjs';
const latest = readdirSync('local-validation').filter(f => /^trace-demo-\d+$/.test(f)).sort().at(-1);
const dataDir = path.resolve(process.argv[2] ?? path.join('local-validation', latest ?? 'run-demo-first'));
const methods = new Map();
registerTrace({ pluginConfig: { dataDir }, config: {}, logger: { warn() {} }, on() {}, registerHttpRoute() {}, registerGatewayMethod(name, fn) { methods.set(name, fn); } });
const server = createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      const url = new URL(req.url, 'http://localhost'), method = url.pathname.slice(5), params = JSON.parse(url.searchParams.get('params') ?? '{}');
      await methods.get('govagentsec.trace.' + method)({ params, respond(ok, data, error) { res.writeHead(ok ? 200 : 400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data ?? error)); } }); return;
    }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<html lang="zh-CN"><meta charset="utf-8"><title>轨迹审计测试</title><body style="margin:24px;background:#f5f8f6"><main id="root"></main><script type="module">import {mountTraceAudit} from "/view.mjs"; mountTraceAudit(document.querySelector("main").attachShadow({mode:"open"}), async(m,p={})=>{const r=await fetch("/api/"+m+"?params="+encodeURIComponent(JSON.stringify(p)));if(!r.ok)throw Error("request failed");return r.json()});</script></body></html>'); return; }
    const file = req.url.slice(1); if (!['view.mjs', 'view-model.mjs', 'usage.mjs'].includes(file)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', 'text/javascript'); res.end(readFileSync(new URL('../modules/govagentsec-trace/' + file, import.meta.url)));
  } catch { res.writeHead(500); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const playwright = await import(pathToFileURL(path.join(process.env.APPDATA, 'npm/node_modules/openclaw/node_modules/playwright-core/index.mjs')));
const browser = await playwright.chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1560, height: 1080 } }), errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.getByText('没有此范围的轨迹。', { exact: false }).waitFor();
  await page.getByRole('checkbox', { name: '包含本地合成测试' }).check();
  await page.locator('.trace-row button').filter({ hasText: '正常样例 1' }).click();
  await page.locator('.event').first().waitFor();
  const traceId = await page.locator('section[aria-label="轨迹审计"]').getAttribute('data-trace-id');
  const trace = await page.evaluate(async id => (await fetch('/api/detail?params=' + encodeURIComponent(JSON.stringify({ trace_id: id })))).json(), traceId);
  const expectedGraph = traceGraph(trace);
  assert.ok(expectedGraph.nodes.length >= 20);
  assert.deepEqual(await page.locator('.event').evaluateAll(nodes => nodes.map(n => n.dataset.eventId)), expectedGraph.nodes.map(n => n.event_id));
  assert.deepEqual(await page.locator('.canvas svg path').evaluateAll(edges => edges.map(e => [e.dataset.from, e.dataset.to, e.dataset.kind])), expectedGraph.edges.map(e => [e.from, e.to, e.kind]));
  assert.deepEqual(await page.locator('.lanes > span').allTextContents(), graphLanes);
  assert.equal(await page.getByRole('button', { name: '完整事件图', exact: true }).count(), 0);
  await page.getByRole('button', { name: /^模型调用/ }).first().click();
  await page.locator('.detail summary').click();
  assert.ok((await page.locator('.detail').innerText()).includes('event_hash'));
  await page.getByRole('button', { name: '毫秒时间线' }).click(); assert.ok((await page.locator('.timeline').innerText()).includes('重试'));
  assert.equal(await page.locator('.timeline-event').count(), trace.events.length);
  assert.ok((await page.locator('.timeline').innerText()).includes('失败'));
  await page.getByRole('button', { name: '调用关系图' }).click();
  const output = path.resolve('local-validation/trace-ui'); mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'graph.png'), fullPage: true });
  await page.setViewportSize({ width: 680, height: 900 });
  const narrowGraph = await page.locator('.canvas-wrap').evaluate(e => { e.scrollLeft = 180; return { width: e.clientWidth, scrollWidth: e.scrollWidth, left: e.scrollLeft }; });
  assert.ok(narrowGraph.scrollWidth > narrowGraph.width && narrowGraph.left > 0);
  assert.ok(await page.locator('html').evaluate(e => e.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: path.join(output, 'graph-narrow.png'), fullPage: true });
  await page.setViewportSize({ width: 1560, height: 1080 });
  await page.getByRole('checkbox', { name: /选择轨迹.*正常样例 1/ }).check();
  await page.getByRole('checkbox', { name: /选择轨迹.*正常样例 2/ }).check();
  await page.getByRole('button', { name: '对比所选轨迹' }).click(); await page.locator('table').waitFor(); assert.equal(await page.locator('table tr').count(), 3);
  await page.screenshot({ path: path.join(output, 'compare.png'), fullPage: true });
  await page.getByRole('button', { name: '候选 Skill', exact: true }).click(); await page.locator('.candidate').first().waitFor();
  assert.ok((await page.locator('.candidate').allTextContents()).join(' ').includes('准入通过'));
  assert.ok((await page.locator('.candidate').allTextContents()).join(' ').includes('已拒绝'));
  const candidate = page.locator('.candidate').filter({hasText:'expense-word-candidate'});
  await candidate.locator('summary').filter({hasText:/^1\./}).first().click();
  await candidate.locator('summary').filter({hasText:'来源标识与哈希'}).first().click();
  assert.ok((await candidate.innerText()).includes('trace_id'));
  await page.screenshot({ path: path.join(output, 'candidates.png'), fullPage: true });
  await page.setViewportSize({ width: 680, height: 900 }); assert.ok(await page.locator('main').evaluate(e => e.getBoundingClientRect().width < 680));
  // Isolated UI fixtures: never written to the live JSONL store.
  await page.evaluate(async()=>{
    const {mountTraceAudit}=await import('/view.mjs');
    const list=await (await fetch('/api/list')).json();
    const id=list.traces.find(t=>t.trace_id).trace_id;
    window.baseTrace=await(await fetch('/api/detail?params='+encodeURIComponent(JSON.stringify({trace_id:id})))).json();
    window.remount=async(mode)=>{
      window.disposeU2?.();const trace=structuredClone(window.baseTrace);trace.summary.source='openclaw';trace.summary.session_key='u2-session';
      if(mode==='empty'){trace.events=[];trace.summary.missing_fields=['run_start','run_end'];trace.summary.trace_status='partial';}
      if(mode==='orphan'){trace.events=trace.events.filter(e=>e.event_type!=='tool.started');trace.summary.missing_fields=['orphan_result'];trace.summary.trace_status='partial';}
      window.u2Calls=[];
      window.disposeU2=mountTraceAudit(document.querySelector('main').shadowRoot,async(method,params)=>{
        u2Calls.push({method,params});return method==='list'?{traces:[trace.summary]}:method==='detail'?trace:{candidates:[]};
      },{sessionKey:mode==='other-session'?'unrelated-session':'u2-session'});
    };
    await window.remount('empty');
  });
  await page.getByText('此轨迹尚无事件。',{exact:false}).waitFor();assert.equal(await page.locator('.event').count(),0);
  await page.evaluate(()=>window.remount('orphan'));
  await page.getByText('工具结果缺少对应的开始事件',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:/^工具调用/}).count(),0);
  await page.screenshot({path:path.join(output,'orphan-isolated.png'),fullPage:true});
  await page.getByRole('searchbox',{name:'搜索轨迹'}).fill('no-matching-u2-task');
  await page.getByText('没有此范围的轨迹。',{exact:false}).waitFor();assert.equal(await page.locator('.event').count(),0);
  await page.evaluate(()=>window.remount('other-session'));
  await page.getByText('尚无轨迹。',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>u2Calls.filter(c=>c.method==='detail').length),0);
  assert.deepEqual(errors, []);
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, checks: ['empty','default_full_graph_nodes_edges_lanes','node_detail','timeline','retry','failure','graph_horizontal_scroll_no_page_overflow','same_task_compare','candidate_provenance','admission_allow_block','responsive','no_page_errors','zero_events_no_fake_nodes','orphan_ineligible','search_reconciles_detail','current_session_only'] }, null, 2));
  console.log(JSON.stringify({ passed: true, screenshots: output }));
} finally { await browser.close(); server.close(); }
