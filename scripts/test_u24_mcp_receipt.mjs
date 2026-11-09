import test from 'node:test';import assert from 'node:assert/strict';
import {hostExecutionResult} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/chat-acl.mjs';
const event=status=>({toolName:'agentguard-notices__read_gov_document',result:{details:{structuredContent:{status}}}});
test('MCP pending response does not claim successful execution',()=>assert.deepEqual(hostExecutionResult(event('pending_approval')),{success:false,control_status:'pending_approval'}));
test('real MCP isError envelope preserves pending and blocked business state',()=>{
 for(const [name,status] of [['agentguard-notices__list_notices','pending_approval'],['agentguard-notices__read_gov_document','blocked']]){
  const result=event(status);result.toolName=name;result.result.details.isError=true;
  result.result.details.content=[{type:'text',text:JSON.stringify({status,executed:false})}];
  assert.deepEqual(hostExecutionResult(result),{success:false,control_status:status});
 }
});
test('MCP execution requires typed executed receipt',()=>{assert.equal(hostExecutionResult(event('executed_isolated')).success,true);assert.equal(hostExecutionResult(event('blocked')).success,false);assert.equal(hostExecutionResult({toolName:'agentguard-notices__read_gov_document',result:{}}).success,null);});
test('transport error overrides a claimed execution',()=>assert.equal(hostExecutionResult({...event('executed_isolated'),error:'error'}).success,false));
test('native host result behavior preserved',()=>{assert.equal(hostExecutionResult({toolName:'read',result:{}}).success,true);assert.equal(hostExecutionResult({toolName:'read',result:{isError:true}}).success,false);});
