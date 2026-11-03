import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { TraceStore, digest, redact } from './trace-store.mjs';
import { LocalJudge } from './local-judge.mjs';
import { selectExperiences } from './gates.mjs';
import { Workshop } from './workshop.mjs';
import { validateCandidate } from './validation.mjs';
import { Releases } from './releases.mjs';
import { assessTrace, calibrate, comparisonPlan } from './assessment.mjs';

const [command, configPath, ...args] = process.argv.slice(2);
const json = file => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const print = result => console.log(JSON.stringify(result, null, 2));
const config = configPath ? json(configPath) : {};
const root = path.resolve(config.dataDir ?? 'local-validation/trajectory');
const store = () => new TraceStore(path.join(root, 'traces'));
const workshop = () => new Workshop(path.join(root, 'candidates'), config.loaderRoots);
const releases = () => {
  if (!config.publishRoot) throw new Error('explicit publishRoot required');
  return new Releases(path.join(root, 'releases'), config.publishRoot, workshop());
};

async function main() {
  if (command === 'list') return print(store().list());
  if (command === 'inspect') return print(store().read(args[0]));
  if (command === 'review') {
    const trace = store().read(args[0]);
    if (trace.summary.trace_status !== 'complete') throw new Error('only complete traces can be reviewed');
    const judge = new LocalJudge(config.judge);
    const reviews = {};
    for (const kind of ['safety', 'efficiency', 'recovery', 'factuality']) reviews[kind] = await judge.review(kind, trace.events);
    const result = { trace_id: args[0], evidence_hash: digest(trace.events), reviews, production_decision: 'unverified', reason: 'task oracle, data review and calibration required' };
    mkdirSync(path.join(root, 'reviews'), { recursive: true });
    writeFileSync(path.join(root, 'reviews', args[0] + '.json'), JSON.stringify(result, null, 2));
    return print(result);
  }
  if (command === 'select') return print(selectExperiences(json(args[0]), args[1], Number(args[2])));
  if (command === 'assess') {
    const input = json(args[1]);
    const result = await assessTrace(store(), args[0], { ...input, judge: config.judge, calibration: config.calibration });
    mkdirSync(path.join(root, 'reviews'), { recursive: true });
    writeFileSync(path.join(root, 'reviews', args[0] + '.record.json'), JSON.stringify(result, null, 2));
    return print(result);
  }
  if (command === 'calibrate') { const input = json(args[0]); return print(calibrate(input.rows, input.identity, input.requirements)); }
  if (command === 'compare-plan') return print(comparisonPlan(json(args[0]), { taskFamily: args[1], k: Number(args[2]), seed: args[3] }));
  if (command === 'generate') {
    const records = json(args[0]);
    const selection = selectExperiences(records, args[1], Number(args[2]));
    if (!selection.selected.length) return print({ status: 'skipped', reason: 'no_eligible_experiences', decisions: selection.decisions });
    const sessions = selection.selected.map(r => {
      const trace = store().read(r.trace_id);
      if (trace.summary.trace_status !== 'complete' || digest(trace.events) !== r.evidence_hash || !r.original_task_group) throw new Error('source evidence changed or source group missing');
      return { session_id: r.trace_id, _trajectory: JSON.stringify(redact(trace.events)), _summary: 'Independent task oracle passed. Preserve approvals and authorization boundaries.' };
    });
    if (!config.python) throw new Error('python runtime path is required');
    const adapter = fileURLToPath(new URL('./skillclaw_adapter.py', import.meta.url));
    const result = spawnSync(config.python, [adapter], { input: JSON.stringify({ sessions, endpoint: config.judge.endpoint, model: config.judge.model }), encoding: 'utf8', timeout: 300000, maxBuffer: 1024 * 1024, windowsHide: true, env: { ...process.env, PYTHONUTF8: '1' } });
    if (result.error || result.status !== 0) throw new Error('generation failed: ' + (result.stdout || result.error?.message));
    const generated = JSON.parse(result.stdout);
    if (generated.status !== 'candidate') return print(generated);
    const candidate = workshop().create({ name: generated.name, content: generated.content,
      source_traces: selection.selected.map(r => ({ trace_id: r.trace_id, evidence_hash: r.evidence_hash, original_task_group: r.original_task_group })),
      generation: { identity: generated.identity, upstream_commit: generated.upstream_commit },
    });
    return print(candidate);
  }
  if (command === 'admit') return print(workshop().admit(args[0], config.admission));
  if (command === 'candidate') return print(workshop().read(args[0]));
  if (command === 'validate') return print(await validateCandidate(workshop(), args[0], { judge: config.judge, outputDir: path.join(root, 'validations', args[0]) }));
  if (command === 'request-approval') return print(workshop().requestApproval(args[0]));
  if (command === 'release-review') return print(releases().review(args[0]));
  if (command === 'publish') return print(releases().publish(args[0], { actor: args[1], confirmation: args[2] }));
  if (command === 'rollback-review') return print(releases().rollbackReview(args[0], args[1]));
  if (command === 'rollback') return print(releases().rollback(args[0], args[1], { actor: args[2], confirmation: args[3] }));
  if (command === 'recover') return print(releases().recover(args[0]));
  throw new Error('Usage: node cli.mjs COMMAND CONFIG [args]. Commands documented in README.md.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
