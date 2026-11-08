"""U8 acceptance entry: no credentials, external API or production traces used."""
import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default=str(ROOT / 'config/model-routing.json'))
    args = parser.parse_args()
    result = subprocess.run(['node', str(ROOT / 'scripts/test_model_routing.mjs'), str(Path(args.config).resolve())],
                            cwd=ROOT, check=False)
    if result.returncode:
        print(f'Model routing smoke failed: node exit {result.returncode}; inspect local-validation/model-routing.',file=sys.stderr)
        return result.returncode
    python=ROOT/'modules/agentguard-group2/.venv/Scripts/python.exe'
    return subprocess.run([str(python),str(ROOT/'scripts/test_generation_local_only.py')],cwd=ROOT,check=False).returncode


if __name__ == '__main__':
    raise SystemExit(main())
