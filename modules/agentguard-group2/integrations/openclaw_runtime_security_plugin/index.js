import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PLUGIN_ID = "agentguard-runtime-security";
const ROUTE_ROOT = "/plugins/agentguard-runtime-security";
const PLUGIN_ROOT = dirname(fileURLToPath(import.meta.url));
const PANEL_PATH = join(PLUGIN_ROOT, "ui", "panel.html");
const MAX_AUDIT_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = 16 * 1024;
const PAGE_TOKEN_TTL_MS = 30 * 60 * 1000;
const pageTokens = new Map();
let approvalMutation = Promise.resolve();

function isLoopbackAddress(value) {
  const address = String(value || "").replace(/^::ffff:/u, "");
  return address === "127.0.0.1" || address === "::1" || address === "localhost";
}

function isAllowedOrigin(req) {
  const origin = String(req.headers?.origin || "");
  if (!origin || origin === "null") return true;
  try {
    const parsed = new URL(origin);
    return ["http:", "https:"].includes(parsed.protocol)
      && parsed.host.toLowerCase() === String(req.headers?.host || "").toLowerCase();
  } catch {
    return false;
  }
}

function writeResponse(res, statusCode, contentType, body, extraHeaders = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body), "utf8");
  res.statusCode = statusCode;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", String(payload.byteLength));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  for (const [name, value] of Object.entries(extraHeaders)) res.setHeader(name, value);
  res.end(payload);
}

function sendJson(res, statusCode, body, extraHeaders = {}) {
  writeResponse(res, statusCode, "application/json; charset=utf-8", JSON.stringify(body), extraHeaders);
}

const SANDBOX_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "null",
  "Vary": "Origin",
};

function safeString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function redact(value, key = "") {
  if (/token|secret|password|api[_-]?key|authorization|^ticket$/iu.test(key)) {
    return value == null ? value : "***REDACTED***";
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  }
  if (typeof value === "string") {
    return value.replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, "***REDACTED_API_KEY***");
  }
  return value;
}

function issuePageToken() {
  const now = Date.now();
  for (const [token, expiresAt] of pageTokens) if (expiresAt <= now) pageTokens.delete(token);
  const token = randomBytes(32).toString("hex");
  pageTokens.set(token, now + PAGE_TOKEN_TTL_MS);
  return token;
}

function validatePageToken(candidate) {
  const token = safeString(candidate);
  const expiresAt = pageTokens.get(token);
  if (!expiresAt || expiresAt <= Date.now()) {
    if (token) pageTokens.delete(token);
    return false;
  }
  return true;
}

async function readJsonBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("请求体超过 16 KiB 限制");
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("请求体必须是 JSON 对象");
  return parsed;
}

async function readJson(path, fallback) {
  if (!path) return fallback;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function approvalPathOf(config) {
  return safeString(config.approvalPath);
}

async function readApprovals(config) {
  const records = await readJson(approvalPathOf(config), []);
  return Array.isArray(records) ? records : [];
}

async function writeApprovals(config, records) {
  const path = approvalPathOf(config);
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(records, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

function mutateApprovals(config, mutator) {
  const operation = approvalMutation.then(async () => {
    const records = await readApprovals(config);
    const value = await mutator(records);
    await writeApprovals(config, records);
    return value;
  });
  approvalMutation = operation.catch(() => {});
  return operation;
}

function publicApproval(record) {
  const request = record?.request || {};
  const action = request.action || {};
  return redact({
    control_request_id: record.control_request_id,
    task_id: request.task_id,
    action_digest: record.action_digest,
    status: record.status,
    tool: action.tool,
    operation: action.operation,
    resource: action.resource,
    parameters: action.parameters || {},
    subject_id: request.subject?.id,
    department: request.subject?.department,
    reason_code: record.reason_code,
    created_at: record.created_at,
    resolved_at: record.resolved_at || null,
    approver_id: record.approver_id || null,
    note: record.note || "",
    executed: Boolean(record.executed),
    receipt: record.receipt || null,
    notification: record.notification || { configured: false, status: "not_configured" },
    history: Array.isArray(record.history) ? record.history : [],
  });
}

function configuredWeChatWebhook(config) {
  const candidate = safeString(config.wechatWebhookUrl || process.env.AGENTGUARD_WECHAT_WEBHOOK_URL);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.hostname !== "qyapi.weixin.qq.com" || url.pathname !== "/cgi-bin/webhook/send" || !url.searchParams.get("key")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function notifyWeChat(config, record) {
  const webhook = configuredWeChatWebhook(config);
  if (!webhook) return { configured: false, status: "not_configured", sent_at: null };
  const action = record.request?.action || {};
  const amount = action.parameters?.amount;
  const summary = amount ? `${action.tool} · ¥${Number(amount).toLocaleString("zh-CN")}` : `${action.tool} · ${action.operation}`;
  const payload = {
    msgtype: "markdown",
    markdown: { content: `**AgentGuard 待审批通知**\n> 请求：${record.control_request_id}\n> 动作：${summary}\n> 状态：REVIEW（已安全暂停）\n请由工作人员登录 OpenClaw 审批中心处理。` },
  };
  const result = await fetchJson(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, 5000);
  const accepted = result.ok && Number(result.payload?.errcode || 0) === 0;
  return { configured: true, status: accepted ? "sent" : "failed", sent_at: new Date().toISOString(), error_code: accepted ? null : safeString(String(result.payload?.errcode ?? result.status), "unavailable") };
}

async function readJsonLines(path) {
  if (!path) return [];
  try {
    const raw = await readFile(path);
    const bounded = raw.byteLength > MAX_AUDIT_BYTES ? raw.subarray(raw.byteLength - MAX_AUDIT_BYTES) : raw;
    let text = bounded.toString("utf8");
    if (raw.byteLength > MAX_AUDIT_BYTES) text = text.slice(text.indexOf("\n") + 1);
    return text.split(/\r?\n/u).filter(Boolean).flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === "object" ? [redact(parsed)] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

async function fetchJson(url, options = {}, timeoutMs = 3000) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    const payload = await response.json();
    return { ok: response.ok, status: response.status, payload: redact(payload) };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : "Unavailable" };
  }
}

function effectOf(event) {
  const result = event?.result && typeof event.result === "object" ? event.result : {};
  const effect = safeString(result.policy_effect).toLowerCase();
  if (["allow", "require_approval", "deny"].includes(effect)) return effect;
  const status = safeString(result.status).toLowerCase();
  if (status === "pending_approval") return "require_approval";
  if (["authorized", "executed_isolated"].includes(status)) return "allow";
  return "deny";
}

function summarizeAudits(events) {
  const enforcement = events.filter((event) => event?.event === "enforcement_decision");
  const byRequest = new Map();
  for (const event of enforcement) {
    const requestId = safeString(event.request_id, "unknown");
    const previous = byRequest.get(requestId) || { request_id: requestId, stages: [] };
    const result = event.result && typeof event.result === "object" ? event.result : {};
    previous.subject_id = safeString(event.subject_id, previous.subject_id || "-");
    previous.task_id = safeString(event.task_id, previous.task_id || "-");
    previous.tool = safeString(event.tool, previous.tool || "-");
    previous.operation = safeString(event.operation, previous.operation || "-");
    previous.parameters = event.parameters || previous.parameters || {};
    previous.policy_effect = effectOf(event);
    previous.status = safeString(result.status, previous.status || "unknown");
    previous.reason_code = safeString(result.reason_code, previous.reason_code || "-");
    previous.policy_reason_codes = Array.isArray(result.policy_reason_codes) ? result.policy_reason_codes : [];
    previous.action_digest = safeString(result.action_digest, previous.action_digest || "");
    previous.receipt = result.receipt || previous.receipt || null;
    previous.stages.push({ status: safeString(result.status, "unknown"), effect: effectOf(event), reason_code: safeString(result.reason_code, "-") });
    byRequest.set(requestId, previous);
  }
  const requests = [...byRequest.values()].reverse();
  const counts = { total: requests.length, allow: 0, require_approval: 0, deny: 0, executed_isolated: 0 };
  for (const request of requests) {
    counts[request.policy_effect] += 1;
    if (request.status === "executed_isolated") counts.executed_isolated += 1;
  }
  const complete = requests.filter((request) => [request.request_id, request.task_id, request.tool, request.operation, request.policy_effect, request.status, request.reason_code].every((item) => safeString(item))).length;
  const timeline = events.slice(-200).reverse().map((event) => {
    const result = event?.result && typeof event.result === "object" ? event.result : {};
    return redact({
      event: safeString(event?.event, "unknown"),
      request_id: safeString(event?.request_id, "-"),
      task_id: safeString(event?.task_id, "-"),
      tool: safeString(event?.tool, "-"),
      operation: safeString(event?.operation, "-"),
      resolution: safeString(event?.resolution, ""),
      approver_id: safeString(event?.approver_id, ""),
      note: safeString(event?.note, ""),
      status: safeString(result.status, "unknown"),
      reason_code: safeString(result.reason_code, "-"),
      policy_effect: safeString(result.policy_effect, ""),
      receipt_id: safeString(result.receipt?.receipt_id, ""),
    });
  });
  const incidents = timeline.filter((item) => ["approval_error", "reconciliation_required"].includes(item.status) || /ERROR|FAILED|UNAVAILABLE/u.test(item.reason_code));
  return { counts, evidence: { complete, total: requests.length, coverage_percent: requests.length ? Math.round(complete * 100 / requests.length) : 0 }, requests: requests.slice(0, 100), timeline, incidents };
}

async function buildSnapshot(config) {
  const baseUrl = safeString(config.agentGuardBaseUrl, "http://127.0.0.1:8080").replace(/\/+$/u, "");
  const [health, ready, version, audits, controlStatuses, approvalRecords] = await Promise.all([
    fetchJson(`${baseUrl}/healthz`), fetchJson(`${baseUrl}/readyz`), fetchJson(`${baseUrl}/version`),
    readJsonLines(safeString(config.auditPath)), readJson(safeString(config.statusPath), []), readApprovals(config),
  ]);
  const auditSummary = summarizeAudits(audits);
  const operatorTimeline = approvalRecords.slice().reverse().map((record) => ({
    event: "operator_approval",
    request_id: safeString(record.control_request_id, "-"),
    task_id: safeString(record.request?.task_id, "-"),
    tool: safeString(record.request?.action?.tool, "-"),
    operation: safeString(record.request?.action?.operation, "-"),
    resolution: safeString(record.status, "pending"),
    approver_id: safeString(record.approver_id, ""),
    note: safeString(record.note, ""),
    status: safeString(record.status, "pending"),
    reason_code: safeString(record.reason_code, "G003_APPROVAL_PENDING"),
    policy_effect: "require_approval",
    receipt_id: safeString(record.receipt?.receipt_id, ""),
  }));
  const timeline = [...operatorTimeline, ...auditSummary.timeline].slice(0, 200);
  const incidents = timeline.filter((item) => item.status === "error" || ["approval_error", "reconciliation_required"].includes(item.status) || /ERROR|FAILED|UNAVAILABLE|D105/u.test(item.reason_code));
  return redact({
    generated_at: new Date().toISOString(), scope: "group2_tool_runtime_governance",
    services: {
      agentguard: health, dependencies: ready, version,
      openclaw_mcp: { ok: Array.isArray(controlStatuses), records: Array.isArray(controlStatuses) ? controlStatuses.length : 0 },
    },
    counts: auditSummary.counts, evidence: auditSummary.evidence, requests: auditSummary.requests,
    approvals: approvalRecords.slice().reverse().map(publicApproval),
    audit_timeline: timeline,
    incidents,
    wechat: { configured: Boolean(configuredWeChatWebhook(config)), mode: "enterprise_wechat_robot_notification" },
    control_requests: Array.isArray(controlStatuses) ? controlStatuses.slice(-100).reverse().map((item) => redact(item)) : [],
    integration: {
      mode: "openclaw-native-plugin", aegis_bridge_contract: "agentguard-runtime-route-v1",
      runtime_route: `${ROUTE_ROOT}/panel`, aegis_route: "/plugins/aegis-security-center/panel", status: "ready_for_coinstallation",
    },
    boundary: {
      included: ["三态策略决策", "人工审批状态", "一次性执行票据", "隔离执行回执", "OpenClaw/MCP受控调用"],
      excluded: ["输入攻击识别", "插件与Skill供应链扫描", "统一评测平台"],
    },
  });
}

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function buildCandidateAction(kind, input = {}) {
  const id = randomUUID().replaceAll("-", "");
  const common = {
    request_id: `ui-req-${id}`, task_id: `ui-task-${id}`, timestamp: new Date().toISOString(),
    context: { source: "openclaw_control_ui", destination_zone: "internal", enforcement_point: "gateway", business_hours: true, repeat_count: 0 },
    approval: {},
  };
  if (kind === "notices") {
    const limit = clampInteger(input.limit, 1, 10, 2);
    return { ...common,
      subject: { id: "demo-office-operator", type: "user", department: "综合办公室", roles: ["office_user"], clearance: 1, mfa: true },
      action: { tool: "database.query", operation: "query", resource: "db://public/notices", parameters: { limit, item_count: limit }, risk_level: "low", data_level: "internal" },
      environment: { sandbox: { enabled: false, profile: "" } },
    };
  }
  if (kind === "payment") {
    const amount = Number(input.amount);
    const payee = safeString(input.payee, "测试商户").slice(0, 64);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) throw new Error("测试金额必须在 0 到 1,000,000 元之间");
    return { ...common,
      subject: { id: "demo-finance-operator", type: "user", department: "财务部", roles: ["finance_operator"], clearance: 2, mfa: true },
      action: { tool: "payment.transfer", operation: "transfer", resource: "erp://payments/test-payee", parameters: { amount, currency: "CNY", payee }, risk_level: "high", data_level: "internal" },
      environment: { sandbox: { enabled: false, profile: "" } },
    };
  }
  if (kind === "command") {
    const command = safeString(input.command, "rm -rf /").slice(0, 200);
    return { ...common,
      subject: { id: "demo-ops-operator", type: "user", department: "运维部", roles: ["ops_engineer"], clearance: 3, mfa: true },
      action: { tool: "shell.execute", operation: "execute", resource: "host://protected-demo", parameters: { command, item_count: 1 }, risk_level: "critical", data_level: "internal" },
      environment: { sandbox: { enabled: true, profile: "gvisor-restricted" } },
    };
  }
  throw new Error("不支持的动作类型");
}

async function evaluateAction(config, body) {
  const baseUrl = safeString(config.agentGuardBaseUrl, "http://127.0.0.1:8080").replace(/\/+$/u, "");
  const request = buildCandidateAction(safeString(body.kind), body.input || {});
  const startedAt = performance.now();
  const result = await fetchJson(`${baseUrl}/invoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) }, 30_000);
  // Policy DENY is intentionally returned as HTTP 4xx by the enforcement
  // service.  It is a successful security decision, not a transport failure.
  if (!result.ok && !(result.payload && typeof result.payload === "object" && result.payload.status)) {
    throw new Error(result.payload?.message || result.error || `AgentGuard 返回 HTTP ${result.status}`);
  }
  let notification = null;
  if (result.payload?.status === "pending_approval") {
    const record = {
      control_request_id: request.request_id,
      action_digest: safeString(result.payload.action_digest),
      status: "pending",
      reason_code: safeString(result.payload.reason_code, "G003_APPROVAL_PENDING"),
      created_at: new Date().toISOString(),
      request,
      executed: false,
      history: [{ at: new Date().toISOString(), action: "submitted", actor: request.subject.id, note: "策略要求人工复核" }],
    };
    notification = await notifyWeChat(config, record);
    record.notification = notification;
    await mutateApprovals(config, (records) => {
      const index = records.findIndex((item) => item.control_request_id === record.control_request_id);
      if (index >= 0) records[index] = record; else records.push(record);
    });
  }
  return redact({ request_id: request.request_id, task_id: request.task_id, action: request.action, result: result.payload, notification, duration_ms: Number((performance.now() - startedAt).toFixed(2)) });
}

async function resolveApproval(config, body) {
  const controlRequestId = safeString(body.control_request_id);
  const resolution = safeString(body.resolution).toLowerCase();
  const approverId = safeString(body.approver_id).slice(0, 80);
  const note = safeString(body.note).slice(0, 500);
  if (!controlRequestId || !["approve", "reject", "interrupt"].includes(resolution)) throw new Error("审批请求或处理动作无效");
  if (!approverId) throw new Error("请填写审批人员姓名或工号");
  const records = await readApprovals(config);
  const record = records.find((item) => item.control_request_id === controlRequestId);
  if (!record) throw new Error("没有找到对应审批请求");
  if (record.status !== "pending") throw new Error("该审批请求已经处理，不能重复操作");
  const baseUrl = safeString(config.agentGuardBaseUrl, "http://127.0.0.1:8080").replace(/\/+$/u, "");
  const response = await fetchJson(`${baseUrl}/approvals/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request: record.request, resolution, approver_id: approverId, approver_roles: ["business_approver"], note }),
  }, 30_000);
  if (!response.payload || typeof response.payload !== "object") throw new Error(response.error || `审批服务返回 HTTP ${response.status}`);
  const result = response.payload;
  const successfulApproval = resolution === "approve" && result.status === "executed_isolated";
  const newStatus = successfulApproval ? "approved_executed"
    : resolution === "reject" && result.status === "rejected" ? "rejected"
      : resolution === "interrupt" && result.status === "interrupted" ? "interrupted" : "error";
  const updated = await mutateApprovals(config, (items) => {
    const index = items.findIndex((item) => item.control_request_id === controlRequestId);
    if (index < 0) throw new Error("审批请求在处理期间消失");
    const current = items[index];
    items[index] = {
      ...current,
      status: newStatus,
      reason_code: safeString(result.reason_code, "A500_UNKNOWN"),
      resolved_at: new Date().toISOString(),
      approver_id: approverId,
      note,
      executed: Boolean(result.receipt),
      receipt: result.receipt || null,
      history: [...(Array.isArray(current.history) ? current.history : []), { at: new Date().toISOString(), action: newStatus, actor: approverId, note, reason_code: result.reason_code }],
    };
    return publicApproval(items[index]);
  });
  return { approval: updated, result: redact(result), http_status: response.status };
}

async function resendApprovalNotification(config, body) {
  const controlRequestId = safeString(body.control_request_id);
  const records = await readApprovals(config);
  const record = records.find((item) => item.control_request_id === controlRequestId);
  if (!record || record.status !== "pending") throw new Error("只有待审批请求可以发送提醒");
  const notification = await notifyWeChat(config, record);
  await mutateApprovals(config, (items) => {
    const index = items.findIndex((item) => item.control_request_id === controlRequestId);
    if (index >= 0) items[index] = { ...items[index], notification, history: [...(items[index].history || []), { at: new Date().toISOString(), action: "wechat_notification", actor: "system", note: notification.status }] };
  });
  return notification;
}

async function handler(req, res, config) {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) { sendJson(res, 403, { status: "forbidden" }); return true; }
  if (!isAllowedOrigin(req)) { sendJson(res, 403, { status: "forbidden", message: "不允许的浏览器来源" }); return true; }
  const requestUrl = new URL(req.url || ROUTE_ROOT, "http://127.0.0.1");
  const method = String(req.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    writeResponse(res, 204, "text/plain; charset=utf-8", "", { ...SANDBOX_CORS_HEADERS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, X-AgentGuard-Page-Token", "Access-Control-Max-Age": "300" });
    return true;
  }
  if (method === "GET" && (requestUrl.pathname === `${ROUTE_ROOT}/panel` || requestUrl.pathname === `${ROUTE_ROOT}/`)) {
    const html = (await readFile(PANEL_PATH, "utf8")).replaceAll("__AGENTGUARD_PAGE_TOKEN__", issuePageToken());
    writeResponse(res, 200, "text/html; charset=utf-8", html, {
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    });
    return true;
  }
  if (method === "GET" && requestUrl.pathname === `${ROUTE_ROOT}/api/bootstrap`) {
    sendJson(res, 200, {
      ok: true,
      page_token: issuePageToken(),
      expires_in_seconds: Math.floor(PAGE_TOKEN_TTL_MS / 1000),
    }, SANDBOX_CORS_HEADERS);
    return true;
  }
  if (method === "GET" && requestUrl.pathname === `${ROUTE_ROOT}/api/snapshot`) { sendJson(res, 200, await buildSnapshot(config), SANDBOX_CORS_HEADERS); return true; }
  if (method === "GET" && requestUrl.pathname === `${ROUTE_ROOT}/api/evidence`) {
    writeResponse(res, 200, "application/json; charset=utf-8", JSON.stringify(await buildSnapshot(config), null, 2), {
      "Content-Disposition": `attachment; filename="AgentGuard-runtime-evidence-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    return true;
  }
  if (method === "POST" && requestUrl.pathname === `${ROUTE_ROOT}/api/evaluate`) {
    if (!validatePageToken(req.headers?.["x-agentguard-page-token"])) {
      sendJson(res, 403, { ok: false, error: { code: "PAGE_TOKEN_INVALID", message: "页面令牌无效或已过期，请刷新页面" } }, SANDBOX_CORS_HEADERS);
      return true;
    }
    try { sendJson(res, 200, { ok: true, data: await evaluateAction(config, await readJsonBody(req)) }, SANDBOX_CORS_HEADERS); }
    catch (error) { sendJson(res, 400, { ok: false, error: { code: "EVALUATION_FAILED", message: String(error?.message || error).slice(0, 500) } }, SANDBOX_CORS_HEADERS); }
    return true;
  }
  if (method === "POST" && requestUrl.pathname === `${ROUTE_ROOT}/api/approvals/resolve`) {
    if (!validatePageToken(req.headers?.["x-agentguard-page-token"])) {
      sendJson(res, 403, { ok: false, error: { code: "PAGE_TOKEN_INVALID", message: "页面令牌无效或已过期，请刷新页面" } }, SANDBOX_CORS_HEADERS);
      return true;
    }
    try { sendJson(res, 200, { ok: true, data: await resolveApproval(config, await readJsonBody(req)) }, SANDBOX_CORS_HEADERS); }
    catch (error) { sendJson(res, 400, { ok: false, error: { code: "APPROVAL_ACTION_FAILED", message: String(error?.message || error).slice(0, 500) } }, SANDBOX_CORS_HEADERS); }
    return true;
  }
  if (method === "POST" && requestUrl.pathname === `${ROUTE_ROOT}/api/approvals/notify`) {
    if (!validatePageToken(req.headers?.["x-agentguard-page-token"])) {
      sendJson(res, 403, { ok: false, error: { code: "PAGE_TOKEN_INVALID", message: "页面令牌无效或已过期，请刷新页面" } }, SANDBOX_CORS_HEADERS);
      return true;
    }
    try { sendJson(res, 200, { ok: true, data: await resendApprovalNotification(config, await readJsonBody(req)) }, SANDBOX_CORS_HEADERS); }
    catch (error) { sendJson(res, 400, { ok: false, error: { code: "WECHAT_NOTIFY_FAILED", message: String(error?.message || error).slice(0, 500) } }, SANDBOX_CORS_HEADERS); }
    return true;
  }
  sendJson(res, 404, { status: "not_found" });
  return true;
}

const plugin = {
  id: PLUGIN_ID, name: "AgentGuard 运行时安全中心", description: "第二组工具调用和任务执行安全控制面",
  register(api) {
    const config = api.pluginConfig && typeof api.pluginConfig === "object" ? api.pluginConfig : {};
    api.registerHttpRoute({ path: ROUTE_ROOT, match: "prefix", auth: "plugin", handler: (req, res) => handler(req, res, config) });
  },
};

export { buildCandidateAction, buildSnapshot, configuredWeChatWebhook, isAllowedOrigin, isLoopbackAddress, publicApproval, summarizeAudits };
export default plugin;
