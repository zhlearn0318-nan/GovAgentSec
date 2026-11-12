import base64
import csv
import hashlib
import io
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
import build_harness_python as build


def distribution(root, name='example', version='1.0', requires=None):
    info = root / f'{name}-{version}.dist-info'; info.mkdir(parents=True)
    (root / f'{name}.py').write_text('value = 1\n', encoding='utf-8')
    (info / 'METADATA').write_text(f'Metadata-Version: 2.1\nName: {name}\nVersion: {version}\n', encoding='utf-8')
    (info / 'WHEEL').write_text('Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: py3-none-any\n', encoding='utf-8')
    (info / 'direct_url.json').write_text('{"url":"file:///private/developer/path"}', encoding='utf-8')
    rows = []
    for path in sorted(root.rglob('*')):
        if path.is_file():
            data = path.read_bytes()
            rows.append([path.relative_to(root).as_posix(), 'sha256=' + base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode().rstrip('='), len(data)])
    with (info / 'RECORD').open('w', encoding='utf-8', newline='') as out:
        csv.writer(out).writerows(rows + [[f'{info.name}/RECORD', '', '']])
    return {'name': name, 'version': version, 'root': str(root), 'info': str(info), 'requires': requires or []}


class WheelhouseTests(unittest.TestCase):
    def test_dependency_closure_includes_active_markers_and_rejects_missing_pins(self):
        envs = {'protect': {'packages': {'main': {'name': 'main', 'version': '1', 'requires': ['dep>=2', 'unix-only; sys_platform == "linux"']},
                                         'dep': {'name': 'dep', 'version': '2', 'requires': []}}}}
        result = build.select_closure(envs, [{'name': 'main', 'version': '1', 'source': 'protect'}])
        self.assertEqual(set(result), {'main', 'dep'})
        envs['protect']['packages']['main']['requires'] = ['missing>=3']
        with self.assertRaisesRegex(ValueError, 'missing'):
            build.select_closure(envs, [{'name': 'main', 'version': '1', 'source': 'protect'}])

    def test_rebuilt_wheel_retains_only_verified_content_and_rebuilds_record(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = root / 'source'; source.mkdir(); output = root / 'output'; output.mkdir()
            package = distribution(source)
            result = build.repack_wheel(package, output)
            with zipfile.ZipFile(output / result['file']) as wheel:
                self.assertIn('example.py', wheel.namelist())
                self.assertNotIn('example-1.0.dist-info/direct_url.json', wheel.namelist())
                record = list(csv.reader(io.StringIO(wheel.read('example-1.0.dist-info/RECORD').decode())))
                for path, expected, size in record:
                    if expected:
                        self.assertEqual('sha256=' + base64.urlsafe_b64encode(hashlib.sha256(wheel.read(path)).digest()).decode().rstrip('='), expected)
            (source / 'example.py').write_text('tampered = True', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'RECORD'):
                build.repack_wheel(package, output)

    def test_unrecorded_interpreter_files_cannot_enter_snapshot(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = root / 'python'; source.mkdir()
            (source / 'python.exe').write_bytes(b'exe'); (source / 'LICENSE.txt').write_bytes(b'license')
            (source / 'Lib/site-packages').mkdir(parents=True)
            (source / 'Lib/site-packages/private.py').write_text('secret', encoding='utf-8')
            (source / 'Lib/os.py').write_text('stdlib', encoding='utf-8')
            paths = list(build.interpreter_files(source))
            self.assertNotIn(source / 'Lib/site-packages/private.py', paths)
            self.assertIn(source / 'Lib/os.py', paths)

    def test_recorded_shared_data_is_preserved_in_wheel_data_scheme(self):
        with tempfile.TemporaryDirectory() as temp:
            prefix = Path(temp); source = prefix / 'Lib/site-packages'; source.mkdir(parents=True)
            package = distribution(source); package['prefix'] = str(prefix)
            manual = prefix / 'share/man/manual.1'; manual.parent.mkdir(parents=True); manual.write_bytes(b'manual')
            digest = base64.urlsafe_b64encode(hashlib.sha256(b'manual').digest()).decode().rstrip('=')
            with (Path(package['info']) / 'RECORD').open('a', encoding='utf-8', newline='') as out:
                csv.writer(out).writerow(['../../share/man/manual.1', 'sha256='+digest, '6'])
            output = prefix / 'wheels'; output.mkdir()
            result = build.repack_wheel(package, output)
            with zipfile.ZipFile(output / result['file']) as archive:
                self.assertEqual(archive.read('example-1.0.data/data/share/man/manual.1'), b'manual')


if __name__ == '__main__':
    unittest.main()
