import { createServer } from 'node:http';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { installHarnessWorkspace, createRuntimeStatus, readActivity } from '../integrations/deepseek-harness/workspace.mjs';

const { chromium } = await import(pathToFileURL(process.env.GOVAGENTSEC_PLAYWRIGHT_MODULE || process.env.APPDATA + '/npm/node_modules/openclaw/node_modules/playwright-core/index.mjs').href);
const routes = new Map(), launcherScripts = [];
const snapshot = { counts: { total: 8, allow: 5, require_approval: 3, deny: 0, executed_isolated: 2 }, evidence: { complete: 7, total: 8 }, requests: [],
  services: { agentguard: { ok: true }, dependencies: { ok: true, payload: { ready: true, dependencies: { identity: { required: true, healthy: false } } } } } };
const runtimeStatus = createRuntimeStatus({ enabled: true, snapshot: async () => snapshot });
const auditDirPrefix = join(tmpdir(), 'harness-settings-audit-');
const auditDir = mkdtempSync(auditDirPrefix);
process.on('exit', () => {
  assert.ok(auditDir.startsWith(auditDirPrefix));
  rmSync(auditDir, { recursive: true, force: true });
});
const auditFile = join(auditDir, 'audit.jsonl');
installHarnessWorkspace({ inject(_deps, apply) { apply({ on(_name, inject) { inject(launcherScripts); }, connection: { fetch: { register(route) { routes.set(route.path, route); } } } }); } },
  { scanRoots: [], runtimeStatus, activity: () => readActivity(auditFile), trajectory: { list: () => [], evolution: () => ({ candidates: [], gates: [] }) } });
let offline = false, serviceReady = true, runtimeReads = 0;
const server = createServer(async (req, res) => {
  if (req.url === '/chat-fixture') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="zh-CN"><body><div role="textbox" aria-label="聊天草稿" contenteditable="true"></div>' + launcherScripts.map(row => '<script>' + row.text + '</script>').join('') + '</body></html>'); return;
  }
  if (req.url === '/api/govagentsec/state') {
    res.setHeader('Content-Type', 'application/json');
    if (offline) { res.writeHead(503); res.end('{}'); return; }
    res.end(JSON.stringify({ version: '1', status: 'allowed', decision: 'ALLOW', riskLevel: 'LOW', riskScore: .1, service: { status: serviceReady ? 'ready' : 'unavailable', mode: 'real' }, steps: ['input', 'policy', 'tools', 'output'].map(id => ({ id, status: 'passed' })) })); return;
  }
  const route = routes.get(req.url);
  if (!route) { res.writeHead(404); res.end(); return; }
  if (req.url.endsWith('/runtime')) { runtimeReads++; if (offline) { res.writeHead(503); res.end('{}'); return; } }
  const response = await route.fetch(new Request('http://localhost' + req.url));
  res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [], checks = [];
mkdirSync('local-validation/harness-settings', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/api/govagentsec/workspace');
  await page.locator('#settings-total').getByText('8', { exact: true }).waitFor();
  assert.equal(await page.locator('#view-title').textContent(), '防护设置');
  assert.deepEqual(await page.locator('[data-page=settings] > article > .section-head > h2').allTextContents(), ['安全总览', '实际防护状态', '配置与维护']);
  assert.equal(await page.locator('.settings-metric').count(), 5);
  assert.equal(await page.locator('.control-path li').count(), 6);
  assert.equal(await page.locator('#settings-deny').textContent(), '0');
  assert.equal(await page.locator('#settings-evidence').textContent(), '7 / 8');
  assert.equal(await page.locator('#settings-allow-note').count(), 1);
  assert.equal(await page.locator('#settings-allow-note').textContent(), '已隔离执行 2 次');
  assert.equal(await page.locator('#component-mcp').textContent(), '未就绪');
  assert.equal(await page.locator('#coverage-input').textContent(), '已启用');
  const bounds = await page.locator('[data-page=settings] > article').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, width: r.width }; }));
  assert(bounds[1].top >= bounds[0].bottom && bounds[2].top >= bounds[1].bottom);
  assert(bounds.every(b => b.left === bounds[0].left && b.width === bounds[0].width));
  await page.screenshot({ path: 'local-validation/harness-settings/settings-fixture.png', fullPage: true });
  checks.push('reference layout, measured statistics, zero counts, and unconfigured business identity');
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}`);
    if (width === 320) await page.screenshot({ path: 'local-validation/harness-settings/settings-320.png', fullPage: true });
  }
  checks.push('no horizontal overflow at 320, 768, 1024, and 1440 pixels');
  for (const view of ['runtime', 'supply', 'trajectory', 'input', 'evolution', 'settings']) {
    await page.locator(`.navigation [data-view=${view}]`).click();
    await page.locator(`[data-page=${view}]`).waitFor({ state: 'visible' });
    assert.equal(await page.locator(`.navigation [data-view=${view}]`).getAttribute('aria-current'), 'page');
  }
  await page.getByRole('link', { name: '查看过程', exact: false }).click();
  await page.locator('[data-page=process]').waitFor({ state: 'visible' });
  await page.goBack();
  await page.locator('[data-page=settings]').waitFor({ state: 'visible' });
  checks.push('all existing routes, process shortcut, browser back, and active navigation');
  await page.locator('.navigation [data-view=runtime]').click();
  const agentGuardTotal = page.locator('#runtime-stats .stat').first().locator('strong');
  await agentGuardTotal.getByText('8', { exact: true }).waitFor();
  for (const [phase, decision] of [['approval', 'REVIEW'], ['tool_gate', 'BLOCK']]) {
    appendFileSync(auditFile, JSON.stringify({ time: new Date().toISOString(), phase, decision }) + '\n');
  }
  const harnessAudit = page.getByRole('table', { name: 'Harness 防护记录' });
  await harnessAudit.getByRole('row', { name: /原生审批请求.*需复核/ }).waitFor({ timeout: 10000 });
  await harnessAudit.getByRole('row', { name: /工具门控.*阻断/ }).waitFor();
  assert.equal(await agentGuardTotal.textContent(), '8');
  await page.setViewportSize({ width: 320, height: 1000 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('.navigation [data-view=settings]').click();
  checks.push('runtime security shows new Harness approval and block records on the next poll, with separate AgentGuard totals');
  const before = runtimeReads;
  offline = true;
  await page.locator('#refresh-settings').click();
  await page.locator('#settings-runtime-note').getByText('运行状态读取失败，请刷新重试。', { exact: true }).waitFor();
  assert(runtimeReads > before);
  assert.equal(await page.locator('#settings-total').textContent(), '—');
  assert.equal(await page.locator('#component-gateway').textContent(), '待核验');
  assert.equal(await page.locator('#coverage-input').textContent(), '状态连接中断');
  assert.equal(await page.locator('#overall').textContent(), '状态连接中断');
  assert.deepEqual(await page.locator('#steps .chip').allTextContents(), ['待核验', '待核验', '待核验', '待核验']);
  assert.equal(await page.locator('#decision').textContent(), '待核验');
  offline = false;
  await page.locator('#refresh-settings').click();
  await page.locator('#settings-total').getByText('8', { exact: true }).waitFor();
  serviceReady = false;
  await page.locator('#refresh-settings').click();
  await page.locator('#connection').getByText('防护服务不可用', { exact: true }).waitFor();
  assert.equal(await page.locator('#overall').textContent(), '防护服务不可用');
  assert.equal(await page.locator('#decision').textContent(), '待核验');
  serviceReady = true;
  await page.locator('#refresh-settings').click();
  await page.locator('#overall').getByText('本次输出检查通过', { exact: true }).waitFor({ state: 'attached' });
  const contrast = await page.evaluate(() => {
    const lum = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => { const x = n / 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }).reduce((a, x, i) => a + x * [.2126, .7152, .0722][i], 0);
    return ['.chip[data-tone=warn]', '.breadcrumb strong'].map(selector => {
      const el = document.querySelector(selector), text = lum(getComputedStyle(el).color); let bg = el;
      while (bg.parentElement && getComputedStyle(bg).backgroundColor === 'rgba(0, 0, 0, 0)') bg = bg.parentElement;
      const background = lum(getComputedStyle(bg).backgroundColor);
      return { selector, ratio: (Math.max(text, background) + .05) / (Math.min(text, background) + .05) };
    });
  });
  assert(contrast.every(row => row.ratio >= 4.5), JSON.stringify(contrast));
  checks.push('unavailable services invalidate stale passes; warning and breadcrumb contrast meets 4.5:1');
  const chat = await browser.newPage({ viewport: { width: 320, height: 900 } });
  await chat.goto(base + '/chat-fixture');
  await chat.getByRole('textbox', { name: '聊天草稿' }).fill('不发送的验收草稿');
  const launcher = chat.getByRole('button', { name: '安全工作区 ↗', exact: true });
  await launcher.click();
  const dialog = chat.getByRole('dialog', { name: 'GovAgentSec 安全工作区', exact: true });
  const box = await dialog.boundingBox();
  assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 900, JSON.stringify(box));
  await chat.frameLocator('iframe[title="安全工作区"]').getByRole('heading', { name: '防护设置', exact: true }).waitFor();
  await chat.frameLocator('iframe[title="安全工作区"]').locator('#back-chat').click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await chat.getByRole('textbox', { name: '聊天草稿' }).innerText(), '不发送的验收草稿');
  await launcher.click();
  await chat.frameLocator('iframe[title="安全工作区"]').locator('#refresh-settings').focus();
  await chat.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await launcher.evaluate(el => el.getRootNode().activeElement === el), true);
  await chat.close();
  checks.push('320px dialog fits width and height; return, Escape, focus restore, and chat draft work');
  await page.keyboard.press('Tab');
  assert(await page.evaluate(() => document.activeElement !== document.body));
  assert.deepEqual(errors, []);
  checks.push('manual refresh, failure clears stale health and counters, recovery, and keyboard access');
  writeFileSync('local-validation/harness-settings/report.json', JSON.stringify({ passed: true, checks, errors }, null, 2));
  console.log(JSON.stringify({ passed: true, checks }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
