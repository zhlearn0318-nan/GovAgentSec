import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { TraceStore } from "../modules/trajectory-governance/trace-store.mjs";
import { registerTrajectory } from "../modules/trajectory-governance/register.mjs";
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  pathToFileURL(
    process.env.APPDATA +
      "/npm/node_modules/openclaw/node_modules/playwright-core/index.mjs",
  ).href
);
const root = path.resolve("local-validation/task-workbench-integration"),
  data = path.join(root, "data-" + Date.now());
mkdirSync(data, { recursive: true });
const requests = JSON.parse(
  readFileSync(path.join(root, "requests.json"), "utf8"),
);
const config = {
  plugins: {
    entries: {
      "govagentsec-trajectory": { enabled: true },
      "agentguard-runtime-security": {
        enabled: true,
        config: {
          agentGuardBaseUrl: "http://127.0.0.1:8080",
          statusPath: path.join(root, "statuses.json"),
          approvalPath: path.join(data, "approvals.json"),
          auditPath: path.resolve(
            "modules/agentguard-group2/live-runtime/state/enforcement_audit.jsonl",
          ),
        },
      },
    },
  },
};
const routes = [],
  methods = {};
const store = registerTrajectory({
  config,
  pluginConfig: { dataDir: data },
  logger: { warn() {} },
  on() {},
  registerHttpRoute: (r) => routes.push(r),
  registerGatewayMethod: (n, h, o) => (methods[n] = { h, o }),
});
function seed(run, session, entries) {
  let last;
  const emit = (event_type, payload = {}, extra = {}) =>
    (last = store.append({
      event_type,
      payload,
      source: "integration-test",
      run_id: run,
      session_key: session,
      seal: false,
      ...extra,
    }));
  emit("run.started", { prompt: run });
  for (const [tool, output] of entries) {
    const id = tool + "-call";
    emit(
      "tool.started",
      { tool: "agentguard-notices__" + tool, params: { test: true } },
      { tool_call_id: id },
    );
    emit(
      "tool.ended",
      {
        tool: "agentguard-notices__" + tool,
        result: {
          details: {
            mcpServer: "agentguard-notices",
            mcpTool: tool,
            structuredContent: output,
          },
        },
      },
      { tool_call_id: id },
    );
  }
  emit("run.ended", { success: true });
  store.seal(last.trace_id);
  return last.trace_id;
}
const main = seed(
  "集成测试：查询、审批与阻断",
  "session-one",
  Object.entries(requests),
);
seed("另一个会话的任务", "session-two", []);
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/test") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      `<html><body><textarea aria-label="聊天草稿"></textarea><govagentsec-chat-traces></govagentsec-chat-traces><script type="module">import{defineChatEntry}from'/plugins/govagentsec/trajectory-native.mjs';defineChatEntry();const e=document.querySelector('govagentsec-chat-traces');e.enabled=true;e.sessionKey='session-one';e.client={request:async(method,params)=>{const r=await fetch('/rpc',{method:'POST',body:JSON.stringify({method,params})});const d=await r.json();if(!d.ok)throw Error(d.error.message);return d.data}};</script></body></html>`,
    );
    return;
  }
  if (url.pathname === "/rpc") {
    let raw = "";
    for await (const c of req) raw += c;
    const p = JSON.parse(raw);
    const method = methods[p.method];
    if (!method) {
      res.writeHead(404);
      res.end();
      return;
    }
    await method.h({
      params: p.params,
      respond: (ok, data, error) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok, data, error }));
      },
    });
    return;
  }
  const route = routes.find((r) => r.path === url.pathname);
  if (route) await route.handler(req, res);
  else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1050 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/test`);
  const entry = page.locator("govagentsec-chat-traces");
  await page.getByRole("textbox", { name: "聊天草稿" }).fill("保留我的草稿");
  await entry.getByRole("button", { name: "任务与轨迹", exact: true }).click();
  const panel = entry.getByRole("region", { name: "任务详情" });
  await panel.locator(".graph-node").first().waitFor();
  const selectedNode = await panel.locator(".graph-node").nth(1).elementHandle();
  await selectedNode.click();
  const refreshed = page.waitForResponse(response =>
    response.url().endsWith('/rpc') && response.request().postDataJSON().method === 'govagentsec.trajectory.task');
  await panel.getByRole('button', {name:'刷新', exact:true}).click();
  await (await refreshed).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await selectedNode.evaluate(node => node.isConnected && node.classList.contains('selected')), true);
  assert.equal(
    await panel
      .getByRole("combobox", { name: "选择任务运行" })
      .locator("option")
      .count(),
    1,
  );
  await panel.getByRole("tab", { name: "风险与审批" }).click();
  await panel
    .getByRole("button", { name: "批准并执行", exact: true })
    .waitFor();
  assert.equal(
    await panel
      .getByText("输入与最终回复的对话钩子尚未授权，不能视为已经检查。", {
        exact: true,
      })
      .count(),
    1,
  );
  await panel
    .getByRole("textbox", { name: "审批人员", exact: true })
    .fill("integration-test-operator");
  await panel
    .getByRole("textbox", { name: "审批意见", exact: true })
    .fill("合成测试付款，不涉及真实资金");
  await panel.getByRole("button", { name: "批准并执行", exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("govagentsec-chat-traces")
        .body.shadowRoot.textContent.includes("已批准并执行"),
    {},
    { timeout: 20000 },
  );
  await panel.getByRole("tab", { name: "证据", exact: true }).click();
  assert.ok(
    (await panel
      .getByText("调用 ID 与适配器请求已核对", { exact: true })
      .count()) > 0,
  );
  await panel
    .getByText("请求、策略、审批与回执", { exact: true })
    .nth(1)
    .click();
  await page.screenshot({ path: path.join(root, "approved-evidence.png") });
  await panel.getByRole("combobox", { name: "轨迹范围" }).selectOption("all");
  await page.waitForFunction(
    () =>
      document
        .querySelector("govagentsec-chat-traces")
        .body.shadowRoot.querySelector(".runs").options.length === 2,
  );
  await panel
    .getByRole("combobox", { name: "轨迹范围" })
    .selectOption("session");
  await page.waitForFunction(
    () =>
      document
        .querySelector("govagentsec-chat-traces")
        .body.shadowRoot.querySelector(".runs").options.length === 1,
  );
  await entry.getByRole("button", { name: "关闭面板" }).click();
  assert.equal(
    await page.getByRole("textbox", { name: "聊天草稿" }).inputValue(),
    "保留我的草稿",
  );
  const approval = JSON.parse(
    readFileSync(path.join(data, "approvals.json"), "utf8"),
  )[0];
  assert.equal(approval.status, "approved_executed");
  assert.ok(approval.receipt);
  assert.deepEqual(errors, []);
  const report = {
    passed: true,
    trace_id: main,
    scope:
      "real local AgentGuard requests and approval; synthetic host event fixtures, not an OpenClaw model turn",
    checks: [
      "session filter",
      "three decisions",
      "trusted request matching",
      "in-panel approval",
      "actual execution receipt",
      "history switch",
      "draft preserved",
      "no script errors",
    ],
  };
  writeFileSync(
    path.join(root, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
