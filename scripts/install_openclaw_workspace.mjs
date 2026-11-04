import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
export function installWorkspace(root, restore = false) {
  const dir = path.join(root, "dist/control-ui/assets"),
    names = readdirSync(dir);
  const mainNames = names.filter(
    (n) =>
      /^index-.*\.js$/.test(n) &&
      readFileSync(path.join(dir, n), "utf8").includes(
        'class="shell ${n===`chat`',
      ),
  );
  const pluginNames = names.filter((n) => /^plugin-page-.*\.js$/.test(n));
  if (mainNames.length !== 1 || pluginNames.length !== 1)
    throw Error("Unsupported OpenClaw shell assets");
  const main = path.join(dir, mainNames[0]),
    plugin = path.join(dir, pluginNames[0]);
  const index = path.join(root, "dist/control-ui/index.html");
  const files = [main, plugin, index];
  if (restore) {
    for (const f of files)
      if (!existsSync(f + ".gov-workspace-backup"))
        throw Error("Missing workspace backup");
    for (const f of files)
      writeFileSync(f, readFileSync(f + ".gov-workspace-backup"));
    return { restored: true };
  }
  const plans = [];
  for (const file of files) {
    const original = readFileSync(file, "utf8");
    let next = original;
    if (file === main && !original.includes("<govagentsec-shell")) {
      const marker = "</openclaw-app-topbar>";
      if (original.split(marker).length !== 2)
        throw Error("Unsupported host layout");
      const element =
        "<govagentsec-shell .host=${this} .client=${e.gateway.snapshot.client} .connected=${this.gatewayConnected} .sessionKey=${this.activeSessionKey} .location=${this.routeState.location}></govagentsec-shell>";
      next =
        original.replace(marker, marker + element) +
        "\nimport('/plugins/govagentsec/shell.mjs?v=workspace-2').then(m=>m.defineShell()).catch(e=>console.error('GovAgentSec shell unavailable',e));\n";
    }
    if (file === plugin && !original.includes('"protect-agent/govagentsec":')) {
      const marker = "var f={";
      const lit = original.match(
        /import\{([^}]+)\}from"\.\/(lit-runtime-[^"]+)"/,
      );
      const html = lit?.[1].match(/(?:^|,)g as (\w+)/)?.[1];
      if (!html || original.split(marker).length !== 2)
        throw Error("Unsupported plugin registry");
      next = original.replace(
        marker,
        marker +
          `"protect-agent/govagentsec":async()=>{const m=await import('/plugins/govagentsec/workspace.mjs');return m.createWorkspaceView(${html})},`,
      );
    }
    if (file === index && !original.includes("gov-workspace-cache-2")) {
      const assetPaths = [mainNames[0], pluginNames[0]];
      const cleanup = `<script>/* gov-workspace-cache-2 */(async()=>{const marker='gov-workspace-cache-2';try{if(sessionStorage.getItem(marker))return;sessionStorage.setItem(marker,'1');if(!('caches' in window))return;let removed=false;const names=${JSON.stringify(assetPaths)};for(const name of await caches.keys()){if(!name.startsWith('openclaw-control-'))continue;const cache=await caches.open(name);for(const request of await cache.keys()){const u=new URL(request.url);if(u.origin===location.origin&&names.some(n=>u.pathname.endsWith('/assets/'+n))){await cache.delete(request);removed=true;}}}if(removed)location.reload();}catch{sessionStorage.removeItem(marker);}})();</script>`;
      if (!original.includes("</head>"))
        throw Error("Unsupported index document");
      next = original.replace("<head>", "<head>" + cleanup);
    }
    if (next !== original) {
      const backup = file + ".gov-workspace-backup";
      if (existsSync(backup) && readFileSync(backup, "utf8") !== original)
        throw Error("Workspace backup differs; inspect asset before adapting");
      plans.push({ file, original, next, backup });
    }
  }
  // Validate both assets before any mutation; preserve the previous working adaptation.
  for (const p of plans) {
    if (!existsSync(p.backup))
      writeFileSync(p.backup, p.original, { flag: "wx" });
    writeFileSync(p.file, p.next);
  }
  return { installed: true, changed: plans.length, files };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  console.log(
    JSON.stringify(
      installWorkspace(
        process.argv.slice(2).find((x) => x !== "--restore") ||
          path.join(process.env.APPDATA, "npm/node_modules/openclaw"),
        process.argv.includes("--restore"),
      ),
    ),
  );
