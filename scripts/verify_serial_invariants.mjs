// Read-only comparison against the pre-change manifest; never writes host config.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const out=path.resolve(process.argv[2]??fs.readFileSync('.runtime/u26-evidence-path.txt','utf8').trim());
const before=JSON.parse(fs.readFileSync(path.join(out,'baseline.json'),'utf8').replace(/^\uFEFF/,''));
const hash=file=>fs.existsSync(file)?createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase():null;
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
const changedHost=Object.entries(before.host).filter(([file,value])=>hash(path.join(host,file.replace(/^[/\\]/,'')))!==value).map(([file])=>file);
const config=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json'),cfg=JSON.parse(fs.readFileSync(config,'utf8'));
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const changes=files.filter(file=>hash(file)!==before.files[file]).map(file=>({file,before_sha256:before.files[file]??null,after_sha256:hash(file),preexisting_dirty:before.dirty.some(row=>row.slice(3)===file)}));
const report={version:JSON.parse(fs.readFileSync(path.join(host,'package.json'))).version,
  config_unchanged:hash(config)===before.config,config_sha256:hash(config),host_files_checked:Object.keys(before.host).length,host_changes:changedHost,
  navigation_unchanged:['modules/govagentsec-ui/shell.mjs','modules/govagentsec-ui/workspace.mjs'].every(file=>hash(file)===before.files[file]),
  sandbox_default:cfg.agents.defaults.sandbox.backend,
  enabled_usage_wrappers:Object.entries(cfg.plugins.entries).filter(([id,e])=>/usage-wrapper/.test(id)&&e.enabled===true).map(([id])=>id)};
report.passed=report.version==='2026.7.1-2'&&report.config_unchanged&&!changedHost.length&&!report.enabled_usage_wrappers.length&&report.sandbox_default==='docker';
fs.writeFileSync(path.join(out,'changes.json'),JSON.stringify({baseline:before.stamp,preexisting_dirty:before.dirty,changes},null,2));
fs.writeFileSync(path.join(out,'invariants.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
