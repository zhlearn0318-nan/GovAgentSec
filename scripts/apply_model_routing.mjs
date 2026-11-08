// Explicit operator action. Config keys unrelated to the default session model are preserved.
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import path from 'node:path';
import {loadRouting,openclawModelPatch} from '../modules/model-routing/routing.mjs';

const args=process.argv.slice(2);
if(args.length!==2 || args[0]!=='--config')throw Error('Usage: node scripts/apply_model_routing.mjs --config PATH_TO_OPENCLAW_JSON');
const host=path.join(process.env.APPDATA || '', 'npm/node_modules/openclaw');
if(JSON.parse(readFileSync(path.join(host,'package.json'))).version!=='2026.7.1-2')throw Error('fixed OpenClaw version required');
const policy=loadRouting(),patch=openclawModelPatch(policy),file=path.resolve(args[1]);
if(!process.env[policy.session_llm.api_key_env]?.trim())throw Error('session API key environment variable missing; config unchanged');
const original=readFileSync(file,'utf8'),config=JSON.parse(original.replace(/^\uFEFF/,''));
config.models??={};config.models.providers??={};
const provider=policy.session_llm.provider, prior=config.models.providers[provider];
const added=patch.models.providers[provider];
config.models.providers[provider]={...prior,...added,models:[
  ...(prior?.models??[]).filter(m=>!added.models.some(n=>n.id===m.id)),...added.models]};
config.agents??={};config.agents.defaults??={};config.agents.defaults.model=patch.agents.defaults.model;
// Expose all configured session choices, preserving existing local/other choices.
config.agents.defaults.models??={};
for(const [key,value] of Object.entries(patch.agents.defaults.models))
  config.agents.defaults.models[key]={...config.agents.defaults.models[key],...value};
// Retain the old provider for existing sessions, but retire the incomplete picker entry.
if(provider==='deepseek')delete config.agents.defaults.models['gov-session/deepseek-chat'];
const backup=file+'.before-model-routing-'+Date.now();
if(existsSync(backup))throw Error('backup collision');
writeFileSync(backup,original,{flag:'wx'});
const temp=file+'.model-routing.tmp';writeFileSync(temp,JSON.stringify(config,null,2)+'\n',{flag:'wx'});renameSync(temp,file);
console.log(JSON.stringify({status:'configured-restart-required',backup,session:patch.agents.defaults.model.primary,
  credentials:'environment-reference-only',hooks:'preserved',warning:'existing session and per-agent overrides unchanged'}));
