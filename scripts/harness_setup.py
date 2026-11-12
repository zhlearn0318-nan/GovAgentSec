"""Transactional, current-user DeepSeek Harness deployment.

Uses the host package manager for bundle registration. Never rewrites a complete
profile, adopts a PID, deletes models, or treats registration as E2E acceptance.
"""
from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
from dataclasses import dataclass, field
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from urllib.parse import urljoin, urlparse
import uuid

BEGIN = '# BEGIN GOVAGENTSEC MANAGED INTEGRATION'
END = '# END GOVAGENTSEC MANAGED INTEGRATION'
PACKAGE = 'govagentsec-harness'
VERSION = '1.0.0-alpha.1'


def digest(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def atomic(path: Path, value: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        temporary.write_bytes(value)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def save(path: Path, value) -> None:
    atomic(path, (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))


def run(command: list[str], *, env=None, cwd=None, timeout=600) -> str:
    result = subprocess.run(command, check=False, capture_output=True, encoding='utf-8', errors='replace',
                            env=env, cwd=cwd, timeout=timeout, creationflags=0x08000000 if os.name == 'nt' else 0)
    if result.returncode:
        # Do not print child output: package manager/model logs can contain secrets.
        raise RuntimeError(f'{Path(command[0]).name} failed (exit {result.returncode}); component did not pass validation')
    return result.stdout


def managed_span(data: bytes):
    begin, end = BEGIN.encode(), END.encode()
    if data.count(begin) != data.count(end) or data.count(begin) > 1:
        raise ValueError('Malformed GovAgentSec managed block; refusing to change profile')
    if begin not in data:
        return None
    start, stop = data.index(begin), data.index(end) + len(end)
    if stop < start or (start and data[start - 1:start] != b'\n'):
        raise ValueError('Malformed GovAgentSec managed block ordering')
    return start, stop


def update_managed(data: bytes, content: bytes | None) -> bytes:
    span = managed_span(data)
    block = BEGIN.encode() + b'\n' + content.rstrip(b'\r\n') + b'\n' + END.encode() if content is not None else b''
    if span:
        updated = data[:span[0]] + block + data[span[1]:]
        if content is None and not any(line.strip() and not line.lstrip().startswith(b'#') for line in updated.splitlines()):
            return updated + b'[]\n'
        return updated
    if content is None:
        if not any(line.strip() and not line.lstrip().startswith(b'#') for line in data.splitlines()):
            return data + b'[]\n'
        return data
    # Empty array has to become a YAML sequence before adding a row.
    if data.strip() in (b'[]', b''):
        return block
    meaningful = [line.strip() for line in data.splitlines() if line.strip() and not line.lstrip().startswith(b'#')]
    if len(meaningful) == 1 and re.fullmatch(rb'\[\][ \t]*(?:#.*)?', meaningful[0]):
        empty = re.search(rb'(?m)^[ \t]*\[\][ \t]*(#[^\r\n]*)?(?:\r?\n|$)', data)
        suffix = data[empty.end():]
        replacement = (empty[1] + b'\n' if empty[1] else b'') + block
        if suffix and not suffix.startswith((b'\r', b'\n')):
            replacement += b'\n'
        return data[:empty.start()] + replacement + suffix
    return data + (b'' if data.endswith(b'\n') else b'\n') + block


def relative_file(directory: Path, name: str) -> Path:
    if not isinstance(name, str) or '\\' in name or ':' in name or '\x00' in name:
        raise ValueError('Invalid release path')
    relative = PurePosixPath(name)
    if relative.is_absolute() or '..' in relative.parts or not relative.parts:
        raise ValueError('Invalid release path')
    result = directory.joinpath(*relative.parts)
    if not result.resolve().is_relative_to(directory.resolve()):
        raise ValueError('Release path escapes directory')
    return result


def read_release(directory: Path) -> dict:
    record = json.loads((directory / 'release.json').read_text(encoding='utf-8'))
    if record.get('protocolVersion') != 1 or record.get('version') != VERSION or record.get('hostVersion') != '0.2.2-alpha.2':
        raise ValueError('Unsupported release version or protocol')
    for key in ('bundle', 'runtime'):
        item = record[key]
        if digest(relative_file(directory, item['file'])) != item['sha256']:
            raise ValueError(f'{key} digest mismatch')
    return record


def verify_inventory(root: Path) -> None:
    inventory = json.loads((root / 'resources.json').read_text(encoding='utf-8'))
    for item in inventory['files']:
        if digest(relative_file(root, item['path'])) != item['sha256']:
            raise ValueError(f'Installed resource digest mismatch: {item["path"]}')


def extract(artifact: Path, target: Path, prefix: str) -> None:
    with tarfile.open(artifact, 'r:gz') as archive:
        members = archive.getmembers()
        if len(members) > 10000 or sum(item.size for item in members) > 100 * 1024 * 1024:
            raise ValueError('Release exceeds extraction limit')
        names = set()
        for item in members:
            if not item.isfile() or not item.name.startswith(prefix + '/') or item.name in names:
                raise ValueError('Release contains unsupported or duplicate entries')
            names.add(item.name)
            path = relative_file(target, item.name[len(prefix) + 1:])
            path.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(item) as source, path.open('xb') as output:
                shutil.copyfileobj(source, output)
    verify_inventory(target)


class HTTPSRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlparse(newurl).scheme != 'https':
            raise ValueError('HTTPS download cannot redirect to another protocol')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(url: str, target: Path, expected: str) -> None:
    if urlparse(url).scheme != 'https' or not re.fullmatch('[0-9a-f]{64}', expected):
        raise ValueError('Downloads require HTTPS and a pinned SHA-256 digest')
    if target.exists() and digest(target) == expected:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + '.partial')
    offset = partial.stat().st_size if partial.exists() else 0
    request = urllib.request.Request(url, headers={'Range': f'bytes={offset}-'} if offset else {})
    with urllib.request.build_opener(HTTPSRedirect()).open(request, timeout=60) as response:
        append = response.status == 206 and offset > 0
        if append and not response.headers.get('Content-Range', '').startswith(f'bytes {offset}-'):
            raise ValueError('Invalid resumed download range')
        with partial.open('ab' if append else 'wb') as output:
            shutil.copyfileobj(response, output, 1024 * 1024)
    if digest(partial) != expected:
        partial.unlink(missing_ok=True)
        raise ValueError('Downloaded artifact digest mismatch; retry download')
    partial.replace(target)


@dataclass
class InstallOptions:
    release: Path
    install_root: Path
    dsh_home: Path
    profile: str
    dsh_command: list[str]
    python: Path
    model_root: Path
    trustrag_module: Path
    scan_roots: list[Path]
    loader_roots: list[Path]
    scanner_python: Path | None = None
    agentguard: dict = field(default_factory=dict)
    managed_python_artifact: Path | None = None
    prepare_models: bool = False
    auto_skill_roots: bool = False
    auto_skill_directories: list[str] = field(default_factory=list)
    auto_skill_project_roots: bool = True
    previous_installation: dict | None = None
    previous_deployment: Path | None = None
    package_manager_args: list[str] = field(default_factory=list)

    def profile_dir(self) -> Path:
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', self.profile):
            raise ValueError('Invalid target profile')
        return self.dsh_home / 'profiles' / self.profile

    def deployment(self) -> Path:
        key = hashlib.sha256(str(self.profile_dir().resolve()).casefold().encode('utf-8')).hexdigest()[:24]
        return self.install_root / 'profiles' / key


@contextmanager
def profile_lock(options: InstallOptions):
    profile = options.profile_dir()
    if not (profile / 'cordis.patch.yml').is_file():
        raise ValueError('Initialize the target Harness profile first')
    lock = profile / '.govagentsec-install.lock'
    try:
        with lock.open('x', encoding='utf-8') as output:
            output.write(json.dumps({'pid': os.getpid(), 'profile': options.profile}))
    except FileExistsError:
        raise RuntimeError(f'Profile installation is locked: {lock}; close the installer before recovering a stale lock') from None
    try:
        yield
    finally:
        lock.unlink(missing_ok=True)


def check_inactive(deployment: Path) -> None:
    for owner in (deployment / 'state/instances').glob('*/owner.json'):
        record = json.loads(owner.read_text(encoding='utf-8'))
        pid = record.get('pid')
        if not isinstance(pid, int) or pid <= 0:
            raise RuntimeError('Invalid instance ownership record; repair it before installation')
        if process_running(pid):
            raise RuntimeError('Close the target Harness profile before changing its deployment')


def process_running(pid: int) -> bool:
    if os.name == 'nt':
        # os.kill(pid, 0) can terminate a process on Windows. Query only.
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            if ctypes.get_last_error() == 87:
                return False
            raise RuntimeError('Cannot establish whether the target host is stopped')
        try:
            code = wintypes.DWORD()
            if not kernel.GetExitCodeProcess(handle, ctypes.byref(code)):
                raise RuntimeError('Cannot read host process state')
            return code.value == 259
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def secure_token(path: Path) -> None:
    if not path.exists():
        atomic(path, secrets.token_hex(32).encode('ascii'))
    if os.name == 'nt':
        # SID rather than account display name handles domain/Chinese usernames.
        # Change only the DACL. Changing ownership also requests WRITE_OWNER,
        # which normal writable install directories may deliberately deny.
        script = "$ErrorActionPreference='Stop';$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=[Security.AccessControl.FileSecurity]::new();$a.SetAccessRuleProtection($true,$false);$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'));[IO.File]::SetAccessControl($env:GOVAGENTSEC_TOKEN_FILE,$a)"
        run(['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', base64.b64encode(script.encode('utf-16-le')).decode('ascii')],
            env={**os.environ, 'GOVAGENTSEC_TOKEN_FILE': str(path)})
    else:
        path.chmod(0o600)


def preflight_components(options: InstallOptions, runtime: Path, config: dict) -> None:
    probe_env = {**os.environ, 'PYTHONUTF8': '1'}
    if options.managed_python_artifact:
        probe_env.pop('PYTHONHOME', None); probe_env.pop('PYTHONPATH', None)
        probe_env['PYTHONNOUSERSITE'] = '1'
    for path in [options.python, options.scanner_python or options.python, options.trustrag_module, *options.scan_roots, *options.loader_roots]:
        if not path.exists() or not path.is_absolute():
            raise ValueError(f'Missing absolute component path: {path}')
    if not options.scan_roots or not options.loader_roots:
        raise ValueError('Confirm scan roots and all Skill loader roots before installing')
    lock = json.loads((runtime / 'models.lock.json').read_text(encoding='utf-8'))
    if digest(options.trustrag_module) != lock['trustrag']['files']['defend_module.py']:
        raise ValueError('TrustRAG module digest mismatch')
    for model in lock['models']:
        for item in model['files']:
            path = relative_file(options.model_root, model['directory'] + '/' + item['name'])
            if digest(path) != item['sha256']:
                raise ValueError(f'Model digest mismatch: {model["directory"]}/{item["name"]}')
    # Actual model inference; this never reports a rule baseline as ready.
    probe = '''import sys
from integrations.openclaw.sidecar import build_real_adapter,OpenClawScreeningService,ScreenRequest
from risk.output_guard import OutputContext,MessageRole
a=build_real_adapter(sys.argv[1],sys.argv[2])
s=OpenClawScreeningService(a)
for req in [ScreenRequest('input','Summarize the public service status.'),
            ScreenRequest('tool_result','The public service is operating normally.',query='Summarize public service status.'),
            ScreenRequest('output','The public service is operating normally.',output_context=OutputContext(original_task='Summarize public service status.',role=MessageRole.AGENT))]:
 r=s.screen(req)
 assert r.detectors_available and r.decision=='ALLOW'
'''
    run([str(options.python), '-c', probe, str(options.model_root), str(options.trustrag_module)],
        cwd=runtime / 'modules/protect-agent-group1/智能体安全', env=probe_env, timeout=600)
    # Exercise installed scanners, including rules and policy files, on an inert fixture.
    with tempfile.TemporaryDirectory(prefix='scanner-probe-', dir=options.deployment()) as temp:
        fixture = Path(temp)
        (fixture / 'SKILL.md').write_text('---\nname: public-summary\ndescription: Summarize supplied public text.\n---\nSummarize supplied public text.', encoding='utf-8')
        (fixture / 'skill_config.json').write_text(json.dumps({'skill_name': 'public-summary', 'access_level': 'public'}), encoding='utf-8')
        output = run([str(options.scanner_python or options.python), str(runtime / 'integrations/deepseek-harness/scan_skill.py'),
                      '--path', str(fixture), '--roots-json', json.dumps([str(fixture)])], env=probe_env)
        result = json.loads(output)
        if result.get('decision') not in ('ALLOW', 'REVIEW') or not result.get('tree_sha256'):
            raise RuntimeError('Installed Skill scanner probe failed')


def preflight_installation(options: InstallOptions, release: dict, *, runner=run, host_version=None) -> dict:
    from harness_preflight import evaluate
    report = evaluate(release, install_root=options.install_root, model_root=options.model_root,
                      managed_python=options.managed_python_artifact is not None)
    try:
        host_version = host_version if host_version is not None else runner(options.dsh_command + ['--version'],
            env={**os.environ, 'DSH_HOME': str(options.dsh_home)}, timeout=30).strip()
        report['host'] = {'version': host_version, 'expectedVersion': release['hostVersion']}
        if not re.search(r'(?<![\w.-])0\.2\.2-alpha\.2(?![\w.-])', host_version):
            raise ValueError('Unsupported host version')
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError):
        report['issues'].append({'component': 'host', 'code': 'HARNESS_UNAVAILABLE_OR_INCOMPATIBLE', 'severity': 'error',
                                 'recovery': 'Select the installed Harness 0.2.2-alpha.2 CLI or its JavaScript entry point.'})
    cached_payload = options.install_root / 'python' / release.get('python', {}).get('sha256', '')[:24] / 'payload'
    if options.managed_python_artifact and not options.managed_python_artifact.is_file() and not (cached_payload / 'python-runtime.json').is_file():
        report['issues'].append({'component': 'python', 'code': 'PYTHON_ARTIFACT_NOT_FOUND', 'severity': 'error',
                                 'recovery': 'Place the offline Python artifact beside the installer, or select its path.'})
    for root in [*options.scan_roots, *options.loader_roots]:
        if not root.is_absolute() or not root.is_dir():
            report['issues'].append({'component': 'skills', 'code': 'INVALID_SKILL_ROOT', 'severity': 'error',
                                     'recovery': f'Select an existing absolute Skill root: {root}'})
    if not options.scan_roots or not options.loader_roots:
        report['issues'].append({'component': 'skills', 'code': 'SKILL_ROOTS_REQUIRED', 'severity': 'error',
                                 'recovery': 'Confirm the allowed scan roots and all Skill loader roots.'})
    report['ok'] = not any(item['severity'] == 'error' for item in report['issues'])
    return report


def managed_content(data: bytes) -> bytes | None:
    span = managed_span(data)
    if span is None:
        return None
    return data[span[0] + len(BEGIN):span[1] - len(END)].strip(b'\r\n')


def encoded(data: bytes | None):
    return None if data is None else base64.b64encode(data).decode('ascii')


def decoded(value):
    return None if value is None else base64.b64decode(value)


def restore(options: InstallOptions, journal: dict, runner) -> None:
    env = {**os.environ, 'DSH_HOME': str(options.dsh_home)}
    previous = journal.get('previous')
    if journal['phase'] in ('registering', 'configured', 'validated'):
        if previous:
            runner(options.dsh_command + ['plugin', '--profile', options.profile, 'add', previous['bundlePath'], '--ignore-scripts', '--config.auto-install-peers=false'] + options.package_manager_args, env=env)
        else:
            runner(options.dsh_command + ['plugin', '--profile', options.profile, 'remove', PACKAGE, '--config.ignore-scripts=true'] + options.package_manager_args, env=env)
    patch = options.profile_dir() / 'cordis.patch.yml'
    atomic(patch, update_managed(patch.read_bytes(), decoded(journal['managedBefore'])))
    config_file = options.deployment() / 'runtime.json'
    if journal.get('configBefore') is not None:
        atomic(config_file, decoded(journal['configBefore']))
    else:
        config_file.unlink(missing_ok=True)
    target_previous = journal.get('targetPrevious', previous)
    if target_previous:
        save(options.deployment() / 'installation.json', target_previous)
    else:
        (options.deployment() / 'installation.json').unlink(missing_ok=True)
    journal['phase'] = 'rolled_back'
    save(options.deployment() / 'journal.json', journal)


def install(options: InstallOptions, *, runner=run) -> dict:
    release = read_release(options.release)
    env = {**os.environ, 'DSH_HOME': str(options.dsh_home)}
    host_version = runner(options.dsh_command + ['--version'], env=env)
    if not re.search(r'(?<![\w.-])0\.2\.2-alpha\.2(?![\w.-])', host_version):
        raise ValueError('Unsupported Harness version; expected 0.2.2-alpha.2')
    report = preflight_installation(options, release, runner=runner, host_version=host_version)
    if not report['ok']:
        errors = [row['component'] + ': ' + row['recovery'] for row in report['issues'] if row['severity'] == 'error']
        raise ValueError('Installation preflight failed: ' + '; '.join(errors))
    deployment = options.deployment()
    deployment.mkdir(parents=True, exist_ok=True)
    with profile_lock(options):
        check_inactive(deployment)
        if options.previous_deployment:
            check_inactive(options.previous_deployment)
        journal_file = deployment / 'journal.json'
        if journal_file.exists():
            journal = json.loads(journal_file.read_text(encoding='utf-8'))
            if journal['phase'] not in ('committed', 'rolled_back', 'uninstalled'):
                restore(options, journal, runner)
        patch = options.profile_dir() / 'cordis.patch.yml'
        original = patch.read_bytes()
        managed_span(original)  # Validate before any registration.
        existing_record = deployment / 'installation.json'
        target_previous = json.loads(existing_record.read_text(encoding='utf-8')) if existing_record.exists() else None
        previous = target_previous or options.previous_installation
        config_file = deployment / 'runtime.json'
        if options.managed_python_artifact:
            from harness_python import prepare_managed_python
            executable = prepare_managed_python(options.managed_python_artifact, release['python'], options.install_root, release['version'])
            options.python = executable
            options.scanner_python = executable
        if options.prepare_models:
            from prepare_harness_runtime import prepare_models
            model_lock = json.loads((options.release / 'models.lock.json').read_text(encoding='utf-8'))
            prepared = prepare_models(model_lock, options.model_root)
            options.trustrag_module = Path(prepared['trustRagModule'])
        runtime = options.install_root / 'releases' / (release['version'] + '-' + release['runtime']['sha256'][:12])
        runtime.parent.mkdir(parents=True, exist_ok=True)
        if not runtime.exists():
            with tempfile.TemporaryDirectory(prefix='staging-', dir=runtime.parent) as temporary:
                staged = Path(temporary) / 'runtime'
                extract(relative_file(options.release, release['runtime']['file']), staged, 'runtime')
                staged.replace(runtime)
        verify_inventory(runtime)
        bundle = options.install_root / 'artifacts' / release['bundle']['sha256'] / release['bundle']['file']
        if not bundle.exists():
            bundle.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(relative_file(options.release, release['bundle']['file']), bundle)
        if digest(bundle) != release['bundle']['sha256']:
            raise ValueError('Cached bundle digest mismatch')
        config = {'protocolVersion': 1, 'runtimeVersion': release['version'], 'runtimeRoot': str(runtime),
                  'stateDir': str(deployment / 'state'), 'pythonPath': str(options.python),
                  'scannerPython': str(options.scanner_python or options.python), 'mode': 'real',
                  'modelRoot': str(options.model_root), 'trustRagModule': str(options.trustrag_module),
                  'tokenFile': str(deployment / 'protect-agent.token'),
                  'allowedRoots': [str(path) for path in options.scan_roots],
                  'skillLoaderRoots': [str(path) for path in options.loader_roots],
                  'autoSkillRoots': options.auto_skill_roots,
                  'autoSkillDirectories': options.auto_skill_directories,
                  'autoSkillProjectRoots': options.auto_skill_project_roots,
                  'agentGuard': options.agentguard,
                  'highImpactTools': ['bash', 'pwsh', 'exec', 'write', 'edit', 'apply_patch', 'run_code', 'cordis']}
        preflight_components(options, runtime, config)
        secure_token(Path(config['tokenFile']))
        journal = {'phase': 'prepared', 'previous': previous, 'targetPrevious': target_previous, 'managedBefore': encoded(managed_content(original)),
                   'configBefore': encoded(config_file.read_bytes()) if config_file.exists() else None}
        save(journal_file, journal)
        try:
            journal['phase'] = 'registering'; save(journal_file, journal)
            runner(options.dsh_command + ['plugin', '--profile', options.profile, 'add', str(bundle), '--ignore-scripts', '--config.auto-install-peers=false'] + options.package_manager_args, env=env)
            save(config_file, config)
            content = ('- id: govagentsec-security\n  config: ' + json.dumps({'runtimeConfigFile': str(config_file)}, ensure_ascii=False)).encode('utf-8')
            atomic(patch, update_managed(patch.read_bytes(), content))
            journal['phase'] = 'configured'; save(journal_file, journal)
            effective = runner(options.dsh_command + ['--profile', options.profile, '--dump-config'], env=env)
            if len(re.findall(r'^\s*-?\s*id:\s*[\'\"]?govagentsec-security[\'\"]?\s*$', effective, re.M)) != 1:
                raise RuntimeError('Expected exactly one GovAgentSec hook in the composed profile')
            record = {'version': release['version'], 'runtimeRoot': str(runtime), 'bundlePath': str(bundle),
                      'runtimeConfigFile': str(config_file), 'profile': options.profile, 'dshHome': str(options.dsh_home),
                      'status': 'restart_required', 'componentProbePassed': True,
                      'hostVersion': release['hostVersion'], 'endToEndPassed': False,
                      'managedPython': options.managed_python_artifact is not None, 'pythonPath': str(options.python),
                      'preflightPassed': True}
            save(existing_record, record)
            journal['phase'] = 'committed'; save(journal_file, journal)
            return record
        except Exception:
            try:
                restore(options, journal, runner)
            except Exception as recovery:
                raise RuntimeError('Installation failed and rollback requires repair; rerun repair before starting Harness') from recovery
            raise


def uninstall(options: InstallOptions, *, runner=run) -> dict:
    deployment = options.deployment()
    with profile_lock(options):
        check_inactive(deployment)
        patch = options.profile_dir() / 'cordis.patch.yml'
        # Validate before touching package manager state.
        original = patch.read_bytes()
        updated = update_managed(original, None)
        record_file = deployment / 'installation.json'
        config_file = deployment / 'runtime.json'
        previous = json.loads(record_file.read_text(encoding='utf-8')) if record_file.exists() else None
        if previous is None:
            if not original.strip():
                atomic(patch, updated)
            return {'status': 'not_installed', 'auditRetained': True, 'modelsRetained': True, 'sharedReleasesRetained': True}
        journal = {'phase': 'registering', 'previous': previous, 'managedBefore': encoded(managed_content(original)),
                   'configBefore': encoded(config_file.read_bytes()) if config_file.exists() else None}
        save(deployment / 'journal.json', journal)
        try:
            runner(options.dsh_command + ['plugin', '--profile', options.profile, 'remove', PACKAGE, '--config.ignore-scripts=true'] + options.package_manager_args,
                   env={**os.environ, 'DSH_HOME': str(options.dsh_home)})
            atomic(patch, updated)
            config_file.unlink(missing_ok=True)
            record_file.unlink(missing_ok=True)
            save(deployment / 'journal.json', {'phase': 'uninstalled'})
            (deployment / 'protect-agent.token').unlink(missing_ok=True)
        except Exception:
            restore(options, journal, runner)
            raise
        return {'status': 'uninstalled', 'auditRetained': True, 'modelsRetained': True, 'sharedReleasesRetained': True}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['install', 'repair', 'uninstall', 'inspect', 'preflight'])
    parser.add_argument('--release', type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument('--install-root', type=Path, default=Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'GovAgentSec')
    parser.add_argument('--dsh-home', type=Path, default=Path(os.environ.get('DSH_HOME', Path.home() / '.dsh')))
    parser.add_argument('--profile', default='web')
    parser.add_argument('--dsh', default='dsh.exe', help='Installed native Harness CLI executable')
    parser.add_argument('--dsh-cli', type=Path, help='CLI JS entry point; passed to node without shell expansion')
    parser.add_argument('--node', default='node.exe')
    parser.add_argument('--python', type=Path, default=Path(sys.executable))
    parser.add_argument('--scanner-python', type=Path)
    parser.add_argument('--managed-python-artifact', type=Path)
    parser.add_argument('--prepare-models', action='store_true', help='Download missing pinned model assets into the selected cache')
    parser.add_argument('--model-root', type=Path)
    parser.add_argument('--trustrag-module', type=Path)
    parser.add_argument('--scan-root', type=Path, action='append', default=[])
    parser.add_argument('--loader-root', type=Path, action='append', default=[])
    parser.add_argument('--agentguard-config', type=Path, help='Optional local JSON lifecycle and formal OIDC configuration')
    args = parser.parse_args()
    if args.action in ('install', 'repair', 'preflight') and not args.model_root:
        parser.error('--model-root is required for real models')
    if args.action in ('install', 'repair') and not (args.trustrag_module or args.prepare_models):
        parser.error('--trustrag-module or --prepare-models is required for real models')
    options = InstallOptions(release=args.release.resolve(), install_root=args.install_root.resolve(),
        dsh_home=args.dsh_home.resolve(), profile=args.profile,
        dsh_command=[args.node, str(args.dsh_cli.resolve())] if args.dsh_cli else [args.dsh],
        python=args.python.resolve(), scanner_python=args.scanner_python.resolve() if args.scanner_python else None,
        model_root=(args.model_root or Path('.')).resolve(), trustrag_module=(args.trustrag_module or Path('.')).resolve(),
        scan_roots=[path.resolve() for path in args.scan_root], loader_roots=[path.resolve() for path in args.loader_root],
        agentguard=json.loads(args.agentguard_config.read_text(encoding='utf-8')) if args.agentguard_config else {},
        managed_python_artifact=args.managed_python_artifact.resolve() if args.managed_python_artifact else None,
        prepare_models=args.prepare_models)
    if args.action == 'preflight':
        result = preflight_installation(options, read_release(options.release))
        print(json.dumps(result, ensure_ascii=True, indent=2))
        return 0 if result['ok'] else 2
    elif args.action == 'inspect':
        record = options.deployment() / 'installation.json'
        result = json.loads(record.read_text(encoding='utf-8')) if record.exists() else {'status': 'not_installed'}
    elif args.action == 'uninstall':
        result = uninstall(options)
    else:
        result = install(options)
    print(json.dumps(result, ensure_ascii=True, indent=2))
    return 0


if __name__ == '__main__':
    # The Windows bootstrap invokes Python with -I; only bundled helpers are
    # added back, never the caller's PYTHONPATH or user site-packages.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    try:
        raise SystemExit(main())
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(f'GovAgentSec: {error}', file=sys.stderr)
        raise SystemExit(1)
