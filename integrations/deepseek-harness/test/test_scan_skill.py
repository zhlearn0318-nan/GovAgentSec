import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

MODULE = Path(__file__).resolve().parents[1] / 'scan_skill.py'
spec = importlib.util.spec_from_file_location('harness_scan', MODULE)
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)
ROOT = MODULE.parents[2]
FIXTURES = ROOT / 'modules/aegis/fixtures/skills'


class ScanTests(unittest.TestCase):
    def test_group4_completed_public_permissions_are_not_mistaken_for_a_failed_check(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.runtime') as directory:
            target = Path(directory)
            (target / 'SKILL.md').write_text('---\nname: example\ndescription: Summarize supplied public text.\n---\n\nSummarize supplied public text.\n', encoding='utf-8')
            (target / 'skill_config.json').write_text(json.dumps({'skill_name': 'example', 'access_level': 'public'}))
            self.assertEqual(scanner.scan(target, [target])['decision'], 'ALLOW')
            (target / 'skill_config.json').write_text(json.dumps({'skill_name': 'example', 'access_level': 'unrecognized'}))
            self.assertEqual(scanner.scan(target, [target])['decision'], 'BLOCK')

    def test_existing_local_semantic_and_context_checks_are_not_omitted(self):
        result = scanner.scan(FIXTURES / 'benign_doc_summary', [FIXTURES])
        self.assertIn('aegis-finding-context-v2', result['analyzers'])
        self.assertIn('aegis-static-coverage-v1', result['analyzers'])
        self.assertTrue(any('semantic' in name for name in result['analyzers']))
        self.assertEqual(len(result['tree_sha256']), 64)
        self.assertEqual(len(result['manifest_body_sha256']), 64)

    def test_malicious_skill_is_blocked(self):
        result = scanner.scan(FIXTURES / 'malicious_prompt_injection', [FIXTURES])
        self.assertEqual(result['decision'], 'BLOCK')
        self.assertTrue(result['aegis_findings'] or result['group4_static_high'])
        self.assertFalse(result['dynamic_execution'])

    def test_benign_skill_is_not_high_risk(self):
        result = scanner.scan(FIXTURES / 'benign_doc_summary', [FIXTURES])
        self.assertNotEqual(result['decision'], 'BLOCK')

    def test_outside_root_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.runtime') as directory:
            with self.assertRaises(ValueError):
                scanner.scan(Path(directory), [FIXTURES])

    def test_oversized_file_is_not_silently_skipped(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.runtime') as directory:
            root = Path(directory)
            (root / 'SKILL.md').write_text('a' * (1024 * 1024 + 1))
            with self.assertRaises(ValueError):
                scanner.scan(root, [root])

    def test_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.runtime') as directory:
            root = Path(directory)
            (root / 'SKILL.md').write_text('benign')
            try:
                (root / 'linked').symlink_to(FIXTURES, target_is_directory=True)
            except OSError:
                self.skipTest('Windows symlink privilege is unavailable')
            with self.assertRaises(ValueError):
                scanner.scan(root, [root])


if __name__ == '__main__':
    unittest.main()
