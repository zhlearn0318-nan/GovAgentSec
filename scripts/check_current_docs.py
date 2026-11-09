"""Check the documentation inventory, local links and product facts against source."""
import hashlib
import json
import pathlib
import re
import sys
from urllib.parse import unquote

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main():
    errors, checks = [], []
    index = json.loads((ROOT / 'docs/DOCUMENTATION_INDEX.json').read_text(encoding='utf-8'))
    rows = index['documents']
    declared = {row['path'] for row in rows}
    local_only = index.get('excluded_local_directories', [])
    actual = {p.relative_to(ROOT).as_posix() for p in (ROOT / 'docs').rglob('*.md')
              if not any(p.relative_to(ROOT).as_posix().startswith(d+'/') for d in local_only)}
    if declared != actual or len(declared) != len(rows):
        errors.append({'inventory_missing': sorted(actual-declared), 'stale': sorted(declared-actual)})
    else:
        checks.append('all_markdown_classified')
    current = ['README.md'] + [row['path'] for row in rows if row['status'] == 'current']
    for name in current:
        file = ROOT / name
        text = file.read_text(encoding='utf-8-sig')
        for target in re.findall(r'\]\(([^\s)]+)(?:\s+[^)]*)?\)', text):
            if re.match(r'^(?:https?:|mailto:|#)', target):
                continue
            target = unquote(target.split('#')[0].strip('<>'))
            if target and not (file.parent / target).resolve().exists():
                errors.append({'file': name, 'missing_link': target})
    checks.append('current_document_local_links_checked')
    baseline = (ROOT / 'docs/CURRENT_SYSTEM.md').read_text(encoding='utf-8')
    shell = (ROOT / 'modules/govagentsec-ui/shell.mjs').read_text(encoding='utf-8')
    routes = shell.split('const routes = [', 1)[1].split('];', 1)[0]
    labels = re.findall(r'\["[^"]+", "([^"]+)"\]', routes)
    if labels != ['动态权限', '能力准入', '演进审计', '安全总览', '防护设置'] or any(label not in baseline for label in labels):
        errors.append('Navigation changed; update CURRENT_SYSTEM and current guides')
    identity = (ROOT / 'modules/agentguard-group2/identity/demo_provider.py').read_text(encoding='utf-8')
    if not re.search(r'LOGIN_TTL_SECONDS\s*=\s*30\s*\*\s*60', identity) or '30 分钟' not in baseline:
        errors.append('Login lifetime differs from current documentation')
    view_model = (ROOT / 'modules/govagentsec-trace/view-model.mjs').read_text(encoding='utf-8')
    lanes = re.findall(r"'([^']+)'", view_model.split('export const graphLanes = [', 1)[1].split(']', 1)[0])
    if len(lanes) != 5 or any(label not in baseline for label in lanes):
        errors.append('Graph column description differs from source')
    view = (ROOT / 'modules/govagentsec-trace/view.mjs').read_text(encoding='utf-8')
    if '尚未评估' not in view or '尚未评估' not in baseline:
        errors.append('Unassessed presentation differs from documentation')
    registry = (ROOT / 'modules/agentguard-group2/enforcement/documents.py').read_text(encoding='utf-8')
    for document_id in re.findall(r"^\s*'([^']+)':\s*\(", registry, re.M):
        if document_id not in baseline:
            errors.append({'undocumented_document_id': document_id})
    account_doc = (ROOT / 'docs/OIDC_USAGE.md').read_text(encoding='utf-8')
    accounts = json.loads((ROOT / 'modules/agentguard-group2/identity/demo_accounts.json').read_text(encoding='utf-8'))
    for account in accounts['accounts']:
        match = re.search(r'\| '+re.escape(account['account'])+r' \| ([^|]+) \|', account_doc)
        if not match:
            errors.append({'missing_demo_account': account['account']})
            continue
        digest = hashlib.pbkdf2_hmac('sha256', match[1].strip().encode(), bytes.fromhex(account['salt']), accounts['iterations']).hex()
        if digest != account['password_hash']:
            errors.append({'demo_password_mismatch': account['account']})
    manifest = json.loads((ROOT / 'release-manifest.json').read_text(encoding='utf-8'))
    if manifest['openclaw'] != '2026.7.1-2' or manifest['version'] != (ROOT / 'VERSION').read_text().strip():
        errors.append('Release version differs from documentation baseline')
    for name in ['README.md', 'docs/WINDOWS_ONE_CLICK_INSTALL.md', 'docs/releases/v1.0.md']:
        text = (ROOT / name).read_text(encoding='utf-8')
        if any(label not in text for label in ['### 1. Windows', '### 2. 使用 Agent', '### 3. 传统手动']):
            errors.append({'file': name, 'installation_methods': 'expected_three'})
        if 'releases/download/v1.0/Bootstrap-Windows.ps1' in text:
            errors.append({'file': name, 'obsolete_asset_link': True})
    checks.append('source_navigation_identity_graph_registry_and_installation_contracts_checked')
    report = {'source': 'documentation-and-source-readonly', 'passed': not errors,
              'documents': len(rows), 'current_documents_checked': len(current), 'checks': checks, 'errors': errors}
    out = ROOT / 'local-validation/docs-sync/20261110/docs-check.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=True))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
