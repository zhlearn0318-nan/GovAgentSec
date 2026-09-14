import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";


const DECISIONS = new Set(["ALLOW", "REVIEW", "BLOCK"]);
const RISK_LEVELS = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const DEFAULT_HIGH_IMPACT_TOOLS = ["exec", "apply_patch", "write", "edit", "message"];


function requiredString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}


function boundedInteger(value, fallback, minimum, maximum, name) {
  const normalized = value ?? fallback;
  if (!Number.isInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw new Error(`${name} is invalid`);
  }
  return normalized;
}


export function parsePluginConfig(raw) {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const mode = value.mode ?? "real";
  if (!new Set(["real", "baseline"]).has(mode)) {
    throw new Error("mode must be real or baseline");
  }
  const baseUrl = new URL(value.baseUrl ?? "http://127.0.0.1:19171");
  if (
    baseUrl.protocol !== "http:" ||
    !new Set(["127.0.0.1", "::1", "[::1]", "localhost"]).has(baseUrl.hostname)
  ) {
    throw new Error("baseUrl must use an HTTP loopback address");
  }
  if (baseUrl.username || baseUrl.password || baseUrl.pathname !== "/" || baseUrl.search || baseUrl.hash) {
    throw new Error("baseUrl must not contain credentials, a path, query, or fragment");
  }

  const pythonPath = requiredString(value.pythonPath, "pythonPath");
  const projectRoot = requiredString(value.projectRoot, "projectRoot");
  const modelRoot = mode === "real" ? requiredString(value.modelRoot, "modelRoot") : undefined;
  const trustRagModule = mode === "real"
    ? requiredString(value.trustRagModule, "trustRagModule")
    : undefined;
  const tokenFile = requiredString(value.tokenFile, "tokenFile");
  for (const [name, candidate] of Object.entries({
    pythonPath,
    projectRoot,
    modelRoot,
    trustRagModule,
    tokenFile,
  })) {
    if (candidate === undefined) {
      continue;
    }
    if (!path.isAbsolute(candidate)) {
      throw new Error(`${name} must be an absolute path`);
    }
  }

  const highImpactTools = value.highImpactTools ?? DEFAULT_HIGH_IMPACT_TOOLS;
  if (
    !Array.isArray(highImpactTools) ||
    highImpactTools.length > 64 ||
    highImpactTools.some(
      (item) => typeof item !== "string" || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(item),
    )
  ) {
    throw new Error("highImpactTools is invalid");
  }

  return Object.freeze({
    mode,
    baseUrl: baseUrl.href.replace(/\/$/, ""),
    pythonPath,
    projectRoot,
    modelRoot,
    trustRagModule,
    tokenFile,
    requestTimeoutMs: boundedInteger(
      value.requestTimeoutMs,
      12_000,
      1_000,
      60_000,
      "requestTimeoutMs",
    ),
    startupTimeoutMs: boundedInteger(
      value.startupTimeoutMs,
      120_000,
      5_000,
      600_000,
      "startupTimeoutMs",
    ),
    highImpactTools: Object.freeze([...new Set(highImpactTools)]),
  });
}


export function deriveConversationId(sessionKey) {
  if (typeof sessionKey !== "string" || sessionKey.length === 0) {
    return undefined;
  }
  return createHash("sha256").update(sessionKey, "utf8").digest("hex");
}


function sanitizeValue(value, depth, seen) {
  if (typeof value === "string") {
    return value.length <= 4_096 ? value : `${value.slice(0, 4_080)}[Truncated]`;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value !== "object") {
    return `[${typeof value}]`;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  if (depth >= 6) {
    return "[MaxDepth]";
  }
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1, seen));
    if (value.length > 50) {
      result.push("[TruncatedItems]");
    }
  } else {
    result = {};
    const entries = Object.entries(value).slice(0, 50);
    for (const [key, item] of entries) {
      result[String(key).slice(0, 128)] = sanitizeValue(item, depth + 1, seen);
    }
    if (Object.keys(value).length > 50) {
      result.__truncated__ = "[TruncatedItems]";
    }
  }
  seen.delete(value);
  return result;
}


export function boundedSerialize(value, maximum = 16_000) {
  if (!Number.isInteger(maximum) || maximum < 128 || maximum > 64_000) {
    throw new Error("serialization limit is invalid");
  }
  const serialized = JSON.stringify(sanitizeValue(value, 0, new WeakSet()));
  if (serialized.length <= maximum) {
    return serialized;
  }
  return `${serialized.slice(0, maximum - 11)}[Truncated]`;
}


function readToken(tokenFile) {
  const token = readFileSync(tokenFile, "utf8").trim();
  if (token.length < 32 || token.length > 512 || /\s/.test(token)) {
    throw new Error("Protect Agent token file is invalid");
  }
  return token;
}


function validateScreenResponse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Protect Agent returned an invalid response");
  }
  if (
    payload.version !== "1" ||
    !DECISIONS.has(payload.decision) ||
    !RISK_LEVELS.has(payload.riskLevel) ||
    typeof payload.policyAction !== "string" ||
    typeof payload.riskScore !== "number" ||
    !Number.isFinite(payload.riskScore) ||
    payload.riskScore < 0 ||
    payload.riskScore > 1 ||
    !Array.isArray(payload.categories) ||
    payload.categories.some((item) => typeof item !== "string") ||
    typeof payload.detectorsAvailable !== "boolean" ||
    typeof payload.reasonCode !== "string" ||
    typeof payload.retained !== "boolean"
  ) {
    throw new Error("Protect Agent returned an invalid response");
  }
  if (!payload.detectorsAvailable) {
    return { ...payload, decision: "BLOCK" };
  }
  return payload;
}


export function createScreeningClient(config, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is unavailable");
  }
  const token = readToken(config.tokenFile);
  return {
    async screen(request, options = {}) {
      const timeoutSignal = AbortSignal.timeout(config.requestTimeoutMs);
      const signal = options.signal
        ? AbortSignal.any([timeoutSignal, options.signal])
        : timeoutSignal;
      const response = await fetchImpl(`${config.baseUrl}/v1/screen`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: "1", ...request }),
        signal,
      });
      if (!response.ok) {
        throw new Error(`Protect Agent screening failed with HTTP ${response.status}`);
      }
      return validateScreenResponse(await response.json());
    },
  };
}


async function waitUntilReady(config, fetchImpl, token, child) {
  const deadline = Date.now() + config.startupTimeoutMs;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error("Protect Agent sidecar exited during startup");
    }
    try {
      const response = await fetchImpl(`${config.baseUrl}/readyz`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        const payload = await response.json();
        if (payload?.ready === true) {
          return;
        }
      }
    } catch {
      // Startup polling intentionally ignores transient connection failures.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Protect Agent sidecar did not become ready in time");
}


export function createSidecarService(config, dependencies = {}) {
  const spawnImpl = dependencies.spawnImpl ?? spawn;
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  let child;
  let ownsChild = false;
  return {
    id: "protect-agent-sidecar",
    async start(context) {
      const requiredPaths = [
        config.pythonPath,
        config.projectRoot,
        config.tokenFile,
      ];
      if (config.mode === "real") {
        requiredPaths.push(config.modelRoot, config.trustRagModule);
      }
      for (const requiredPath of requiredPaths) {
        if (!existsSync(requiredPath)) {
          throw new Error("Protect Agent sidecar configuration references a missing path");
        }
      }
      const token = readToken(config.tokenFile);
      try {
        await waitUntilReady(
          { ...config, startupTimeoutMs: 1_000 },
          fetchImpl,
          token,
        );
        context.logger.info("Protect Agent sidecar is already ready.");
        return;
      } catch {
        // No healthy sidecar exists; this plugin will own the child it starts.
      }
      const endpoint = new URL(config.baseUrl);
      const sidecarArgs = [
          "-m",
          "integrations.openclaw.sidecar",
          "--host",
          endpoint.hostname === "[::1]" ? "::1" : endpoint.hostname,
          "--port",
          endpoint.port || "19171",
          "--token-file",
          config.tokenFile,
          "--mode",
          config.mode,
      ];
      if (config.mode === "real") {
        sidecarArgs.push(
          "--model-root",
          config.modelRoot,
          "--trustrag-module",
          config.trustRagModule,
        );
      }
      child = spawnImpl(
        config.pythonPath,
        sidecarArgs,
        {
          cwd: config.projectRoot,
          env: { ...process.env, PYTHONUTF8: "1" },
          shell: false,
          windowsHide: true,
          stdio: "ignore",
        },
      );
      ownsChild = true;
      await waitUntilReady(config, fetchImpl, token, child);
      context.logger.info("Protect Agent sidecar is ready.");
    },
    async stop() {
      if (ownsChild && child && child.exitCode === null) {
        child.kill();
      }
      child = undefined;
      ownsChild = false;
    },
  };
}
