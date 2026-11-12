import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts'))
import harness_auto as auto


class AutoDiscoveryTests(unittest.TestCase):
    def test_prepared_worker_failure_always_has_a_diagnostic(self):
        with patch.object(auto.subprocess, 'run', return_value=SimpleNamespace(returncode=7, stdout='', stderr='')):
            with self.assertRaisesRegex(RuntimeError, '7'):
                auto.run_prepared(['synthetic-python'])

    def fixture(self, root):
        home = root / 'user'; home.mkdir()
        dsh_home = root / 'custom dsh'
        profile = dsh_home / 'profiles/web'; profile.mkdir(parents=True)
        (profile / 'cordis.patch.yml').write_text('[]\n', encoding='utf-8')
        host = root / 'harness'; (host / 'apps/cli/lib').mkdir(parents=True)
        (host / 'apps/cli/lib/bin.js').write_text('host', encoding='utf-8')
        (host / 'apps/cli/package.json').write_text(json.dumps({'name': '@deepseek-ai/dsh', 'version': '0.2.2-alpha.2', 'bin': {'dsh': 'lib/bin.js'}}), encoding='utf-8')
        repo = root / 'product'; (repo / '.runtime/deepseek-harness').mkdir(parents=True)
        (repo / '.runtime/deepseek-harness/installation.json').write_text(json.dumps({'harnessRoot': str(host), 'dshHome': str(dsh_home)}), encoding='utf-8')
        media = repo / '.runtime/harness-release'; media.mkdir()
        release = root / 'payload'; release.mkdir()
        return home, dsh_home, host, repo, media, release

    def test_existing_host_is_found_without_any_path_inputs_except_destination(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); home, dsh_home, host, repo, media, release = self.fixture(root)
            plan = auto.discover(release, media, root / 'chosen destination', environ={'USERPROFILE': str(home)}, which=lambda name: None)
            self.assertEqual(plan['dshHome'], str(dsh_home.resolve()))
            self.assertEqual(plan['dsh'], str((host / 'apps/cli/lib/bin.js').resolve()))
            self.assertEqual(plan['profile'], 'web')
            self.assertEqual(plan['models'], str((root / 'chosen destination/models').resolve()))
            self.assertNotIn(str(home.resolve()), plan['scanRoots'])

    def test_explicit_dsh_home_wins_and_discovery_does_not_write_anything(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); home, dsh_home, host, repo, media, release = self.fixture(root)
            custom = root / 'explicit home'; (custom / 'profiles/web').mkdir(parents=True)
            config = custom / 'profiles/web/cordis.patch.yml'; config.write_text('[]\n', encoding='utf-8')
            chosen = root / 'uncreated'
            plan = auto.discover(release, media, chosen, environ={'USERPROFILE': str(home), 'DSH_HOME': str(custom)}, which=lambda name: None)
            self.assertEqual(plan['dshHome'], str(custom.resolve()))
            self.assertEqual(config.read_text(), '[]\n')
            self.assertFalse(chosen.exists())

    def test_missing_harness_is_a_clear_error(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaisesRegex(ValueError, 'Harness'):
                auto.discover(root, root, root / 'target', environ={'USERPROFILE': str(root)}, which=lambda name: None)

    def test_safe_host_inspection_honors_disabled_defaults_and_keeps_relative_custom_roots(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            modules = root / 'dsh/profiles/web/node_modules'; modules.mkdir(parents=True)
            store = root / 'original-store/v11'; store.mkdir(parents=True)
            (modules / '.modules.yaml').write_text('storeDir: ' + json.dumps(str(store)) + '\n', encoding='utf-8')
            plan = {'dshHome': str(root / 'dsh'), 'profile': 'web', '_command': ['synthetic-dsh'],
                    'dsh': str(root / 'dsh.exe'), 'scanRoots': [str(root / 'owned'), str(root / 'default')], 'reuseModels': []}
            text = '- id: skill-filesystem\n  config:\n    includeDefaultRoots: false\n    customSkillDirs: [relative-skills]\n- id: provider\n  config: {secret: PRIVATE, evaluator: !!js process.exit(99)}\n'
            auto.inspect_host(plan, lambda *args, **kwargs: text)
            self.assertEqual(plan['scanRoots'], [str(root / 'owned')])
            self.assertEqual(plan['relativeSkillDirs'], ['relative-skills'])
            self.assertFalse(plan['projectSkills'])
            self.assertEqual(plan['packageManagerArgs'], ['--config.store-dir=' + str(store.parent)])
            self.assertNotIn('PRIVATE', json.dumps(plan))
            with self.assertRaises(Exception):
                auto.safe_rows('!!python/object/apply:os.system [invalid]')


if __name__ == '__main__':
    unittest.main()
