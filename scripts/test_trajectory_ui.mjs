import { createServer } from 'node:http';
import { mkdirSync, cpSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { registerTrajectory } from '../modules/trajectory-governance/register.mjs';

const base = path.resolve('local-validation/trajectory-ui-test');
const root = path.join(base, String(Date.now())); mkdirSync(root, { recursive: true });
cpSync('local-validation/trajectory-holdout/traces', path.join(root, 'traces'), { recursive: true });
cpSync('local-validation/trajectory-admission-probe/candidates', path.join(root, 'candidates'), { recursive: true });
const routes = [];
registerTrajectory({ pluginConfig: { dataDir: root }, logger: { warn() {} }, on() {}, registerHttpRoute: r => routes.push(r) });
const server = createServer(async (req, res) => {
  const route = routes.find(r => r.path === new URL(req.url, 'http://localhost').pathname);
  if (!route) { res.writeHead(404); res.end(); return; }
  if (route.auth === 'gateway' && req.headers.authorization !== 'Bearer ui-test-only') { res.writeHead(401); res.end(); return; }
  await route.handler(req, res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await import(pathToFileURL(path.join(process.env.APPDATA, 'npm/node_modules/openclaw/node_modules/playwright-core/index.mjs')).href);
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/plugins/govagentsec/trajectory-panel`);
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('需要网关认证'));
  await page.fill('#token', 'ui-test-only'); await page.click('#refresh');
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('已读取'));
  assert.ok(await page.locator('#runs button').count() >= 3);
  await page.locator('#runs button').first().click(); await page.waitForSelector('.graph-node');
  assert.ok(await page.locator('.edge-call').count() > 0);
  await page.locator('.graph-node[data-kind="tool"]').first().click();
  assert.ok((await page.locator('#inspector').textContent()).includes('输入'));
  await page.click('#zoom-in'); assert.equal(await page.locator('#graph svg').evaluate(e => e.style.width), '792px');
  await page.click('#zoom-reset');
  await page.fill('#search', 'no-such-task'); assert.equal(await page.locator('#runs button').count(), 0);
  await page.fill('#search', '');
  await page.selectOption('#source', 'openclaw'); assert.equal(await page.locator('#runs button').count(), 0);
  await page.selectOption('#source', 'all');
  await page.getByText('完整事件时间线', { exact: true }).click();
  await page.locator('.timeline summary').first().click();
  assert.ok(await page.locator('.timeline pre').first().textContent());
  await page.getByText('两次运行对照', { exact: true }).click();
  await page.selectOption('#left', { index: 1 }); await page.selectOption('#right', { index: 2 }); await page.click('#compare');
  await page.waitForFunction(() => document.querySelectorAll('#comparison .timeline').length === 2);
  assert.ok((await page.locator('#candidates').textContent()).includes('拒绝'));
  await page.screenshot({ path: path.join(root, 'desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(root, 'mobile.png'), fullPage: true });
  await page.click('#clear-token'); assert.equal(await page.inputValue('#token'), '');
  assert.deepEqual(errors, []);
  const report = { passed: true, checks: ['graph ID pairing', 'node inspector', 'zoom', 'search and source filter', 'gateway auth', 'refresh', 'timeline evidence', 'two-run comparison', 'rejected candidate', 'mobile overflow', 'token clearing', 'no script errors'] };
  writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(path.join(base, 'latest.json'), JSON.stringify({ root, ...report }, null, 2)); console.log(JSON.stringify({ root, ...report }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
