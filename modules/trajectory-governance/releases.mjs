import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, realpathSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest } from './trace-store.mjs';

function atomic(file, content) {
  const temp = file + '.' + randomUUID() + '.tmp';
  writeFileSync(temp, content, { mode: 0o600 });
  renameSync(temp, file);
}
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const hashFile = p => existsSync(p) ? digest(readFileSync(p, 'utf8')) : null;
const isWithin = (root, target) => { const r = path.relative(root, target); return !r || (!r.startsWith('..') && !path.isAbsolute(r)); };

// Operator-only local CLI. No model-facing tool or HTTP write route is registered.
// One SKILL.md is the atomic loader-facing unit; immutable revisions live outside
// the loader. A prepared transaction makes crash recovery explicit and checkable.
export class Releases {
  constructor(root, skillRoot, workshop) {
    mkdirSync(root, { recursive: true }); mkdirSync(skillRoot, { recursive: true });
    this.root = realpathSync(root); this.skillRoot = realpathSync(skillRoot); this.workshop = workshop;
    if (isWithin(this.skillRoot, this.root) || isWithin(this.root, this.skillRoot) || isWithin(this.skillRoot, workshop.root) || isWithin(workshop.root, this.skillRoot)) throw new Error('release archive and candidates must be outside loader');
  }
  name(name) { if (!/^[a-z][a-z0-9-]{2,63}$/.test(name)) throw new Error('invalid skill name'); return name; }
  paths(name) {
    this.name(name);
    const archive = path.join(this.root, name), active = path.join(this.skillRoot, name);
    for (const [root, folder] of [[this.root, archive], [this.skillRoot, active]]) {
      if (existsSync(folder) && realpathSync(folder) !== folder) throw new Error('linked release directory rejected');
      if (!isWithin(root, folder)) throw new Error('release path escaped root');
    }
    return { archive, active, current: path.join(archive, 'current.json'), pending: path.join(archive, 'pending.json'), file: path.join(active, 'SKILL.md') };
  }
  current(name) {
    const p = this.paths(name);
    if (existsSync(p.pending)) throw new Error('interrupted release; run recover before continuing');
    const current = existsSync(p.current) ? json(p.current) : null;
    if (hashFile(p.file) !== (current?.artifact_hash ?? null)) throw new Error('active skill was modified or is unmanaged');
    if (existsSync(p.active) && readdirSync(p.active).some(f => f !== 'SKILL.md')) throw new Error('unexpected files in managed skill');
    return current;
  }
  review(id) {
    const c = this.workshop.read(id);
    if (c.generation?.test_only) throw new Error('test-evidence candidates cannot be published');
    if (c.status !== 'pending_approval') throw new Error('candidate is not pending approval');
    const validation = c.validation_passed;
    if (!validation?.task_passed || validation.artifact_hash !== c.artifact_hash || !validation.verifier_hash || !validation.suite_hash || !validation.cases?.length || digest(validation.cases) !== validation.result_hash || validation.cases.some(t => !t.task_passed || t.trace_status !== 'complete')) throw new Error('verified independent task evidence required');
    const old = this.current(c.name);
    const content = readFileSync(path.join(this.workshop.directory(id), 'bundle', 'SKILL.md'), 'utf8');
    const proposal = { action: 'publish', candidate_id: id, name: c.name, artifact_hash: c.artifact_hash,
      previous_hash: old?.artifact_hash ?? null, validation_hash: digest(validation), destination: this.paths(c.name).file };
    return { ...proposal, confirmation: digest(proposal), content, previous_content: old ? readFileSync(this.paths(c.name).file, 'utf8') : null, validation };
  }
  publish(id, { actor, confirmation }) {
    const review = this.review(id);
    if (!actor?.trim() || confirmation !== review.confirmation) throw new Error('operator and exact reviewed confirmation required');
    return this.#install({ name: review.name, artifact_hash: review.artifact_hash, content: review.content,
      candidate_id: id, validation_hash: review.validation_hash, confirmation, actor, action: 'publish' });
  }
  rollbackReview(name, version) {
    this.name(name);
    if (!/^[a-f0-9]{64}$/.test(version)) throw new Error('invalid revision hash');
    const current = this.current(name);
    if (!current) throw new Error('no managed current version');
    const file = path.join(this.paths(name).archive, 'versions', version + '.json');
    const old = json(file);
    if (old.artifact_hash !== version || digest(old.content) !== version || old.name !== name) throw new Error('archived revision corrupted');
    if (this.workshop.read(old.candidate_id).status !== 'published') throw new Error('rollback target is revoked or not published');
    if (current.artifact_hash === version) throw new Error('revision already active');
    const proposal = { action: 'rollback', name, previous_hash: current.artifact_hash, artifact_hash: version, destination: this.paths(name).file };
    return { ...proposal, confirmation: digest(proposal), revision: old };
  }
  rollback(name, version, { actor, confirmation }) {
    const review = this.rollbackReview(name, version);
    if (!actor?.trim() || confirmation !== review.confirmation) throw new Error('operator and exact rollback confirmation required');
    return this.#install({ ...review.revision, actor, confirmation, action: 'rollback' });
  }
  #install(revision) {
    const previous = this.current(revision.name), p = this.paths(revision.name);
    if (digest(revision.content) !== revision.artifact_hash) throw new Error('revision content changed');
    mkdirSync(path.join(p.archive, 'versions'), { recursive: true }); mkdirSync(p.active, { recursive: true });
    const savedVersion = path.join(p.archive, 'versions', revision.artifact_hash + '.json');
    if (!existsSync(savedVersion)) writeFileSync(savedVersion, JSON.stringify(revision, null, 2), { flag: 'wx', mode: 0o400 });
    const record = { ...revision, transaction_id: randomUUID(), previous_hash: previous?.artifact_hash ?? null, at: new Date().toISOString(), loader_status: 'reload_required' };
    // Acquire one writer per skill before changing the active file.
    writeFileSync(p.pending, JSON.stringify(record, null, 2), { flag: 'wx', mode: 0o600 });
    if (hashFile(p.file) !== record.previous_hash) throw new Error('active file changed before installation; recover required');
    atomic(p.file, revision.content);
    return this.recover(revision.name);
  }
  recover(name) {
    const p = this.paths(name);
    if (!existsSync(p.pending)) return this.current(name);
    const record = json(p.pending);
    if (record.name !== name || digest(record.content) !== record.artifact_hash || !record.actor || !record.confirmation) throw new Error('invalid release journal');
    const activeHash = hashFile(p.file);
    if (activeHash !== record.artifact_hash) {
      if (activeHash !== record.previous_hash) throw new Error('unexpected active content: manual reconciliation required');
      // No active change occurred. Cancel preparation; a fresh confirmation is required.
      unlinkSync(p.pending);
      return this.current(name);
    }
    const { content, ...current } = record;
    atomic(p.current, JSON.stringify(current, null, 2));
    const history = path.join(p.archive, record.transaction_id + '.json');
    if (!existsSync(history)) writeFileSync(history, JSON.stringify(current, null, 2), { flag: 'wx', mode: 0o600 });
    if (record.action === 'publish') {
      const c = this.workshop.read(record.candidate_id);
      if (c.status === 'pending_approval') this.workshop.transition(c.id, 'pending_approval', 'published', current);
      else if (c.status !== 'published') throw new Error('candidate state changed during publication');
    } else if (record.previous_hash) {
      // Rollback marks the superseded candidate as revoked without altering snapshots.
      const previousFile = path.join(p.archive, 'versions', record.previous_hash + '.json');
      const old = json(previousFile), c = this.workshop.read(old.candidate_id);
      if (c.status === 'published') this.workshop.transition(c.id, 'published', 'revoked', current);
    }
    unlinkSync(p.pending);
    return current;
  }
}
