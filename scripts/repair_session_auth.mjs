// Repair the pinned host's persisted provider profile to use the existing env
// SecretRef. Never accepts, prints, or copies key material into the repository.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {loadRouting} from '../modules/model-routing/routing.mjs';
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
assert.equal(JSON.parse(readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
const root=path.join(process.env.USERPROFILE,'.openclaw'),agentDir=path.join(root,'agents/main/agent');
const configPath=path.join(root,'openclaw.json'),before=readFileSync(configPath,'utf8');
const cfg=JSON.parse(before),s=loadRouting().session_llm;
const ref={source:'env',provider:'default',id:s.api_key_env};
assert.deepEqual(cfg.models.providers[s.provider].apiKey,ref);
const expected=process.env[s.api_key_env];
assert(expected?.trim(),'Load the existing .openclaw/.env; no inline key arguments');
const {u:load,m:update}=await import(pathToFileURL(path.join(host,'dist/store-DH33UrUj.js')));
const {f:resolve}=await import(pathToFileURL(path.join(host,'dist/model-auth-CJEm9SNp.js')));
const store=load(agentDir),id=s.provider+':default',profile=store.profiles[id];
assert(profile?.provider===s.provider&&profile.type==='api_key','Expected existing API key profile');
const report={source:'openclaw-profile-auth-synthetic-probe',profile:id,passed:false,real_trace_sent:false};
const out=path.resolve('local-validation/model-controls');mkdirSync(out,{recursive:true});
try {
  // Verify the replacement independently before changing the profile.
  const available=await fetch(s.base_url+'/models',{headers:{Authorization:'Bearer '+expected},redirect:'error',signal:AbortSignal.timeout(20000)});
  assert.equal(available.status,200,'Replacement API credential rejected; profile unchanged');
  const changed=await update({agentDir,updater(current){
    const p=current.profiles[id];assert.equal(p.provider,s.provider);assert.equal(p.type,'api_key');
    delete p.key;p.keyRef=ref;
    // A successful rotation invalidates the old key's authentication cooldown.
    if(current.usageStats?.[id])delete current.usageStats[id];
    return true;
  }});
  assert(changed,'Auth profile transaction failed');
  const persisted=load(agentDir);
  assert.equal(persisted.profiles[id].key,undefined);assert.deepEqual(persisted.profiles[id].keyRef,ref);
  for(const [key,value] of Object.entries(store.profiles))if(key!==id)assert.deepEqual(persisted.profiles[key],value);
  const auth=await resolve({cfg,provider:s.provider,profileId:id,agentDir,modelApi:s.api,secretSentinels:false});
  assert(auth.apiKey===expected,'Actual profile resolver still selects another credential');
  const defaultAuth=await resolve({cfg,provider:s.provider,agentDir,modelApi:s.api,secretSentinels:false});
  assert(defaultAuth.apiKey===expected,'Default resolver still selects another credential');
  report.resolver_matches_current_key=true;
  const response=await fetch(s.base_url+'/chat/completions',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
    headers:{Authorization:'Bearer '+auth.apiKey,'Content-Type':'application/json'},
    body:JSON.stringify({model:s.model,messages:[{role:'user',content:'Synthetic authentication check. Reply only OK.'}],thinking:{type:'disabled'},max_tokens:16,stream:false})});
  report.http_status=response.status;assert.equal(response.status,200,'Profile-resolved API request failed');
  const body=await response.json();report.model=body.model;report.reply_ok=body.choices?.[0]?.message?.content?.trim()==='OK';
  assert(report.reply_ok);assert.equal(readFileSync(configPath,'utf8'),before);
  report.gateway_config_unchanged=true;report.passed=true;
}catch(e){report.error=String(e.message).replaceAll(expected,'[REDACTED]');process.exitCode=1;}
writeFileSync(path.join(out,'auth-repair-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
