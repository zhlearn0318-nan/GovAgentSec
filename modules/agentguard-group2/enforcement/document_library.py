"""Service-owned uploaded text; immutable metadata, no caller-selected paths."""
import base64
import hashlib
import io
import re
import sqlite3
import stat
import uuid
import zipfile
from contextlib import closing
from pathlib import Path
from xml.etree import ElementTree

LEVELS = {'public': 0, 'internal': 1, 'confidential': 2, 'secret': 3}
MAX_UPLOAD = 256 * 1024
MAX_TEXT = 32768


class ImportError(ValueError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def extract_text(filename, encoded):
    if (not isinstance(filename, str) or not 1 <= len(filename) <= 180
            or any(c in filename for c in '/\\:\x00') or filename in {'.', '..'}):
        raise ImportError('DOCUMENT_INVALID_FILE')
    suffix = Path(filename).suffix.lower()
    if suffix not in {'.txt', '.md', '.docx'}:
        raise ImportError('DOCUMENT_UNSUPPORTED_FORMAT')
    if not isinstance(encoded, str) or len(encoded) > 4 * ((MAX_UPLOAD + 2) // 3):
        raise ImportError('DOCUMENT_TOO_LARGE')
    try:
        raw = base64.b64decode(encoded, validate=True)
        if not raw or len(raw) > MAX_UPLOAD:
            raise ImportError('DOCUMENT_TOO_LARGE')
        if suffix == '.docx':
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                entries = archive.infolist()
                if (len(entries) > 256 or sum(e.file_size for e in entries) > 4 * 1024 * 1024
                        or any(e.flag_bits & 1 for e in entries)):
                    raise ImportError('DOCUMENT_INVALID_FILE')
                info = archive.getinfo('word/document.xml')
                if info.file_size > 1024 * 1024:
                    raise ImportError('DOCUMENT_TOO_LARGE')
                xml = archive.read(info)
                if b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper():
                    raise ImportError('DOCUMENT_INVALID_FILE')
                root = ElementTree.fromstring(xml)
                ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
                text = '\n'.join(''.join(p.itertext()) if not list(p.iter(ns+'t')) else
                    ''.join(t.text or '' for t in p.iter(ns+'t')) for p in root.iter(ns+'p'))
        else:
            text = raw.decode('utf-8-sig')
    except ImportError:
        raise
    except Exception:
        raise ImportError('DOCUMENT_INVALID_FILE') from None
    text = text.strip()
    if not text or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', text):
        raise ImportError('DOCUMENT_EMPTY_OR_BINARY')
    if len(text.encode('utf-8')) > MAX_TEXT:
        raise ImportError('DOCUMENT_TEXT_TOO_LARGE')
    return text


class DocumentLibrary:
    def __init__(self, directory):
        self.root = Path(directory).absolute()
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / 'documents.sqlite'
        self._check_paths()
        with closing(self.connect()) as db:
            db.execute('''CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, level TEXT NOT NULL,
                content TEXT NOT NULL, sha256 TEXT NOT NULL, importer TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
            db.commit()

    def _check_paths(self):
        for part in [*self.root.parents, self.root, self.path]:
            if not part.exists() and not part.is_symlink():
                continue
            info = part.lstat()
            if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
                raise ImportError('DOCUMENT_STORAGE_UNAVAILABLE')
            if part == self.path and (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1):
                raise ImportError('DOCUMENT_STORAGE_UNAVAILABLE')

    def connect(self):
        self._check_paths()
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def catalogue(self):
        with closing(self.connect()) as db:
            return {row['id']: dict(document_id=row['id'], title=row['title'], data_level=row['level'],
                    imported=True, created_at=row['created_at'])
                    for row in db.execute('SELECT id,title,level,created_at FROM documents ORDER BY created_at,id')}

    def registry(self):
        return {key: (key, f'govdoc://library/{row["data_level"]}/{key}', row['data_level'], 'low')
                for key,row in self.catalogue().items()}

    def import_document(self, payload, subject):
        # Checked again here so a new caller cannot accidentally bypass UI/RPC authorization.
        if 'workspace_maintainer' not in subject.get('roles', []):
            raise ImportError('DOCUMENT_IMPORT_FORBIDDEN')
        if set(payload) != {'filename','content_base64','title','data_level'}:
            raise ImportError('DOCUMENT_INVALID_FIELDS')
        level, title = payload['data_level'], payload['title']
        if not isinstance(level, str) or level not in LEVELS or LEVELS[level] > subject.get('clearance', -1):
            raise ImportError('DOCUMENT_INVALID_LEVEL')
        if not isinstance(title, str) or not 1 <= len(title.strip()) <= 120 or re.search(r'[\x00-\x1f]', title):
            raise ImportError('DOCUMENT_INVALID_TITLE')
        text = extract_text(payload['filename'], payload['content_base64'])
        document_id = 'doc_' + uuid.uuid4().hex
        hashed = hashlib.sha256(text.encode('utf-8')).hexdigest()
        with closing(self.connect()) as db:
            db.execute('INSERT INTO documents(id,title,level,content,sha256,importer) VALUES (?,?,?,?,?,?)',
                (document_id, title.strip(), level, text, hashed, subject['id']))
            db.commit()
        return {'document_id': document_id, 'title':title.strip(), 'data_level':level, 'imported':True}

    def delete_document(self, document_id, subject):
        if 'workspace_maintainer' not in subject.get('roles', []):
            raise ImportError('DOCUMENT_DELETE_FORBIDDEN')
        if not isinstance(document_id, str) or not re.fullmatch(r'doc_[0-9a-f]{32}', document_id):
            raise ImportError('DOCUMENT_UNAVAILABLE')
        with closing(self.connect()) as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT level FROM documents WHERE id=?', (document_id,)).fetchone()
            if not row or LEVELS.get(row['level'], 99) > subject.get('clearance', -1):
                raise ImportError('DOCUMENT_UNAVAILABLE')
            db.execute('DELETE FROM documents WHERE id=?', (document_id,))
            db.commit()
        return {'document_id': document_id, 'data_level': row['level']}

    def read(self, document_id, level):
        with closing(self.connect()) as db:
            row = db.execute('SELECT level,content,sha256 FROM documents WHERE id=?', (document_id,)).fetchone()
        if (not row or row['level'] != level or len(row['content'].encode('utf-8')) > MAX_TEXT
                or hashlib.sha256(row['content'].encode('utf-8')).hexdigest() != row['sha256']):
            raise ImportError('DOCUMENT_STORAGE_UNAVAILABLE')
        return row['content']
