import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TraceStore } from "../trace-store.mjs";
import { TaskLinks, controlReferences } from "../task-links.mjs";
import { registerTrajectory } from "../register.mjs";
import { createServer } from "node:http";
import {
  resolveApproval,
  readApprovals,
} from "../../agentguard-group2/integrations/openclaw_runtime_security_plugin/index.js";
const temp = () => {
  mkdirSync("local-validation/task-tests", { recursive: true });
  return mkdtempSync("local-validation/task-tests/t-");
};
const requestId = "mcp-req-" + "a".repeat(32);
function fixture(session = "session-a", run = "run-a") {
  const root = temp(),
    store = new TraceStore(path.join(root, "traces"));
  const add = (event_type, payload = {}, more = {}) =>
    store.append({
      event_type,
      payload,
      run_id: run,
      session_key: session,
      seal: false,
      ...more,
    });
  add("run.started", { prompt: "test" });
  add(
    "tool.started",
    { tool: "agentguard-notices__request_test_payment" },
    { tool_call_id: "c1" },
  );
  add(
    "tool.ended",
    {
      tool: "agentguard-notices__request_test_payment",
      result: {
        details: {
          mcpServer: "agentguard-notices",
          mcpTool: "request_test_payment",
          structuredContent: { control_request_id: requestId },
        },
      },
    },
    { tool_call_id: "c1" },
  );
  add("run.ended", { success: true });
  store.seal(store.traceId(run));
  return { root, store, trace: store.read(store.traceId(run)) };
}
test("session identity is persisted; old traces stay unknown and list filtering does not mix sessions", async () => {
  const hooks = {},
    methods = {};
  const store = registerTrajectory({
    pluginConfig: { dataDir: temp() },
    logger: { warn() {} },
    on: (n, h) => (hooks[n] = h),
    registerHttpRoute() {},
    registerGatewayMethod: (n, h) => (methods[n] = h),
  });
  for (const [run, session] of [
    ["a", "s1"],
    ["b", "s2"],
  ]) {
    hooks.before_agent_run(
      { runId: run, prompt: "hello" },
      { sessionKey: session },
    );
    hooks.agent_end({ runId: run, success: true }, { sessionKey: session });
    hooks.llm_output(
      { runId: run, assistantTexts: ["ok"] },
      { sessionKey: session },
    );
  }
  let data;
  await methods["govagentsec.trajectory.list"]({
    params: { session_key: "s1" },
    respond: (_ok, v) => (data = v),
  });
  assert.equal(data.traces.length, 1);
  assert.equal(data.traces[0].run_id, "a");
  const old = store.append({ run_id: "old", event_type: "run.started" });
  assert.equal(store.read(old.trace_id).summary.session_key, null);
});
test("arbitrary tool text or another server cannot forge a control reference", () => {
  const { trace } = fixture();
  assert.equal(controlReferences(trace).length, 1);
  trace.events[2].payload.result.details.mcpServer = "untrusted";
  assert.equal(controlReferences(trace).length, 0);
  trace.events[2].payload.result = {
    content: [
      { type: "text", text: JSON.stringify({ control_request_id: requestId }) },
    ],
  };
  assert.equal(controlReferences(trace).length, 0);
});
test("cross-session or unbacked approval request cannot reach the approval service", async () => {
  const { store, trace } = fixture(),
    links = new TaskLinks(store, {});
  await assert.rejects(
    links.resolve({
      trace_id: trace.summary.trace_id,
      session_key: "other",
      control_request_id: requestId,
      resolution: "approve",
    }),
    /不属于/,
  );
  await assert.rejects(
    links.resolve({
      trace_id: trace.summary.trace_id,
      session_key: "session-a",
      control_request_id: requestId,
      resolution: "approve",
    }),
    /可信关联/,
  );
});
test("stored request must match the exact id and action kind", async () => {
  const { root, store, trace } = fixture();
  const statusPath = path.join(root, "status.json");
  mkdirSync(statusPath + ".requests");
  const ref = controlReferences(trace)[0];
  const links = new TaskLinks(store, {
    plugins: {
      entries: { "agentguard-runtime-security": { config: { statusPath } } },
    },
  });
  writeFileSync(
    path.join(statusPath + ".requests", requestId + ".json"),
    JSON.stringify({
      control_request_id: requestId,
      request: { request_id: requestId, action: { tool: "shell.execute" } },
    }),
  );
  assert.equal(await links.request(ref), null);
});
test("MCP admission links bind config hash and predate execution", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { root, store } = fixture();
  const dbPath = path.join(root, "admission.db");
  const db = new DatabaseSync(dbPath);
  db.exec(
    "CREATE TABLE install_policy_audit(sequence INTEGER PRIMARY KEY,event_id TEXT,created_at TEXT,decision TEXT,reason_code TEXT,source_tree_sha256 TEXT,target_type TEXT,target_name TEXT)",
  );
  const server = { command: "python", args: ["server.py"] },
    links = new TaskLinks(store, {
      mcp: { servers: { "agentguard-notices": server } },
      security: {
        installPolicy: { exec: { env: { AEGIS_OPENCLAW_AUDIT_DB: dbPath } } },
      },
    });
  const capability = links.capability("agentguard-notices__list_notices");
  const insert = db.prepare(
    "INSERT INTO install_policy_audit VALUES(?,?,?,?,?,?,?,?)",
  );
  insert.run(
    1,
    "prior",
    "2026-01-01T00:00:00Z",
    "allow",
    "OK",
    capability.config_sha256,
    "mcp",
    "agentguard-notices",
  );
  insert.run(
    2,
    "future",
    "2030-01-01T00:00:00Z",
    "block",
    "BAD",
    capability.config_sha256,
    "mcp",
    "agentguard-notices",
  );
  db.close();
  const result = await links.admissions({
    events: [
      {
        event_type: "tool.started",
        tool_call_id: "t",
        observed_at: "2026-11-04T00:00:00Z",
        payload: { capability },
      },
    ],
  });
  assert.equal(result.items[0].report.event_id, "prior");
  capability.config_sha256 = "b".repeat(64);
  assert.equal(
    (
      await links.admissions({
        events: [
          {
            event_type: "tool.started",
            observed_at: "2026-11-04T00:00:00Z",
            payload: { capability },
          },
        ],
      })
    ).items[0].report,
    null,
  );
});
test("MCP pending requests merge with approvals; duplicate submissions execute only once and resolved records win", async () => {
  const root = temp(),
    statusPath = path.join(root, "status.json");
  mkdirSync(statusPath + ".requests");
  const pending = {
    control_request_id: requestId,
    status: "pending",
    request: { request_id: requestId, action: { tool: "payment.transfer" } },
  };
  writeFileSync(
    path.join(statusPath + ".requests", requestId + ".json"),
    JSON.stringify(pending),
  );
  let calls = 0;
  const server = createServer((req, res) => {
    calls++;
    req.resume();
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({ status: "rejected", reason_code: "OPERATOR_REJECTED" }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const config = {
    statusPath,
    approvalPath: path.join(root, "approvals.json"),
    agentGuardBaseUrl: `http://127.0.0.1:${server.address().port}`,
  };
  const body = {
    control_request_id: requestId,
    resolution: "reject",
    approver_id: "test-operator",
  };
  try {
    assert.equal((await readApprovals(config))[0].status, "pending");
    const first = resolveApproval(config, body);
    await assert.rejects(resolveApproval(config, body), /正在处理/);
    assert.equal((await first).approval.status, "rejected");
    assert.equal((await readApprovals(config))[0].status, "rejected");
    await assert.rejects(resolveApproval(config, body), /已经处理/);
    assert.equal(calls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
