// Compatibility preload for OpenClaw 2026.7.1-2 + @openclaw/codex 2026.7.1-1.
//
// Node 24 may otherwise evaluate the same OpenClaw ESM module concurrently
// through import() and require(), which raises ERR_REQUIRE_ESM_RACE_CONDITION.
// Resolve from the project-local OpenClaw package and fully evaluate each
// plugin-sdk module before the Gateway starts plugin discovery.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const openClawPackage = new URL(
  "../../third_party/runtime/openclaw-client/node_modules/openclaw/package.json",
  import.meta.url,
);
const resolveFromOpenClaw = createRequire(openClawPackage);

const codexPluginSdkModules = [
  "agent-harness-exec-review-runtime",
  "agent-harness-runtime",
  "agent-harness-task-runtime",
  "agent-harness",
  "agent-runtime",
  "agent-sessions",
  "codex-mcp-projection",
  "config-mutation",
  "core",
  "diagnostic-runtime",
  "exec-approvals-runtime",
  "extension-shared",
  "file-lock",
  "image-generation",
  "inline-image-data-url-runtime",
  "json-schema-runtime",
  "json-store",
  "keyed-async-queue",
  "lazy-runtime",
  "logging-core",
  "media-store",
  "message-tool-delivery-hints",
  "migration-runtime",
  "migration",
  "number-runtime",
  "plugin-config-runtime",
  "plugin-entry",
  "plugin-runtime",
  "provider-auth",
  "provider-model-shared",
  "provider-usage",
  "provider-web-search-contract",
  "provider-web-search",
  "routing",
  "runtime-env",
  "sandbox",
  "secret-input",
  "security-runtime",
  "session-store-runtime",
  "session-transcript-runtime",
  "ssrf-runtime",
  "string-coerce-runtime",
  "temp-path",
  "text-utility-runtime",
  "windows-spawn",
];

for (const moduleName of codexPluginSdkModules) {
  const modulePath = resolveFromOpenClaw.resolve(`openclaw/plugin-sdk/${moduleName}`);
  await import(pathToFileURL(modulePath).href);
}
