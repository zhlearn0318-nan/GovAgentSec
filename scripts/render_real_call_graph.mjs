#!/usr/bin/env node
// Reads local evidence only. The exact requested trace is mandatory; no fallback to another run.
import path from 'node:path';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { TraceStore } from '../modules/govagentsec-trace/store.mjs';
import { traceGraph, nodePresentation, graphLanes } from '../modules/govagentsec-trace/view-model.mjs';

const [input, traceId, output = 'local-validation/trace-call-graph', provenance] = process.argv.slice(2);
let browser;
try {
  if (!input || !traceId) throw new Error('Usage: node scripts/render_real_call_graph.mjs EVIDENCE_DIR TRACE_ID [OUTPUT_DIR]');
  const root = path.resolve(input);
  const traceDir = existsSync(path.join(root, 'traces')) ? path.join(root, 'traces') : root;
  if (!existsSync(traceDir)) throw new Error('Evidence directory does not exist');
  const trace = new TraceStore(traceDir).read(traceId);
  if (!trace.integrity.valid) throw new Error('Hash chain invalid');
  if (trace.summary.source !== 'openclaw') throw new Error('A real OpenClaw trace is required');
  const graph = traceGraph(trace);
  if (!graph.nodes.length) throw new Error('Trace has no events');
  const outDir = path.resolve(output); mkdirSync(outDir, { recursive: true });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const width = 1920, rowHeight = 124, laneWidth = (width - 40) / 5, height = graph.nodes.length * rowHeight + 100;
  const colors = { blocked: '#b94736', failed: '#b94736', risk: '#b5802b', pending: '#b5802b', approved: '#26845e', normal: '#4d8d81' };
  const positions = new Map(graph.nodes.map((n, i) => [n.event_id, { x: 20 + n.lane * laneWidth + laneWidth / 2, y: 90 + i * rowHeight + 50 }]));
  const edges = graph.edges.map(e => {
    const a = positions.get(e.from), b = positions.get(e.to);
    return `<path data-from="${esc(e.from)}" data-to="${esc(e.to)}" data-kind="${e.kind}" d="M ${a.x} ${a.y} L ${b.x} ${b.y}" stroke="${e.kind === 'call' ? '#398c7c' : '#c3d4cd'}" fill="none" stroke-width="${e.kind === 'call' ? 3 : 1.5}" ${e.kind === 'order' ? 'stroke-dasharray="4 5"' : ''}/>`;
  }).join('');
  const nodes = graph.nodes.map((n, i) => {
    const x = 28 + n.lane * laneWidth, y = 90 + i * rowHeight, p = nodePresentation(n);
    const subjects = p.subject.match(/.{1,44}/gu) ?? [''];
    return `<g data-event-id="${esc(n.event_id)}"><title>${esc([p.title, p.subject, p.timing, p.tokens].join('\n'))}</title>
      <rect x="${x}" y="${y}" width="${laneWidth - 16}" height="110" rx="6" fill="#fff" stroke="${colors[n.state]}" stroke-width="2"/>
      <text x="${x + 10}" y="${y + 22}" font-size="14">${esc(p.title)}</text>
      ${subjects.slice(0, 2).map((s, j) => `<text x="${x + 10}" y="${y + 42 + j * 15}" font-size="12" fill="#637570">${esc(s)}</text>`).join('')}
      <text x="${x + 10}" y="${y + 77}" font-size="12" fill="#637570">${esc(p.timing)}</text>
      <text x="${x + 10}" y="${y + 97}" font-size="12" fill="#637570">${esc(p.tokens)}</text></g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Microsoft YaHei UI, sans-serif" fill="#233b37">
    <rect width="100%" height="100%" fill="#fbfdfc"/><text x="24" y="27" font-size="20">${provenance === '--synthetic-upstream' ? '真实宿主 · 合成上游用量回放（非云端实测）' : '真实调用关系图'} · ${esc(traceId)}</text>
    <text x="24" y="46" font-size="12">${graph.nodes.length} 节点 / ${graph.edges.length} 边 · 实线为明确调用关系，虚线为时间顺序</text>
    ${graphLanes.map((name, i) => `<rect x="${20 + i * laneWidth}" y="50" width="${laneWidth}" height="32" fill="#edf4f0"/><text x="${20 + i * laneWidth + laneWidth / 2}" y="72" text-anchor="middle" font-size="14">${esc(name)}</text>`).join('')}
    ${edges}${nodes}</svg>`;
  writeFileSync(path.join(outDir, 'call-graph-real.svg'), svg);
  const html = path.join(outDir, 'call-graph-real.html');
  writeFileSync(html, '<!doctype html><meta charset="utf-8"><title>真实调用关系图</title><body style="margin:0">' + svg + '</body>');
  const summary = { trace_id: traceId, source: trace.summary.source, upstream_source: provenance === '--synthetic-upstream' ? 'synthetic-fixture' : 'unspecified', integrity: trace.integrity, node_count: graph.nodes.length, edge_count: graph.edges.length,
    nodes: graph.nodes.map(n => ({ event_id: n.event_id, ...nodePresentation(n) })), edges: graph.edges, png: false };
  writeFileSync(path.join(outDir, 'call-graph-real.json'), JSON.stringify(summary, null, 2));
  const host = path.join(process.env.APPDATA, 'npm/node_modules/openclaw');
  if (JSON.parse(readFileSync(path.join(host, 'package.json'), 'utf8')).version !== '2026.7.1-2') throw new Error('OpenClaw 2026.7.1-2 required for bundled PNG renderer');
  const { chromium } = await import(pathToFileURL(path.join(host, 'node_modules/playwright-core/index.mjs')));
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width, height: Math.min(height, 1000) } });
  await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
  await page.goto(pathToFileURL(html).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(outDir, 'call-graph-real.png'), fullPage: true });
  summary.png = true;
  writeFileSync(path.join(outDir, 'call-graph-real.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ trace_id: traceId, nodes: graph.nodes.length, edges: graph.edges.length, png: true, outDir }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await browser?.close(); }
