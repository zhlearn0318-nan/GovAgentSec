import path from 'node:path';
import { readFileSync } from 'node:fs';
import { TraceStore } from './store.mjs';
import { generateCandidate } from './evolution.mjs';
import { assess, LocalJudge } from './scoring.mjs';
import { makeLocalJudge } from './local-judges.mjs';
const [command, root, id, value] = process.argv.slice(2);
const json = f => JSON.parse(readFileSync(f, 'utf8'));
try {
  if (!root) throw new Error('Usage: cli.mjs list|verify|inspect|assign|assess|generate DATA_DIR [trace_id|config.json] [task_key]');
  const store = new TraceStore(path.join(root, 'traces'));
  let result;
  if (command === 'list') result = store.list();
  else if (command === 'verify') { result = store.read(id).integrity; if (!result.valid) process.exitCode = 1; }
  else if (command === 'inspect') result = store.read(id);
  else if (command === 'assign') result = store.assign(id, { task_key: value, confirmed: true });
  else if (command === 'assess') {
    const config = json(value);
    const judge = makeLocalJudge(config);
    if (!(judge instanceof LocalJudge)) throw new Error('judge must extend LocalJudge');
    result = await assess(store.read(id), judge, config);
    store.append({ trace_id: id, event_type: 'assessment.completed', payload: result });
  }
  else if (command === 'generate') { const input = json(id), config = input.generation ?? input; result = generateCandidate(store, json(config.records), { ...config, workshopRoot: path.join(root, 'skill-workshop') }); }
  else throw new Error('unknown command');
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
