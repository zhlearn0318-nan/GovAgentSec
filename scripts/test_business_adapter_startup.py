"""Startup must not recreate historical demo business rows after cleanup."""
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'modules/agentguard-group2'))
from enforcement.adapters import LocalTestBusinessAdapters


class BusinessAdapterStartup(unittest.TestCase):
    def test_empty_start_and_restart(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'local-validation') as directory:
            for _ in range(2):
                adapter = LocalTestBusinessAdapters(directory)
                with closing(sqlite3.connect(adapter.notices_db)) as db:
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM notices').fetchone()[0], 0)
                with closing(sqlite3.connect(adapter.ledger_db)) as db:
                    self.assertEqual(db.execute('SELECT COUNT(*) FROM payments').fetchone()[0], 0)

    def test_explicit_fixture_and_cleanup_are_preserved(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'local-validation') as directory:
            adapter = LocalTestBusinessAdapters(directory)
            with closing(sqlite3.connect(adapter.notices_db)) as db:
                db.execute('INSERT INTO notices VALUES (?, ?, ?, ?)',
                           (1, 'Explicit test notice', 'Test fixture', '2024-09-01'))
                db.commit()
            LocalTestBusinessAdapters(directory)
            with closing(sqlite3.connect(adapter.notices_db)) as db:
                self.assertEqual(db.execute('SELECT title FROM notices').fetchall(), [('Explicit test notice',)])
                db.execute('DELETE FROM notices WHERE id = 1')
                db.commit()
            LocalTestBusinessAdapters(directory)
            with closing(sqlite3.connect(adapter.notices_db)) as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM notices').fetchone()[0], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
