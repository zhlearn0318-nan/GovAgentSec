import asyncio
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('adapter', Path(__file__).resolve().parents[1] / 'skillclaw_adapter.py')
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class AdapterTests(unittest.TestCase):
    def test_remote_endpoints_rejected(self):
        for url in ('https://example.com', 'http://localhost:11435', 'http://127.0.0.1.evil.test', 'http://user@127.0.0.1:11435'):
            with self.assertRaises(ValueError):
                adapter.LocalClient(url, 'model')

    def test_upstream_does_not_silently_drop_sessions(self):
        for sessions in ([], [{}] * 31):
            with self.assertRaises(ValueError):
                asyncio.run(adapter.generate({'sessions': sessions}))

    def test_generation_returns_candidate_not_published_files(self):
        async def fake_generate(client, sessions, names):
            client.identity = {'model': 'fixture'}
            return {'action': 'create_skill', 'skill': {'name': 'purchase-check', 'description': 'Check prices', 'content': 'Preserve approvals.'}}
        with patch.object(adapter, 'create_skill_from_sessions', fake_generate):
            result = asyncio.run(adapter.generate({'sessions': [{'session_id': 'fixture'}], 'endpoint': 'http://127.0.0.1:11435', 'model': 'test'}))
        self.assertEqual(result['status'], 'candidate')
        self.assertTrue(result['content'].startswith('---\nname: purchase-check\n'))

    def test_invalid_name_cannot_escape_candidate_directory(self):
        async def fake_generate(*args):
            return {'action': 'create_skill', 'skill': {'name': '../../escape', 'description': 'x', 'content': 'x'}}
        with patch.object(adapter, 'create_skill_from_sessions', fake_generate), self.assertRaises(ValueError):
            asyncio.run(adapter.generate({'sessions': [{}], 'endpoint': 'http://127.0.0.1:11435', 'model': 'test'}))


if __name__ == '__main__':
    unittest.main()
