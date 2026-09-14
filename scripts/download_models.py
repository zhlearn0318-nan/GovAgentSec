"""Download reviewed official assets, pinned by models.lock.json."""
from __future__ import annotations

import hashlib
from http.client import IncompleteRead
import json
from pathlib import Path
import shutil
import urllib.request
import time
import argparse
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]


def fetch(url: str, target: Path, expected: str | None = None) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and expected:
        with target.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() == expected:
                return
    partial = target.with_name(target.name + '.partial')
    for attempt in range(12):
        offset = partial.stat().st_size if partial.exists() else 0
        headers = {'User-Agent': 'GovAgentSec-installer/1.0'}
        if offset:
            headers['Range'] = f'bytes={offset}-'
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                append = response.status == 206 and offset > 0
                if append and not response.headers.get('Content-Range', '').startswith(f'bytes {offset}-'):
                    raise RuntimeError('Invalid download range')
                with partial.open('ab' if append else 'wb') as out:
                    while chunk := response.read(1024 * 1024):
                        out.write(chunk)
            if expected:
                with partial.open('rb') as stream:
                    actual = hashlib.file_digest(stream, 'sha256').hexdigest()
                if actual != expected:
                    print(f'Retrying incomplete {target.name}: {partial.stat().st_size} bytes', flush=True)
                    continue
            partial.replace(target)
            return
        except (OSError, TimeoutError, IncompleteRead) as error:
            print(f'Retrying {target.name}: {type(error).__name__}', flush=True)
            time.sleep(2)
    raise RuntimeError(f'Could not download and verify {target.name}')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--small-only', action='store_true')
    parser.add_argument('--model', default='')
    args = parser.parse_args()
    lock = json.loads((ROOT / 'models.lock.json').read_text(encoding='utf-8'))
    def download_model(model):
        for item in model['files']:
            name = item['name']
            if args.small_only and name.endswith(('.safetensors', '.bin')):
                continue
            relative = Path(name)
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError('Invalid asset path')
            target = ROOT / 'models' / model['directory'] / relative
            print(f"Downloading {model['repository']}/{name}", flush=True)
            fetch(f"https://huggingface.co/{model['repository']}/resolve/{model['revision']}/{name}", target, item.get('sha256'))
    selected = [model for model in lock['models'] if not args.model or model['directory'] == args.model]
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(download_model, selected))
    dependency = lock['trustrag']
    for name in ('defend_module.py', 'LICENSE', 'README.md'):
        fetch(f"https://raw.githubusercontent.com/HuichiZhou/TrustRAG/{dependency['revision']}/{name}", ROOT / 'third_party' / 'TrustRAG' / name, dependency.get('files', {}).get(name))
    print('Official assets downloaded.', flush=True)


if __name__ == '__main__':
    main()
