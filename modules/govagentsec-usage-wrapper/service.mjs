import { readFileSync, writeFileSync } from 'node:fs';
import { createUsageWrapper } from './server.mjs';
const file = process.argv[2];
try {
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const wrapper = createUsageWrapper({ upstreams: config.upstreams, controlKey: readFileSync(config.credentialFile, 'utf8').trim() });
  const port = await wrapper.listen(config.port);
  writeFileSync(config.readyFile, JSON.stringify({ port, pid: process.pid }), { mode: 0o600 });
} catch { console.error('USAGE_WRAPPER_START_FAILED'); process.exitCode = 1; }
