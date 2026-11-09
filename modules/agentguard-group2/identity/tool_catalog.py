"""Server-owned adapter catalog. Admission is local; this never installs tools."""
import hashlib
import json
import sys
import tempfile
from pathlib import Path

from integrations.openclaw_mcp import server

ROOT = Path(__file__).resolve().parents[1]
NATIVE = {
    'read': ('读取工作区文件', 'native.read', 'read'),
    'write': ('写入工作区文件', 'file.write', 'write'),
    'edit': ('编辑工作区文件', 'file.write', 'write'),
    'exec': ('执行工作区命令', 'shell.execute', 'execute'),
}
MCP = [
    (server.TOOL_DEFINITION, 'database.query', 'query'),
    (server.DOCUMENT_TOOL_DEFINITION, 'file.read', 'read'),
    (server.STATUS_TOOL_DEFINITION, 'database.query', 'query'),
    (server.NOTICE_TOOL_DEFINITION, 'notification.submit', 'submit'),
    (server.PAYMENT_TOOL_DEFINITION, 'payment.transfer', 'transfer'),
    (server.DANGEROUS_TOOL_DEFINITION, 'shell.execute', 'execute'),
]


def assess_definition(definition):
    """Reuse Aegis's declaration analyzer and policy. No network or host config."""
    backend = str(ROOT.parent / 'aegis/demo_web')
    if backend not in sys.path:
        sys.path.insert(0, backend)
    from backend.analyzers.mcp_policy import analyze_mcp_objects
    from backend.policy import evaluate_findings
    with tempfile.TemporaryDirectory() as directory:
        paths = [Path(directory) / (kind + '.json') for kind in ('tools', 'prompts', 'resources')]
        for path, kind, values in zip(paths, ('tools', 'prompts', 'resources'), ([definition], [], [])):
            path.write_text(json.dumps({kind: values}, ensure_ascii=False), encoding='utf-8')
        findings, _ = analyze_mcp_objects(*paths)
    evaluation = evaluate_findings(findings)
    return evaluation.decision.value.upper()


class ToolCatalog:
    def __init__(self, policy, receipt_path):
        self.policy = policy
        self.rows = {}
        for name, (label, tool, operation) in NATIVE.items():
            self.rows[name] = dict(tool_name=name, label=label, tool=tool, operation=operation,
                                   source='builtin-managed', admission='BUILTIN')
        for definition, tool, operation in MCP:
            name = 'agentguard-notices__' + definition['name']
            try:
                decision = assess_definition(definition)
            except Exception:
                decision = 'UNAVAILABLE'  # Never turn an unavailable scanner into ALLOW.
            digest = hashlib.sha256(json.dumps(definition, sort_keys=True, ensure_ascii=False,
                                               separators=(',', ':')).encode()).hexdigest()
            self.rows[name] = dict(tool_name=name, label=definition.get('title', definition['name']),
                tool=tool, operation=operation, source='aegis-local-declaration',
                admission=decision, definition_sha256=digest)
        Path(receipt_path).write_text(json.dumps(dict(scope='bundled-adapter-declarations',
            production_oidc=False, tools=list(self.rows.values())), ensure_ascii=False, indent=2), encoding='utf-8')

    def check(self, name, subject):
        row = self.rows.get(name)
        if row is None:
            return 'P024_TOOL_NOT_IN_CATALOG'
        if row['admission'] not in {'ALLOW', 'BUILTIN'}:
            return 'P026_TOOL_ADMISSION_REQUIRED'
        if not self.policy['tools'].get(row['tool'], {}).get('enabled') or not any(
            p['role'] in subject['roles'] and p['tool'] == row['tool'] and row['operation'] in p['operations']
            for p in self.policy['permissions']
        ):
            return 'P025_TOOL_PERMISSION_DENIED'
        return None

    def summary(self, subject):
        return [{**row, 'available': self.check(name, subject) is None,
                 'reason_code': self.check(name, subject)} for name, row in self.rows.items()]
