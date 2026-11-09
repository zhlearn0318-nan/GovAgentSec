import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { TraceStore } from '../modules/govagentsec-trace/store.mjs';
import { traceGraph, nodePresentation, graphLanes } from '../modules/govagentsec-trace/view-model.mjs';

const [input, traceId, ...flags] = process.argv.slice(2);
if (!input || !traceId) throw new Error('Usage: node scripts/test_real_call_graph.mjs EVIDENCE_DIR TRACE_ID [--live] [--output=DIR]');
const out = path.resolve(flags.find(f => f.startsWith('--output='))?.slice(9) || 'local-validation/trace-graph-fix'); mkdirSync(out, { recursive: true });
const traceDir = existsSync(path.join(input, 'traces')) ? path.join(input, 'traces') : input;
const trace = new TraceStore(traceDir).read(traceId), expected = traceGraph(trace);
assert.equal(trace.integrity.valid, true); assert.equal(trace.summary.source, 'openclaw');
assert.ok(expected.nodes.length > 0 && expected.edges.length > 0);
const checks = [], errors = [];
const exported = spawnSync(process.execPath, ['scripts/render_real_call_graph.mjs', input, traceId, path.join(out,'export')], {encoding:'utf8',windowsHide:true});
assert.equal(exported.status,0,exported.stderr);
const offline=JSON.parse(readFileSync(path.join(out,'export/call-graph-real.json'),'utf8'));
assert.deepEqual(offline.edges,expected.edges);
assert.deepEqual(offline.nodes,expected.nodes.map(n=>({event_id:n.event_id,...nodePresentation(n)})));
assert.equal(offline.png,true);
assert.equal(readFileSync(path.join(out,'export/call-graph-real.png')).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
const absent = spawnSync(process.execPath,['scripts/render_real_call_graph.mjs',input,'missing-requested-trace',path.join(out,'must-not-exist')],{encoding:'utf8',windowsHide:true});
assert.notEqual(absent.status,0); assert.equal(existsSync(path.join(out,'must-not-exist')),false);
checks.push('offline_png_svg_labels_edges_match_and_unknown_id_fails');
const server = createServer((req, res) => {
  if (req.url === '/trace') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(trace)); return; }
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><meta charset="utf-8"><main></main><script type="module">
      import {mountTraceAudit} from '/view.mjs';
      const trace = await (await fetch('/trace')).json();
      const host=document.querySelector('main'), root=host.attachShadow({mode:'open'});
      window.trace=trace; window.root=root; window.pending=[];
      window.reset = (options={}) => {
        window.cleanup?.(); window.pending=[]; window.mode=options; window.rows=[trace.summary];
        window.cleanup=mountTraceAudit(root, async (method, params={})=> {
          if(method==='list') {
            const result={traces:structuredClone(window.rows)};
            if(window.mode.holdList) return new Promise(resolve=>window.pending.push({kind:'list', resolve:()=>resolve(result)}));
            return result;
          }
          if(method==='candidates') {
            if(window.mode.holdCandidates) return new Promise(resolve=>window.pending.push({kind:'candidates',resolve:()=>resolve({candidates:[]})}));
            return {candidates:[]};
          }
          if(method==='detail') {
            if(params.trace_id==='unavailable') throw Error('test failure');
            if(window.mode.holdDetail) return new Promise((resolve,reject)=>window.pending.push({kind:'detail',resolve:()=>resolve(structuredClone(trace)),reject}));
            return structuredClone(trace);
          }
          throw Error('No writes allowed');
        });
      };
      window.release=(kind)=>{const i=window.pending.findIndex(p=>p.kind===kind);if(i<0)throw Error('no pending '+kind);window.pending.splice(i,1)[0].resolve()};
      window.reset();
    </script>`); return;
  }
  const file = req.url.slice(1);
  if (!['view.mjs', 'view-model.mjs', 'usage.mjs'].includes(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', 'text/javascript'); res.end(readFileSync(new URL('../modules/govagentsec-trace/' + file, import.meta.url)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const host = path.join(process.env.APPDATA, 'npm/node_modules/openclaw');
assert.equal(JSON.parse(readFileSync(path.join(host, 'package.json'), 'utf8')).version, '2026.7.1-2');
const { chromium } = await import(pathToFileURL(path.join(host, 'node_modules/playwright-core/index.mjs')));
let browser;
async function assertGraph(page, graph) {
  await page.locator('.event').first().waitFor();
  assert.deepEqual(await page.locator('.event').evaluateAll(es => es.map(e => e.dataset.eventId)), graph.nodes.map(n => n.event_id));
  assert.deepEqual(await page.locator('.lanes span').allTextContents(), graphLanes);
  assert.deepEqual(await page.locator('.event').evaluateAll(es => es.map(e => Number(e.dataset.lane))), graph.nodes.map(n => n.lane));
  const aligned = await page.locator('.canvas').evaluate(canvas => {
    const headers = [...canvas.querySelectorAll('.lanes span')].map(e => e.getBoundingClientRect());
    return [...canvas.querySelectorAll('.event')].every(e => {
      const r=e.getBoundingClientRect(), h=headers[Number(e.dataset.lane)];
      return Math.abs((r.left+r.right-h.left-h.right)/2)<1;
    });
  });
  assert.equal(aligned,true,'Every event must align with its own lane header');
  assert.deepEqual(await page.locator('.canvas svg path').evaluateAll(es => es.map(e => ({ from:e.dataset.from, to:e.dataset.to, kind:e.dataset.kind }))), graph.edges);
  assert.deepEqual(await page.locator('.event').evaluateAll(es => es.map(e => e.firstChild.textContent)), graph.nodes.map(n => nodePresentation(n).title));
  assert.deepEqual(await page.locator('.event').evaluateAll(es => es.map(e => [...e.querySelectorAll('small')].find(s => s.textContent.includes('token '))?.textContent ?? '')),
    graph.nodes.map(n => nodePresentation(n).tokens));
  const size = await page.locator('.canvas-wrap').evaluate(e => ({ height:e.clientHeight, width:e.clientWidth, scroll:e.scrollHeight }));
  assert.ok(size.height > 100 && size.width > 100 && size.scroll > size.height);
  await page.locator('.event').last().scrollIntoViewIfNeeded();
  assert.ok(await page.locator('.event').last().isVisible());
  await page.locator('.canvas-wrap').evaluate(e => { e.scrollTop = 0; });
}
try {
  browser = await chromium.launch({ channel:'msedge', headless:true });
  const page = await browser.newPage({ viewport:{width:1600,height:1000} });
  await page.route('**/*', route => /^http:\/\/127\.0\.0\.1[:/]/.test(route.request().url()) ? route.continue() : route.abort());
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + server.address().port);
  await assertGraph(page, expected); checks.push('real_evidence_graph_matches_traceGraph');
  await page.screenshot({path:path.join(out,'evidence-ui.png'),fullPage:true});
  await page.getByRole('button',{name:'毫秒时间线',exact:true}).click();
  assert.equal(await page.locator('.timeline li').count(), expected.nodes.length);
  for (const n of expected.nodes.filter(n => n.event_type.startsWith('model.'))) {
    assert.ok((await page.locator(`.timeline-event[data-event-id="${n.event_id}"]`).innerText()).includes(nodePresentation(n).tokens));
  }
  assert.ok((await page.locator('.timeline').innerText()).includes('ALLOW'));
  assert.ok((await page.locator('.timeline').innerText()).includes('MCP / tool'));
  await page.locator('.timeline li').last().scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'timeline.png'),fullPage:true}); checks.push('timeline_labels_and_scroll');
  await page.getByRole('button',{name:'调用关系图',exact:true}).click(); await assertGraph(page, expected);
  await page.locator('.event').first().click();
  await page.locator('.detail summary').click();
  assert.ok((await page.locator('.detail').innerText()).includes('event_hash'));
  checks.push('tab_round_trip_and_details');

  // Regression: a slow refresh started before a user selection must not replace it.
  await page.evaluate(() => {window.mode.holdList=true;});
  await page.getByRole('button',{name:'刷新',exact:true}).click();
  await page.waitForFunction(()=>window.pending.some(p=>p.kind==='list'));
  await page.evaluate(() => {window.mode.holdDetail=true;});
  await page.locator('.trace-row button').first().click();
  await page.getByText('正在加载轨迹…',{exact:true}).waitFor();
  await page.evaluate(()=>window.release('list'));
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>window.pending.filter(p=>p.kind==='detail').length), 1);
  await page.evaluate(()=>window.release('detail')); await assertGraph(page, expected);
  checks.push('late_refresh_does_not_replace_selection');

  // Regression: filter changes must update both the list and detail pane.
  await page.evaluate(() => {window.reset(); window.rows=[{...window.trace.summary,task_key:'task-a'}, {...window.trace.summary,trace_id:'unavailable',title:'故障响应',task_key:'task-b'}];});
  await page.getByRole('button',{name:'刷新',exact:true}).click();
  await page.getByRole('combobox',{name:'按任务筛选'}).selectOption('task-b');
  await page.getByRole('button',{name:'重试加载'}).waitFor();
  assert.equal(await page.locator('.event').count(),0);
  await page.getByRole('combobox',{name:'按任务筛选'}).selectOption('task-a');
  await assertGraph(page,expected); checks.push('filter_reconciles_selection_and_error');

  // A detail callback arriving after unmount must never repopulate a detached/cleared UI.
  await page.evaluate(()=>window.reset({holdDetail:true}));
  await page.waitForFunction(()=>window.pending.some(p=>p.kind==='detail'));
  await page.evaluate(()=>{window.cleanup();window.release('detail');});
  await page.waitForTimeout(100); assert.equal(await page.locator('.event').count(),0);
  checks.push('unmount_ignores_pending_detail');
  await page.evaluate(()=>window.reset()); await assertGraph(page,expected);

  await page.evaluate(()=>{window.mode.holdCandidates=true;});
  await page.getByRole('button',{name:'候选 Skill',exact:true}).click();
  await page.waitForFunction(()=>window.pending.some(p=>p.kind==='candidates'));
  await page.locator('.trace-row button').first().click(); await assertGraph(page,expected);
  await page.getByRole('button',{name:'候选 Skill',exact:true}).click();
  await page.waitForFunction(()=>window.pending.filter(p=>p.kind==='candidates').length===2);
  await page.evaluate(()=>window.release('candidates')); await page.waitForTimeout(100);
  assert.equal(await page.getByText('尚无候选。',{exact:false}).count(),0);
  await page.evaluate(()=>window.release('candidates'));
  await page.getByText('尚无候选。',{exact:false}).waitFor();
  checks.push('stale_tab_response_ignored');
  await page.evaluate(()=>window.reset()); await assertGraph(page,expected);

  await page.evaluate(()=>{window.trace.summary.assessment={source:'UI missing-field test',quality:null,safety:null}; window.reset();});
  await assertGraph(page,expected); checks.push('missing_optional_scores_do_not_blank_graph');
  await page.evaluate(()=>{window.savedEvents=window.trace.events;window.trace.events=[];window.reset();});
  await page.getByText('此轨迹尚无事件。',{exact:false}).waitFor();
  await page.evaluate(()=>{window.trace.events=window.savedEvents;window.reset();});
  await assertGraph(page,expected); checks.push('empty_capture_has_explicit_state');

  // BLOCK labels are a presentation test only; never modify the real evidence or its chain.
  const titles = await page.evaluate(async()=>{
    const {nodePresentation}=await import('/view-model.mjs');
    return [true,false].map(enforced=>nodePresentation({label:'防护判定',event_type:'protection.input',offset_ms:0,state:enforced?'blocked':'risk',payload:{decision:'BLOCK',enforced}}).title);
  });
  assert.match(titles[0],/BLOCK.*已阻断/); assert.match(titles[1],/BLOCK.*仅观察/); checks.push('block_observe_and_enforce_distinguished');
  await page.setViewportSize({width:680,height:900}); await assertGraph(page,expected);
  assert.ok(await page.locator('.canvas-wrap').evaluate(e=>e.scrollWidth>e.clientWidth));
  assert.ok(await page.locator('main').evaluate(e=>e.scrollWidth<=680));
  checks.push('narrow_viewport_lane_scroll_is_contained');

  let live = null;
  if (flags.includes('--live')) {
    const config=JSON.parse(readFileSync(process.env.USERPROFILE+'/.openclaw/openclaw.json','utf8'));
    await page.setViewportSize({width:1600,height:1000});
    await page.goto(`http://127.0.0.1:${config.gateway?.port ?? 18789}/plugin?plugin=protect-agent&id=govagentsec&section=audit#token=`+encodeURIComponent(config.gateway.auth.token));
    const row=page.locator('.trace-row button[data-trace-id="'+traceId+'"]'); await row.waitFor({timeout:30000}); await row.click();
    const detail=await page.locator('openclaw-app-shell').evaluate((e,id)=>e.context.gateway.snapshot.client.request('govagentsec.trace.detail',{trace_id:id}),traceId);
    const liveGraph=traceGraph(detail); await assertGraph(page,liveGraph);
    assert.equal(detail.integrity.valid,true);
    // Live ledger may append task/score annotations. Original evidence must remain an exact prefix.
    assert.deepEqual(detail.events.slice(0,trace.events.length).map(e=>e.event_hash),trace.events.map(e=>e.event_hash));
    await page.screenshot({path:path.join(out,'openclaw-graph.png'),fullPage:true});
    await page.getByRole('button',{name:'毫秒时间线',exact:true}).click();
    assert.equal(await page.locator('.timeline li').count(), liveGraph.nodes.length);
    await page.getByRole('button',{name:'调用关系图',exact:true}).click(); await assertGraph(page,liveGraph);
    live={trace_id:traceId,nodes:liveGraph.nodes.length,edges:liveGraph.edges.length,original_evidence_prefix_matches:true};
    checks.push('actual_openclaw_graph_timeline_and_evidence_prefix');
  }
  assert.deepEqual(errors,[]);
  const report={passed:true,source:'real-openclaw-evidence',trace_id:traceId,nodes:expected.nodes.length,edges:expected.edges.length,offline:{png:true,labels_and_edges_match:true},checks,live,page_errors:errors};
  writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report));
} catch(error) {writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:false,checks,error:error.message,page_errors:errors},null,2)); throw error;}
finally {await browser?.close(); server.close();}
