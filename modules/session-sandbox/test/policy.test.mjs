import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,readdirSync,symlinkSync,existsSync} from 'node:fs';
import path from 'node:path';
import {applySandboxPolicy,rejectBypass} from '../policy.mjs';
import {SandboxService} from '../service.mjs';
import {createSrtBackend,contained} from '../backend.mjs';

test('policy disables host bypass while preserving safety modules and credentials',()=>{
  const input={agents:{defaults:{model:'local'},list:[{id:'a',sandbox:{mode:'off'},tools:{exec:{host:'gateway'},elevated:{enabled:true}}}]},tools:{elevated:{enabled:true},allow:['read','exec']},plugins:{entries:{guard:{enabled:true}}},gateway:{auth:{token:'synthetic'}}};
  const c=applySandboxPolicy(input,'docker','F:/demo');
  assert.deepEqual(c.plugins,input.plugins);assert.deepEqual(c.gateway,input.gateway);
  assert.deepEqual(c.tools.allow,input.tools.allow);assert.equal(c.agents.defaults.model,'local');
  assert.equal(c.agents.defaults.sandbox.docker.network,'none');assert.equal(c.agents.defaults.sandbox.workspaceAccess,'none');
  assert.equal(c.tools.elevated.enabled,false);assert.equal(c.agents.list[0].sandbox.mode,'all');assert.equal(c.agents.list[0].tools.exec.host,'sandbox');
  assert.equal(input.tools.elevated.enabled,true);assert.throws(()=>applySandboxPolicy(input,'host','F:/demo'));
});
test('exec host/elevated overrides are blocked; managed MCP is unchanged',()=>{
  for(const params of [{host:'gateway'},{host:'node'},{elevated:true}])assert.equal(rejectBypass({toolName:'exec',params}).block,true);
  assert.equal(rejectBypass({toolName:'exec',params:{host:'sandbox'}}),undefined);
  assert.equal(rejectBypass({toolName:'read_gov_document',params:{document_id:'public'}}),undefined);
});
test('native sandbox keeps only previously authorized managed tools, not arbitrary plugins',()=>{
  const c=applySandboxPolicy({tools:{alsoAllow:['agentguard-notices__read_gov_document','arbitrary-plugin'],sandbox:{tools:{deny:['browser']}}}},'docker','F:/demo');
  assert.deepEqual(c.tools.sandbox.tools.alsoAllow,['agentguard-notices__read_gov_document']);
  assert.deepEqual(c.tools.sandbox.tools.deny,['browser']);
  const restricted=applySandboxPolicy({tools:{alsoAllow:['agentguard-notices__read_gov_document'],sandbox:{tools:{allow:[]}}}},'srt','F:/demo');
  assert.deepEqual(restricted.tools.sandbox.tools,{allow:[]});
});
test('notification is retained only when authorized, and explicit sandbox restrictions remain',()=>{
  const name='agentguard-notices__submit_emergency_notice';
  for(const engine of ['docker','srt']){
    assert.deepEqual(applySandboxPolicy({tools:{alsoAllow:[name]}},engine,'F:/demo').tools.sandbox.tools.alsoAllow,[name]);
    assert.equal(applySandboxPolicy({tools:{}},engine,'F:/demo').tools.sandbox,undefined);
    assert.deepEqual(applySandboxPolicy({tools:{alsoAllow:[name],sandbox:{tools:{allow:[],deny:[name]}}}},engine,'F:/demo').tools.sandbox.tools,{allow:[],deny:[name]});
  }
});
test('switch only writes validated ready engines, creates backup and audit',async()=>{
  const base=path.resolve('local-validation/session-sandbox/unit');mkdirSync(base,{recursive:true});const root=mkdtempSync(path.join(base,'switch-'));
  const configFile=path.join(root,'config.json'),initial={gateway:{auth:{token:'DO_NOT_AUDIT'}},agents:{defaults:{}}};writeFileSync(configFile,JSON.stringify(initial));
  let ready=true,valid=true;const service=new SandboxService({configFile,root,check:async()=>({docker:{ready},srt:{ready}}),validateConfig:async()=>{if(!valid)throw Error('invalid');}});
  await service.select('docker');await service.select('srt');assert.equal(JSON.parse(readFileSync(configFile)).agents.defaults.sandbox.backend,'srt');
  const audit=readFileSync(path.join(root,'switch-audit.jsonl'),'utf8');assert.equal(audit.includes('DO_NOT_AUDIT'),false);assert.equal(audit.trim().split('\n').length,4);
  assert.equal(readdirSync(root).filter(n=>n.includes('before-session')).length,2);
  const current=readFileSync(configFile,'utf8');ready=false;await assert.rejects(()=>service.select('docker'),/未就绪/);ready=true;valid=false;await assert.rejects(()=>service.select('docker'),/invalid/);
  await assert.rejects(()=>service.select('host'));assert.equal(readFileSync(configFile,'utf8'),current);
});
test('srt builds only isolated runner specs, rejects escape, PTY and custom environment',async()=>{
  const root=path.resolve('local-validation/session-sandbox/unit/backend'),workspace=path.join(root,'workspace');mkdirSync(workspace,{recursive:true});
  const b=await createSrtBackend({scopeKey:'synthetic',workspaceDir:workspace},{root});
  assert.equal(await b.validateWorkdir('/workspace'),workspace);assert.equal(await b.validateWorkdir('../escape'),null);
  const spec=await b.buildExecSpec({command:'Write-Output synthetic',workdir:workspace,env:{HOME:workspace,OPENCLAW_SHELL:'exec'}});
  assert.match(spec.argv[1],/runner.mjs$/);assert.equal('DEEPSEEK_API_KEY' in spec.env,false);
  const isolated=Buffer.from(spec.argv.at(-1),'base64').toString();
  const script=Buffer.from(isolated.split(' ').at(-1),'base64').toString('utf16le');
  assert(script.startsWith(`try { Set-Location -LiteralPath '${workspace.replaceAll("'","''")}' -ErrorAction Stop } catch`));
  assert.match(script,/SRT_WORKDIR_UNAVAILABLE'; exit 125/);
  await assert.rejects(()=>b.buildExecSpec({command:'echo x',workdir:'../escape',env:{}}));
  await assert.rejects(()=>b.buildExecSpec({command:'echo x',env:{NODE_OPTIONS:'unsafe'}}));
  await assert.rejects(()=>b.buildExecSpec({command:'echo x',usePty:true}));
  await assert.rejects(()=>b.createFsBridge().readFile({filePath:'../outside'}));
  const outside=path.join(root,'outside');mkdirSync(outside,{recursive:true});
  const link=path.join(workspace,'escape-link');if(!existsSync(link))symlinkSync(outside,link,'junction');
  await assert.rejects(()=>b.createFsBridge().readFile({filePath:'escape-link/not-present.txt'}),/SYMLINK_ESCAPE/);
  assert.equal(contained(workspace,path.join(root,'workspace-other')),false);
});
test('RPC mutations require operator.admin',()=>{
  const source=readFileSync(new URL('../index.mjs',import.meta.url),'utf8');
  assert.match(source,/\['select','operator.admin'/);assert.match(source,/\['status','operator.read'/);assert.match(source,/\{scope\}/);
});
