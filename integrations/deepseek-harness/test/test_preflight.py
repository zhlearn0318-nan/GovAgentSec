import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
import harness_preflight as preflight


class PreflightTests(unittest.TestCase):
    def test_shared_volume_space_is_summed_before_approval(self):
        demands = [{'path': 'C:/app', 'bytes': 80}, {'path': 'C:/models', 'bytes': 70}]
        report = preflight.check_volumes(demands, lambda path: ('C:', 100))
        self.assertFalse(report[0]['ok'])
        self.assertEqual(report[0]['requiredBytes'], 150)

    def test_gpu_inventory_handles_names_and_missing_driver(self):
        gpu = preflight.parse_gpus('NVIDIA Example, 576.88, 8151\n')
        self.assertEqual(gpu[0]['memoryMiB'], 8151)
        self.assertEqual(gpu[0]['driverVersion'], '576.88')
        with self.assertRaises(ValueError):
            preflight.parse_gpus('unavailable')

    def test_model_download_counts_corrupt_files_and_resumed_partials(self):
        import hashlib
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'valid').write_bytes(b'abc')
            (root / 'corrupt').write_bytes(b'x')
            (root / 'corrupt.partial').write_bytes(b'ab')
            expected = hashlib.sha256(b'abc').hexdigest()
            files = [{'path': 'valid', 'bytes': 3, 'sha256': expected}, {'path': 'corrupt', 'bytes': 3, 'sha256': expected}]
            report = preflight.model_plan(root, files)
            self.assertEqual(report['downloadBytes'], 1)
            self.assertEqual(report['writeBytes'], 3)
            self.assertEqual(report['missingFiles'], ['corrupt'])

    def test_machine_failure_report_contains_actionable_component_and_no_profile_write(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            release = {'bundle': {'bytes': 100}, 'runtime': {'bytes': 100}, 'modelFiles': []}
            report = preflight.evaluate(release, install_root=root, model_root=root, managed_python=False,
                machine={'system': 'Windows', 'bits': 64, 'gpus': [], 'memoryBytes': 16 * 1024**3},
                volume_probe=lambda path: ('volume', 20 * 1024**3))
            self.assertFalse(report['ok'])
            issue = next(row for row in report['issues'] if row['component'] == 'cuda')
            self.assertIn('recovery', issue)
            self.assertEqual(list(root.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
