import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
import harness_python as managed
import prepare_harness_runtime as prepare


class ManagedPythonTests(unittest.TestCase):
    def test_zip_traversal_links_and_windows_aliases_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for name in ('../outside', 'python/NUL', 'python/a.', 'python/case'):
                with zipfile.ZipFile(root / 'bad.zip', 'w') as archive:
                    archive.writestr(name, b'x')
                    if name == 'python/case': archive.writestr('python/Case', b'y')
                with self.assertRaises(ValueError):
                    managed.validate_members(root / 'bad.zip', {'expandedBytes': 1000})
            with zipfile.ZipFile(root / 'linked.zip', 'w') as archive:
                link = zipfile.ZipInfo('python/link'); link.external_attr = 0o120777 << 16
                archive.writestr(link, b'target')
            with self.assertRaisesRegex(ValueError, 'links'):
                managed.validate_members(root / 'linked.zip', {'expandedBytes': 1000})

    def test_archive_digest_failure_prevents_any_extraction(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); archive = root / 'bad.zip'; archive.write_bytes(b'bad')
            with self.assertRaisesRegex(ValueError, 'digest'):
                managed.extract_python(archive, root / 'target', {'sha256': '0'*64, 'expandedBytes': 1000}, '1.0.0-alpha.1')
            self.assertFalse((root / 'target').exists())

    def test_cached_inventory_is_bound_to_release_even_when_zip_is_unavailable(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); payload = root / 'python' / ('0' * 24) / 'payload'; payload.mkdir(parents=True)
            (payload / 'resources.json').write_text('{"files":[]}', encoding='utf-8')
            expected = {'sha256': '0' * 64, 'resourcesSha256': '1' * 64}
            with patch.object(managed, 'prepare_python') as prepare_env:
                with self.assertRaisesRegex(ValueError, 'inventory digest'):
                    managed.prepare_managed_python(root / 'missing.zip', expected, root, '1.0.0-alpha.1')
                prepare_env.assert_not_called()

    def test_environment_preparation_resumes_after_pip_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); env = root / 'env'; wheels = root / 'wheels'; wheels.mkdir()
            lock = root / 'requirements.lock'; lock.write_text('# hashes\n', encoding='utf-8')
            failed = False
            def runner(command, **kwargs):
                nonlocal failed
                if 'venv' in command:
                    (env / 'Scripts').mkdir(parents=True, exist_ok=True)
                    (env / 'Scripts/python.exe').write_bytes(b'exe')
                if 'install' in command and not failed:
                    failed = True; raise RuntimeError('synthetic interruption')
                return ''
            with patch.object(prepare, 'run', runner):
                with self.assertRaisesRegex(RuntimeError, 'interruption'):
                    prepare.prepare_python(Path(sys.executable), env, wheels, lock)
                result = prepare.prepare_python(Path(sys.executable), env, wheels, lock)
                self.assertTrue(result.endswith('python.exe'))
                record = json.loads((env / 'govagentsec-environment.json').read_text(encoding='utf-8'))
                self.assertEqual(record['state'], 'ready')
                lock.write_text('changed', encoding='utf-8')
                with self.assertRaisesRegex(ValueError, 'requirements'):
                    prepare.prepare_python(Path(sys.executable), env, wheels, lock)


if __name__ == '__main__':
    unittest.main()
