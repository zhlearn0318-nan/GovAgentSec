import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../graph.mjs';
import { registerTrajectory } from '../register.mjs';
import { install } from '../../../scripts/install_trajectory_view.mjs';
import { installChat } from '../../../scripts/install_trajectory_chat.mjs';
const tmp=()=>{mkdirSync('local-validation/graph-tests',{recursive:true});return mkdtempSync('local-validation/graph-tests/run-')};
const e=(event_type,id)=>({event_type,tool_call_id:id});
test('interleaved parallel tools pair by ID; orphan and absent IDs are not guessed',()=>{
 const g=buildGraph([e('tool.started','a'),e('tool.started','b'),e('tool.ended','a'),e('tool.ended','b'),e('tool.ended','orphan'),e('tool.started',null),e('tool.ended',null)]);
 assert.deepEqual(g.edges.filter(x=>x.kind==='call'),[{from:'0',to:'2',kind:'call'},{from:'1',to:'3',kind:'call'}]);
 assert.equal(g.edges.filter(x=>x.kind==='order').length,6);
});
test('duplicate call IDs are not drawn as unambiguous pairs',()=>{
 assert.equal(buildGraph([e('tool.started','a'),e('tool.started','a'),e('tool.ended','a')]).edges.filter(x=>x.kind==='call').length,0);
});
test('later duplicate start also invalidates an earlier apparent pair',()=>{assert.equal(buildGraph([e('tool.started','a'),e('tool.ended','a'),e('tool.started','a')]).edges.filter(x=>x.kind==='call').length,0)});
test('native tab uses read scope and detail RPC rejects path traversal',async()=>{
 const methods={},tabs=[];registerTrajectory({pluginConfig:{dataDir:tmp()},logger:{warn(){}},on(){},registerHttpRoute(){},session:{controls:{registerControlUiDescriptor:d=>tabs.push(d)}},registerGatewayMethod:(n,h,o)=>methods[n]={h,o}});
 assert.deepEqual(tabs[0].requiredScopes,['operator.read']);
 for(const [name,m] of Object.entries(methods))assert.equal(m.o.scope,name.endsWith('.resolve')?'operator.approvals':'operator.read');
 let response;await methods['govagentsec.trajectory.detail'].h({params:{trace_id:'../../other'},respond:(...r)=>response=r});assert.equal(response[0],false);
});
test('native view adaptation is idempotent, reversible and rejects changed upstream shape',()=>{
 const root=tmp(),assets=path.join(root,'dist/control-ui/assets');mkdirSync(assets,{recursive:true});const file=path.join(assets,'plugin-page-test.js');
 const original='import{g as i}from"./lit-runtime-test.js";var f={"logbook/logbook":async()=>({})};';writeFileSync(file,original);
 assert.equal(install(root).changed,true);assert.equal(install(root).changed,false);install(root,true);assert.equal(readFileSync(file,'utf8'),original);
 writeFileSync(file,'different upstream');assert.throws(()=>install(root),/Unsupported/);assert.equal(readFileSync(file,'utf8'),'different upstream');
});
test('chat upgrade binds session on the trace element even when another host element already has sessionKey',()=>{
 const root=tmp(),assets=path.join(root,'dist/control-ui/assets');mkdirSync(assets,{recursive:true});const file=path.join(assets,'chat-page-test.js');
 const original='return s`${this.renderPaneHeader(e)}${ZC(o)}`';writeFileSync(file,original);
 assert.equal(installChat(root).changed,true);
 const binding='.sessionKey=${e.sessionKey} ';
 const upgraded=readFileSync(file,'utf8');assert.ok(upgraded.includes('<govagentsec-chat-traces .client=${e.client} '+binding));
 writeFileSync(file,'<other '+binding+'></other>'+upgraded.replace(binding,''));
 assert.equal(installChat(root).changed,true);assert.ok(readFileSync(file,'utf8').includes('<govagentsec-chat-traces .client=${e.client} '+binding));
 assert.equal(installChat(root).changed,false);installChat(root,true);assert.equal(readFileSync(file,'utf8'),original);
});
