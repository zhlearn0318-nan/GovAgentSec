import { pathToFileURL } from "node:url";
const { chromium } = await import(
  pathToFileURL(
    process.env.APPDATA +
      "/npm/node_modules/openclaw/node_modules/playwright-core/index.mjs",
  ).href
);
import { readFileSync, writeFileSync } from "node:fs";
import { TraceStore } from "../modules/trajectory-governance/trace-store.mjs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const c = JSON.parse(
  readFileSync(process.env.USERPROFILE + "/.openclaw/openclaw.json", "utf8"),
);
const session = process.argv.includes("--reuse")
    ? new TraceStore("local-validation/trajectory/traces")
        .list()
        .find((t) => t.session_key?.includes("gov-workbench-")).session_key
    : "agent:main:dashboard:gov-workbench-" + randomUUID(),
  browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1050 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    "http://127.0.0.1:18789/chat?session=" +
      encodeURIComponent(session) +
      "#token=" +
      encodeURIComponent(c.gateway.auth.token),
  );
  const entry = page.locator("govagentsec-shell"),
    button = entry.getByRole("button", { name: "任务与轨迹", exact: true });
  await button.waitFor({ timeout: 45000 });
  const prompt =
    "这是合成集成测试。请仅调用 agentguard-notices__list_notices 工具，limit=1，查询完成后简短说明结果。不要调用其他工具，不要付款，也不要发起审批。";
  if (!process.argv.includes("--reuse")) {
    const draft = page.locator("textarea").first();
    await draft.fill(prompt);
    await draft.press("Enter");
  }
  const headers = { Authorization: "Bearer " + c.gateway.auth.token };
  let trace;
  for (let i = 0; i < 75; i++) {
    const r = await fetch(
      "http://127.0.0.1:18789/plugins/govagentsec/trajectories",
      { headers, signal: AbortSignal.timeout(5000) },
    );
    const data = await r.json();
    trace = data.traces.find(
      (t) => t.session_key === session && t.trace_status === "complete" && t.title?.startsWith("这是合成集成测试"),
    );
    if (trace) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  assert.ok(
    trace,
    "A completed run must be recorded under the exact session key",
  );
  await button.click();
  const panel = entry.getByRole("region", { name: "任务详情" });
  await panel.locator(".graph-node").first().waitFor();
  assert.equal(
    await panel.getByRole("combobox", { name: "轨迹范围" }).inputValue(),
    "session",
  );
  await panel.getByRole("combobox", {name:"选择任务运行"}).selectOption(trace.trace_id);
  await panel.getByRole("tab", { name: "证据", exact: true }).click();
  await panel
    .getByText("调用 ID 与适配器请求已核对", { exact: true })
    .waitFor({ timeout: 15000 });
  await panel
    .getByText("请求、策略、审批与回执", { exact: true })
    .first()
    .click();
  await page.screenshot({ path: "local-validation/task-live-evidence.png" });
  await panel.getByRole("tab", { name: "过程", exact: true }).click();
  await page.screenshot({ path: "local-validation/task-live-process.png" });
  await panel.getByRole("link", { name: "安全管理", exact: true }).click();
  await page.waitForURL("**/plugin?plugin=protect-agent&id=govagentsec");
  assert.equal(browser.contexts()[0].pages().length, 1, "management stays in the same window");
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    mode: process.argv.includes("--reuse") ? "recheck-existing-live-run" : "new-live-run",
    session_key: session,
    trace_id: trace.trace_id,
    checks: [
      "actual OpenClaw model turn",
      "actual MCP query",
      "session capture",
      "task drawer default scope",
      "verified AgentGuard correlation",
      "management navigation stays in OpenClaw",
      "no script errors",
    ],
  };
  writeFileSync(
    "local-validation/task-live-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
