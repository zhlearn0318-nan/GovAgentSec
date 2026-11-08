import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {evidence} from './lib/backlog-evidence.mjs';import {configPath} from './lib/config-recovery.mjs';
const e=evidence('u17-u8-activation-boundary'),r=e.run('model-routing','python',['scripts/check_model_routing.py']);
let details,valid=false;
try{
 assert.equal(r.status,0);const line=r.stdout.split(/\r?\n/).find(x=>x.startsWith('{')&&x.includes('report'));
 const p=JSON.parse(line).report;details=JSON.parse(fs.readFileSync(p));assert(details.passed);
 fs.copyFileSync(p,path.join(e.out,'routing-report.json'));
 const policy=JSON.parse(fs.readFileSync('config/model-routing.json'));assert.equal(policy.external_review_enabled,false);
 const ui=fs.readFileSync('modules/govagentsec-ui/workspace.mjs','utf8');assert(ui.includes('会话模型（可 API）'));assert(ui.includes('安全评审'));
 valid=true;
}catch(err){e.report.error=err.message;}
const c=JSON.parse(fs.readFileSync(configPath()));
e.finish({valid,session_smoke:details?.session_smoke,review_local_only:valid,applied_by_this_package:false,
 actual_default_model:c.agents?.defaults?.model,activation_state:'configured-runtime-connectivity-not-probed',
 note:'Cloud account not tested; existing per-session overrides may differ.'});
