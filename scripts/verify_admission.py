"""Exercise the actual combined policy process with generated deployment environment."""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--batch', type=Path, default=ROOT / '.runtime/config-batch.json')
    args = parser.parse_args()
    batch = json.loads(args.batch.read_text(encoding='utf-8'))
    policy = next(row['value']['exec'] for row in batch if row['path'] == 'security.installPolicy')
    cases = [('skill', 'skills/benign_doc_summary', 'allow'),
             ('skill', 'skills/malicious_prompt_injection', 'block'),
             ('plugin', 'openclaw_plugins/benign_mcp_plugin', 'allow'),
             ('plugin', 'openclaw_plugins/blocked_runtime_fetch_only', 'block')]
    results = []
    for kind, relative, expected in cases:
        source = ROOT / 'modules/aegis/fixtures' / relative
        payload = {'protocolVersion': 1, 'openclawVersion': '2026.7.1-2',
                   'targetType': kind, 'targetName': 'govagentsec-verify-' + source.name,
                   'sourcePath': str(source), 'sourcePathKind': 'directory',
                   'source': {'kind': 'local-path', 'mutable': False},
                   'request': {'kind': 'skill-install' if kind == 'skill' else 'plugin-dir', 'mode': 'preflight'}}
        result = subprocess.run([policy['command'], *policy['args']],
                                input=json.dumps(payload).encode(), capture_output=True,
                                env=policy['env'], timeout=150, check=True)
        response = json.loads(result.stdout)
        verdict = response.get('decision')
        results.append({'case': source.name, 'decision': verdict, 'expected': expected})
        print(json.dumps(results[-1]), flush=True)
        if verdict != expected:
            raise RuntimeError(f'Combined policy failed: {source.name}: {verdict}; rules=' +
                               ','.join(str(f.get('ruleId')) for f in response.get('findings', [])))
    folder = ROOT / 'local-validation'
    folder.mkdir(exist_ok=True)
    (folder / 'combined-admission.json').write_text(json.dumps(results, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
