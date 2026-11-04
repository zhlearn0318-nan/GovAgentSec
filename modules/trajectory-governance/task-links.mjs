import { readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { redact, digest } from "./trace-store.mjs";
import {
  buildSnapshot,
  readApprovals,
  resolveApproval,
} from "../agentguard-group2/integrations/openclaw_runtime_security_plugin/index.js";
const actions = {
  list_notices: "database.query",
  request_test_payment: "payment.transfer",
  run_protected_command: "shell.execute",
};
export function controlReferences(trace) {
  const refs = [];
  for (const e of trace.events) {
    if (e.event_type !== "tool.ended" || !e.tool_call_id) continue;
    const starts = trace.events.filter(
      (x) =>
        x.event_type === "tool.started" && x.tool_call_id === e.tool_call_id,
    );
    const ends = trace.events.filter(
      (x) => x.event_type === "tool.ended" && x.tool_call_id === e.tool_call_id,
    );
    if (
      starts.length !== 1 ||
      ends.length !== 1 ||
      starts[0].sequence >= e.sequence ||
      starts[0].payload?.tool !== e.payload?.tool
    )
      continue;
    const result = e.payload?.result,
      metadata = result?.details;
    // These are OpenClaw's wrapper fields, never parsed from arbitrary tool text.
    if (
      metadata?.mcpServer !== "agentguard-notices" ||
      !actions[metadata.mcpTool]
    )
      continue;
    if (e.payload.tool !== `agentguard-notices__${metadata.mcpTool}`) continue;
    const id = metadata.structuredContent?.control_request_id;
    if (typeof id !== "string" || !/^mcp-req-[a-f0-9]{32}$/.test(id)) continue;
    refs.push({
      control_request_id: id,
      tool_call_id: e.tool_call_id,
      mcp_tool: metadata.mcpTool,
      action_tool: actions[metadata.mcpTool],
    });
  }
  return refs;
}
export class TaskLinks {
  constructor(store, config) {
    this.store = store;
    this.config = config;
    this.guard =
      config.plugins?.entries?.["agentguard-runtime-security"]?.config ?? {};
  }
  capability(toolName) {
    const servers = this.config.mcp?.servers ?? {};
    const matches = Object.keys(servers).filter((name) =>
      toolName?.startsWith(
        name.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 30) + "__",
      ),
    );
    if (matches.length !== 1) return null;
    const server = matches[0];
    return {
      kind: "mcp",
      name: server,
      config_sha256: digest(servers[server]),
    };
  }
  async admissions(trace) {
    const found = [];
    const dbPath =
      this.config.security?.installPolicy?.exec?.env?.AEGIS_OPENCLAW_AUDIT_DB;
    let db;
    try {
      if (dbPath && existsSync(dbPath)) {
        const { DatabaseSync } = await import("node:sqlite");
        db = new DatabaseSync(dbPath, { readOnly: true });
      }
      for (const e of trace.events) {
        const c = e.payload?.capability;
        if (e.event_type !== "tool.started" || c?.kind !== "mcp") continue;
        const report = db
          ?.prepare(
            "SELECT event_id, created_at, decision, reason_code, source_tree_sha256 FROM install_policy_audit WHERE target_type = ? AND target_name = ? AND source_tree_sha256 = ? AND julianday(created_at) <= julianday(?) ORDER BY sequence DESC LIMIT 1",
          )
          .get("mcp", c.name, c.config_sha256, e.observed_at);
        found.push({
          tool_call_id: e.tool_call_id,
          ...c,
          status: report ? "matched_config" : "no_matching_admission",
          report: report ?? null,
        });
      }
    } catch {
      return {
        status: "unavailable",
        items: [],
        reason: "准入台账无法读取，未将当前报告代替历史证据",
      };
    } finally {
      db?.close();
    }
    return {
      status: found.length ? "configuration_evidence" : "unknown",
      items: found,
      reason: found.length
        ? "MCP 配置摘要与运行前准入记录关联；不等同于远端服务代码版本证明。"
        : "尚无实际能力版本证据；Skill 使用不按工具名称推测。",
    };
  }
  status() {
    const p = this.config.plugins?.entries ?? {};
    return {
      capture: p["govagentsec-trajectory"]?.enabled !== false,
      input_hooks:
        p["protect-agent"]?.enabled === true &&
        p["protect-agent"]?.hooks?.allowConversationAccess === true
          ? "configured"
          : "not_authorized",
      tool_result_enforcement: "observation_only",
      agentguard_configured: Boolean(this.guard.statusPath),
      skill_attribution: "unknown",
    };
  }
  trace(params) {
    const trace = this.store.read(params.trace_id);
    if (!trace.events.length || trace.summary.trace_status === "invalid")
      throw new Error("轨迹不存在或校验失败");
    if (params.session_key && trace.summary.session_key !== params.session_key)
      throw new Error("任务不属于当前会话");
    return trace;
  }
  async request(ref) {
    if (!this.guard.statusPath) return null;
    try {
      const r = JSON.parse(
        await readFile(
          path.join(
            this.guard.statusPath + ".requests",
            ref.control_request_id + ".json",
          ),
          "utf8",
        ),
      );
      if (
        r.control_request_id !== ref.control_request_id ||
        r.request?.request_id !== ref.control_request_id ||
        r.request?.action?.tool !== ref.action_tool
      )
        return null;
      return r;
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async detail(params) {
    const trace = this.trace(params),
      refs = controlReferences(trace),
      controls = [];
    const snapshot =
      refs.length && this.guard.statusPath
        ? await buildSnapshot(this.guard)
        : null;
    for (const ref of refs) {
      const original = await this.request(ref);
      if (!original) {
        controls.push({
          ...ref,
          verified: false,
          status: "unverified",
          message: "尚无可信适配器请求记录，不能据此审批",
        });
        continue;
      }
      const approval = snapshot.approvals.find(
        (a) => a.control_request_id === ref.control_request_id,
      );
      const decision = snapshot.requests.find(
        (r) => r.request_id === ref.control_request_id,
      );
      controls.push({
        ...ref,
        verified: true,
        status: approval?.status ?? decision?.status ?? original.status,
        action: original.request.action,
        reason:
          approval?.reason_code ??
          decision?.reason_code ??
          original.reason_code,
        approval: approval ?? null,
        receipt:
          approval?.receipt ?? decision?.receipt ?? original.receipt ?? null,
        stages: decision?.stages ?? [],
        source: "AgentGuard",
        can_resolve: approval?.status === "pending",
      });
    }
    return redact({
      trace,
      controls,
      coverage: this.status(),
      business_result: trace.summary.task_passed,
      capability_evidence: await this.admissions(trace),
    });
  }
  async workspace() {
    const traces = this.store.list();
    const references = new Map();
    for (const summary of traces.slice(0, 100)) {
      if (summary.trace_status === "invalid") continue;
      for (const ref of controlReferences(this.store.read(summary.trace_id))) {
        if (await this.request(ref))
          references.set(ref.control_request_id, summary);
      }
    }
    let pending = [],
      approvalError = null;
    try {
      pending = (await readApprovals(this.guard))
        .filter((r) => r.status === "pending")
        .map((r) => {
          const trace = references.get(r.control_request_id);
          return {
            id: r.control_request_id,
            tool: r.request?.action?.tool,
            parameters: r.request?.action?.parameters,
            reason: r.reason_code,
            created_at: r.created_at,
            trace_id: trace?.trace_id,
            session_key: trace?.session_key,
          };
        });
    } catch {
      approvalError = "审批记录读取失败，请进入运行防护检查";
    }
    return redact({
      traces: traces.slice(0, 100),
      total: traces.length,
      pending,
      approval_error: approvalError,
      coverage: this.status(),
      servers: Object.entries(this.config.mcp?.servers ?? {}).map(
        ([name, c]) => ({ name, enabled: c.enabled !== false }),
      ),
    });
  }
  async resolve(params) {
    if (!["approve", "reject", "interrupt"].includes(params.resolution))
      throw new Error("审批动作无效");
    const trace = this.trace(params),
      ref = controlReferences(trace).find(
        (r) => r.control_request_id === params.control_request_id,
      );
    if (!ref || !(await this.request(ref)))
      throw new Error("审批请求未与这次工具调用可信关联");
    if (!this.guard.approvalPath) throw new Error("尚未配置审批结果保存位置");
    return resolveApproval(this.guard, {
      control_request_id: ref.control_request_id,
      resolution: params.resolution,
      approver_id: params.approver_id,
      note: params.note,
    });
  }
}
