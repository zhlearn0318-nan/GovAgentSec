import { readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { redact, digest } from "./trace-store.mjs";
import {
  buildSnapshot,
  readApprovals,
  readIdentityStatus,
} from "../agentguard-group2/integrations/openclaw_runtime_security_plugin/index.js";
import {requireBusinessDelegation} from '../govagentsec-ui/identity-status.mjs';
import {modelRoutingStatus} from '../model-routing/routing.mjs';
const actions = {read_gov_document:'file.read',
  submit_emergency_notice: 'notification.submit',
  list_notices: "database.query",
  request_test_payment: "payment.transfer",
  run_protected_command: "shell.execute",
};
export function toolCoverage(config, observed = []) {
  const server = config.mcp?.servers?.['agentguard-notices'];
  const include = server?.toolFilter?.include;
  const excluded = server?.toolFilter?.exclude ?? [];
  const known = [...Object.keys(actions), 'get_control_request_status'];
  const configured = server && server.enabled !== false
    ? known.filter(name => (!include || include.includes('*') || include.includes(name)) && !excluded.includes('*') && !excluded.includes(name)) : [];
  const names = [...new Set([...configured.map(n => 'agentguard-notices__' + n), ...observed])];
  return names.map(name => ({name, managed:configured.some(n => name === 'agentguard-notices__' + n),
    observed:observed.includes(name)}));
}
export function controlReferences(trace) {
  const refs = [];
  for (const e of trace.events) {
    if (e.event_type !== "tool.ended" || !e.tool_call_id) continue;
    if (e.payload.correlation_verified && /^mcp-req-[a-f0-9]{32}$/.test(e.request_id ?? '')) {
      const tool = e.payload.tool?.replace(/^agentguard-notices__/, '');
      if (actions[tool] && e.payload.tool === 'agentguard-notices__' + tool) refs.push({control_request_id:e.request_id,tool_call_id:e.tool_call_id,mcp_tool:tool,action_tool:actions[tool]});
      continue;
    }
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
  async capabilityInventory() {
    const servers=Object.entries(this.config.mcp?.servers??{}).map(([name,server])=>({name,enabled:server.enabled!==false,
      config_sha256:digest(server),connection:'not_verified',admission:{status:'no_matching_record'}}));
    const dbPath=this.config.security?.installPolicy?.exec?.env?.AEGIS_OPENCLAW_AUDIT_DB;
    if(!dbPath||!existsSync(dbPath))return servers;
    let db;
    try{
      const {DatabaseSync}=await import('node:sqlite');db=new DatabaseSync(dbPath,{readOnly:true});
      const query=db.prepare('SELECT sequence, created_at, decision, reason_code FROM install_policy_audit WHERE target_type = ? AND target_name = ? AND source_tree_sha256 = ? ORDER BY sequence DESC LIMIT 1');
      for(const server of servers){const record=query.get('mcp',server.name,server.config_sha256);
        if(record)server.admission={status:'matching_record',integrity:'not_verified_here',...record};}
    }catch{for(const server of servers)server.admission={status:'unavailable'};}
    finally{db?.close();}
    return servers;
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
  async status() {
    const p=this.config.plugins?.entries??{};
    const server=this.config.mcp?.servers?.['agentguard-notices'];
    const identityMode=!server||server.enabled===false?'disabled':server.env?.AGENTGUARD_MCP_IDENTITY_MODE==='oidc'?'oidc_token':server.env?.AGENTGUARD_MCP_IDENTITY_MODE??'unknown';
    const runtime=await globalThis[Symbol.for('govagentsec.protection.runtime')]?.snapshot?.()??{
      service:'unknown',input:{mode:'unavailable',reason:'防护插件未注册'},output:{mode:'unavailable',reason:'防护插件未注册'},tool_results:{mode:'unavailable',reason:'防护插件未注册'}
    };
    return {
      capture:['govagentsec-trace','govagentsec-trajectory'].some(id=>p[id]?.enabled===true&&p[id]?.hooks?.allowConversationAccess===true),
      input_hooks:runtime.input.mode==='enforce'?'configured':'not_authorized',
      tool_result_enforcement:runtime.tool_results.mode,
      runtime,agentguard_identity_mode:identityMode,
      model_routing: modelRoutingStatus(this.config),
      business_identity: await readIdentityStatus(this.guard, identityMode === 'loopback_static_dev' ? identityMode : this.guard.identityMode),
      agentguard_configured:Boolean(this.guard.statusPath),skill_attribution:'unknown'
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
        governance: original.governance ?? null,
        reason:
          approval?.reason_code ??
          decision?.reason_code ??
          original.reason_code,
        approval: approval ?? null,
        receipt:
          approval?.receipt ?? decision?.receipt ?? original.receipt ?? null,
        stages: decision?.stages ?? [],
        source: "AgentGuard",
        can_resolve: false, // No per-user business bearer delegation in Control UI.
      });
    }
    return redact({
      trace,
      controls,
      tool_coverage: toolCoverage(this.config, trace.events.filter(e=>e.event_type==='tool.started').map(e=>e.payload?.tool).filter(Boolean)),
      coverage: await this.status(),
      business_result: trace.summary.task_passed,
      capability_evidence: await this.admissions(trace),
    });
  }
  async workspace() {
    const traces = this.store.list();
    const references = new Map();
    const observedTools = new Set();
    for (const summary of traces.slice(0, 100)) {
      if (summary.trace_status === "invalid") continue;
      const trace = this.store.read(summary.trace_id);
      for (const e of trace.events) if (e.event_type==='tool.started' && e.payload?.tool) observedTools.add(e.payload.tool);
      for (const ref of controlReferences(trace)) {
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
            governance: r.governance ?? null,
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
      tool_coverage: toolCoverage(this.config, [...observedTools]),
      approval_error: approvalError,
      coverage: await this.status(),
      servers: await this.capabilityInventory(),
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
    requireBusinessDelegation();
  }
}
