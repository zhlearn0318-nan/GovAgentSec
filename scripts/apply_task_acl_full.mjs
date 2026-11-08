// Explicit U11 deployment: only permit the already-enabled runtime plugin's
// conversation hook. No provider, sandbox, MCP or identity configuration edits.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.resolve(process.env.GOV_ACL_FULL_EVIDENCE??'local-validation/identity-task-acl-full/'+stamp);
fs.mkdirSync(out,{recursive:true});
const file=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json');
const raw=fs.readFileSync(file),before=JSON.parse(raw),after=structuredClone(before);
assert.equal(JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'npm/node_modules/openclaw/package.json'))).version,'2026.7.1-2');
const id='agentguard-runtime-security',entry=after.plugins.entries[id];assert.equal(entry.enabled,true);
const backup=path.join(path.dirname(file),'backups','openclaw.before-u11-'+stamp+'.json');
fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,raw,{flag:'wx'});
const sha=b=>createHash('sha256').update(b).digest('hex');assert.equal(sha(fs.readFileSync(backup)),sha(raw));
entry.hooks={...entry.hooks,allowConversationAccess:true};
const unchanged=structuredClone(after);unchanged.plugins.entries[id]=before.plugins.entries[id];assert.deepEqual(unchanged,before);
assert(fs.readFileSync(file).equals(raw),'Concurrent configuration change');
fs.writeFileSync(file,JSON.stringify(after,null,2)+'\n');
const report={passed:true,backup,config_file:file,before_sha256:sha(raw),after_sha256:sha(fs.readFileSync(file)),
  changed_paths:['plugins.entries.agentguard-runtime-security.hooks.allowConversationAccess'],
  unrelated_fields_unchanged:true,production_oidc:false,host_version:'2026.7.1-2'};
fs.writeFileSync(path.join(out,'deployment.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:true,report:path.join(out,'deployment.json')}));
