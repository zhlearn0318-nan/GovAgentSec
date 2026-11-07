import { mkdirSync, writeFileSync, readFileSync, renameSync, existsSync, lstatSync, realpathSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { digest } from './trace-store.mjs';

function save(file, value) {
  const temp = file + '.' + randomUUID() + '.tmp';
  writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(temp, file);
}
const inside = (parent, child) => { const rel = path.relative(parent, child); return !rel || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };
function resolvedTarget(target) {
  const absolute = path.resolve(target);
  return existsSync(absolute) ? realpathSync(absolute) : path.join(resolvedTarget(path.dirname(absolute)), path.basename(absolute));
}

// This first implementation intentionally only accepts instruction-only SKILL.md.
// It never executes model-generated code or adds candidates to a loader directory.
export class Workshop {
  constructor(root, loaderRoots) {
    if (!loaderRoots?.length) throw new Error('actual OpenClaw loader roots must be supplied');
    mkdirSync(root, { recursive: true });
    this.root = realpathSync(root);
    for (const loader of loaderRoots) {
      // Existing roots must be resolved through junctions before overlap checks.
      const resolved = resolvedTarget(loader);
      if (inside(resolved, this.root) || inside(this.root, resolved)) throw new Error('candidate area overlaps a skill loader root');
    }
  }
  directory(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('invalid candidate id');
    const dir = path.join(this.root, id);
    if (existsSync(dir) && (lstatSync(dir).isSymbolicLink() || !inside(this.root, realpathSync(dir)))) throw new Error('candidate escaped workshop');
    return dir;
  }
  read(id) {
    const dir = this.directory(id);
    const bundle = path.join(dir, 'bundle');
    if (lstatSync(bundle).isSymbolicLink() || realpathSync(bundle) !== bundle || readdirSync(bundle).join(',') !== 'SKILL.md') throw new Error('candidate bundle changed or linked');
    const file = path.join(dir, 'bundle', 'SKILL.md');
    if (lstatSync(file).isSymbolicLink() || !inside(dir, realpathSync(file))) throw new Error('linked candidate rejected');
    const candidate = JSON.parse(readFileSync(path.join(dir, 'candidate.json'), 'utf8'));
    if (candidate.id !== id || digest(readFileSync(file, 'utf8')) !== candidate.artifact_hash) throw new Error('candidate changed: create a new revision');
    return candidate;
  }
  create({ name, content, source_traces, generation }) {
    if (!/^[a-z][a-z0-9-]{2,63}$/.test(name)) throw new Error('invalid skill name');
    if (typeof content !== 'string' || Buffer.byteLength(content) > 64000 || !content.startsWith('---\n') || !content.includes(`name: ${name}\n`)) throw new Error('invalid skill document');
    if (!source_traces?.length || source_traces.some(s => !s.trace_id || !s.evidence_hash || !s.original_task_group)) throw new Error('source evidence and original task groups required');
    const id = randomUUID(), dir = this.directory(id);
    mkdirSync(dir);
    mkdirSync(path.join(dir, 'bundle'));
    const candidate = { schema_version: 1, id, name, status: 'draft', artifact_hash: digest(content), source_traces, generation, created_at: new Date().toISOString(), history: [] };
    writeFileSync(path.join(dir, 'bundle', 'SKILL.md'), content, { flag: 'wx', mode: 0o400 });
    save(path.join(dir, 'candidate.json'), candidate);
    return candidate;
  }
  transition(id, expected, status, evidence) {
    const candidate = this.read(id);
    if (candidate.status !== expected) throw new Error(`expected ${expected}, got ${candidate.status}`);
    candidate.history.push({ from: expected, to: status, at: new Date().toISOString(), evidence_hash: digest(evidence) });
    candidate.status = status;
    candidate[status] = evidence;
    save(path.join(this.directory(id), 'candidate.json'), candidate);
    return candidate;
  }
  admit(id, { command, script, env, openclawVersion }) {
    const candidate = this.read(id);
    if (candidate.status !== 'draft') throw new Error('only drafts can be admitted');
    if (path.basename(script) !== 'combined_install_policy.py') throw new Error('combined policy required');
    const request = { protocolVersion: 1, openclawVersion, targetType: 'skill', targetName: candidate.name, sourcePathKind: 'directory', sourcePath: path.join(this.directory(id), 'bundle') };
    let evidence;
    try {
      const result = spawnSync(command, [script], { input: JSON.stringify(request), encoding: 'utf8', timeout: 150000, maxBuffer: 1024 * 1024, windowsHide: true, shell: false, env: { ...process.env, ...env } });
      if (result.error || result.status !== 0) throw new Error('policy process failed');
      const response = JSON.parse(result.stdout);
      if (response.protocolVersion !== 1 || !['allow', 'block', 'warn'].includes(response.decision)) throw new Error('invalid admission response');
      evidence = { request, response, artifact_hash: candidate.artifact_hash, audit_kind: 'instruction_semantic_audit', code_executed: false };
      const infrastructureFailure = response.findings?.some(f => /FAILED|ERROR|TIMEOUT|UNAVAILABLE|INCONCLUSIVE/.test(f.ruleId));
      return this.transition(id, 'draft', infrastructureFailure ? 'unverified' : response.decision === 'allow' ? 'admission_passed' : 'rejected', evidence);
    } catch (error) {
      // A changed artifact is a hard error, never an alternative passing result.
      this.read(id);
      return this.transition(id, 'draft', 'unverified', { error: error.message, ...evidence });
    }
  }
  validate(id, evidence) {
    const candidate = this.read(id);
    if (!evidence || evidence.artifact_hash !== candidate.artifact_hash || !evidence.task_id || !evidence.original_task_group || !evidence.verifier_version || !evidence.result_hash) throw new Error('independent validation evidence required');
    if (candidate.source_traces.some(s => s.original_task_group === evidence.original_task_group)) throw new Error('validation task overlaps generation source');
    if (!evidence.cases?.length || !evidence.verifier_hash || !evidence.suite_hash || digest(evidence.cases) !== evidence.result_hash) throw new Error('verifier case evidence missing or changed');
    if (evidence.cases.some(t => candidate.source_traces.some(s => s.original_task_group === t.original_task_group))) throw new Error('validation cases overlap generation source');
    const verified = evidence.task_passed === true && evidence.unauthorized_effects === 0 && evidence.approvals_preserved === true && evidence.cases.every(t => t.task_passed && t.trace_status === 'complete' && t.unauthorized_attempts === 0 && t.unauthorized_effects === 0);
    return this.transition(id, 'admission_passed', verified ? 'validation_passed' : 'rejected', evidence);
  }
  requestApproval(id) {
    return this.transition(id, 'validation_passed', 'pending_approval', { message: 'Operator review and host reload verification required. No skill has been installed.' });
  }
}
