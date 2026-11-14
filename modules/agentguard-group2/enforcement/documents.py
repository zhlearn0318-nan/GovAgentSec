"""Operator-owned synthetic document registry; never accepts a caller path."""
from pathlib import Path, PureWindowsPath
import os
import re
import stat

REGISTRY = {
    'grid_curves': ('grid_curves.csv', 'govdoc://grid/public/curves', 'public', 'low'),
    'grid_records': ('grid_records.json', 'govdoc://grid/internal/records', 'internal', 'low'),
    'grid_other': ('grid_other.txt', 'govdoc://protected/grid/other', 'internal', 'low'),
}
ROOT = Path(__file__).resolve().parents[1] / 'demo_documents'

def document_action(document_id, registry=None):
    registry = REGISTRY if registry is None else registry
    if not isinstance(document_id, str) or document_id not in registry:
        raise ValueError('document unavailable')
    _, resource, level, risk = registry[document_id]
    return dict(tool='file.read', operation='read', resource=resource,
                parameters={'document_id': document_id}, data_level=level, risk_level=risk)

def validate_document_action(action, registry=None):
    parameters = action.get('parameters', {})
    if set(parameters) != {'document_id'} or action != document_action(parameters.get('document_id'), registry):
        raise ValueError('document unavailable')

def scrub_document_receipt(value):
    """Remove content from audit, status, approval responses and cached receipts."""
    if isinstance(value, list):
        return [scrub_document_receipt(v) for v in value]
    if isinstance(value, dict):
        return {k: scrub_document_receipt(v) for k, v in value.items() if k != 'document_content'}
    return value

class DocumentReader:
    def __init__(self, root=ROOT, library=None):
        self.root = Path(root).absolute()
        self.library = library
        self.read_count = 0

    @property
    def registry(self):
        return {**REGISTRY, **(self.library.registry() if self.library else {})}

    def action(self, document_id):
        return document_action(document_id, self.registry)

    def execute(self, request):
        action = request['action']
        validate_document_action(action, self.registry)
        document_id = action['parameters']['document_id']
        if document_id not in REGISTRY:
            text = self.library.read(document_id, action['data_level'])
            self.read_count += 1
            return self.receipt(document_id, text, synthetic=False)
        relative = REGISTRY[document_id][0]
        if Path(relative).is_absolute() or PureWindowsPath(relative).is_absolute() or '..' in Path(relative).parts or '\\' in relative:
            raise ValueError('document unavailable')
        target = self.root / relative
        # Reject symlinks and Windows junctions in every component, including root.
        for part in [*target.parents, target]:
            info = part.lstat()
            if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
                raise ValueError('document unavailable')
        if not target.resolve().is_relative_to(self.root.resolve()):
            raise ValueError('document unavailable')
        info = target.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_size > 32768:
            raise ValueError('document unavailable')
        # Directory is service-owned; no agent write capability is exposed.
        with target.open('rb') as handle:
            if not os.path.samestat(info, os.fstat(handle.fileno())):
                raise ValueError('document unavailable')
            self.read_count += 1
            text = handle.read(32769).decode('utf-8')
        if len(text.encode('utf-8')) > 32768:
            raise ValueError('document unavailable')
        return self.receipt(document_id, text, synthetic=document_id != 'grid_curves')

    @staticmethod
    def receipt(document_id, text, *, synthetic):
        text = re.sub(r'(?<!\d)\d{17}[\dXx](?!\d)|(?<!\d)1[3-9]\d{9}(?!\d)', '[已脱敏]', text)
        text = re.sub(r'(?i)(password|token|secret|口令)\s*[:=：]\s*\S+', '[已脱敏]', text)
        return {'adapter': 'isolated_synthetic_document' if synthetic else 'isolated_managed_document', 'document_id': document_id,
                'document_content': text, 'side_effect': False, 'synthetic': synthetic}
