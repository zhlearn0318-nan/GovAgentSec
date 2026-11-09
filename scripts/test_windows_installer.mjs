import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {initialConfig,initialize} from './initialize_windows_config.mjs';
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
const {validateConfigObjectRaw}=await import(pathToFileURL(path.join(host,'dist/config/config.js')));
const base=path.resolve('local-validation/windows-installer-tests');fs.mkdirSync(base,{recursive:true});
test('fresh local-only configuration validates on pinned host; tokens are unique and omitted from results',()=>{
  assert.equal(JSON.parse(fs.readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
  const state=fs.mkdtempSync(path.join(base,'fresh-'));
  const a=initialConfig(state),b=initialConfig(state);
  assert.notEqual(a.gateway.auth.token,b.gateway.auth.token);assert.equal(a.gateway.auth.token.length,64);
  const valid=validateConfigObjectRaw(a);assert(valid.ok,JSON.stringify(valid.issues));
  assert.equal(a.gateway.bind,'loopback');assert.equal(a.gateway.controlUi.allowInsecureAuth,false);
  assert.equal(a.models.providers.ollama.baseUrl,'http://127.0.0.1:11434');
  assert(initialize(state,validateConfigObjectRaw).created);
  const original=fs.readFileSync(path.join(state,'openclaw.json'));
  const result=initialize(state,()=>{throw Error('existing config must not be rewritten');});
  assert(result.existing_preserved);assert.deepEqual(fs.readFileSync(path.join(state,'openclaw.json')),original);
  assert(!JSON.stringify(result).includes(JSON.parse(original).gateway.auth.token));
});
test('invalid and malformed-existing configuration cannot be overwritten by onboarding',()=>{
  const state=fs.mkdtempSync(path.join(base,'invalid-'));
  assert.throws(()=>initialize(state,()=>({ok:false})),/schema/);assert(!fs.existsSync(path.join(state,'openclaw.json')));
  fs.writeFileSync(path.join(state,'openclaw.json'),'user config requiring manual repair');
  assert(initialize(state,validateConfigObjectRaw).existing_preserved);
  assert.equal(fs.readFileSync(path.join(state,'openclaw.json'),'utf8'),'user config requiring manual repair');
});
test('existing external API provider and selected model survive initialization byte for byte',()=>{
  const state=fs.mkdtempSync(path.join(base,'external-'));
  const config=initialConfig(state);
  config.models.providers.external={baseUrl:'https://example.invalid/v1',api:'openai-completions',apiKey:'fixture-not-a-real-key',models:[{id:'example-model',name:'Example'}]};
  config.agents.defaults.model.primary='external/example-model';
  const original=JSON.stringify(config,null,2)+'\n';
  fs.writeFileSync(path.join(state,'openclaw.json'),original);
  assert(initialize(state,validateConfigObjectRaw).existing_preserved);
  assert.equal(fs.readFileSync(path.join(state,'openclaw.json'),'utf8'),original);
});
test('PowerShell installer plan is side-effect-free and locks host/version/real protection stages',()=>{
  const config=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json'),before=fs.readFileSync(config);
  const result=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','Setup-Windows.ps1','-Plan'],{encoding:'utf8'}));
  assert.equal(result.openclaw,'2026.7.1-2');assert.equal(result.tag,'v1.0');assert.equal(result.changes_applied,false);
  assert.equal(result.default_engine,'docker');assert(result.requires_cuda);
  assert.deepEqual(result.steps,['preflight','openclaw','dependencies','ollama','gateway-service','security-install','shortcuts','verify']);
  assert.deepEqual(fs.readFileSync(config),before);
});
