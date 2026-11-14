"""Exact-document, expiring grants issued only by a verified business approver."""
import json
import sqlite3
import time
import uuid
from contextlib import closing


class DocumentAccess:
    def __init__(self, root):
        self.path = root / 'document-access.sqlite'
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('''CREATE TABLE IF NOT EXISTS requests (
                id TEXT PRIMARY KEY, subject TEXT NOT NULL, document_id TEXT NOT NULL,
                purpose TEXT NOT NULL, minutes INTEGER NOT NULL, status TEXT NOT NULL,
                created_at REAL NOT NULL, reviewer TEXT, reviewed_at REAL, expires_at REAL)''')
            db.commit()

    def rows(self, subject):
        if not subject:
            return []
        privileged = bool({'business_approver', 'workspace_maintainer'}.intersection(subject['roles']))
        with closing(sqlite3.connect(self.path)) as db:
            db.row_factory = sqlite3.Row
            rows = [dict(r) for r in db.execute('SELECT * FROM requests ORDER BY created_at DESC')
                    if privileged or r['subject'] == subject['id']]
        for row in rows:
            if row['status'] == 'approved' and row['expires_at'] <= time.time():
                row['status'] = 'expired'
        return rows

    def allowed(self, subject, document_id):
        if document_id != 'grid_records':
            return None
        if {'security_admin', 'business_approver'}.intersection(subject.get('roles', [])):
            return True
        if 'office_user' not in subject.get('roles', []):
            return False
        return any(r['document_id'] == document_id and r['status'] == 'approved'
                   for r in self.rows(subject))

    def request(self, subject, payload):
        if 'office_user' not in subject['roles'] or payload.get('document_id') != 'grid_records':
            raise ValueError('DOCUMENT_REQUEST_FORBIDDEN')
        purpose, minutes = payload.get('purpose'), payload.get('minutes')
        if not isinstance(purpose, str) or not 8 <= len(purpose.strip()) <= 500:
            raise ValueError('DOCUMENT_PURPOSE_REQUIRED')
        if type(minutes) is not int or not 1 <= minutes <= 120:
            raise ValueError('DOCUMENT_DURATION_INVALID')
        rid = uuid.uuid4().hex
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('INSERT INTO requests VALUES(?,?,?,?,?,?,?,NULL,NULL,NULL)',
                       (rid, subject['id'], 'grid_records', purpose.strip(), minutes, 'pending', time.time()))
            db.commit()
        return next(r for r in self.rows(subject) if r['id'] == rid)

    def review(self, subject, payload):
        if 'business_approver' not in subject['roles']:
            raise ValueError('DOCUMENT_REVIEW_FORBIDDEN')
        if payload.get('resolution') not in {'approve', 'reject'}:
            raise ValueError('DOCUMENT_REVIEW_INVALID')
        with closing(sqlite3.connect(self.path)) as db:
            db.row_factory = sqlite3.Row
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM requests WHERE id=?', (payload.get('request_id'),)).fetchone()
            if not row or row['status'] != 'pending' or row['subject'] == subject['id']:
                raise ValueError('DOCUMENT_REVIEW_INVALID')
            stamp = time.time()
            db.execute('UPDATE requests SET status=?,reviewer=?,reviewed_at=?,expires_at=? WHERE id=?',
                       ('approved' if payload['resolution'] == 'approve' else 'rejected', subject['id'], stamp,
                        stamp + row['minutes'] * 60 if payload['resolution'] == 'approve' else None, row['id']))
            db.commit()
        return next(r for r in self.rows(subject) if r['id'] == row['id'])
