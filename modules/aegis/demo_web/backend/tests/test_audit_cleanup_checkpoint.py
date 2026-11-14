from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import sqlite3

import pytest

from backend.install_policy_audit import record_install_policy_audit, verify_audit_rows, verify_install_policy_audit


def retained_fixture(destination, snapshot, checkpoint):
    """Build a synthetic retained chain without importing local cleanup commands."""
    with sqlite3.connect(destination) as db:
        for entry in snapshot["schema"]:
            if entry["type"] == "table":
                db.execute(entry["sql"])
        rows = snapshot["rows"][checkpoint["removed_rows"]:]
        fields = list(rows[0])
        db.executemany("INSERT INTO install_policy_audit (" + ",".join(fields) + ") VALUES (" + ",".join("?" for _ in fields) + ")", [[r[f] for f in fields] for r in rows])
        db.execute("CREATE TABLE audit_cleanup_checkpoint (id INTEGER PRIMARY KEY CHECK(id=1), payload_json TEXT NOT NULL)")
        db.execute("INSERT INTO audit_cleanup_checkpoint VALUES(1,?)", (json.dumps(checkpoint),))
        for operation in ("UPDATE", "DELETE"):
            db.execute(f"CREATE TRIGGER checkpoint_no_{operation.lower()} BEFORE {operation} ON audit_cleanup_checkpoint BEGIN SELECT RAISE(ABORT, 'cleanup checkpoint is immutable'); END")
        for entry in snapshot["schema"]:
            if entry["type"] != "table":
                db.execute(entry["sql"])
    return verify_install_policy_audit(destination)


def source_ledger(tmp_path):
    database = tmp_path / "source.db"
    for name in ("old-test", "old-test", "grid-anomaly-diagnosis", "grid-anomaly-diagnosis"):
        record_install_policy_audit({"targetType": "skill", "targetName": name}, {"decision": "allow", "findings": []}, "a" * 64, 5, database=database)
    with sqlite3.connect(database) as db:
        db.execute("CREATE TABLE admission_manual_review (audit_sequence INTEGER PRIMARY KEY, evidence_hash TEXT NOT NULL, resolution TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL)")
        db.execute("INSERT INTO admission_manual_review VALUES(1,'old-hash','reject','old-reviewer','2026-11-01')")
    with sqlite3.connect(database) as db:
        db.row_factory = sqlite3.Row
        rows = [dict(r) for r in db.execute("SELECT * FROM install_policy_audit ORDER BY sequence")]
        schema = [dict(r) for r in db.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name!='sqlite_sequence' ORDER BY type,name")]
    snapshot = {"rows": rows, "schema": schema, "integrity": verify_audit_rows(rows)}
    checkpoint = {"original_database_sha256": hashlib.sha256(database.read_bytes()).hexdigest(), "prefix_chain_sha256": rows[1]["chain_sha256"], "removed_rows": 2, "created_at": datetime.now(timezone.utc).isoformat(), "reason": "Synthetic retained-history fixture"}
    return snapshot, checkpoint


def test_cleanup_preserves_original_grid_events_and_labels_partial_history(tmp_path):
    snapshot, checkpoint = source_ledger(tmp_path)
    destination = tmp_path / "retained.db"
    result = retained_fixture(destination, snapshot, checkpoint)
    assert result["valid"] and result["prefix_removed"] and result["scope"] == "retained_suffix"
    assert result["head_chain_sha256"] == snapshot["integrity"]["head_chain_sha256"]
    with sqlite3.connect(destination) as db:
        db.row_factory = sqlite3.Row
        rows = [dict(r) for r in db.execute("SELECT * FROM install_policy_audit ORDER BY sequence")]
        assert rows == snapshot["rows"][2:]
        assert db.execute("SELECT COUNT(*) FROM admission_manual_review").fetchone()[0] == 0
        with pytest.raises(sqlite3.IntegrityError, match="immutable"):
            db.execute("DELETE FROM audit_cleanup_checkpoint")
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            db.execute("DELETE FROM install_policy_audit")
    assert b"old-test" not in destination.read_bytes()
    assert b"old-reviewer" not in destination.read_bytes()
    record_install_policy_audit({"targetType": "skill", "targetName": "future-grid"}, {"decision": "block", "findings": []}, "b" * 64, 5, database=destination)
    continued = verify_install_policy_audit(destination)
    assert continued["valid"] and continued["rows"] == 3 and continued["prefix_removed"]


def test_checkpoint_never_masks_changes_or_missing_original_events(tmp_path):
    snapshot, checkpoint = source_ledger(tmp_path)
    rows = snapshot["rows"][2:]
    assert not verify_audit_rows(rows)["valid"]
    assert not verify_audit_rows(rows, {**checkpoint, "prefix_chain_sha256": "0" * 64})["valid"]
    assert not verify_audit_rows(rows[1:], checkpoint)["valid"]
    assert not verify_audit_rows([{**rows[0], "decision": "block"}, rows[1]], checkpoint)["valid"]
    assert not verify_audit_rows(rows, {**checkpoint, "removed_rows": 1})["valid"]
