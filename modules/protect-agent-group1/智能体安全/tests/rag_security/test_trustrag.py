import unittest

from rag_security.provenance import KnowledgeDocument
from rag_security.trustrag_adapter import BaselineTrustRAG, TrustRAGResult


def document(
    document_id: str,
    *,
    trust: float = 0.9,
    verified: bool = True,
    poison: float = 0.0,
) -> KnowledgeDocument:
    return KnowledgeDocument(
        document_id=document_id,
        content=f"content for {document_id}",
        source="official_web",
        source_trust=trust,
        verified=verified,
        poison_score=poison,
    )


class TrustRAGTests(unittest.TestCase):
    def test_keeps_only_verified_trusted_clean_documents(self) -> None:
        clean = document("clean")
        unverified = document("unverified", verified=False)
        low_trust = document("low-trust", trust=0.2)
        poisoned = document("poisoned", poison=0.95)

        result = BaselineTrustRAG().assess(
            "question", (clean, unverified, low_trust, poisoned)
        )

        self.assertEqual(result.trusted_documents, (clean,))
        self.assertEqual(result.poison_score, 1.0)
        self.assertEqual(result.filtered_count, 3)

    def test_empty_retrieval_is_clean_and_available(self) -> None:
        result = BaselineTrustRAG().assess("question", ())

        self.assertEqual(result.poison_score, 0.0)
        self.assertEqual(result.trusted_documents, ())
        self.assertTrue(result.available)

    def test_document_rejects_invalid_source_trust(self) -> None:
        with self.assertRaisesRegex(ValueError, "source_trust"):
            document("invalid", trust=-0.1)

    def test_result_rejects_non_document_context(self) -> None:
        with self.assertRaisesRegex(ValueError, "trusted_documents"):
            TrustRAGResult(("not-a-document",), 0.0, 0)


if __name__ == "__main__":
    unittest.main()
