import pytest
from backend.custom_rules import CustomRuleError
from backend.install_policy_audit import record_install_policy_audit, read_install_policy_audit, verify_install_policy_audit
from backend.manual_reviews import list_reviews, resolve_review


def test_review_binds_existing_evidence_and_never_changes_admission(tmp_path, monkeypatch):
    monkeypatch.setenv('AEGIS_OPENCLAW_AUDIT_DB',str(tmp_path/'review.db'))
    for target,decision in [('skill','warn'),('mcp','review'),('skill','block'),('skill','allow')]:
        record_install_policy_audit({'targetType':target,'targetName':'synthetic-review','openclawVersion':'2026.7.1-2'},
            {'decision':decision},'a'*64,1)
    assert len(list_reviews()['reviews'])==2
    before=read_install_policy_audit(1)
    request={'sequence':1,'evidence_hash':before['chain_sha256'],'resolution':'approve','actor':'maintenance-test'}
    with pytest.raises(CustomRuleError):resolve_review({**request,'evidence_hash':'b'*64})
    resolve_review(request)
    assert read_install_policy_audit(1)==before
    assert verify_install_policy_audit()['valid']
    row=next(r for r in list_reviews()['reviews'] if r['sequence']==1)
    assert row['status']=='recheck_required' and row['installed'] is False
    with pytest.raises(CustomRuleError):resolve_review(request)
    second=read_install_policy_audit(2)
    resolve_review({**request,'sequence':2,'evidence_hash':second['chain_sha256'],'resolution':'reject'})
    assert next(r for r in list_reviews()['reviews'] if r['sequence']==2)['status']=='rejected'
    for sequence in (3,4,99):
        with pytest.raises(CustomRuleError):resolve_review({**request,'sequence':sequence})


def test_invalid_resolution_and_actor_cannot_record_review(tmp_path,monkeypatch):
    monkeypatch.setenv('AEGIS_OPENCLAW_AUDIT_DB',str(tmp_path/'review.db'))
    for request in [{'sequence':True,'actor':'test','resolution':'approve'}, {'sequence':1,'actor':'','resolution':'approve'}, {'sequence':1,'actor':'test','resolution':'install'}]:
        with pytest.raises(CustomRuleError):resolve_review(request)
