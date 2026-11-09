import { readFile } from "node:fs/promises";

// Both the host adapter and plugins use this process-local registry. No prompts,
// results, session keys or credentials are exposed by its snapshot function.
export const PROTECTION_RUNTIME = Symbol.for("govagentsec.protection.runtime");
export const RESULT_GATE_VERSION = 1;

export function controlledDocumentDenial(result, ctx, hostConfig) {
  // Only the host-bound managed tool can supply this verdict. Never parse tool text.
  const server = hostConfig?.mcp?.servers?.['agentguard-notices'];
  const details = result?.details, control = details?.structuredContent;
  // U7b: a host-bound notification denial is authoritative even if the text
  // classifier says ALLOW. Ordinary tool errors and pending approvals differ.
  if (server && server.enabled !== false && ctx?.toolName === 'agentguard-notices__submit_emergency_notice'
    && details?.mcpServer === 'agentguard-notices' && details?.mcpTool === 'submit_emergency_notice'
    && control?.status === 'blocked' && control.executed === false
    && /^mcp-req-[a-f0-9]{32}$/.test(control.control_request_id ?? '')
    && /^(?:G|P|S|MCP_G)\d{3}_[A-Z0-9_]+$/.test(control.reason_code ?? ''))
    return {decision:'BLOCK',riskLevel:'HIGH',reasonCode:control.reason_code,categories:['agentguard_notification_access']};
  if (!server || server.enabled === false || ctx?.toolName !== 'agentguard-notices__read_gov_document'
    || details?.mcpServer !== 'agentguard-notices' || details?.mcpTool !== 'read_gov_document'
    || control?.status !== 'blocked' || control.executed !== false
    || !/^mcp-req-[a-f0-9]{32}$/.test(control.control_request_id ?? '')
    || control.reason_code !== 'G002_POLICY_DENY' || !Array.isArray(control.policy_reason_codes)) return null;
  const reason = ['D004_CLEARANCE_INSUFFICIENT', 'D005_PROTECTED_RESOURCE'].find(code => control.policy_reason_codes.includes(code));
  return reason ? {decision:'BLOCK',riskLevel:'HIGH',reasonCode:reason,categories:['agentguard_document_access']} : null;
}

function runtime() {
  return globalThis[PROTECTION_RUNTIME] ??= { bridgeVersion: 0 };
}

export function activateToolResultGate() {
  runtime().bridgeVersion = RESULT_GATE_VERSION;
}

export function withheldToolResult(reason = { kind: "check_unavailable", reasonCode: "CHECK_UNAVAILABLE", message: "安全检查暂不可用，工具返回内容已隔离。" }) {
  return {
    isError: true,
    content: [{ type: "text", text: `Protect Agent：${reason.message} 请查看对话中的防护提示。` }],
    details: { govagentsec: { decision: reason.decision ?? "UNAVAILABLE", kind: reason.kind, reasonCode: reason.reasonCode, withheld: true } },
  };
}

export function prepareToolResult(result) {
  let snapshot;
  try { snapshot = JSON.parse(JSON.stringify(result)); }
  catch { throw new Error("UNSUPPORTED_TOOL_RESULT_FORMAT"); }
  if (!snapshot || !Array.isArray(snapshot.content) || snapshot.content.some(
    (part) => part?.type !== "text" || typeof part.text !== "string",
  )) throw new Error("UNSUPPORTED_TOOL_RESULT_CONTENT");

  // Classifiers must see the actual content, not JSON-escaped protocol text.
  // Keep every text block and extra field (including unknown field names) in
  // the material to screen. Repeated exec "aggregated" output is scanned once.
  const fragments = [], seen = new Set();
  let size = 0;
  function add(value) {
    const text = String(value);
    if (!text || seen.has(text)) return;
    seen.add(text);
    size += text.length + (fragments.length ? 2 : 0);
    if (size > 15_000) throw new Error("UNSUPPORTED_TOOL_RESULT_SIZE");
    fragments.push(text);
  }
  function fields(value) {
    if (value === null) return;
    if (Array.isArray(value)) { for (const item of value) fields(item); return; }
    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value)) { add(key); fields(item); }
      return;
    }
    add(value);
  }
  for (const part of snapshot.content) {
    add(part.text);
    fields(Object.fromEntries(Object.entries(part).filter(([key]) => key !== "text" && key !== "type")));
  }
  fields(Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "content")));
  const text = fragments.join("\n\n") || "工具返回为空。";
  return { text, snapshot };
}

async function isolate(state, ctx, reason) {
  // The host owns cancellation and its confirmation. Returning an error alone
  // lets the model retry, so explicitly request cancellation before returning.
  try { await state.stopRun?.(ctx, { phase: "tool_results", ...reason }); }
  catch { state.recordFailure?.(ctx, "TASK_STOP_FAILED"); }
  return withheldToolResult(reason);
}

export async function executeWithResultGuard(execute, args, ctx, enabled) {
  if (!enabled) return execute(...args);
  const state = runtime();
  let result, executionError = false;
  const executionStarted = performance.now();
  try {
    // onUpdate can publish raw output before the final result is screened.
    // Buffered final text is the supported path while this guard is enabled.
    result = await execute(args[0], args[1], args[2], undefined);
  } catch (error) {
    executionError = true;
    // Preserve useful ordinary errors only after screening their content.
    // The original exception must never bypass the return gate.
    result = { isError: true, content: [{ type: "text", text: String(error?.message ?? error) }] };
  }
  ctx = { ...ctx, executionMs: Math.round(performance.now() - executionStarted) };
  let prepared;
  try {
    prepared = prepareToolResult(result);
  } catch (error) {
    const reasonCode = error.message.startsWith("UNSUPPORTED_TOOL_RESULT_") ? error.message : "UNSUPPORTED_TOOL_RESULT_FORMAT";
    state.recordFailure?.(ctx, reasonCode);
    return isolate(state, ctx, { kind: "unsupported", reasonCode,
      message: reasonCode === "UNSUPPORTED_TOOL_RESULT_SIZE" ? "工具返回超过检查容量，内容已隔离。" : "当前检查器不支持此工具返回格式，内容已隔离。" });
  }
  let decision;
  try {
    if (typeof state.screenToolResult !== "function") throw new Error("CHECK_UNAVAILABLE");
    decision = await state.screenToolResult(prepared, ctx, args[2]);
    if (!["ALLOW", "BLOCK", "REVIEW"].includes(decision?.decision)) throw new Error("CHECK_UNAVAILABLE");
  } catch {
    state.recordFailure?.(ctx, "CHECK_UNAVAILABLE");
    return isolate(state, ctx, { kind: "check_unavailable", reasonCode: "CHECK_UNAVAILABLE", message: "安全检查失败或暂不可用，工具返回内容已隔离。" });
  }
  if (decision.decision !== "ALLOW") return isolate(state, ctx, {
    kind: "security_block", decision: decision.decision,
    reasonCode: decision.reasonCode ?? `SECURITY_${decision.decision}`,
    message: decision.decision === "REVIEW" ? "工具返回需要安全复核，内容已隔离。" : "工具返回未通过安全检查，内容已隔离。",
  });
  if (executionError || prepared.snapshot.isError) {
    state.recordFailure?.(ctx, "TOOL_EXECUTION_ERROR");
    prepared.snapshot.details ??= {};
    if (typeof prepared.snapshot.details === "object" && !Array.isArray(prepared.snapshot.details))
      prepared.snapshot.details.govagentsec = { kind: "tool_error", reasonCode: "TOOL_EXECUTION_ERROR", withheld: false };
  }
  return prepared.snapshot;
}

async function probeSidecar(config) {
  const token = (await readFile(config.tokenFile, "utf8")).trim();
  if (token.length < 32 || token.length > 512 || /\s/.test(token)) return false;
  const response = await fetch(`${config.baseUrl}/readyz`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(1_000),
  });
  return response.ok && (await response.json())?.ready === true;
}

// Trusted ACL hook only: diagnostics must never change the enforcement result.
export function reportTaskAccessDenied(ctx, reasonCode) {
  try { runtime().reportTaskAccessDenied?.(ctx, reasonCode); }
  catch { /* The ACL caller still returns block:true. */ }
}

export function registerProtectionRuntime({ config, conversationAllowed, screenToolResult, recordFailure, stopRun, reportTaskAccessDenied, probe = probeSidecar }) {
  const state = runtime();
  const hooks = {};
  const lastDecisions = {};
  const screenedCalls = new Set();
  let service = "unknown";
  let serviceCheckedAt = null;
  let pendingProbe;
  const callKey = (ctx) => ctx?.toolCallId
    ? `${ctx.runId ?? ctx.sessionKey ?? ctx.sessionId ?? ""}:${ctx.toolCallId}` : null;

  function rememberCall(ctx) {
    const key = callKey(ctx);
    if (key) screenedCalls.add(key);
    while (screenedCalls.size > 1_024) screenedCalls.delete(screenedCalls.values().next().value);
  }

  state.screenToolResult = async (prepared, ctx, signal) => {
    const decision = await screenToolResult(prepared, ctx, signal);
    rememberCall(ctx);
    return decision;
  };
  state.recordFailure = (ctx, reason) => { rememberCall(ctx); recordFailure?.(ctx, reason); };
  state.stopRun = stopRun;
  state.reportTaskAccessDenied = reportTaskAccessDenied;
  state.snapshot = async ({ probe: shouldProbe = true } = {}) => {
    if (shouldProbe && (!serviceCheckedAt || Date.now() - Date.parse(serviceCheckedAt) > 5_000)) {
      pendingProbe ??= Promise.resolve().then(() => probe(config)).then(
        (ready) => { service = ready ? "online" : "offline"; },
        () => { service = "offline"; },
      ).finally(() => { serviceCheckedAt = new Date().toISOString(); pendingProbe = undefined; });
      await pendingProbe;
    }
    const authorized = conversationAllowed === true;
    const input = {
      mode: authorized ? "enforce" : "disabled",
      reason: authorized ? "已授权输入检查；检查失败时拒绝运行" : "未授权对话访问，输入检查不可用",
    };
    const output = {
      mode: authorized ? "observe" : "disabled",
      reason: authorized
        ? "回复终审可请求重写；渠道发送可取消，聊天流式回复尚无完整发送前门控"
        : "未授权对话访问；仅渠道发送钩子可取消，聊天回复终审不可用",
    };
    const tool_results = {
      mode: state.bridgeVersion === RESULT_GATE_VERSION ? "enforce" : "observe",
      reason: state.bridgeVersion === RESULT_GATE_VERSION
        ? "工具文本按正文检查；风险、检查故障和不支持的返回分别提示并请求停止任务；流式工具更新暂停"
        : "未安装宿主返回前适配器；after_tool_call 仅事后观察",
    };
    return { service, serviceCheckedAt, input, output, tool_results,
      hooks: { ...hooks }, lastDecisions: structuredClone(lastDecisions),
      resultGateVersion: state.bridgeVersion,
    };
  };
  return {
    snapshot: state.snapshot,
    markHook(name) { hooks[name] = new Date().toISOString(); },
    record(phase, decision, enforced, ctx) {
      lastDecisions[phase] = { decision: decision?.decision ?? "BLOCK", enforced,
        riskLevel: decision?.riskLevel ?? "UNKNOWN", reasonCode: decision?.reasonCode ?? null,
        categories: decision?.categories ?? [], durationMs: decision?.durationMs ?? null,
        executionMs: ctx?.executionMs ?? null, at: new Date().toISOString() };
      globalThis[Symbol.for('govagentsec.protection.audit')]?.({phase, ...lastDecisions[phase],
        runId:ctx?.runId,sessionKey:ctx?.sessionKey,sessionId:ctx?.sessionId,toolCallId:ctx?.toolCallId});
      // Read-only consumers cannot change the guard's decision or break execution.
      for (const observe of globalThis[Symbol.for('govagentsec.trace.observers')]?.values() ?? []) {
        try { observe({phase, ...lastDecisions[phase], runId:ctx?.runId, sessionKey:ctx?.sessionKey,
          sessionId:ctx?.sessionId, toolCallId:ctx?.toolCallId}); } catch { /* Consumer owns capture health. */ }
      }
    },
    consumeToolResult(ctx) {
      const key = callKey(ctx);
      return key ? screenedCalls.delete(key) : false;
    },
  };
}

export async function getProtectionRuntimeSnapshot(options) {
  return runtime().snapshot?.(options) ?? {
    service: "unknown", input: { mode: "unavailable", reason: "防护插件未注册" },
    output: { mode: "unavailable", reason: "防护插件未注册" },
    tool_results: { mode: "unavailable", reason: "防护插件未注册" },
    hooks: {}, lastDecisions: {}, resultGateVersion: runtime().bridgeVersion,
  };
}
