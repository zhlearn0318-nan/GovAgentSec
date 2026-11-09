"""Human review receipts never grant installation or change combined decisions."""
from datetime import datetime, timezone
from contextlib import closing
from backend.install_policy_audit import (
    _connect, resolve_audit_db, read_install_policy_audit,
    read_recent_install_policy_audits, verify_install_policy_audit,
)
from backend.custom_rules import CustomRuleError


def _connection():
    connection = _connect(resolve_audit_db())
    connection.execute("""CREATE TABLE IF NOT EXISTS admission_manual_review (
        audit_sequence INTEGER PRIMARY KEY, evidence_hash TEXT NOT NULL,
        resolution TEXT NOT NULL CHECK(resolution IN ('approve','reject')),
        actor TEXT NOT NULL, created_at TEXT NOT NULL)""")
    connection.executescript("""
        CREATE TRIGGER IF NOT EXISTS admission_manual_review_no_update
        BEFORE UPDATE ON admission_manual_review BEGIN SELECT RAISE(ABORT, 'review receipts are immutable'); END;
        CREATE TRIGGER IF NOT EXISTS admission_manual_review_no_delete
        BEFORE DELETE ON admission_manual_review BEGIN SELECT RAISE(ABORT, 'review receipts are immutable'); END;
    """)
    return connection


def list_reviews():
    integrity = verify_install_policy_audit()
    if not integrity['valid']:
        raise CustomRuleError('原准入审计链异常，不能复核。')
    with closing(_connection()) as connection, connection:
        receipts = {r['audit_sequence']: dict(r) for r in connection.execute('SELECT * FROM admission_manual_review')}
    rows = []
    for audit in read_recent_install_policy_audits(limit=100):
        if audit['target_type'].lower() not in {'skill', 'mcp'} or audit['decision'].lower() not in {'warn', 'review'}:
            continue
        receipt = receipts.get(audit['sequence'])
        if receipt and receipt['evidence_hash'] != audit['chain_sha256']:
            raise CustomRuleError('复核依据不匹配，不能继续。')
        rows.append({key: audit[key] for key in ('sequence','target_type','target_name','created_at','chain_sha256','finding_rule_ids')} | {
            'status': 'pending_review' if not receipt else 'recheck_required' if receipt['resolution'] == 'approve' else 'rejected',
            'receipt': receipt, 'installed': False,
        })
    return {'reviews': rows, 'integrity': integrity}


def resolve_review(request):
    resolution = request.get('resolution')
    actor = request.get('actor')
    sequence = request.get('sequence')
    if resolution not in {'approve','reject'} or not isinstance(actor,str) or not actor or len(actor)>120 or type(sequence) is not int:
        raise CustomRuleError('复核参数无效。')
    if not verify_install_policy_audit()['valid']:
        raise CustomRuleError('原准入审计链异常，不能复核。')
    audit = read_install_policy_audit(sequence)
    if not audit or audit['target_type'].lower() not in {'skill','mcp'} or audit['decision'].lower() not in {'warn','review'}:
        raise CustomRuleError('该记录不属于待人工复核项。')
    if request.get('evidence_hash') != audit['chain_sha256']:
        raise CustomRuleError('复核依据已变化，请刷新。')
    with closing(_connection()) as connection, connection:
        connection.execute('BEGIN IMMEDIATE')
        if connection.execute('SELECT 1 FROM admission_manual_review WHERE audit_sequence=?',(sequence,)).fetchone():
            raise CustomRuleError('该项已复核，请刷新。')
        connection.execute('INSERT INTO admission_manual_review VALUES (?,?,?,?,?)',(
            sequence,audit['chain_sha256'],resolution,actor,datetime.now(timezone.utc).isoformat()))
    # The immutable install-policy ledger and upload installation eligibility are untouched.
    return list_reviews()
