"""Read-only planning for the Windows CUDA runtime installation."""
from __future__ import annotations
import csv
import ctypes
import hashlib
import os
from pathlib import Path, PurePosixPath
import platform
import shutil
import struct
import subprocess

GiB = 1024**3


def parse_gpus(text: str) -> list[dict]:
    result = []
    for row in csv.reader(text.splitlines()):
        if not row:
            continue
        if len(row) != 3 or not row[0].strip() or not row[1].strip():
            raise ValueError('Invalid NVIDIA driver inventory')
        result.append({'name': row[0].strip(), 'driverVersion': row[1].strip(), 'memoryMiB': int(row[2].strip())})
    return result


def machine_info() -> dict:
    memory = 0
    if os.name == 'nt':
        class MemoryStatus(ctypes.Structure):
            _fields_ = [('length', ctypes.c_ulong), ('load', ctypes.c_ulong)] + [
                (name, ctypes.c_ulonglong) for name in ('totalPhysical', 'availablePhysical', 'totalPage', 'availablePage',
                                                       'totalVirtual', 'availableVirtual', 'availableExtended')]
        status = MemoryStatus(); status.length = ctypes.sizeof(status)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            memory = status.totalPhysical
    try:
        probe = subprocess.run(['nvidia-smi', '--query-gpu=name,driver_version,memory.total', '--format=csv,noheader,nounits'],
                               capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=10,
                               creationflags=0x08000000 if os.name == 'nt' else 0)
        gpus = parse_gpus(probe.stdout) if probe.returncode == 0 else []
    except (OSError, ValueError, subprocess.SubprocessError):
        gpus = []
    return {'system': platform.system(), 'bits': struct.calcsize('P') * 8, 'memoryBytes': memory, 'gpus': gpus}


def volume_info(path: Path) -> tuple[str, int]:
    existing = path.resolve()
    while not existing.exists():
        existing = existing.parent
    return str(existing.stat().st_dev), shutil.disk_usage(existing).free


def check_volumes(demands: list[dict], probe=volume_info) -> list[dict]:
    volumes = {}
    for item in demands:
        volume, free = probe(Path(item['path']))
        row = volumes.setdefault(volume, {'volume': volume, 'freeBytes': free, 'requiredBytes': 0, 'paths': []})
        row['requiredBytes'] += item['bytes']
        row['freeBytes'] = min(row['freeBytes'], free)
        row['paths'].append(str(item['path']))
    return [dict(row, ok=row['freeBytes'] >= row['requiredBytes']) for row in volumes.values()]


def model_plan(root: Path, files: list[dict]) -> dict:
    network = writes = worst = 0
    missing = []
    for item in files:
        relative = PurePosixPath(item['path'])
        if relative.is_absolute() or '..' in relative.parts or '\\' in item['path'] or ':' in item['path']:
            raise ValueError('Invalid model inventory path')
        path = root.joinpath(*relative.parts)
        if not path.resolve().is_relative_to(root.resolve()):
            raise ValueError('Model inventory escapes cache')
        if path.is_file() and path.stat().st_size == item['bytes']:
            with path.open('rb') as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() == item['sha256']:
                    continue
        partial = path.with_name(path.name + '.partial')
        offset = partial.stat().st_size if partial.is_file() else 0
        missing.append(item['path'])
        writes += item['bytes']; worst += item['bytes']
        network += item['bytes'] - min(offset, item['bytes'])
    return {'downloadBytes': network, 'worstCaseDownloadBytes': worst, 'writeBytes': writes,
            'missingFiles': missing, 'downloadEstimate': 'Existing partial downloads may need restarting if corrupted.'}


def evaluate(release: dict, *, install_root: Path, model_root: Path, managed_python: bool,
             machine: dict | None = None, volume_probe=volume_info) -> dict:
    machine = machine if machine is not None else machine_info()
    issues = []
    def issue(component, code, recovery, severity='error'):
        issues.append({'component': component, 'code': code, 'severity': severity, 'recovery': recovery})
    if machine['system'] != 'Windows' or machine['bits'] != 64:
        issue('platform', 'WINDOWS_X64_REQUIRED', 'Use the Windows x64 release with a 64-bit interpreter.')
    if not machine['gpus']:
        issue('cuda', 'NVIDIA_DRIVER_UNAVAILABLE', 'Install a compatible NVIDIA driver, then verify nvidia-smi before retrying.')
    elif max(gpu['memoryMiB'] for gpu in machine['gpus']) < 7500:
        issue('cuda', 'GPU_MEMORY_BELOW_TESTED_8GB', 'The tested configuration uses an 8 GB GPU. Real model probes must still pass.', 'warning')
    if machine['memoryBytes'] and machine['memoryBytes'] < 8 * GiB:
        issue('memory', 'RAM_BELOW_8GB', 'Free memory or use a machine with at least 8 GB RAM; real model loading remains mandatory.')
    models = model_plan(model_root, release.get('modelFiles', []))
    if 'modelFiles' not in release:
        models.update(downloadBytes=None, worstCaseDownloadBytes=None)
        issue('models', 'MODEL_SIZE_INVENTORY_MISSING', 'Build the release with --model-root to publish verified model sizes.', 'warning')
    package = release.get('python') if managed_python else None
    if managed_python and not package:
        issue('python', 'MANAGED_PYTHON_MISSING', 'Select a release containing the managed Python artifact, or provide a prepared Python environment.')
    code_bytes = 128 * 1024**2 + 4 * (release['bundle']['bytes'] + release['runtime']['bytes'])
    demands = [{'path': str(install_root), 'bytes': code_bytes + (package.get('expandedBytes', 0) + package.get('installedWheelBytes', 0) if package else 0)},
               {'path': str(model_root), 'bytes': models['writeBytes']}]
    volumes = check_volumes(demands, volume_probe)
    for volume in volumes:
        if not volume['ok']:
            issue('disk', 'INSUFFICIENT_DISK', f'Free space on the volume containing {volume["paths"][0]}; required {volume["requiredBytes"]} bytes.')
    return {'schemaVersion': 1, 'ok': not any(row['severity'] == 'error' for row in issues),
            'machine': machine, 'volumes': volumes, 'models': models, 'managedPython': managed_python,
            'pythonArtifactBytes': package.get('bytes', 0) if package else 0,
            'issues': issues, 'realModelProbeRequired': True}
