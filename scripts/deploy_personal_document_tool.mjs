// Narrow config migration. Private backup contains secrets; evidence contains hashes only.
import fs from 'node:fs';import path from 'node:path';
import {backup,configPath,sha,version} from './lib/config-recovery.mjs';
version();const file=configPath(),raw=fs.readFileSync(file),cfg=JSON.parse(raw);
const out=process.argv[2];if(!out)throw Error('Evidence directory required');fs.mkdirSync(out,{recursive:true});
const old='agentguard-notices__read_gov_document',replacement='gov_read_document';
for(const section of [cfg.tools??={},(cfg.tools.sandbox??={}).tools??={}]){
  section.alsoAllow=[...new Set([...(section.alsoAllow??[]).filter(x=>x!==old),replacement])];
  if(Array.isArray(section.allow))section.allow=[...new Set([...section.allow.filter(x=>x!==old),replacement])];
}
const filter=cfg.mcp?.servers?.['agentguard-notices']?.toolFilter;
if(Array.isArray(filter?.include))filter.include=filter.include.filter(x=>x!=='read_gov_document');
const bytes=Buffer.from(JSON.stringify(cfg,null,2)+'\n');
const saved=backup(file);
if(sha(fs.readFileSync(file))!==sha(raw))throw Error('Config changed since read');
fs.writeFileSync(file,bytes);
const report={changed:true,version:'2026.7.1-2',before_sha256:sha(raw),after_sha256:sha(bytes),...saved,
  changes:['tools alsoAllow: replace static document MCP with gov_read_document','sandbox tools: same replacement','agentguard-notices toolFilter: remove static read_gov_document only']};
fs.writeFileSync(path.join(out,'config-migration.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
