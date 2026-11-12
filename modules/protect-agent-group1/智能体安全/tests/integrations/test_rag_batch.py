import unittest

from rag_security.trustrag_adapter import TrustRAGResult
from risk.risk_schema import GuardSignal
from security_eval.adapter import SecurityEvalAdapter
from integrations.openclaw.sidecar import OpenClawScreeningService, parse_screen_request


class SafeGuard:
    name = 'safe_test_guard'

    def scan(self, text, source):
        return GuardSignal(self.name, 0.0)


class BatchTrustRAG:
    def __init__(self):
        self.calls = []

    def assess(self, query, documents):
        self.calls.append((query, documents))
        return TrustRAGResult(documents[:-1], 0.5, 1)


class RagBatchTests(unittest.TestCase):
    def test_removed_chunk_blocks_the_batch_and_all_chunks_reach_rag_together(self):
        rag = BatchTrustRAG()
        adapter = SecurityEvalAdapter(piguard=SafeGuard(), qwen3guard=SafeGuard(), trustrag=rag)
        request = parse_screen_request({
            'version': '1', 'kind': 'tool_result', 'toolName': 'retrieve', 'query': 'Read the notices.',
            'chunks': [{'id': 'one', 'text': 'Notice one.'}, {'id': 'two', 'text': 'Notice two.'}],
        })
        result = OpenClawScreeningService(adapter).screen(request)
        self.assertEqual(len(rag.calls[0][1]), 2)
        self.assertEqual(result.decision, 'BLOCK')
        self.assertFalse(result.retained)
        self.assertTrue(result.detectors_available)


if __name__ == '__main__':
    unittest.main()
