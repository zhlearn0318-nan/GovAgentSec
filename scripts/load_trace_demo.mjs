// Import verified, explicitly synthetic demo artifacts only. Never overwrite a chain.
import { mkdirSync, readFileSync, readdirSync, copyFileSync, existsSync, constants } from 'node:fs';
import path from 'node:path';
import { TraceStore } from '../modules/govagentsec-trace/store.mjs';
const source = path.resolve(process.argv[2]), target = path.resolve(process.argv[3] ?? 'local-validation/trace-audit');
const store = new TraceStore(path.join(source, 'traces'));
const summaries = store.list();
if (summaries.length !== 6 || summaries.some(t => t.source !== 'synthetic-fixture' || !store.read(t.trace_id).integrity.valid)) throw new Error('only the verified six-trace synthetic demo can be imported');
mkdirSync(path.join(target, 'traces'), { recursive: true });
for (const t of summaries) for (const suffix of ['', '.head.json']) {
  const from = store.file(t.trace_id) + suffix, to = path.join(target, 'traces', path.basename(from));
  if (existsSync(to)) { if (!readFileSync(to).equals(readFileSync(from))) throw new Error('demo ID already exists with different evidence'); }
  else copyFileSync(from, to, constants.COPYFILE_EXCL);
}
const workshop = path.join(source, 'skill-workshop');
for (const id of readdirSync(workshop).filter(id => /^[a-f0-9-]{36}$/.test(id))) {
  const record = JSON.parse(readFileSync(path.join(workshop, id, 'candidate.json'), 'utf8'));
  if (!record.generation?.test_only) throw new Error('only test candidates may be imported');
  const destination = path.join(target, 'skill-workshop', id); mkdirSync(path.join(destination, 'bundle'), { recursive: true });
  for (const file of ['candidate.json', 'bundle/SKILL.md']) if (!existsSync(path.join(destination, file))) copyFileSync(path.join(workshop, id, file), path.join(destination, file), constants.COPYFILE_EXCL);
}
console.log(JSON.stringify({ imported: 6, source: 'synthetic-fixture', target, installed: false }));
