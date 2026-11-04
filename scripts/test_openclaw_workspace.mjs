import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = await import(
  pathToFileURL(
    process.env.APPDATA +
      "/npm/node_modules/openclaw/node_modules/playwright-core/index.mjs",
  ).href
);
const cfg = JSON.parse(
  readFileSync(process.env.USERPROFILE + "/.openclaw/openclaw.json", "utf8"),
);
const browser = await chromium.launch({ channel: "msedge", headless: true });
mkdirSync("local-validation/workspace-ui", { recursive: true });
const checks = [];
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 960 },
      timezoneId: "Asia/Shanghai",
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    "http://127.0.0.1:18789/plugin?plugin=protect-agent&id=govagentsec#token=" +
      encodeURIComponent(cfg.gateway.auth.token),
  );
  const work = page.locator("govagentsec-workspace"),
    shell = page.locator("govagentsec-shell"),
    entry = shell.getByRole("button", { name: "任务与轨迹", exact: true });
  await work
    .getByRole("heading", { name: "最近任务", exact: true })
    .waitFor({ timeout: 60000 });
  await page.locator(".gov-nav").waitFor();
  assert.equal(await work.locator("iframe").count(), 0);
  assert.ok(await entry.isVisible());
  assert.ok(
    await work
      .locator(".workspace-footer")
      .evaluate((e) => e.getBoundingClientRect().bottom <= innerHeight + 2),
  );
  checks.push("native single-screen home without marketing or nested iframe");
  await page.screenshot({ path: "local-validation/workspace-ui/home.png" });
  await work.locator(".task-row").first().click();
  const drawer = shell.getByRole("region", { name: "任务详情" });
  await drawer.locator(".graph-node").first().waitFor();
  assert.ok(await entry.isVisible());
  await page.screenshot({ path: "local-validation/workspace-ui/task.png" });
  await page.keyboard.press("Escape");
  assert.equal(await drawer.isVisible(), false);
  checks.push(
    "task evidence opens from a row; entry remains visible; Escape closes",
  );
  for (const [key, title] of [
    ["admission", "能力接入"],
    ["approvals", "待审批"],
    ["audit", "任务轨迹"],
    ["home", "工作台"],
  ]) {
    await page.locator(`.gov-nav [data-route=${key}]`).click();
    await work.getByRole("heading", { name: title, exact: true }).waitFor();
    assert.ok(await entry.isVisible());
  }
  checks.push("persistent entry across all four primary routes");
  await page.goBack();
  await work.getByRole("heading", { name: "任务轨迹", exact: true }).waitFor();
  await page.goForward();
  await work.getByRole("heading", { name: "工作台", exact: true }).waitFor();
  checks.push("browser back and forward");
  await page.locator(".gov-nav [data-route=admission]").click();
  await work.locator("iframe").waitFor();
  const mode = await page
    .locator("openclaw-app-shell")
    .evaluate((e) => e.context.config.current.embedSandboxMode);
  assert.equal(
    await work.locator("iframe").getAttribute("sandbox"),
    mode === "trusted"
      ? "allow-scripts allow-same-origin"
      : mode === "strict"
        ? ""
        : "allow-scripts",
  );
  const upload = work.frameLocator("iframe");
  await upload.locator("#zip-label").waitFor();
  assert.equal(await upload.locator(".product-header").isVisible(), false);
  assert.equal(await upload.locator(".aegis-center-nav").isVisible(), false);
  assert.ok(await upload.locator("#scan-button").isVisible());
  await page.screenshot({
    path: "local-validation/workspace-ui/admission.png",
  });
  await work.getByRole("button", { name: "MCP 接入", exact: true }).click();
  await work
    .frameLocator("iframe")
    .locator("#form")
    .waitFor({ timeout: 20000 });
  await page.screenshot({ path: "local-validation/workspace-ui/mcp.png" });
  checks.push("direct Skill/MCP forms; original iframe sandbox preserved");
  await work.getByRole("button", { name: "检查报告", exact: true }).click();
  await work.frameLocator("iframe").locator(".report-register").waitFor();
  checks.push("reports reachable in one click");
  await work.getByRole("button", { name: "返回对话", exact: true }).click();
  await page.locator("openclaw-chat-pane textarea").first().waitFor();
  const draft = page.locator("openclaw-chat-pane textarea").first();
  const old = await draft.inputValue();
  await draft.fill("原生工作区草稿测试，不发送");
  await entry.click();
  await drawer.waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await draft.inputValue(), "原生工作区草稿测试，不发送");
  await draft.fill(old);
  checks.push("chat draft preserved");
  await page.getByRole("button", { name: "折叠侧边栏", exact: true }).click();
  assert.ok(await entry.isVisible());
  await entry.click();
  assert.ok(await drawer.isVisible());
  await page.keyboard.press("Escape");
  checks.push("entry survives collapsed sidebar");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await entry.isVisible());
  assert.ok(
    await entry.evaluate((e) => {
      const r = e.getBoundingClientRect();
      return r.x >= 0 && r.right <= innerWidth && r.y >= 0;
    }),
  );
  await entry.click();
  assert.ok(
    await drawer.evaluate((e) => e.getBoundingClientRect().width <= innerWidth),
  );
  await page.waitForFunction(
    () =>
      !document
        .querySelector("govagentsec-shell")
        .body.shadowRoot.querySelector("[role=status]")
        .textContent.includes("读取任务"),
  );
  await page.screenshot({ path: "local-validation/workspace-ui/mobile.png" });
  await page.keyboard.press("Escape");
  checks.push("mobile visible entry and full-width inspector");
  // Warm an old cache entry, then verify the index migration replaces the stale shell.
  await page.evaluate(async () => {
    const script = [...document.scripts].find(
      (s) => s.type === "module" && s.src.includes("/assets/index-"),
    );
    const cache = await caches.open("openclaw-control-workspace-test");
    await cache.put(
      script.src,
      new Response("/* stale shell: no application */", {
        headers: { "Content-Type": "text/javascript" },
      }),
    );
    sessionStorage.removeItem("gov-workspace-cache-2");
  });
  await page.reload();
  await page
    .locator("govagentsec-shell .inspect:not([disabled])")
    .waitFor({ timeout: 45000 });
  checks.push("old cached shell replaced on reload");
  assert.deepEqual(errors, []);
  checks.push("no script errors");
  writeFileSync(
    "local-validation/workspace-ui/report.json",
    JSON.stringify({ passed: true, checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, checks }));
} finally {
  await browser.close();
}
