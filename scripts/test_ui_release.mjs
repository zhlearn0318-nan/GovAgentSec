import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Script } from 'node:vm';
import { brandPage } from '../modules/govagentsec-ui/design.mjs';
import { renderGovAgentSecPanel, renderProtectAgentPanel } from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/suite-pages.mjs';

test('branded hub keeps navigable module targets and executable inline scripts', () => {
  const html = brandPage(renderGovAgentSecPanel(), 'hub');
  for (const name of ['protect', 'agentguard', 'aegis']) {
    assert.ok(html.includes(`data-gov-view="${name}"`));
    assert.ok(html.includes(`data-open-module="${name}"`));
  }
  assert.ok(!html.includes('data-gov-view="assessment"'));
  assert.ok(html.includes('id="module-frame"'));
  for (const [, source] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    new Script(source);
  }
  assert.equal(brandPage(html, 'hub'), html);
});

test('fresh checkout renders without the locally downloaded font', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'govagentsec-ui-'));
  try {
    cpSync(new URL('../modules/govagentsec-ui/', import.meta.url), folder, {
      recursive: true, filter: source => !String(source).endsWith('.woff2'),
    });
    const { brandPage: freshBrand } = await import(pathToFileURL(join(folder, 'design.mjs')).href);
    const html = freshBrand(renderProtectAgentPanel(), 'protect');
    assert.ok(html.includes('data-gov-kind="protect"'));
    assert.ok(!html.includes('data:font/woff2;base64,'));
    assert.ok(html.includes('id="steps"'));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
