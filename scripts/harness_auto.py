"""Single-path installation; discovery never evaluates host configuration code."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8-sig'))
    except (OSError, ValueError, TypeError):
        return {}


def ancestors(path):
    path = Path(path).resolve()
    return [path, *list(path.parents)[:5]]


def host_entry(path):
    path = Path(path)
    candidates = [path, path / 'apps/cli/lib/bin.js', path / 'lib/bin.js',
                  path.parent / 'node_modules/@deepseek-ai/dsh/lib/bin.js']
    for entry in candidates:
        if not entry.is_file() or entry.suffix != '.js':
            continue
        manifest = read_json(entry.parent.parent / 'package.json')
        if manifest.get('name') == '@deepseek-ai/dsh' and manifest.get('version') == '0.2.2-alpha.2':
            return entry.resolve()
    return None


def discover(release, media, destination, *, environ=None, which=None):
    env = os.environ if environ is None else environ
    which = shutil.which if which is None else which
    home = Path(env.get('USERPROFILE') or env.get('HOME') or Path.home())
    destination = Path(destination).resolve()
    records, hosts, reuses = [], [], []
    for base in ancestors(media):
        legacy = read_json(base / '.runtime/deepseek-harness/installation.json')
        if legacy:
            records.append(legacy)
        reuses.append(base / '.runtime/harness-package-smoke/model-cache')
    for base in (destination, Path(env.get('LOCALAPPDATA', home / 'AppData/Local')) / 'GovAgentSec'):
        profile_root = base / 'profiles'
        if profile_root.is_dir():
            for receipt in sorted(profile_root.glob('*/installation.json'))[:32]:
                record = read_json(receipt)
                if record:
                    records.insert(0, record)
    for record in records:
        hosts += [record[key] for key in ('dsh', 'harnessRoot') if isinstance(record.get(key), str)]
    command = which('dsh') or which('dsh.cmd')
    if command:
        if Path(command).suffix.lower() == '.exe':
            hosts.insert(0, command)
        else:
            hosts.insert(0, Path(command).parent / 'node_modules/@deepseek-ai/dsh/lib/bin.js')
    # Bounded probes for conventional source installations, never a disk scan.
    if env.get('USERPROFILE'):
        hosts += [home / 'deepseek-harness', home / 'DeepSeekHarness']
        if os.name == 'nt' and environ is None:
            hosts += [Path(drive + ':/deepseek-harness') for drive in 'CDEFG']
    entry = next((candidate for item in hosts if (candidate := host_entry(item))), None)
    if entry is None and command and Path(command).suffix.lower() == '.exe':
        entry = Path(command).resolve()
    if entry is None:
        raise ValueError('未找到已安装的 DeepSeek Harness 0.2.2-alpha.2。请先安装 Harness，再运行此安装器。')
    dsh_home = Path(env.get('DSH_HOME') or next((r['dshHome'] for r in records if r.get('dshHome')), home / '.dsh')).resolve()
    roots = [destination / 'skills', dsh_home / 'skills', Path(env.get('DSH_AGENTS_HOME', home / '.agents')) / 'skills']
    for record in records:
        overlay = read_json(record.get('overlay', ''))
        for row in overlay if isinstance(overlay, list) else []:
            if row.get('id') == 'govagentsec-security':
                config = row.get('config', {})
                if config.get('modelRoot'):
                    reuses.insert(0, Path(config['modelRoot']))
        config = read_json(record.get('runtimeConfigFile', ''))
        if config.get('modelRoot'):
            reuses.insert(0, Path(config['modelRoot']))
    return {'release': str(Path(release).resolve()), 'media': str(Path(media).resolve()),
            'installRoot': str(destination), 'dsh': str(entry), 'dshHome': str(dsh_home), 'profile': 'web',
            'models': str(destination / 'models'), 'scanRoots': [str(p) for p in roots],
            'reuseModels': [str(p.resolve()) for p in reuses if p.is_dir()]}


def safe_rows(text):
    import yaml
    class ConfigLoader(yaml.SafeLoader):
        pass
    ConfigLoader.add_constructor('tag:yaml.org,2002:js', lambda loader, node: None)
    value = yaml.load(text, Loader=ConfigLoader)
    if not isinstance(value, list):
        raise ValueError('无法识别 Harness 的配置格式。')
    return [row for row in value if isinstance(row, dict)]


def run_prepared(command):
    result = subprocess.run(command, capture_output=True, encoding='utf-8', errors='replace', timeout=7200,
        creationflags=0x08000000 if os.name == 'nt' else 0)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or f'安装工作进程异常退出（{result.returncode}），请重试并检查诊断目录。')
    return result.stdout


def inspect_host(plan, runner):
    from harness_setup import run
    env = {**os.environ, 'DSH_HOME': plan['dshHome']}
    # dump-config composes the profile without starting providers or evaluating !!js.
    rows = safe_rows(runner(plan['_command'] + ['--profile', plan['profile'], '--dump-config'], env=env))
    plan['packageManagerArgs'] = []
    modules = Path(plan['dshHome']) / 'profiles' / plan['profile'] / 'node_modules/.modules.yaml'
    if modules.is_file():
        import re
        import yaml
        metadata = yaml.safe_load(modules.read_text(encoding='utf-8'))
        store = metadata.get('storeDir') if isinstance(metadata, dict) else None
        if isinstance(store, str) and Path(store).is_absolute():
            store = Path(store)
            if re.fullmatch(r'v\d+(?:\.\d+)?', store.name):
                store = store.parent
            plan['packageManagerArgs'] = ['--config.store-dir=' + str(store)]
    directories = list(plan['scanRoots'])
    plan['relativeSkillDirs'] = []
    plan['projectSkills'] = True
    office_root = None
    for row in rows:
        config = row.get('config') or {}
        if not isinstance(config, dict):
            continue
        if row.get('id') == 'skill-filesystem':
            custom = config.get('customSkillDirs', [])
            if not isinstance(custom, list) or any(not isinstance(p, str) for p in custom):
                raise ValueError('Harness 的自定义 Skill 目录配置无效。')
            directories = [plan['scanRoots'][0], *[p for p in custom if Path(p).is_absolute()]]
            plan['relativeSkillDirs'] = [p for p in custom if not Path(p).is_absolute()]
            plan['projectSkills'] = config.get('includeDefaultRoots', True)
            if config.get('includeDefaultRoots', True):
                user = Path(os.environ.get('USERPROFILE', Path.home()))
                directories += [str(Path(config.get('dshHome', plan['dshHome'])) / 'skills'),
                                str(Path(config.get('agentsHome', os.environ.get('DSH_AGENTS_HOME', user / '.agents'))) / 'skills')]
                if config.get('bundledSkillDir'):
                    directories.append(config['bundledSkillDir'])
                elif os.environ.get('DSH_BUNDLED_SKILL_DIR'):
                    directories.append(os.environ['DSH_BUNDLED_SKILL_DIR'])
        if row.get('id') == 'skill-office' and config.get('assetRoot'):
            office_root = config['assetRoot']
        if row.get('id') == 'govagentsec-security':
            if config.get('runtimeConfigFile'):
                previous_file = Path(config['runtimeConfigFile'])
                previous = read_json(previous_file)
                receipt = read_json(previous_file.parent / 'installation.json')
                if (not receipt.get('bundlePath') or not Path(receipt['bundlePath']).is_file()
                    or Path(receipt.get('runtimeConfigFile', '')) != previous_file
                    or receipt.get('profile') != plan['profile']
                    or Path(receipt.get('dshHome', '')) != Path(plan['dshHome'])):
                    raise ValueError('已有插件的安装回执不完整或与当前 Harness 不匹配，请先恢复原安装回执。')
                plan['_previous'] = receipt
                plan['_previousDeployment'] = str(previous_file.parent)
            else:
                previous = config
                # A legacy source integration cannot be restored by pnpm if migration fails.
                # Component probes happen before registration; its owned row is preserved on rollback.
            if previous.get('modelRoot'):
                plan['reuseModels'].insert(0, previous['modelRoot'])
    if office_root:
        directories.append(office_root)
    # Resolve the host's bundled office skills without importing or executing the module.
    if not office_root and Path(plan['dsh']).suffix == '.js':
        resolver = "const{createRequire}=require('node:module');const p=require('node:path');try{console.log(p.resolve(p.dirname(createRequire(process.argv[1]).resolve('@deepseek-ai/dsh-skill-office')),'../assets'))}catch{}"
        office = run([plan['_command'][0], '-e', resolver, plan['dsh']], timeout=30).strip()
        if office and Path(office).is_dir():
            directories.append(office)
    plan['scanRoots'] = list(dict.fromkeys(str(Path(p).resolve()) for p in directories if Path(p).is_absolute()))
    return plan


def main():
    # Only this installer process and its children are affected.
    os.environ.pop('PYTHONHOME', None)
    os.environ.pop('PYTHONPATH', None)
    os.environ['PYTHONNOUSERSITE'] = '1'
    from harness_setup import InstallOptions, install, uninstall, read_release, run, save, check_inactive
    from harness_preflight import evaluate
    from harness_python import prepare_managed_python
    from prepare_harness_runtime import prepare_models
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release', type=Path, required=True)
    parser.add_argument('--media', type=Path, required=True)
    parser.add_argument('--install-root', type=Path, required=True)
    parser.add_argument('--artifact', type=Path, required=True)
    parser.add_argument('--status', type=Path, required=True)
    parser.add_argument('--prepared', action='store_true')
    parser.add_argument('--action', choices=('install', 'uninstall'), default='install')
    args = parser.parse_args()
    def progress(message):
        save(args.status, {'message': message})
    progress('正在自动识别 DeepSeek Harness…')
    plan = discover(args.release, args.media, args.install_root)
    node = shutil.which('node')
    if Path(plan['dsh']).suffix == '.js' and not node:
        raise ValueError('已找到 Harness，但未找到 Node.js。请修复 Harness 的运行环境。')
    plan['_command'] = [node, plan['dsh']] if Path(plan['dsh']).suffix == '.js' else [plan['dsh']]
    release = read_release(args.release)
    if not args.prepared:
        if args.action == 'install':
            version = run(plan['_command'] + ['--version'], timeout=30).strip()
            if '0.2.2-alpha.2' not in version:
                raise ValueError('Harness 版本不兼容，需要 0.2.2-alpha.2。')
            report = evaluate(release, install_root=args.install_root, model_root=Path(plan['models']), managed_python=True)
            if not report['ok']:
                raise ValueError('环境检查未通过：' + '; '.join(i['recovery'] for i in report['issues'] if i['severity'] == 'error'))
        progress('正在校验并准备内置 Python 运行环境（首次安装需要数分钟）…')
        executable = prepare_managed_python(args.artifact, release['python'], args.install_root, release['version'])
        print(run_prepared([str(executable), '-I', str(Path(__file__).resolve()), *sys.argv[1:], '--prepared']))
        return
    inspect_host(plan, run)
    if plan.get('_previousDeployment'):
        check_inactive(Path(plan['_previousDeployment']))
    if args.action == 'uninstall':
        options = InstallOptions(release=args.release, install_root=args.install_root, dsh_home=Path(plan['dshHome']),
            profile=plan['profile'], dsh_command=plan['_command'], python=Path(sys.executable),
            model_root=Path(plan['models']), trustrag_module=Path(plan['models']) / 'TrustRAG/defend_module.py',
            scan_roots=[], loader_roots=[], package_manager_args=plan['packageManagerArgs'])
        if not plan.get('_previousDeployment') or Path(plan['_previousDeployment']) != options.deployment():
            raise ValueError('所选路径不是当前 Harness 中插件的安装位置。')
        print(json.dumps(uninstall(options), ensure_ascii=True))
        return
    progress('正在校验模型缓存，自动补齐缺失文件…')
    lock = read_json(args.release / 'models.lock.json')
    destination = Path(plan['models'])
    candidates = [Path(p) for p in plan['reuseModels'] if Path(p).is_dir() and Path(p).resolve() != destination.resolve()]
    def cache_score(path):
        return sum(1 for item in release.get('modelFiles', []) if (path / item['path']).is_file()
                   and (path / item['path']).stat().st_size == item['bytes'])
    reuse = max(candidates, key=cache_score) if candidates else None
    prepared = prepare_models(lock, destination, reuse)
    owned_skills = args.install_root / 'skills'; owned_skills.mkdir(parents=True, exist_ok=True)
    existing = [Path(p) for p in plan['scanRoots'] if Path(p).is_dir()]
    options = InstallOptions(release=args.release, install_root=args.install_root, dsh_home=Path(plan['dshHome']),
        profile=plan['profile'], dsh_command=plan['_command'], python=Path(sys.executable), scanner_python=Path(sys.executable),
        model_root=destination, trustrag_module=Path(prepared['trustRagModule']), scan_roots=existing, loader_roots=existing,
        auto_skill_roots=True, auto_skill_directories=plan['scanRoots'] + plan['relativeSkillDirs'],
        auto_skill_project_roots=plan['projectSkills'],
        package_manager_args=plan['packageManagerArgs'],
        previous_installation=plan.get('_previous'), previous_deployment=Path(plan['_previousDeployment']) if plan.get('_previousDeployment') else None)
    progress('正在运行真实组件验证并注册插件，请保持窗口开启…')
    result = install(options)
    result.update({'dsh': plan['dsh'], 'managedPython': True})
    save(options.deployment() / 'installation.json', result)
    progress('安装完成。请重新启动 DeepSeek Harness。')
    print(json.dumps(result, ensure_ascii=True))


if __name__ == '__main__':
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
