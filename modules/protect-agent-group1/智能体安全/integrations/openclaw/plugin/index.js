import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { registerProtectAgent } from "./register.mjs";


export default definePluginEntry({
  id: "protect-agent",
  name: "Protect Agent Security Guard",
  description: "Fail-closed Protect Agent policy hooks for OpenClaw.",
  register(api) {
    registerProtectAgent(api);
  },
});
