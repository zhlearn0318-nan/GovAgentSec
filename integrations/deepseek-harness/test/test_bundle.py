"""Test the distributed archive outside the source tree."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]


class BundleTests(unittest.TestCase):
    def test_runtime_parts_reassemble_and_match_their_manifest(self):
        spec = importlib.util.spec_from_file_location('build_harness_release', ROOT / 'scripts/build_harness_release.py')
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        with tempfile.TemporaryDirectory() as temp:
            artifact = Path(temp) / 'runtime.zip'
            data = b'0123456789abcdef'
            artifact.write_bytes(data)
            with patch.object(builder, 'PART_BYTES', 7):
                parts = builder.split_runtime(artifact)
            self.assertEqual([part['bytes'] for part in parts], [7, 7, 2])
            contents = [(artifact.parent / part['file']).read_bytes() for part in parts]
            self.assertEqual(b''.join(contents), data)
            for part, content in zip(parts, contents):
                self.assertEqual(part['sha256'], hashlib.sha256(content).hexdigest())

    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell bootstrap')
    def test_offline_runtime_is_verified_before_it_becomes_available(self):
        with tempfile.TemporaryDirectory(prefix='Harness 分卷 ') as temp:
            root = Path(temp)
            data = b'known test runtime'
            manifest = {'file': 'runtime.zip', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                        'distribution': {'parts': []}}
            for index, chunk in enumerate((data[:9], data[9:]), 1):
                part = root / f'runtime.zip.part{index:02}'
                part.write_bytes(chunk)
                manifest['distribution']['parts'].append({'file': part.name, 'bytes': len(chunk),
                                                           'sha256': hashlib.sha256(chunk).hexdigest()})
            (root / 'runtime.json').write_text(json.dumps(manifest), encoding='utf-8')
            env = {**os.environ, 'HARNESS_BOOTSTRAP_TEST_ROOT': str(root),
                   'HARNESS_BOOTSTRAP_TEST_SCRIPT': str(ROOT / 'installer/harness/Python-Bootstrap.ps1')}
            env.pop('PSMODULEPATH', None)
            command = ['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
                       '$ErrorActionPreference = "Stop"; . $env:HARNESS_BOOTSTRAP_TEST_SCRIPT; '
                       '$root = $env:HARNESS_BOOTSTRAP_TEST_ROOT; '
                       '$manifest = Get-Content -Raw -LiteralPath (Join-Path $root "runtime.json") | ConvertFrom-Json; '
                       'Get-DistributedPython -Python $manifest -MediaRoot $root '
                       '-DownloadRoot (Join-Path $root "cache") -Progress {}']
            artifact = root / 'cache/runtime.zip'
            part.write_bytes(b'x' * len(chunk))
            result = subprocess.run(command, env=env, capture_output=True, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(artifact.exists())
            part.write_bytes(chunk)
            result = subprocess.run(command, env=env, capture_output=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(artifact.read_bytes(), data)

    def test_release_is_self_contained_and_inventory_matches(self):
        with tempfile.TemporaryDirectory(prefix='Gov 安装 test ') as temp:
            result = subprocess.run(['python', str(ROOT / 'scripts/build_harness_release.py'), '--output', temp],
                                    capture_output=True, text=True, encoding='utf-8', env={**os.environ, 'PYTHONUTF8': '1'})
            self.assertEqual(result.returncode, 0, result.stderr)
            release = json.loads((Path(temp) / 'release.json').read_text(encoding='utf-8'))
            self.assertEqual(release['source']['version'], (ROOT / 'VERSION').read_text(encoding='utf-8').strip())
            self.assertEqual(release['source']['commit'], subprocess.check_output(
                ['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip())
            artifact = Path(temp) / release['bundle']['file']
            self.assertEqual(hashlib.sha256(artifact.read_bytes()).hexdigest(), release['bundle']['sha256'])
            extracted = Path(temp) / '独立 plugin'
            with tarfile.open(artifact) as archive:
                archive.extractall(extracted, filter='data')
            package = extracted / 'package'
            manifest = json.loads((package / 'package.json').read_text(encoding='utf-8'))
            self.assertEqual(manifest['dsh']['bundle']['patch'], './cordis.patch.yml')
            self.assertNotIn('scripts', manifest)
            for item in json.loads((package / 'resources.json').read_text(encoding='utf-8'))['files']:
                self.assertEqual(hashlib.sha256((package / item['path']).read_bytes()).hexdigest(), item['sha256'], item['path'])
            entry = (package / manifest['main']).as_uri()
            imported = subprocess.run(['node', '--input-type=module', '-e', f'const p = await import({json.dumps(entry)}); if (!p.apply) process.exit(1)'],
                                      cwd=temp, capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(imported.returncode, 0, imported.stderr)
            self.assertLess(artifact.stat().st_size, 5 * 1024 * 1024)


if __name__ == '__main__':
    unittest.main()
