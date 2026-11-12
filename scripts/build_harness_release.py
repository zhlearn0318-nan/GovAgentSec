"""Build offline, prebuilt DSH bundle and source runtime; no dependency scripts.

All JS imports and static assets live inside the npm package. Python/model
dependencies are prepared separately; weights and local credentials are never
redistributed by this builder.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ADAPTER = ROOT / 'integrations/deepseek-harness'
PROTECT = 'modules/protect-agent-group1/智能体安全'
PART_BYTES = 1800 * 1024 * 1024


def sha(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def copy(source: Path, target: Path) -> None:
    if source.is_symlink() or not source.resolve().is_relative_to(ROOT):
        raise ValueError(f'Build input escapes repository: {source}')
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)


def inventory(directory: Path) -> dict:
    return {'files': [{'path': path.relative_to(directory).as_posix(), 'sha256': sha(path), 'bytes': path.stat().st_size}
                      for path in sorted(directory.rglob('*')) if path.is_file() and path.name != 'resources.json']}


def split_runtime(artifact: Path) -> list[dict]:
    parts = []
    total_bytes = artifact.stat().st_size
    with artifact.open('rb') as stream:
        for offset in range(0, total_bytes, PART_BYTES):
            size = min(PART_BYTES, total_bytes - offset)
            destination = artifact.with_name(f'{artifact.name}.part{len(parts) + 1:02}')
            digest = hashlib.sha256()
            remaining = size
            with destination.open('wb') as output:
                while remaining:
                    chunk = stream.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise OSError(f'Python artifact ended early: {artifact}')
                    output.write(chunk)
                    digest.update(chunk)
                    remaining -= len(chunk)
            parts.append({'file': destination.name, 'bytes': size, 'sha256': digest.hexdigest()})
    return parts


def archive(directory: Path, output: Path, prefix: str) -> dict:
    # Stable timestamps, ownership and order yield reproducible archives.
    with output.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as tar:
            for path in sorted(directory.rglob('*')):
                if not path.is_file():
                    continue
                data = path.read_bytes()
                info = tarfile.TarInfo(f'{prefix}/{path.relative_to(directory).as_posix()}')
                info.size, info.mode = len(data), 0o644
                tar.addfile(info, io.BytesIO(data))
    return {'file': output.name, 'sha256': sha(output), 'bytes': output.stat().st_size}


def build(output: Path, python_artifact: Path | None = None, model_root: Path | None = None,
          runtime_download_base: str | None = None) -> dict:
    if runtime_download_base and (not python_artifact or not re.fullmatch(
        r'https://github\.com/[\w.-]+/[\w.-]+/releases/download/[\w.-]+', runtime_download_base, re.ASCII
    )):
        raise ValueError('Runtime downloads require a Python artifact and a versioned GitHub Release URL')
    output.mkdir(parents=True, exist_ok=True)
    # Each build uses its own staging area; never deletes a caller supplied path.
    import tempfile
    with tempfile.TemporaryDirectory(prefix='harness-build-', dir=output) as temp:
        stage = Path(temp)
        package, runtime = stage / 'package', stage / 'runtime'
        package.mkdir()
        runtime.mkdir()
        manifest = json.loads((ADAPTER / 'package.json').read_text(encoding='utf-8'))
        version = manifest['version']
        for name in ('package.json', 'cordis.patch.yml'):
            copy(ADAPTER / name, package / name)
        visited = set()

        def js_closure(source: Path):
            source = source.resolve()
            if source in visited:
                return
            visited.add(source)
            copy(source, package / 'dist' / source.relative_to(ROOT))
            code = source.read_text(encoding='utf-8')
            for match in re.finditer(r'''(?:from\s*|import\s*\(|new URL\(\s*)['"](\.[^'"]+)['"]''', code):
                dependency = (source.parent / match[1]).resolve()
                if dependency.suffix in ('.mjs', '.js'):
                    js_closure(dependency)
                elif dependency.is_file():
                    copy(dependency, package / 'dist' / dependency.relative_to(ROOT))

        js_closure(ADAPTER / 'index.mjs')
        # CLI entry points are intentionally distributed for installed trace verification.
        js_closure(ROOT / 'modules/govagentsec-trace/cli.mjs')
        for directory in (ADAPTER / 'ui', ROOT / 'modules/govagentsec-ui'):
            for path in directory.rglob('*'):
                if path.is_file() and path.suffix in {'.css', '.svg', '.html', '.js'} and 'test' not in path.parts:
                    copy(path, package / 'dist' / path.relative_to(ROOT))
        for notice in ('LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES_SUPPLEMENTED.md'):
            copy(ROOT / notice, package / 'notices' / notice)
        for notice in ('modules/aegis/THIRD_PARTY_NOTICES.md',):
            copy(ROOT / notice, package / 'notices' / Path(notice).parent.name / Path(notice).name)
        write_json(package / 'resources.json', inventory(package))

        # Only code and reviewed rules. Exclude environments, tests, outputs,
        # local identities and all runtime/model/cache directories.
        trees = [PROTECT + '/' + part for part in ('agent', 'guards', 'risk', 'rag_security', 'security_eval', 'policy', 'tools', 'integrations/openclaw')]
        trees += ['modules/aegis/demo_web/backend', 'modules/aegis/demo_web/config',
                  'modules/supply-chain-group4/02-Skill供应链安全检测流水线',
                  *['modules/agentguard-group2/' + part for part in ('service', 'enforcement', 'security_kernel', 'identity', 'approval')],
                  'modules/agentguard-group2/integrations/openclaw_mcp', 'modules/agentguard-group2/policy']
        for tree in trees:
            for path in (ROOT / tree).rglob('*'):
                if path.is_file() and path.suffix in {'.py', '.rego', '.yaml', '.wat'} and not set(path.parts) & {'test', 'tests', '__pycache__', 'outputs', 'node_modules'}:
                    copy(path, runtime / path.relative_to(ROOT))
        group4 = 'modules/supply-chain-group4/02-Skill供应链安全检测流水线/'
        for relative in ('integrations/deepseek-harness/scan_skill.py', 'models.lock.json', 'requirements-protect-lock.txt',
                         'modules/agentguard-group2/data/agent_guard.json',
                         'modules/agentguard-group2/schemas/action_input.schema.json',
                         'modules/agentguard-group2/schemas/decision_output.schema.json',
                         group4 + 'rules.json', group4 + 'third_stage_runtime/file_level_map.json',
                         group4 + 'fourth_stage_sandbox/behavior_rules.json'):
            copy(ROOT / relative, runtime / relative)
        write_json(runtime / 'runtime.json', {'protocolVersion': 1, 'runtimeVersion': version, 'mode': 'real',
                                            'pythonDependencies': 'wheelhouse/requirements.lock' if python_artifact else None,
                                            'pythonDependenciesArtifact': 'release.python' if python_artifact else None, 'models': 'models.lock.json',
                                            'modelsIncluded': False, 'pythonIncluded': False})
        for notice in ('LICENSE', 'THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES_SUPPLEMENTED.md'):
            copy(ROOT / notice, runtime / 'notices' / notice)
        copy(ROOT / 'modules/agentguard-group2/LICENSE', runtime / 'notices/agentguard/LICENSE')
        write_json(runtime / 'resources.json', inventory(runtime))
        release = {'protocolVersion': 1, 'version': version, 'hostVersion': '0.2.2-alpha.2',
                   'source': {'version': (ROOT / 'VERSION').read_text(encoding='utf-8').strip(),
                              'commit': subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()},
                   'bundle': archive(package, output / f'govagentsec-harness-{version}.tgz', 'package'),
                   'runtime': archive(runtime, output / f'govagentsec-runtime-{version}.tar.gz', 'runtime'),
                   'releaseStatus': 'development', 'signedInstaller': False,
                   'acceptance': {'cleanWindows': False, 'distributionHarness': False},
                   'modelLockSha256': sha(ROOT / 'models.lock.json')}
        if python_artifact:
            metadata = json.loads((python_artifact.parent / 'python-artifact.json').read_text(encoding='utf-8'))
            if python_artifact.name != metadata['file'] or sha(python_artifact) != metadata['sha256']:
                raise ValueError('Python runtime artifact digest mismatch')
            with zipfile.ZipFile(python_artifact) as python_archive:
                inventory_entry = python_archive.getinfo('resources.json')
                if inventory_entry.file_size > 16 * 1024 * 1024:
                    raise ValueError('Python runtime inventory is oversized')
                metadata['resourcesSha256'] = hashlib.sha256(python_archive.read(inventory_entry)).hexdigest()
            destination = output / python_artifact.name
            if not destination.exists() or sha(destination) != metadata['sha256']:
                temporary = destination.with_name(destination.name + '.partial')
                temporary.unlink(missing_ok=True)
                try:
                    os.link(python_artifact, temporary)
                except OSError:
                    shutil.copyfile(python_artifact, temporary)
                temporary.replace(destination)
            release['python'] = metadata
            if runtime_download_base:
                metadata['distribution'] = {'baseUrl': runtime_download_base, 'parts': split_runtime(destination)}
        if model_root:
            lock = json.loads((ROOT / 'models.lock.json').read_text(encoding='utf-8'))
            files = [(model['directory'] + '/' + item['name'], item['sha256']) for model in lock['models'] for item in model['files']]
            files += [('TrustRAG/' + name, expected) for name, expected in lock['trustrag']['files'].items()]
            release['modelFiles'] = []
            for relative, expected in files:
                path = model_root / relative
                if sha(path) != expected:
                    raise ValueError(f'Model inventory digest mismatch: {relative}')
                release['modelFiles'].append({'path': relative, 'sha256': expected, 'bytes': path.stat().st_size})
        write_json(output / 'release.json', release)
        for source in ('scripts/harness_setup.py', 'scripts/harness_preflight.py', 'scripts/harness_python.py', 'scripts/harness_auto.py',
                       'scripts/verify_harness_release.mjs', 'scripts/verify_harness_lifecycle.mjs',
                       'scripts/prepare_harness_runtime.py', 'models.lock.json', 'installer/harness/Install-Harness.ps1',
                       'installer/harness/Advanced-Harness.ps1', 'installer/harness/OneClick-Worker.ps1', 'installer/harness/Python-Bootstrap.ps1'):
            copy(ROOT / source, output / Path(source).name)
        # Windows PowerShell 5.1 needs a BOM to display the Chinese installer UI.
        for name in ('Install-Harness.ps1', 'Advanced-Harness.ps1', 'OneClick-Worker.ps1', 'Python-Bootstrap.ps1'):
            installer = output / name
            installer.write_text(installer.read_text(encoding='utf-8-sig'), encoding='utf-8-sig')
        return release


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '.runtime/harness-release')
    parser.add_argument('--python-artifact', type=Path)
    parser.add_argument('--model-root', type=Path)
    parser.add_argument('--runtime-download-base', help='GitHub Release download URL through the tag name')
    args = parser.parse_args()
    print(json.dumps(build(args.output.resolve(), args.python_artifact.resolve() if args.python_artifact else None,
                           args.model_root.resolve() if args.model_root else None, args.runtime_download_base), ensure_ascii=True))
