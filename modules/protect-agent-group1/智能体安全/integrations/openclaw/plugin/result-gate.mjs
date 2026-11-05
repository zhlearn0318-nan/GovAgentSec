import { readFile } from "node:fs/promises";

// Both the host adapter and plugins use this process-local registry. No prompts,
// results, session keys or credentials are exposed by its snapshot function.
export const PROTECTION_RUNTIME = Symbol.for("govagentsec.protection.runtime");
export const RESULT_GATE_VERSION = 1;

function runtime() {
  return globalThis[PROTECTION_RUNTIME] ??= { bridgeVersion: 0 };
}

export function activateToolResultGate() {
  runtime().bridgeVersion = RESULT_GATE_VERSION;
}

export function withheldToolResult() {
  return {
    isError: true,
    content: [{ type: "text", text: "Protect Agent 已隔离此工具返回内容：安全检查未通过或暂不可用。请调整请求后重试。" }],
    details: { govagentsec: { decision: "BLOCK", withheld: true } },
  };
}

export function prepareToolResult(result) {
  const text = JSON.stringify(result);
  // The sidecar accepts at most 16,000 characters. Never screen a truncated
  // prefix and then release the unreviewed suffix (or a non-text attachment).
  if (!text || text.length > 15_000) throw new Error("unsupported_tool_result_size");
  const snapshot = JSON.parse(text);
  if (!snapshot || !Array.isArray(snapshot.content) || snapshot.content.some(
    (part) => part?.type !== "text" || typeof part.text !== "string",
  )) throw new Error("unsupported_tool_result_content");
  return { text, snapshot };
}

export async function executeWithResultGuard(execute, args, ctx, enabled) {
  if (!enabled) return execute(...args);
  let result;
  try {
    // onUpdate can publish raw output before the final result is screened.
    // Buffered final text is the supported path while this guard is enabled.
    result = await execute(args[0], args[1], args[2], undefined);
  } catch {
    // Tool exceptions can also contain secrets. Do not let raw exception text
    // escape into the host's diagnostics or the model's error result.
    runtime().recordFailure?.(ctx, "tool_execution_error");
    return withheldToolResult();
  }
  const state = runtime();
  if (typeof state.screenToolResult !== "function") return withheldToolResult();
  try {
    const prepared = prepareToolResult(result);
    const decision = await state.screenToolResult(prepared, ctx, args[2]);
    return decision?.decision === "ALLOW" ? prepared.snapshot : withheldToolResult();
  } catch {
    state.recordFailure?.(ctx, "tool_result_unavailable");
    return withheldToolResult();
  }
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

export function registerProtectionRuntime({ config, conversationAllowed, screenToolResult, recordFailure, probe = probeSidecar }) {
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
  state.recordFailure = (ctx, reason) => { rememberCall(ctx); recordFailure(ctx, reason); };
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
        ? "文本返回在进入模型和诊断前检查；检查失败、超限和非文本返回将隔离；流式工具更新暂停"
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
        riskLevel: decision?.riskLevel ?? "UNKNOWN", at: new Date().toISOString() };
      globalThis[Symbol.for('govagentsec.protection.audit')]?.({phase, ...lastDecisions[phase],
        runId:ctx?.runId,sessionKey:ctx?.sessionKey,sessionId:ctx?.sessionId,toolCallId:ctx?.toolCallId});
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
