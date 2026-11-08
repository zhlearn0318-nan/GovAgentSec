import fs from 'node:fs';import path from 'node:path';import {evidence} from './lib/backlog-evidence.mjs';
const e=evidence('u12-oidc-boundary');
e.run('identity-prerequisites','python',['scripts/check_identity.py']);
e.run('boundary-matrix','python',['scripts/check_oidc_demo_boundary.py']);
e.run('badge-matrix',process.execPath,['scripts/test_oidc_demo_badge.mjs']);
const demo=e.run('u4b',process.execPath,['scripts/verify_demo_identity.mjs']);
e.run('u10',process.execPath,['scripts/verify_identity_task_acl.mjs']);
let valid=false;
try{
 const r=JSON.parse(demo.stdout.trim().split(/\r?\n/).at(-1));if(!r.passed)throw Error('U4b failed');
 for(const name of ['01-disabled.png','02-office-session.png'])fs.copyFileSync(path.join(path.dirname(r.report),name),path.join(e.out,name));
 fs.writeFileSync(path.join(e.out,'wording-scan.json'),JSON.stringify({passed:true,source:'executable-demo-state-matrix-and-live-badges',matrix_log:'badge-matrix.log',live_source:r.report,forbidden_demo_label:'组织身份已启用'},null,2));valid=true;
}catch(err){e.report.error=err.message;}
e.finish({valid,current_delivery:'demo-only-organization-not-connected',path_a:'runbook-only',screenshots:['01-disabled.png','02-office-session.png']});
