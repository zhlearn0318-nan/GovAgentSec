import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { installWorkspace } from "./install_openclaw_workspace.mjs";
import { compactPage } from "../modules/govagentsec-ui/compact-page.mjs";
function fixture() {
  mkdirSync("local-validation/workspace-installer-tests", { recursive: true });
  const root = mkdtempSync("local-validation/workspace-installer-tests/t-");
  const dir = path.join(root, "dist/control-ui/assets");
  mkdirSync(dir, { recursive: true });
  const main = path.join(dir, "index-test.js"),
    plugin = path.join(dir, "plugin-page-test.js"),
    index = path.join(root, "dist/control-ui/index.html");
  writeFileSync(main, 'class="shell ${n===`chat` </openclaw-app-topbar>');
  writeFileSync(
    plugin,
    'import{g as i}from"./lit-runtime-test.js";var f={"logbook/logbook":()=>{}}',
  );
  writeFileSync(index, "<html><head></head><body></body></html>");
  return { root, main, plugin, index };
}
test("workspace adaptation binds the real gateway, handles cached assets and restores all three originals", () => {
  const f = fixture();
  const before = [f.main, f.plugin, f.index].map((n) =>
    readFileSync(n, "utf8"),
  );
  assert.equal(installWorkspace(f.root).changed, 3);
  assert.match(readFileSync(f.main, "utf8"), /e.gateway.snapshot.client/);
  assert.match(readFileSync(f.plugin, "utf8"), /protect-agent\/govagentsec/);
  assert.match(readFileSync(f.index, "utf8"), /gov-workspace-cache-2/);
  assert.equal(installWorkspace(f.root).changed, 0);
  installWorkspace(f.root, true);
  assert.deepEqual(
    [f.main, f.plugin, f.index].map((n) => readFileSync(n, "utf8")),
    before,
  );
});
test("unsupported plugin shape fails before modifying the valid shell", () => {
  const f = fixture();
  const before = readFileSync(f.main, "utf8");
  writeFileSync(f.plugin, "unknown version");
  assert.throws(() => installWorkspace(f.root), /Unsupported/);
  assert.equal(readFileSync(f.main, "utf8"), before);
});
test("compact rendering retains forms and execution handlers without adding marketing content", () => {
  const source =
    '<html><head></head><body><button id="install" disabled>Install</button><script>window.test=1</script></body></html>';
  const result = compactPage(source);
  assert.ok(result.includes('<button id="install" disabled>'));
  assert.ok(result.includes("<script>window.test=1</script>"));
  assert.ok(!result.includes("gs-hero"));
  assert.match(result, /data-gov-compact/);
});
