from __future__ import annotations

import hashlib
from collections import Counter
from pathlib import Path
from typing import Mapping, Sequence


class DataValidationError(ValueError):
    pass


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def validate_manifest_rows(
    rows: Sequence[Mapping[str, str]], *, expected_count: int = 500
) -> None:
    if len(rows) != expected_count:
        raise DataValidationError(
            f"manifest row count {len(rows)} != {expected_count}"
        )
    ids = [row.get("sample_id", "") for row in rows]
    if any(not value for value in ids) or len(ids) != len(set(ids)):
        raise DataValidationError("sample_id must be present and unique")
    if any(not row.get("text", "") for row in rows):
        raise DataValidationError("manifest text must not be blank")
    if any(row.get("label") not in {"risk", "benign"} for row in rows):
        raise DataValidationError("manifest label is invalid")


def validate_rag_rows(
    rows: Sequence[Mapping[str, str]],
    *,
    expected_queries: int = 50,
    expected_top_k: int = 5,
) -> None:
    expected_rows = expected_queries * expected_top_k * 2
    if len(rows) != expected_rows:
        raise DataValidationError(
            f"retrieval row count {len(rows)} != {expected_rows}"
        )
    ids = [row.get("retrieval_id", "") for row in rows]
    if any(not value for value in ids) or len(ids) != len(set(ids)):
        raise DataValidationError("retrieval_id must be present and unique")
    for row in rows:
        text = row.get("chunk_text", "")
        if not text or sha256_text(text) != row.get("text_sha256", "").lower():
            raise DataValidationError(
                f"text SHA-256 mismatch for {row.get('retrieval_id', '<blank>')}"
            )
        if row.get("scenario") not in {"clean", "poisoned"}:
            raise DataValidationError("retrieval scenario is invalid")
        if row.get("top_k") != str(expected_top_k):
            raise DataValidationError("top_k does not match fixed configuration")
        if row.get("is_poison") not in {"true", "false"}:
            raise DataValidationError("is_poison is invalid")
        if row.get("is_target_poison") not in {"true", "false"}:
            raise DataValidationError("is_target_poison is invalid")

    counts = Counter((row.get("query_id"), row.get("scenario")) for row in rows)
    query_ids = {row.get("query_id") for row in rows}
    if "" in query_ids or len(query_ids) != expected_queries:
        raise DataValidationError("query_id count does not match fixed pilot")
    expected_ranks = {str(rank) for rank in range(1, expected_top_k + 1)}
    for query_id in query_ids:
        for scenario in ("clean", "poisoned"):
            if counts[(query_id, scenario)] != expected_top_k:
                raise DataValidationError(
                    f"Top-K row count mismatch for {query_id}/{scenario}"
                )
            ranks = {
                row.get("rank")
                for row in rows
                if row.get("query_id") == query_id
                and row.get("scenario") == scenario
            }
            if ranks != expected_ranks:
                raise DataValidationError(
                    f"rank set mismatch for {query_id}/{scenario}"
                )
