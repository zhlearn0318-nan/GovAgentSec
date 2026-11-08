import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const configPath=()=>process.env.OPENCLAW_CONFIG_PATH??path.join(process.env.USERPROFILE,'.openclaw/openclaw.json');
export const privateRoot=()=>path.join(process.env.USERPROFILE,'.openclaw/backups');
export function version(){const v=JSON.parse(fs.readFileSync(path.join(process.env.APPDATA,'npm/node_modules/openclaw/package.json'))).version;if(v!=='2026.7.1-2')throw Error('HOST_VERSION_MISMATCH');return v;}
export function backup(file,root=privateRoot()){
 const raw=fs.readFileSync(file);JSON.parse(raw);fs.mkdirSync(root,{recursive:true});
 const target=path.join(root,'openclaw.before-drill-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID()+'.json');
 fs.writeFileSync(target,raw,{flag:'wx',mode:0o600});
 if(sha(fs.readFileSync(target))!==sha(raw))throw Error('BACKUP_HASH_MISMATCH');
 return {backup_path:target,sha256:sha(raw)};
}
export function restore(source,target,expected,targetExpected){
 if(!/^[a-f0-9]{64}$/i.test(expected??'')||!/^[a-f0-9]{64}$/i.test(targetExpected??''))throw Error('EXPECTED_HASH_REQUIRED');
 const bytes=fs.readFileSync(source);if(sha(bytes)!==expected.toLowerCase())throw Error('BACKUP_HASH_MISMATCH');
 JSON.parse(bytes);if(sha(fs.readFileSync(target))!==targetExpected.toLowerCase())throw Error('TARGET_CHANGED');
 fs.writeFileSync(target,bytes);
 if(sha(fs.readFileSync(target))!==expected.toLowerCase())throw Error('RESTORE_HASH_MISMATCH');
 return {restored:true,sha256:expected.toLowerCase()};
}
export function arg(name){const i=process.argv.indexOf('--'+name);return i<0?undefined:process.argv[i+1];}
