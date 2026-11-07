import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const config = JSON.parse(readFileSync(process.env.USERPROFILE + '/.openclaw/openclaw.json', 'utf8'));
const { chromium } = await import(pathToFileURL(process.env.APPDATA + '/npm/node_modules/openclaw/node_modules/playwright-core/index.mjs'));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:18789/plugin?plugin=protect-agent&id=govagentsec&section=audit#token=' + encodeURIComponent(config.gateway.auth.token));
  await page.getByRole('button', {name:'对比所选轨迹',exact:true}).waitFor({timeout:60000});
  const health = await page.locator('openclaw-app-shell').evaluate(e => e.context.gateway.snapshot.client.request('govagentsec.trace.health', {}));
  assert.equal(health.available, true); assert.equal(health.content_mode, 'hash'); assert.equal(health.version, '2026.7.1-2');
  await page.getByRole('checkbox', {name:'包含本地合成测试'}).check();
  await page.locator('.trace-row button').filter({hasText:'正常样例 1'}).click();
  await page.locator('.event').first().waitFor();
  const coverage = await page.locator('openclaw-app-shell').evaluate(e => e.context.gateway.snapshot.client.request('govagentsec.trajectory.status', {}));
  assert.equal(coverage.runtime.input.mode, 'enforce'); assert.equal(coverage.runtime.tool_results.mode, 'enforce');
  assert.equal(coverage.agentguard_identity_mode, 'disabled');
  assert.ok((await page.locator('.metrics').innerText()).includes('输出 80'));
  const folder = 'local-validation/trace-live'; mkdirSync(folder, {recursive:true});
  await page.screenshot({path:folder+'/openclaw-audit.png', fullPage:true});
  const anonymous = await fetch('http://127.0.0.1:18789/plugins/govagentsec/trajectories'); assert.equal(anonymous.status,401);
  assert.deepEqual(errors, []);
  const result = {passed:true,health,coverage:{input:coverage.runtime.input.mode,tool_results:coverage.runtime.tool_results.mode,identity:coverage.agentguard_identity_mode},anonymous_status:anonymous.status,model_calls:0};
  writeFileSync(folder+'/result.json', JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
} catch(e) { console.error(String(e.stack).replaceAll(config.gateway.auth.token,'[REDACTED]')); process.exitCode=1; }
finally { await browser.close(); }
