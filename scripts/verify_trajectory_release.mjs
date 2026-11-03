// Filesystem/host-loader integration test. Validation evidence here is explicitly
// a test fixture, not a claim that the model or a production skill passed tasks.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Workshop } from '../modules/trajectory-governance/workshop.mjs';
import { Releases } from '../modules/trajectory-governance/releases.mjs';
import { digest } from '../modules/trajectory-governance/trace-store.mjs';

const root = path.resolve('local-validation/release-loader-' + Date.now());
const home = path.join(root, 'home'), state = path.join(home, '.openclaw'), workspace = path.join(root, 'workspace'), skillRoot = path.join(workspace, 'skills');
mkdirSync(state, { recursive: true }); mkdirSync(workspace, { recursive: true });
const config = path.join(state, 'openclaw.json');
writeFileSync(config, JSON.stringify({ agents: { defaults: { workspace } }, plugins: { enabled: false } }));
const realApprovals = path.join(os.homedir(), '.openclaw', 'exec-approvals.json');
const originalHash = existsSync(realApprovals) ? digest(readFileSync(realApprovals, 'utf8')) : null;
function verifyOriginal() {
  const current = existsSync(realApprovals) ? digest(readFileSync(realApprovals, 'utf8')) : null;
  if (current !== originalHash) throw new Error('original host approvals changed');
}
const w = new Workshop(path.join(root, 'candidates'), [skillRoot]);
const releases = new Releases(path.join(root, 'releases'), skillRoot, w);
function fixture(marker) {
  const c = w.create({ name: 'gov-release-probe', content: `---\nname: gov-release-probe\ndescription: ${marker}\n---\nSynthetic loader verification; never execute actions.\n`, source_traces: [{ trace_id: 'fixture', evidence_hash: 'fixture', original_task_group: 'fixture-training' }], generation: { mode: 'loader_test_fixture' } });
  w.transition(c.id, 'draft', 'admission_passed', { mode: 'loader_test_fixture' });
  const cases = [{ original_task_group: 'fixture-test', task_passed: true, trace_status: 'complete', unauthorized_attempts: 0, unauthorized_effects: 0 }];
  w.validate(c.id, { artifact_hash: c.artifact_hash, task_id: 'fixture', original_task_group: 'fixture-test', verifier_version: 'loader_test_fixture', verifier_hash: 'fixture', suite_hash: 'fixture', cases, result_hash: digest(cases), task_passed: true, unauthorized_effects: 0, approvals_preserved: true });
  w.requestApproval(c.id);
  return c;
}
function hostRead(marker) {
  const cli = path.join(process.env.APPDATA, 'npm', 'node_modules', 'openclaw', 'openclaw.mjs');
  const result = spawnSync(process.execPath, [cli, 'skills', 'info', 'gov-release-probe', '--json'], { encoding: 'utf8', timeout: 90000, windowsHide: true,
    env: { ...process.env, OPENCLAW_HOME: home, OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: config } });
  verifyOriginal();
  if (result.status !== 0 || !result.stdout.includes(marker)) throw new Error('host failed to load revision: ' + result.stderr.slice(-600));
  writeFileSync(path.join(root, marker + '.json'), result.stdout);
}
const a = fixture('GOV_LOADER_REV_A');
releases.publish(a.id, { actor: 'isolated-integration-test', confirmation: releases.review(a.id).confirmation }); hostRead('GOV_LOADER_REV_A');
const b = fixture('GOV_LOADER_REV_B');
releases.publish(b.id, { actor: 'isolated-integration-test', confirmation: releases.review(b.id).confirmation }); hostRead('GOV_LOADER_REV_B');
releases.rollback(a.name, a.artifact_hash, { actor: 'isolated-integration-test', confirmation: releases.rollbackReview(a.name, a.artifact_hash).confirmation }); hostRead('GOV_LOADER_REV_A');
verifyOriginal();
const report = { mode: 'isolated_loader_integration_not_skill_efficacy', root, published_A: true, updated_B: true, rolled_back_A: true, original_approvals_unchanged: true };
writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
