import importlib.util
import json
import os
import io
import base64
import tarfile
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('harness_setup', ROOT / 'scripts/harness_setup.py')
setup = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = setup
spec.loader.exec_module(setup)


class SetupTests(unittest.TestCase):
    @unittest.skipUnless(os.name == 'nt', 'Windows ACL')
    def test_secure_token_does_not_require_take_ownership_permission(self):
        with tempfile.TemporaryDirectory() as temp:
            token = Path(temp) / 'token'; token.write_text('synthetic-only')
            script = "$ErrorActionPreference='Stop';$p=$env:GOVAGENTSEC_TOKEN_FILE;$a=[IO.File]::GetAccessControl($p);$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($s,'TakeOwnership','Deny'));[IO.File]::SetAccessControl($p,$a)"
            subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-EncodedCommand',base64.b64encode(script.encode('utf-16-le')).decode('ascii')],
                env={**os.environ,'GOVAGENTSEC_TOKEN_FILE':str(token)}, check=True, capture_output=True)
            setup.secure_token(token)
            self.assertEqual(token.read_text(), 'synthetic-only')

    def test_an_initially_empty_profile_keeps_a_yaml_array_after_uninstall(self):
        installed = setup.update_managed(b'[]\n', b'- id: govagentsec-security\n  config: {}')
        self.assertEqual(setup.update_managed(installed, None), b'[]\n')
        self.assertEqual(setup.update_managed(b'# user comment\n', None), b'# user comment\n[]\n')
        original = b'# Host default profile\n# Keep this comment\n[]\n'
        installed = setup.update_managed(original, b'- id: govagentsec-security\n  config: {}')
        self.assertNotIn(b'\n[]\n', installed, 'a YAML [] document cannot precede patch entries')
        self.assertEqual(setup.update_managed(installed, None), original)

    def test_live_process_probe_queries_without_terminating_process(self):
        self.assertTrue(setup.process_running(os.getpid()))

    def test_archive_cannot_escape_or_install_links(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            artifact = root / 'bad.tgz'
            for name, kind in [('runtime/../../escape', tarfile.REGTYPE), ('runtime/link', tarfile.SYMTYPE)]:
                with tarfile.open(artifact, 'w:gz') as archive:
                    item = tarfile.TarInfo(name); item.type = kind; item.size = 1 if kind == tarfile.REGTYPE else 0
                    archive.addfile(item, io.BytesIO(b'x') if item.size else None)
                with self.assertRaises(ValueError):
                    setup.extract(artifact, root / 'target', 'runtime')
            self.assertFalse((root / 'escape').exists())

    def test_migration_preserves_other_configuration_bytes(self):
        original = b'# provider\r\n- id: user-plugin\r\n  config: {value: 3}\r\n'
        legacy = (setup.BEGIN + '\n- insert: [{"id":"govagentsec-security"}]\n' + setup.END).encode()
        source = original + legacy + b'\r\n# trailing user config\r\n'
        updated = setup.update_managed(source, b'- id: govagentsec-security\n  config: {}')
        self.assertTrue(updated.startswith(original))
        self.assertTrue(updated.endswith(b'\r\n# trailing user config\r\n'))
        self.assertEqual(setup.update_managed(updated, b'- id: govagentsec-security\n  config: {}'), updated)
        self.assertEqual(setup.update_managed(updated, None), original + b'\r\n# trailing user config\r\n')
        with self.assertRaises(ValueError):
            setup.update_managed((setup.END + '\n' + setup.BEGIN).encode(), b'test')

    def test_install_repeat_failed_upgrade_and_uninstall(self):
        with tempfile.TemporaryDirectory(prefix='Gov 安装器 test ') as temp:
            root = Path(temp)
            release = root / 'release'
            subprocess.run([sys.executable, str(ROOT / 'scripts/build_harness_release.py'), '--output', str(release)], check=True, capture_output=True)
            profile = root / 'dsh/profiles/web'; profile.mkdir(parents=True)
            original = b'# user settings\r\n- id: user-plugin\r\n  config: {}\r\n'
            (profile / 'cordis.patch.yml').write_bytes(original)
            calls = []
            def runner(command, **kwargs):
                calls.append(command)
                if '--version' in command: return '0.2.2-alpha.2'
                if '--dump-config' in command: return '- id: govagentsec-security\n  name: govagentsec-harness'
                return ''
            options = setup.InstallOptions(release=release, install_root=root / 'app', dsh_home=root / 'dsh',
                profile='web', dsh_command=['dsh'], python=Path(sys.executable), model_root=root / 'models',
                trustrag_module=root / 'defend.py', scan_roots=[root], loader_roots=[root])
            with patch.object(setup, 'preflight_components'), patch.object(setup, 'preflight_installation', return_value={'ok': True}):
                record = setup.install(options, runner=runner)
                self.assertEqual(record['status'], 'restart_required')
                first = (profile / 'cordis.patch.yml').read_bytes()
                second = setup.install(options, runner=runner)
                self.assertEqual((profile / 'cordis.patch.yml').read_bytes(), first)
                self.assertEqual(first.count(setup.BEGIN.encode()), 1)
                config = Path(record['runtimeConfigFile']).read_bytes()
                def fail(command, **kwargs):
                    if '--dump-config' in command: raise RuntimeError('simulated failed activation')
                    return runner(command, **kwargs)
                with self.assertRaisesRegex(RuntimeError, 'simulated'):
                    setup.install(options, runner=fail)
                self.assertEqual(Path(record['runtimeConfigFile']).read_bytes(), config)
                self.assertEqual((profile / 'cordis.patch.yml').read_bytes(), first)
                relocated = setup.InstallOptions(**{**options.__dict__, 'install_root': root / 'new app',
                    'previous_installation': second, 'previous_deployment': options.deployment()})
                calls.clear()
                with self.assertRaisesRegex(RuntimeError, 'simulated'):
                    setup.install(relocated, runner=fail)
                self.assertEqual((profile / 'cordis.patch.yml').read_bytes(), first)
                self.assertEqual(Path(record['runtimeConfigFile']).read_bytes(), config)
                self.assertTrue(any('add' in call and second['bundlePath'] in call for call in calls))
                self.assertFalse((relocated.deployment() / 'installation.json').exists())
                setup.uninstall(options, runner=runner)
                self.assertEqual((profile / 'cordis.patch.yml').read_bytes(), original)
                self.assertTrue((root / 'app/releases').is_dir(), 'shared release retained')
                self.assertTrue(any('remove' in command for command in calls))

    def test_failed_preflight_never_changes_profile_or_prepares_components(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            profile = root / 'dsh/profiles/web'; profile.mkdir(parents=True)
            original = b'[]\n'; (profile / 'cordis.patch.yml').write_bytes(original)
            options = setup.InstallOptions(release=root, install_root=root / 'app', dsh_home=root / 'dsh',
                profile='web', dsh_command=['dsh'], python=Path(sys.executable), model_root=root / 'models',
                trustrag_module=root / 'defend.py', scan_roots=[root], loader_roots=[root])
            report = {'ok': False, 'issues': [{'component': 'disk', 'severity': 'error', 'recovery': 'Free space'}]}
            with patch.object(setup, 'read_release', return_value={}), patch.object(setup, 'preflight_installation', return_value=report), patch.object(setup, 'preflight_components') as probe:
                with self.assertRaisesRegex(ValueError, 'preflight failed'):
                    setup.install(options, runner=lambda *a, **kw: '0.2.2-alpha.2')
                probe.assert_not_called()
            self.assertEqual((profile / 'cordis.patch.yml').read_bytes(), original)
            self.assertFalse(options.install_root.exists())

    def test_tampered_release_is_rejected_before_profile_mutation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaises((ValueError, FileNotFoundError)):
                setup.read_release(root)
            artifact = root / 'fake.tgz'; artifact.write_bytes(b'tampered')
            (root / 'release.json').write_text(json.dumps({'protocolVersion': 1, 'version': '1.0.0-alpha.1',
                'hostVersion': '0.2.2-alpha.2', 'bundle': {'file': 'fake.tgz', 'sha256': '0' * 64},
                'runtime': {'file': 'fake.tgz', 'sha256': '0' * 64}}))
            with self.assertRaisesRegex(ValueError, 'digest'):
                setup.read_release(root)


if __name__ == '__main__':
    unittest.main()
