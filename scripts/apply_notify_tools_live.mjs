// Explicit, single-tool deployment. Full credentials stay in the user's private backup directory.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const short='submit_emergency_notice',full='agentguard-notices__'+short;
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const out=path.resolve(process.env.GOV_U7B_EVIDENCE??path.join('local-validation/u7b-notify-live',stamp));
fs.mkdirSync(out,{recursive:true});
const file=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json');
const raw=fs.readFileSync(file),config=JSON.parse(raw),before=structuredClone(config);
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw/package.json');
assert.equal(JSON.parse(fs.readFileSync(host)).version,'2026.7.1-2');
const server=config.mcp.servers['agentguard-notices'];
assert.equal(server.enabled,true,'MCP disabled: do not silently enable a disabled service');
assert(Array.isArray(server.toolFilter.include));
assert(!(server.toolFilter.exclude??[]).some(s=>s==='*'||s===short),'Explicit exclusion needs operator resolution');
assert(Array.isArray(config.tools.alsoAllow));assert(Array.isArray(config.tools.sandbox.tools.alsoAllow));
assert(!config.tools.sandbox.tools.allow,'Do not widen an explicit sandbox allowlist');
const sha=b=>createHash('sha256').update(b).digest('hex');
const excerpt=c=>({enabled:c.mcp.servers['agentguard-notices'].enabled,identity_mode:c.mcp.servers['agentguard-notices'].env.AGENTGUARD_MCP_IDENTITY_MODE,
  toolFilter:c.mcp.servers['agentguard-notices'].toolFilter,alsoAllow:c.tools.alsoAllow,sandboxTools:c.tools.sandbox.tools});
const backup=path.join(process.env.USERPROFILE,'.openclaw/backups','openclaw.before-u7b-'+stamp+'.json');
fs.mkdirSync(path.dirname(backup),{recursive:true});fs.writeFileSync(backup,raw,{flag:'wx'});
assert.equal(sha(fs.readFileSync(backup)),sha(raw));
fs.writeFileSync(path.join(out,'openclaw-toolfilter-before.json'),JSON.stringify(excerpt(before),null,2));
fs.writeFileSync(path.join(out,'openclaw-hash-before.txt'),sha(raw)+'\n');
for(const [list,item] of [[server.toolFilter.include,short],[config.tools.alsoAllow,full],[config.tools.sandbox.tools.alsoAllow,full]])if(!list.includes(item))list.push(item);
const unchanged=structuredClone(config);
unchanged.mcp.servers['agentguard-notices'].toolFilter.include=before.mcp.servers['agentguard-notices'].toolFilter.include;
unchanged.tools.alsoAllow=before.tools.alsoAllow;
unchanged.tools.sandbox.tools.alsoAllow=before.tools.sandbox.tools.alsoAllow;
assert.deepEqual(unchanged,before);
assert(fs.readFileSync(file).equals(raw),'Concurrent config change; abort');
fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');
const after=fs.readFileSync(file);
fs.writeFileSync(path.join(out,'openclaw-hash-after.txt'),sha(after)+'\n');
fs.writeFileSync(path.join(out,'openclaw-toolfilter-after.json'),JSON.stringify(excerpt(config),null,2));
const batchFile=path.resolve('.runtime/config-batch.json');let batchUpdated=false;
if(fs.existsSync(batchFile)){
 const batchRaw=fs.readFileSync(batchFile),batch=JSON.parse(batchRaw);
 const row=batch.find(r=>r.path==='mcp.servers.agentguard-notices');assert(row&&Array.isArray(row.value.toolFilter.include));
 fs.writeFileSync(batchFile+'.before-u7b-'+stamp,batchRaw,{flag:'wx'});
 if(!row.value.toolFilter.include.includes(short)){row.value.toolFilter.include.push(short);fs.writeFileSync(batchFile,JSON.stringify(batch,null,2)+'\n');batchUpdated=true;}
}
fs.writeFileSync(path.join(out,'deployment.json'),JSON.stringify({passed:true,backup,config_file:file,before_sha256:sha(raw),after_sha256:sha(after),
  retained:true,enabled_before:server.enabled,identity_unchanged:true,unrelated_fields_unchanged:true,batch_updated:batchUpdated,
  changed_paths:['mcp.servers.agentguard-notices.toolFilter.include','tools.alsoAllow','tools.sandbox.tools.alsoAllow'],host_version:'2026.7.1-2'},null,2));
fs.writeFileSync(path.join(out,'restore-steps.md'),`# 恢复到改动前配置\n\n备份位于用户私有目录，不含在证据分发包。以下命令会将配置恢复到本次修改前的完整字节，执行前确认没有需要保留的后续配置修改。\n\n\`\`\`powershell\n$backup='${backup}'\n$target='${file}'\nif ((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash.ToLower() -ne '${sha(raw)}') { throw 'Backup hash mismatch' }\nCopy-Item -LiteralPath $backup -Destination $target -Force\nif ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLower() -ne '${sha(raw)}') { throw 'Restore mismatch' }\n\`\`\`\n\n随后按原方式重启固定版本 OpenClaw 网关。当前保留通知登记，未执行恢复；不清理会话或状态。\n`);
console.log(JSON.stringify({passed:true,out,before:sha(raw),after:sha(after),backup}));
