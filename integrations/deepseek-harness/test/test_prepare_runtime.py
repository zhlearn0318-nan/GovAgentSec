import hashlib
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
import prepare_harness_runtime as prepare


class PrepareTests(unittest.TestCase):
    def test_only_digest_matched_weights_are_reused(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); source = root / 'source'; cache = root / 'cache'
            (source / 'test-model').mkdir(parents=True)
            (source / 'test-model/weights.bin').write_bytes(b'reviewed weights')
            expected = hashlib.sha256(b'reviewed weights').hexdigest()
            lock = {'models': [{'directory': 'test-model', 'repository': 'org/model', 'revision': 'fixed',
                              'files': [{'name': 'weights.bin', 'sha256': expected}]}], 'trustrag': {'revision': 'fixed', 'files': {}}}
            result = prepare.prepare_models(lock, cache, source)
            self.assertEqual((cache / 'test-model/weights.bin').read_bytes(), b'reviewed weights')
            self.assertEqual((source / 'test-model/weights.bin').read_bytes(), b'reviewed weights')
            self.assertEqual(result['modelRoot'], str(cache.resolve()))
            with self.assertRaises(ValueError):
                prepare.prepare_models(lock, source, source)

    def test_foreign_python_environment_is_never_modified(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with patch.object(prepare, 'run') as runner:
                with self.assertRaisesRegex(ValueError, 'not created'):
                    prepare.prepare_python(Path(sys.executable), root, root, root / 'requirements.lock')
                runner.assert_not_called()


if __name__ == '__main__':
    unittest.main()
