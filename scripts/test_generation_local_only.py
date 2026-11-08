"""Skill generation transport boundary: synthetic messages only; no external traffic."""
import asyncio
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import Mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('skillclaw_local_adapter',ROOT/'modules/trajectory-governance/skillclaw_adapter.py')
adapter=importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


class LocalGeneration(unittest.TestCase):
    def test_remote_and_mutated_endpoints_never_reach_transport(self):
        for endpoint in ['https://api.deepseek.com','http://localhost:11434','http://127.0.0.1.evil:11434','http://u:p@127.0.0.1:11434']:
            with self.assertRaises(ValueError):adapter.LocalClient(endpoint,'qwen3:4b')
        client=adapter.LocalClient('http://127.0.0.1:11435','qwen3:4b');client.opener=Mock()
        client.endpoint='https://api.deepseek.com'
        with self.assertRaises(ValueError):client.request('/api/chat',{'messages':'synthetic'})
        client.opener.open.assert_not_called()

    def test_cloud_backed_ollama_has_no_evidence_request(self):
        client=adapter.LocalClient('http://127.0.0.1:11435','qwen3:4b')
        calls=[]
        def request(route,body=None):
            calls.append(route)
            if route=='/api/tags':return {'models':[{'name':'qwen3:4b','digest':'359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7'}]}
            if route=='/api/show':return {'remote_host':'https://cloud.invalid','remote_model':'synthetic-cloud'}
            self.fail('evidence reached cloud-backed model')
        client.request=request
        with self.assertRaises(ValueError):asyncio.run(client.chat([{'role':'system','content':'synthetic'}]))
        self.assertEqual(calls,['/api/tags','/api/show'])

    def test_no_proxy_and_no_redirect(self):
        client=adapter.LocalClient('http://127.0.0.1:11435','qwen3:4b')
        # Empty ProxyHandler is omitted by urllib, which means no environment proxy handler remains.
        self.assertFalse(any(isinstance(h,adapter.urllib.request.ProxyHandler) and h.proxies for h in client.opener.handlers))
        with self.assertRaises(ValueError):adapter.NoRedirect().redirect_request(None,None,302,'redirect',{},'https://cloud.invalid')

if __name__=='__main__':unittest.main()
