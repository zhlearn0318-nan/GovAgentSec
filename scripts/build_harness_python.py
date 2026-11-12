"""Rebuild an offline CPython + wheel snapshot from validated local installs.

RECORD hashes are checked while copying each distribution. The resulting wheels
are explicitly development snapshots, not upstream wheel/provenance claims.
"""
from __future__ import annotations
import base64
import configparser
import csv
from email import message_from_string
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import argparse
import subprocess
import sys
import zipfile

from packaging.markers import default_environment
from packaging.requirements import Requirement
from packaging.tags import sys_tags, parse_tag


def normalize(value: str) -> str:
    return re.sub(r'[-_.]+', '-', value).lower()


def select_closure(environments: dict, roots: list[dict]) -> dict:
    selected, extras, pending = {}, {}, []
    target = {**default_environment(), 'sys_platform': 'win32', 'os_name': 'nt', 'platform_system': 'Windows',
              'platform_machine': 'AMD64', 'python_version': '3.11', 'python_full_version': '3.11.9'}
    def add(requirement: Requirement, source=None):
        if requirement.url:
            raise ValueError('Direct URL dependencies cannot enter an installed snapshot')
        name = normalize(requirement.name)
        if name in selected:
            if not requirement.specifier.contains(selected[name]['version']):
                raise ValueError(f'Conflicting pinned distribution: {requirement}')
        else:
            candidates = [source] if source else list(environments)
            for candidate in candidates:
                package = environments[candidate]['packages'].get(name)
                if package and requirement.specifier.contains(package['version']):
                    selected[name] = dict(package, source=candidate)
                    extras[name] = set()
                    pending.append(name)
                    break
            else:
                raise ValueError(f'No pinned installed distribution satisfies {requirement}')
        if not set(requirement.extras).issubset(extras[name]):
            extras[name].update(requirement.extras)
            pending.append(name)
    for item in roots:
        add(Requirement(f'{item["name"]}=={item["version"]}'), item['source'])
    seen = set()
    while pending:
        name = pending.pop(0)
        state = (name, tuple(sorted(extras[name])))
        if state in seen:
            continue
        seen.add(state)
        for raw in selected[name]['requires']:
            requirement = Requirement(raw)
            if not requirement.marker or any(requirement.marker.evaluate({**target, 'extra': extra}) for extra in {'', *extras[name]}):
                add(requirement)
    return selected


def interpreter_files(base: Path):
    for name in ('python.exe', 'pythonw.exe', 'python3.dll', 'python311.dll', 'vcruntime140.dll', 'vcruntime140_1.dll', 'LICENSE.txt'):
        path = base / name
        if path.is_file():
            yield path
    for directory in ('Lib', 'DLLs', 'tcl'):
        for path in sorted((base / directory).rglob('*')):
            if path.is_file() and not set(path.relative_to(base).parts) & {'site-packages', '__pycache__', 'test', 'tests', 'idlelib'} and path.suffix != '.pyc':
                if path.is_symlink() or not path.resolve().is_relative_to(base.resolve()):
                    raise ValueError('Interpreter snapshot contains an external link')
                yield path


def repack_wheel(package: dict, output: Path) -> dict:
    root, info = Path(package['root']).resolve(), Path(package['info']).resolve()
    if not info.is_relative_to(root):
        raise ValueError('Distribution metadata escapes site-packages')
    wheel = message_from_string((info / 'WHEEL').read_text(encoding='utf-8'))
    compatible = set(sys_tags())
    tag = next((raw for raw in wheel.get_all('Tag', []) if parse_tag(raw) & compatible), None)
    if tag is None:
        raise ValueError(f'No compatible wheel tag for {package["name"]}')
    filename = f'{normalize(package["name"]).replace("-", "_")}-{package["version"]}-{tag}.whl'
    if Path(filename).name != filename or '/' in filename or '\\' in filename:
        raise ValueError('Invalid wheel metadata filename')
    entries = configparser.ConfigParser(interpolation=None)
    entries.optionxform = str
    if (info / 'entry_points.txt').exists():
        entries.read(info / 'entry_points.txt', encoding='utf-8')
    wrappers = {value for section in ('console_scripts', 'gui_scripts') if entries.has_section(section)
                for name in entries[section] for value in (name, name + '.exe', name + '-script.py')}
    record_bytes = (info / 'RECORD').read_bytes()
    records = list(csv.reader(io.StringIO(record_bytes.decode('utf-8'))))
    destination = output / filename
    partial = destination.with_name(destination.name + '.partial')
    rewritten = []
    installed_bytes = 0
    try:
        with zipfile.ZipFile(partial, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            seen = set()
            for raw, expected, size in sorted(records):
                relative = PurePosixPath(raw)
                archive_name = raw
                if relative.suffix == '.pyc' or '__pycache__' in relative.parts:
                    continue
                source = root.joinpath(*relative.parts).resolve()
                if not source.is_relative_to(root):
                    if source.parent.name.casefold() == 'scripts' and source.name in wrappers:
                        continue  # pip regenerates declared entry-point wrappers.
                    prefix = Path(package.get('prefix', root)).resolve()
                    if source.is_relative_to(prefix) and source.relative_to(prefix).parts[0] in {'share', 'include'}:
                        archive_name = info.name.removesuffix('.dist-info') + '.data/data/' + source.relative_to(prefix).as_posix()
                    else:
                        raise ValueError(f'RECORD file outside site-packages: {raw}')
                if relative.is_absolute() or ('..' in relative.parts and archive_name == raw) or '\\' in raw or ':' in raw:
                    raise ValueError('Unsafe distribution RECORD path')
                if source.parent == info and source.name in {'RECORD', 'INSTALLER', 'REQUESTED', 'direct_url.json'}:
                    continue
                if not expected or not expected.startswith('sha256='):
                    raise ValueError(f'Unverified RECORD entry: {raw}')
                if archive_name.casefold() in seen:
                    raise ValueError('Duplicate distribution RECORD entry')
                seen.add(archive_name.casefold())
                member = zipfile.ZipInfo(archive_name, (1980, 1, 1, 0, 0, 0)); member.compress_type = zipfile.ZIP_DEFLATED
                member.external_attr = 0o100644 << 16
                hasher, actual_size = hashlib.sha256(), 0
                with source.open('rb') as incoming, archive.open(member, 'w', force_zip64=True) as outgoing:
                    while block := incoming.read(1024 * 1024):
                        hasher.update(block); actual_size += len(block); outgoing.write(block)
                actual = 'sha256=' + base64.urlsafe_b64encode(hasher.digest()).decode().rstrip('=')
                if actual != expected or str(actual_size) != size:
                    raise ValueError(f'Installed RECORD hash mismatch: {raw}')
                rewritten.append([archive_name, actual, actual_size]); installed_bytes += actual_size
            record_path = info.relative_to(root).as_posix() + '/RECORD'
            buffer = io.StringIO(newline=''); csv.writer(buffer).writerows(rewritten + [[record_path, '', '']])
            member = zipfile.ZipInfo(record_path, (1980, 1, 1, 0, 0, 0)); member.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(member, buffer.getvalue().encode('utf-8'))
        partial.replace(destination)
    except Exception:
        partial.unlink(missing_ok=True)
        raise
    with destination.open('rb') as stream:
        checksum = hashlib.file_digest(stream, 'sha256').hexdigest()
    return {'name': package['name'], 'version': package['version'], 'file': filename, 'sha256': checksum,
            'bytes': destination.stat().st_size, 'installedBytes': installed_bytes,
            'provenance': 'verified-installed-RECORD-snapshot', 'sourceRecordSha256': hashlib.sha256(record_bytes).hexdigest()}


def query_environment(python: Path) -> dict:
    code = '''import importlib.metadata as m,json,sys,struct
p={}
for d in m.distributions():
 files=d.files or []
 wheel=next((f for f in files if str(f).endswith('.dist-info/WHEEL')),None)
 if wheel is None: continue
 name=d.metadata['Name']
 p[name]={'name':name,'version':d.version,'root':str(d.locate_file('')),'info':str(d.locate_file(wheel).parent),'requires':d.requires or [],'prefix':sys.prefix}
print(json.dumps({'pythonVersion':sys.version.split()[0],'base':sys.base_prefix,'bits':struct.calcsize('P')*8,'packages':p}))
'''
    result = subprocess.run([str(python), '-I', '-c', code], capture_output=True, text=True, encoding='utf-8', check=True)
    environment = json.loads(result.stdout)
    if not environment['pythonVersion'].startswith('3.11.') or environment['bits'] != 64:
        raise ValueError('Runtime snapshot requires CPython 3.11 x64')
    environment['packages'] = {normalize(key): value for key, value in environment['packages'].items()}
    return environment


def file_hash(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def build_runtime(output: Path, sources: dict, roots_file: Path, version: str) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    cache = output / 'wheels'; cache.mkdir(exist_ok=True)
    environments = {key: query_environment(path) for key, path in sources.items()}
    roots = json.loads(roots_file.read_text(encoding='utf-8'))
    selected = select_closure(environments, roots['roots'])
    wheels = []
    for name, package in sorted(selected.items()):
        cached_record = cache / f'{name}.json'
        source_hash = file_hash(Path(package['info']) / 'RECORD')
        previous = json.loads(cached_record.read_text(encoding='utf-8')) if cached_record.exists() else None
        if previous and previous['sourceRecordSha256'] == source_hash and (cache / previous['file']).is_file() and file_hash(cache / previous['file']) == previous['sha256']:
            artifact = previous
        else:
            artifact = repack_wheel(package, cache)
            cached_record.write_text(json.dumps(artifact, indent=2), encoding='utf-8')
        wheels.append(artifact)
        print(f'Verified wheel: {artifact["name"]} {artifact["version"]}', flush=True)
    base = Path(environments['protect']['base'])
    required = [base / name for name in ('python.exe', 'python311.dll', 'Lib/os.py', 'Lib/venv/__init__.py', 'Lib/ensurepip/__init__.py', 'LICENSE.txt')]
    if any(not path.is_file() for path in required):
        raise ValueError('CPython source is incomplete for an independent runtime')
    files = {'python/' + path.relative_to(base).as_posix(): path for path in interpreter_files(base)}
    files.update({'wheelhouse/' + wheel['file']: cache / wheel['file'] for wheel in wheels})
    requirements = '# Verified installed distribution snapshots; offline wheels only.\n' + ''.join(
        f'{item["name"]}=={item["version"]} --hash=sha256:{item["sha256"]}\n' for item in wheels)
    descriptor = {'schemaVersion': 1, 'kind': 'govagentsec-python-runtime', 'runtimeVersion': version,
                  'platform': 'win_amd64', 'pythonMinor': '3.11', 'pythonVersion': environments['protect']['pythonVersion'],
                  'python': 'python/python.exe', 'wheelhouse': 'wheelhouse', 'requirements': 'wheelhouse/requirements.lock',
                  'installedWheelBytes': sum(item['installedBytes'] for item in wheels), 'packages': wheels,
                  'provenance': 'Development snapshot of CPython and installed distributions. Not an upstream wheel attestation.'}
    inline = {'wheelhouse/requirements.lock': requirements.encode('utf-8'),
              'python-runtime.json': (json.dumps(descriptor, indent=2) + '\n').encode('utf-8')}
    inventory = [{'path': name, 'sha256': file_hash(path), 'bytes': path.stat().st_size} for name, path in sorted(files.items())]
    inventory += [{'path': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)} for name, data in sorted(inline.items())]
    inline['resources.json'] = (json.dumps({'files': inventory}, indent=2) + '\n').encode('utf-8')
    artifact = output / f'govagentsec-python-{version}-cp311-win_amd64.zip'
    temporary = artifact.with_name(artifact.name + '.partial')
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for name, path in sorted(files.items()):
                member = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0)); member.external_attr = 0o100644 << 16
                member.compress_type = zipfile.ZIP_STORED if name.endswith('.whl') else zipfile.ZIP_DEFLATED
                with path.open('rb') as incoming, archive.open(member, 'w', force_zip64=True) as outgoing:
                    import shutil
                    shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
            for name, data in sorted(inline.items()):
                member = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0)); member.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(member, data)
        temporary.replace(artifact)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    report = {'file': artifact.name, 'sha256': file_hash(artifact), 'bytes': artifact.stat().st_size,
              'expandedBytes': sum(item['bytes'] for item in inventory) + len(inline['resources.json']),
              'installedWheelBytes': descriptor['installedWheelBytes'], 'packageCount': len(wheels),
              'pythonVersion': descriptor['pythonVersion'], 'platform': descriptor['platform'], 'provenance': descriptor['provenance']}
    (output / 'python-artifact.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--protect-python', type=Path, required=True)
    parser.add_argument('--scanner-python', type=Path, required=True)
    parser.add_argument('--roots', type=Path, default=root / 'installer/harness/runtime-roots.json')
    parser.add_argument('--output', type=Path, default=root / '.runtime/harness-python')
    args = parser.parse_args()
    version = json.loads((root / 'integrations/deepseek-harness/package.json').read_text(encoding='utf-8'))['version']
    print(json.dumps(build_runtime(args.output.resolve(), {'protect': args.protect_python, 'scanner': args.scanner_python}, args.roots, version)), flush=True)
