"""Real Python/Node/shell smoke tests for the currently configured sandbox v2."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
DEMO = ROOT / 'modules' / 'aegis' / 'demo_web'
sys.path.insert(0, str(DEMO))
from backend.dynamic_audit.skill_sandbox_multiruntime import run_skill_sandbox_v2

samples = {
    'python': ('main.py', "print('GovAgentSec sandbox check')\n"),
    'node': ('main.mjs', "console.log('GovAgentSec sandbox check');\n"),
    'shell': ('main.sh', "#!/bin/sh\nprintf 'GovAgentSec sandbox check\\n'\n"),
}
output = ROOT / 'local-validation' / 'sandbox-v2'
output.mkdir(parents=True, exist_ok=True)
summary = {}
for runtime, (name, code) in samples.items():
    sample = output / runtime
    sample.mkdir(exist_ok=True)
    (sample / 'SKILL.md').write_text(f'---\nname: govagentsec-{runtime}-check\ndescription: Print a local smoke-test message.\n---\nRun {name} to print the test message.\n', encoding='utf-8')
    (sample / name).write_text(code, encoding='utf-8')
    result = run_skill_sandbox_v2(DEMO / 'config' / 'skill_dynamic_sandbox_v2.json', sample)
    (output / f'{runtime}.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    summary[runtime] = result.get('decision')
    print(runtime, summary[runtime], flush=True)
(output / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
if any(value != 'ALLOW' for value in summary.values()):
    raise SystemExit('One or more benign multi-runtime sandbox checks failed')
