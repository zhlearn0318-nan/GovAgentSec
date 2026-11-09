import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';import path from 'node:path';
import {TaskLinks} from '../task-links.mjs';
const temp=()=>{mkdirSync('local-validation/task-tests',{recursive:true});return mkdtempSync('local-validation/task-tests/inventory-');};
const servers={demo:{command:'private-command',args:['private-path'],env:{TOKEN:'private-secret',COOKIE:'private-cookie'}},disabled:{enabled:false,url:'https://private.example/?token=private-secret'}};
const links=dbPath=>new TaskLinks(null,{mcp:{servers},security:{installPolicy:{exec:{env:{AEGIS_OPENCLAW_AUDIT_DB:dbPath}}}}});
function publicOnly(rows){const text=JSON.stringify(rows);for(const value of ['private-command','private-secret','private-cookie','private-path','private.example','TOKEN','COOKIE'])assert.equal(text.includes(value),false);
 for(const row of rows){assert.deepEqual(Object.keys(row).sort(),['admission','config_sha256','connection','enabled','name']);assert.equal(row.connection,'not_verified');assert.match(row.config_sha256,/^[a-f0-9]{64}$/);}}
test('MCP inventory is credential-free and does not invent admission or connectivity without a database',async()=>{
 for(const file of [undefined,path.join(temp(),'missing.db')]){const rows=await links(file).capabilityInventory();publicOnly(rows);
  assert.equal(rows[0].admission.status,'no_matching_record');assert.equal(rows[1].enabled,false);}
});
test('inventory uses latest exact target type, name, and config digest; it leaves integrity unverified',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const file=path.join(temp(),'audit.db'),db=new DatabaseSync(file),l=links(file);
 db.exec('CREATE TABLE install_policy_audit(sequence INTEGER PRIMARY KEY,created_at TEXT,decision TEXT,reason_code TEXT,source_tree_sha256 TEXT,target_type TEXT,target_name TEXT)');
 const insert=db.prepare('INSERT INTO install_policy_audit VALUES(?,?,?,?,?,?,?)'),hash=l.capability('demo__read').config_sha256;
 insert.run(1,'2026-01-01','allow','MATCH_OLD',hash,'mcp','demo');
 insert.run(2,'2026-01-02','block','MATCH_LATEST',hash,'mcp','demo');
 insert.run(3,'2026-01-03','allow','WRONG_HASH','0'.repeat(64),'mcp','demo');
 insert.run(4,'2026-01-04','allow','WRONG_NAME',hash,'mcp','other');
 insert.run(5,'2026-01-05','allow','WRONG_TYPE',hash,'skill','demo');db.close();
 const before=readFileSync(file),rows=await l.capabilityInventory();publicOnly(rows);assert.deepEqual(readFileSync(file),before);
 assert.deepEqual(rows[0].admission,{status:'matching_record',integrity:'not_verified_here',sequence:2,created_at:'2026-01-02',decision:'block',reason_code:'MATCH_LATEST'});
 assert.equal(rows[1].admission.status,'no_matching_record');
 const changed=new TaskLinks(null,{mcp:{servers:{demo:{...servers.demo,args:['changed-config']}}},security:l.config.security});
 assert.equal((await changed.capabilityInventory())[0].admission.status,'no_matching_record');
});
test('corrupt database or missing schema produces unavailable, never allow or an exception body',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const root=temp(),bad=path.join(root,'bad.db'),empty=path.join(root,'empty.db');
 writeFileSync(bad,'not a database; private-secret');new DatabaseSync(empty).close();
 for(const file of [bad,empty]){const rows=await links(file).capabilityInventory();publicOnly(rows);assert(rows.every(r=>r.admission.status==='unavailable'));}
});
