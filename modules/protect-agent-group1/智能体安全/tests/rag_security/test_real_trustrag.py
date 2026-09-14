import unittest

from rag_security.provenance import KnowledgeDocument
from rag_security.real_trustrag import OfficialTrustRAG


class FakeTrustRAGBackend:
    def __init__(self, retained: tuple[bool, ...]) -> None:
        self.retained = retained

    def retained_mask(self, texts: tuple[str, ...]) -> tuple[bool, ...]:
        self.last_texts = texts
        return self.retained


def document(identifier: str, content: str) -> KnowledgeDocument:
    return KnowledgeDocument(
        document_id=identifier,
        content=content,
        source="test",
        source_trust=1.0,
        verified=True,
    )


class OfficialTrustRAGContractTests(unittest.TestCase):
    def test_retains_documents_using_backend_mask_without_text_rewrite(self) -> None:
        backend = FakeTrustRAGBackend((True, False, True))
        adapter = OfficialTrustRAG(backend)
        documents = (
            document("a", "first"),
            document("b", "second"),
            document("c", "third"),
        )

        result = adapter.assess("question", documents)

        self.assertEqual([item.document_id for item in result.trusted_documents], ["a", "c"])
        self.assertEqual(result.filtered_count, 1)
        self.assertAlmostEqual(result.poison_score, 1 / 3)
        self.assertEqual(backend.last_texts, ("first", "second", "third"))

    def test_invalid_mask_length_is_rejected(self) -> None:
        adapter = OfficialTrustRAG(FakeTrustRAGBackend((True,)))

        with self.assertRaises(ValueError):
            adapter.assess("question", (document("a", "one"), document("b", "two")))

    def test_blank_query_is_rejected_before_backend_call(self) -> None:
        with self.assertRaises(ValueError):
            OfficialTrustRAG(FakeTrustRAGBackend(())).assess(" ", ())


if __name__ == "__main__":
    unittest.main()
