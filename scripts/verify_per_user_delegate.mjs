import {evidence,python} from './lib/backlog-evidence.mjs';
const e=evidence('u13-per-user-delegate');
e.run('identity-boundary',python,['scripts/test_identity_boundary.py']);
e.run('delegation',python,['scripts/test_per_user_delegate.py']);
e.run('u4b',process.execPath,['scripts/verify_demo_identity.mjs']);
e.run('u10',process.execPath,['scripts/verify_identity_task_acl.mjs']);
e.run('u11',process.execPath,['scripts/verify_identity_task_acl_full.mjs']);
e.run('delegate-live',process.execPath,['scripts/test_per_user_delegate_live.mjs'],{GOV_DELEGATE_EVIDENCE:e.out});
e.finish({delegation:'verified-bearer-with-server-revocation',organization_oidc:false});
