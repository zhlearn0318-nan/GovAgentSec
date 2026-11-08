import fs from 'node:fs';import path from 'node:path';
import {version,backup,restore,sha,configPath,privateRoot} from './lib/config-recovery.mjs';
const timestamp=new Date().toISOString(),out=path.resolve('local-validation/u18-openclaw-recovery-drill',timestamp.replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});const file=configPath(),live=process.argv.includes('--live');
const r={timestamp,host_version:version(),config_path:file,mode:live?'live':'dry-run',passed:false,restored:false,
 operator_notes:live?'Append JSON whitespace then restore exact bytes.':'Actual restore on private clone; live config untouched.'};
let target,changed;
try{
 const raw=fs.readFileSync(file),b=backup(file);r.backup_path=b.backup_path;r.sha256_before=b.sha256;
 fs.writeFileSync(path.join(out,'openclaw-hash-before.txt'),b.sha256+'\n');
 target=live?file:path.join(privateRoot(),path.basename(b.backup_path)+'.drill');r.restore_target=target;
 if(!live)fs.writeFileSync(target,raw,{flag:'wx',mode:0o600});
 if(sha(fs.readFileSync(target))!==b.sha256)throw Error('TARGET_CHANGED');
 const probe=Buffer.concat([raw,Buffer.from('\n')]);changed=sha(probe);fs.writeFileSync(target,probe);
 r.sha256_after_change=sha(fs.readFileSync(target));
 restore(b.backup_path,target,b.sha256,changed);r.sha256_after_restore=sha(fs.readFileSync(target));r.restored=true;
 r.live_unchanged=sha(fs.readFileSync(file))===b.sha256;r.passed=r.live_unchanged&&r.sha256_after_restore===b.sha256;
}catch(e){r.error=e.message;process.exitCode=1;
 if(live&&changed&&r.backup_path){try{restore(r.backup_path,file,r.sha256_before,changed);r.restored=true;}catch(re){r.restore_error=re.message;}}
}finally{
 fs.writeFileSync(path.join(out,'drill-report.json'),JSON.stringify(r,null,2));
 fs.writeFileSync(path.join(out,'restore-steps.md'),`# 恢复步骤\n\n私有备份：${r.backup_path}\n\n先核对当前配置 SHA-256；下面 CURRENT_HASH 必须换为经确认的当前值。目标发生并发变化时停止，不覆盖。\n\n\`node scripts/restore_openclaw_config.mjs --backup "${r.backup_path}" --target "${file}" --expected-hash ${r.sha256_before} --target-hash CURRENT_HASH\`\n`);
 fs.writeFileSync(path.join(out,'README.md'),`# U18\n\n${r.passed?'PASS':'FAIL'}；模式 ${r.mode}。${r.operator_notes}\n\n复跑 node scripts/drill_openclaw_config_recovery.mjs。无完整配置正文；私有副本不分发。\n`);
 console.log(JSON.stringify({passed:r.passed,mode:r.mode,report:path.join(out,'drill-report.json')}));if(!r.passed)process.exitCode=1;
}
