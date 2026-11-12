"""Prepare a separate model cache and optional Python venv from pinned assets.

Wheel installation is offline and requires a reviewed requirements file with
hashes. It never builds sdists or executes dependency install scripts.
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import shutil
import sys

from harness_setup import digest, download, relative_file, run, save


def prepare_models(lock: dict, cache: Path, reuse: Path | None = None) -> dict:
    cache.mkdir(parents=True, exist_ok=True)
    if reuse and cache.resolve() == reuse.resolve():
        raise ValueError('Use a separate cache when reusing an existing deployment')
    for model in lock['models']:
        for item in model['files']:
            name = model['directory'] + '/' + item['name']
            target = relative_file(cache, name)
            if target.exists() and digest(target) == item['sha256']:
                continue
            source = relative_file(reuse, name) if reuse else None
            if source and source.is_file() and digest(source) == item['sha256']:
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists():
                    target.unlink()
                try:
                    os.link(source, target)
                except OSError:
                    shutil.copyfile(source, target)
            else:
                download(f'https://huggingface.co/{model["repository"]}/resolve/{model["revision"]}/{item["name"]}', target, item['sha256'])
    trust = cache / 'TrustRAG'
    for name, expected in lock['trustrag']['files'].items():
        target = relative_file(trust, name)
        source = relative_file(reuse / 'TrustRAG', name) if reuse else None
        if not (target.is_file() and digest(target) == expected) and source and source.is_file() and digest(source) == expected:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
        download(f'https://raw.githubusercontent.com/HuichiZhou/TrustRAG/{lock["trustrag"]["revision"]}/{name}',
                 target, expected)
    return {'modelRoot': str(cache.resolve()), 'trustRagModule': str((trust / 'defend_module.py').resolve())}


def prepare_python(python: Path, venv: Path, wheelhouse: Path, requirements: Path) -> str:
    marker = venv / 'govagentsec-environment.json'
    if venv.exists() and not marker.exists():
        raise ValueError('Refusing to change an environment not created by this installer')
    requirements_hash = digest(requirements)
    if marker.exists():
        previous = json.loads(marker.read_text(encoding='utf-8'))
        if previous.get('managedBy') != 'govagentsec-harness' or previous.get('requirementsSha256') != requirements_hash:
            raise ValueError('Managed environment requirements differ; use a new versioned environment')
    if not venv.exists():
        venv.mkdir(parents=True)
        save(marker, {'managedBy': 'govagentsec-harness', 'requirementsSha256': requirements_hash, 'state': 'preparing'})
    executable = venv / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    if not executable.is_file():
        run([str(python), '-I', '-m', 'venv', str(venv)])
    try:
        run([str(executable), '-I', '-m', 'pip', '--isolated', '--disable-pip-version-check', 'install', '--no-index',
             '--find-links', str(wheelhouse), '--only-binary=:all:', '--require-hashes', '--no-compile', '-r', str(requirements)], timeout=600)
        run([str(executable), '-I', '-m', 'pip', '--isolated', 'check'], timeout=60)
    except RuntimeError as error:
        raise RuntimeError('Offline Python dependency preparation failed; verify the wheelhouse and retry. ' + str(error)) from error
    save(marker, {'managedBy': 'govagentsec-harness', 'requirementsSha256': requirements_hash, 'state': 'ready'})
    return str(executable.resolve())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    bundled_lock = Path(__file__).resolve().parent / 'models.lock.json'
    parser.add_argument('--lock', type=Path, default=bundled_lock if bundled_lock.exists() else bundled_lock.parent.parent / 'models.lock.json')
    parser.add_argument('--models', type=Path, required=True)
    parser.add_argument('--reuse-models', type=Path)
    parser.add_argument('--python', type=Path, default=Path(sys.executable))
    parser.add_argument('--venv', type=Path)
    parser.add_argument('--wheelhouse', type=Path)
    parser.add_argument('--requirements', type=Path)
    args = parser.parse_args()
    if args.venv and not (args.wheelhouse and args.requirements):
        parser.error('--venv requires a wheelhouse and a reviewed requirements lock with hashes')
    result = prepare_models(json.loads(args.lock.read_text(encoding='utf-8')), args.models.resolve(),
                            args.reuse_models.resolve() if args.reuse_models else None)
    if args.venv:
        result['python'] = prepare_python(args.python.resolve(), args.venv.resolve(), args.wheelhouse.resolve(), args.requirements.resolve())
    print(json.dumps(result, ensure_ascii=True, indent=2))
