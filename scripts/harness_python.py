"""Validate, extract and prepare the versioned offline Python artifact."""
from __future__ import annotations
import json
from pathlib import Path, PurePosixPath
import shutil
import stat
import tempfile
import zipfile

from harness_setup import digest, relative_file, verify_inventory
from prepare_harness_runtime import prepare_python


def validate_members(artifact: Path, expected: dict) -> list:
    with zipfile.ZipFile(artifact) as archive:
        members = archive.infolist()
        if len(members) > 50000 or sum(item.file_size for item in members) > expected['expandedBytes']:
            raise ValueError('Python artifact exceeds declared extraction limits')
        names = set()
        reserved = {'CON', 'PRN', 'AUX', 'NUL', *{f'{prefix}{index}' for prefix in ('COM', 'LPT') for index in range(1, 10)}}
        for item in members:
            path = PurePosixPath(item.filename)
            if path.is_absolute() or not path.parts or '..' in path.parts or '\\' in item.filename or ':' in item.filename:
                raise ValueError('Unsafe Python artifact path')
            if any(part.endswith(('.', ' ')) or part.split('.')[0].upper() in reserved for part in path.parts):
                raise ValueError('Python artifact contains Windows path aliases')
            kind = stat.S_IFMT(item.external_attr >> 16)
            if item.is_dir() or kind not in (0, stat.S_IFREG):
                raise ValueError('Python artifact contains links or unsupported entries')
            if item.filename.casefold() in names:
                raise ValueError('Python artifact contains duplicate paths')
            names.add(item.filename.casefold())
        return members


def extract_python(artifact: Path, target: Path, expected: dict, version: str) -> dict:
    if digest(artifact) != expected['sha256']:
        raise ValueError('Python artifact digest mismatch')
    members = validate_members(artifact, expected)
    target.mkdir(parents=True, exist_ok=False)
    with zipfile.ZipFile(artifact) as archive:
        for member in members:
            destination = relative_file(target, member.filename)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as incoming, destination.open('xb') as outgoing:
                shutil.copyfileobj(incoming, outgoing, 1024 * 1024)
    if digest(target / 'resources.json') != expected['resourcesSha256']:
        raise ValueError('Python runtime inventory digest mismatch')
    verify_inventory(target)
    descriptor = json.loads((target / 'python-runtime.json').read_text(encoding='utf-8'))
    if descriptor.get('schemaVersion') != 1 or descriptor.get('runtimeVersion') != version or descriptor.get('platform') != 'win_amd64' or descriptor.get('pythonMinor') != '3.11':
        raise ValueError('Incompatible Python runtime artifact')
    return descriptor


def prepare_managed_python(artifact: Path, expected: dict, install_root: Path, version: str) -> Path:
    root = install_root / 'python' / expected['sha256'][:24]
    root.mkdir(parents=True, exist_ok=True)
    lock = root / '.prepare.lock'
    try:
        with lock.open('x', encoding='utf-8') as output:
            output.write('govagentsec-harness')
    except FileExistsError:
        raise RuntimeError('Another installer is preparing this Python runtime; retry after it finishes') from None
    try:
        payload = root / 'payload'
        if not payload.exists():
            with tempfile.TemporaryDirectory(prefix='staging-', dir=root) as temp:
                staged = Path(temp) / 'payload'
                extract_python(artifact, staged, expected, version)
                # Both paths are owned children of the explicitly selected root.
                if not staged.resolve().is_relative_to(root.resolve()) or not payload.resolve().is_relative_to(root.resolve()):
                    raise ValueError('Python staging path escapes installation root')
                staged.replace(payload)
        if digest(payload / 'resources.json') != expected['resourcesSha256']:
            raise ValueError('Cached Python runtime inventory digest mismatch')
        verify_inventory(payload)
        descriptor = json.loads((payload / 'python-runtime.json').read_text(encoding='utf-8'))
        executable = prepare_python(relative_file(payload, descriptor['python']), root / 'environment',
                                    relative_file(payload, descriptor['wheelhouse']), relative_file(payload, descriptor['requirements']))
        return Path(executable)
    finally:
        lock.unlink(missing_ok=True)
