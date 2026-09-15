import { brandPage } from "../../../../../govagentsec-ui/design.mjs";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { renderGovAgentSecPanel, renderProtectAgentPanel, renderSupplyChainPanel } from "./suite-pages.mjs";


const ROUTE_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
});

function writeResponse(request, response, contentType, body) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { ...ROUTE_HEADERS, Allow: "GET, HEAD" });
    response.end();
    return true;
  }
  const encoded = Buffer.from(body, "utf8");
  response.writeHead(200, {
    ...ROUTE_HEADERS,
    "Content-Type": contentType,
    "Content-Length": String(encoded.length),
  });
  response.end(request.method === "HEAD" ? undefined : encoded);
  return true;
}

function writeHtml(request, response, body) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { ...ROUTE_HEADERS, Allow: "GET, HEAD" });
    response.end();
    return true;
  }
  response.setHeader?.(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-src 'self'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  );
  return writeResponse(request, response, "text/html; charset=utf-8", body);
}

function writeJson(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  response.writeHead(statusCode, {
    ...ROUTE_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
  });
  response.end(body);
  return true;
}

async function readJsonBody(request, maximum = 16 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximum) throw new Error("请求内容过大");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function group4Paths() {
  const pluginDir = path.dirname(fileURLToPath(import.meta.url));
  const modulesRoot = path.resolve(pluginDir, "../../../../..");
  const openClawRoot = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw");
  const group4Root = path.join(modulesRoot, "supply-chain-group4");
  return {
    python: path.join(modulesRoot, "agentguard-group2", ".venv", "Scripts", "python.exe"),
    group4Root,
    bridge: path.join(group4Root, "integration", "group4_scan_bridge.py"),
    pipeline: path.join(group4Root, "02-Skill供应链安全检测流水线", "skill_security_pipeline.py"),
    reports: path.join(modulesRoot, "agentguard-group2", "live-runtime", "group4-reports"),
    allowedRoots: [
      path.join(openClawRoot, "workspace"),
      path.join(openClawRoot, "plugin-skills"),
      path.join(openClawRoot, "skill-workshop"),
      path.join(modulesRoot, "aegis", "fixtures"),
    ].join(path.delimiter),
  };
}

async function runGroup4Scan(targetPath) {
  if (typeof targetPath !== "string" || !targetPath.trim() || targetPath.length > 1024) {
    throw new Error("请输入有效的扫描目录");
  }
  const runtime = group4Paths();
  for (const required of [runtime.python, runtime.group4Root, runtime.bridge, runtime.pipeline]) {
    if (!existsSync(required)) throw new Error("第四组扫描运行组件不完整");
  }
  return await new Promise((resolve, reject) => {
    const child = spawn(runtime.python, [runtime.bridge, targetPath.trim()], {
      cwd: runtime.group4Root,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        GROUP4_PIPELINE_SCRIPT: runtime.pipeline,
        GROUP4_REPORT_DIR: runtime.reports,
        GROUP4_ALLOWED_ROOTS: runtime.allowedRoots,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 1024 * 1024) child.kill();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 64 * 1024) child.kill();
    });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("供应链扫描超过 60 秒，已安全终止"));
    }, 60_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      try {
        const payload = JSON.parse(stdout.trim());
        if (code !== 0 || payload.ok !== true) {
          reject(new Error(payload.error || "供应链扫描未完成"));
          return;
        }
        resolve(payload.data);
      } catch (error) {
        reject(new Error(`供应链扫描返回异常${stderr ? `：${stderr.slice(-160)}` : ""}`));
      }
    });
  });
}

function assetHandler(relativePath, contentType) {
  return (request, response) => {
    const body = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    return writeResponse(request, response, contentType, body);
  };
}

export function registerProtectionUiRoutes(api, eventStore) {
  api.registerHttpRoute({
    path: "/plugins/govagentsec/panel",
    auth: "plugin",
    match: "exact",
    handler(request, response) {
      return writeHtml(request, response, brandPage(renderGovAgentSecPanel(), "hub"));
    },
  });
  api.registerHttpRoute({
    path: "/protect-agent/ui/state",
    auth: "plugin",
    match: "exact",
    handler(request, response) {
      return writeResponse(
        request,
        response,
        "application/json; charset=utf-8",
        JSON.stringify(eventStore.snapshot()),
      );
    },
  });
  api.registerHttpRoute({
    path: "/protect-agent/ui/inject.js",
    auth: "plugin",
    match: "exact",
    handler: assetHandler("./ui/inject.js", "text/javascript; charset=utf-8"),
  });
  api.registerHttpRoute({
    path: "/protect-agent/ui/styles.css",
    auth: "plugin",
    match: "exact",
    handler: assetHandler("./ui/styles.css", "text/css; charset=utf-8"),
  });
  api.registerHttpRoute({
    path: "/plugins/protect-agent/panel",
    auth: "plugin",
    match: "exact",
    handler(request, response) {
      return writeHtml(request, response, brandPage(renderProtectAgentPanel(), "protect"));
    },
  });
  api.registerHttpRoute({
    path: "/plugins/supply-chain-security/panel",
    auth: "plugin",
    match: "exact",
    handler(request, response) {
      return writeHtml(request, response, renderSupplyChainPanel());
    },
  });
  api.registerHttpRoute({
    path: "/plugins/supply-chain-security/api/scan",
    auth: "plugin",
    match: "exact",
    async handler(request, response) {
      if (request.method !== "POST") {
        response.writeHead(405, { ...ROUTE_HEADERS, Allow: "POST" });
        response.end();
        return true;
      }
      try {
        const body = await readJsonBody(request);
        const data = await runGroup4Scan(body?.targetPath);
        return writeJson(response, 200, { ok: true, data });
      } catch (error) {
        return writeJson(response, 400, {
          ok: false,
          error: String(error?.message || error).slice(0, 500),
        });
      }
    },
  });
}
