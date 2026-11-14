import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {HOST,ROOT,IMAGE,dataRoot} from '../modules/session-sandbox/constants.mjs';
import {command} from '../modules/session-sandbox/service.mjs';
import {applySandboxPolicy} from '../modules/session-sandbox/policy.mjs';
assert.equal(JSON.parse(readFileSync(path.join(HOST,'package.json'))).version,'2026.7.1-2');
let image=await command('docker',['image','inspect',IMAGE]);
if(!image.ok||process.argv.includes('--build')){
  const base=readFileSync(path.join(ROOT,'modules/session-sandbox/Dockerfile'),'utf8').match(/^FROM (\S+)/m)?.[1];
  assert(base?.includes('@sha256:'),'Session base image must be pinned');
  if(!(await command('docker',['image','inspect',base])).ok){
    if(!(await command('docker',['pull',base],600000)).ok)throw Error('Pinned session base image download failed');
  }
  image=await command('docker',['build','--network=none','-t',IMAGE,path.join(ROOT,'modules/session-sandbox')],120000);
}
if(!image.ok)throw Error('Session image build failed; check Docker and pinned base image');
const root=dataRoot();mkdirSync(root,{recursive:true});mkdirSync(path.join(root,'protected'),{recursive:true});
try {writeFileSync(path.join(root,'protected','synthetic-secret.txt'),'合成数据 / SYNTHETIC PROTECTED DOCUMENT\n',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
const file=process.env.OPENCLAW_CONFIG_PATH??path.join(process.env.OPENCLAW_STATE_DIR??path.join(process.env.USERPROFILE,'.openclaw'),'openclaw.json'),original=readFileSync(file,'utf8');
const config=applySandboxPolicy(JSON.parse(original),'docker',root);
config.plugins??={};config.plugins.load??={};config.plugins.load.paths??=[];
const plugin=path.join(ROOT,'modules/session-sandbox');
if(!config.plugins.load.paths.includes(plugin))config.plugins.load.paths.push(plugin);
config.plugins.entries??={};config.plugins.entries['govagentsec-session-sandbox']={enabled:true,config:{dataDir:root}};
if(config.plugins.allow&&!config.plugins.allow.includes('govagentsec-session-sandbox'))config.plugins.allow.push('govagentsec-session-sandbox');
const {validateConfigObjectRaw}=await import(pathToFileURL(path.join(HOST,'dist/config/config.js')));
const valid=validateConfigObjectRaw(config);assert(valid.ok,JSON.stringify(valid.issues));
const changed=JSON.stringify(JSON.parse(original))!==JSON.stringify(config);
let backup=null;
if(changed){
  assert.equal(readFileSync(file,'utf8'),original,'Configuration changed during sandbox setup');
  backup=file+'.before-session-sandbox-install-'+Date.now();writeFileSync(backup,original,{flag:'wx'});
  const hash=value=>createHash('sha256').update(value).digest('hex');
  assert.equal(hash(readFileSync(backup)),hash(original),'Configuration backup hash mismatch');
  writeFileSync(file,JSON.stringify(config,null,2)+'\n');
}
console.log(JSON.stringify({installed:true,engine:'docker',mode:'all',scope:'session',elevated:false,backup,restart_required:changed}));
