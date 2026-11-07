import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { abortAgentHarnessRun } from "openclaw/plugin-sdk/agent-harness-runtime";

import { registerProtectAgent } from "./register.mjs";


export default definePluginEntry({
  id: "protect-agent",
  name: "Protect Agent Security Guard",
  description: "Fail-closed Protect Agent policy hooks for OpenClaw.",
  register(api) {
    registerProtectAgent(api, {
      stopRun: (ctx) => typeof ctx?.sessionId === 'string' && ctx.sessionId.length > 0
        ? abortAgentHarnessRun(ctx.sessionId, { reason: 'protect-agent-policy' }) : false,
    });
  },
});
