import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {DemoIdentityBridge,registerDemoIdentity} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs';

const methods={};
const registered=registerDemoIdentity({registerGatewayMethod:(name,handler,options)=>methods[name]={handler,...options},registerService(){}});
assert.equal(registerDemoIdentity({registerService(){}}),registered,'gateway and pre-warmed registries must share their identity worker');
assert.equal(Object.keys(methods).length,11);
for(const [name,method] of Object.entries(methods))assert.equal(method.scope,name.endsWith('.status')?'operator.read':'operator.admin');
let response;
await methods['govagentsec.demoIdentity.invoke'].handler({params:{subject:{roles:['business_approver']}},respond:(_,value)=>response=value});
assert.equal(response.http_status,403);
const root=path.resolve('local-validation/identity-demo/rpc-'+new Date().toISOString().replace(/[:.]/g,'-'));
mkdirSync(root,{recursive:true});
const bridge=new DemoIdentityBridge({root});
try{
  assert.equal((await bridge.request('status')).enabled,false);
  assert.equal(bridge.child,null);
  assert.equal((await bridge.request('enable')).enabled,true);
  const office=await bridge.request('login',{user:'office-test'});
  const pending=await bridge.request('invoke',{scenario:'notice'},'Bearer '+office.access_token);
  assert.equal(pending.status,'pending_approval');
  assert.equal((await bridge.request('resolve',{request_id:pending.request_id},'Bearer '+office.access_token)).reason_code,'D105_SELF_APPROVAL');
  const approver=await bridge.request('login',{user:'approver-test'});
  const result=await bridge.request('resolve',{request_id:pending.request_id},'Bearer '+approver.access_token);
  assert.equal(result.executed,true);assert.equal(result.counts.notices,1);
  assert.equal((await bridge.request('disable')).enabled,false);
  assert.equal((await bridge.request('invoke',{},'Bearer '+office.access_token)).reason_code,'DEMO_IDENTITY_DISABLED');
  console.log(JSON.stringify({passed:true,source:'real-local-stdio-oidc-opa',production_oidc:false,root}));
}finally{await bridge.request('disable');}
