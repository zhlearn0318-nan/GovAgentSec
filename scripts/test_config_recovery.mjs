import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {backup,restore,sha} from './lib/config-recovery.mjs';
test('restore bytes; reject wrong backup hash and concurrent edits',()=>{
 const root=fs.mkdtempSync(path.resolve('local-validation/recovery-unit-')),target=path.join(root,'config.json');
 const original=Buffer.from('{"synthetic":true}\r\n');fs.writeFileSync(target,original);
 const b=backup(target,root);fs.appendFileSync(target,'\n');const changed=sha(fs.readFileSync(target));
 assert.throws(()=>restore(b.backup_path,target,'0'.repeat(64),changed),/BACKUP_HASH/);
 assert.throws(()=>restore(b.backup_path,target,b.sha256,b.sha256),/TARGET_CHANGED/);
 assert.equal(sha(fs.readFileSync(target)),changed);
 restore(b.backup_path,target,b.sha256,changed);assert.deepEqual(fs.readFileSync(target),original);
});
