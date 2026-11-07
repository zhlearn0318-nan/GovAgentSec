// Real combined admission on a synthetic capability candidate; never publishes.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Workshop } from '../modules/trajectory-governance/workshop.mjs';
import { digest } from '../modules/trajectory-governance/trace-store.mjs';

const read = p => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
const host = read(path.join(os.homedir(), '.openclaw', 'openclaw.json'));
const state = path.join(os.homedir(), '.openclaw');
const roots = [path.join(host.agents.defaults.workspace, 'skills'), path.join(state, 'skills'), path.join(state, 'plugin-skills'), ...(host.skills?.load?.extraDirs ?? [])];
const root = path.resolve('local-validation/trajectory-admission-probe');
const generated = read('local-validation/trajectory-generation-probe.json');
if (generated.status !== 'candidate') throw new Error('No generated capability candidate');
const workshop = new Workshop(path.join(root, 'candidates'), roots);
const candidate = workshop.create({ name: generated.name, content: generated.content,
  source_traces: [{ trace_id: 'synthetic-capability-probe', evidence_hash: digest(generated), original_task_group: 'synthetic-procurement-training' }],
  generation: { mode: 'synthetic_capability_probe_not_production_experience', identity: generated.identity, upstream_commit: generated.upstream_commit },
});
const policy = host.security.installPolicy.exec;
const result = workshop.admit(candidate.id, { command: policy.command, script: policy.args[0], env: policy.env, openclawVersion: '2026.7.1-2' });
// Do not persist host environment or credentials; candidate evidence only contains
// the local source path, policy response and content hash.
writeFileSync(path.join(root, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ id: result.id, status: result.status, artifact_hash: result.artifact_hash, published: false }));
