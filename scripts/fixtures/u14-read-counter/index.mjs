// Test-only instrumentation. Loaded solely by the isolated U14 gateway.
import * as sdk from 'openclaw/plugin-sdk/sandbox';
export default {id:'u14-read-counter',register(api){
 const state=globalThis[Symbol.for('govagentsec.u14.counter')]??={reads:0,completed:0,ends:[],tool_results:[]};
  const original=sdk.getSandboxBackendFactory('srt');if(!original)throw Error('U14_SRT_BACKEND_MISSING');
  if(!original.u14Wrapped){const factory=async params=>{
   const backend=await original(params),create=backend.createFsBridge;
   backend.createFsBridge=(...args)=>{
    const bridge=create(...args),read=bridge.readFile;
    bridge.readFile=async(...values)=>{state.reads++;const result=await read(...values);state.completed++;return result;};
    return bridge;
   };return backend;
  };factory.u14Wrapped=true;sdk.registerSandboxBackend('srt',{resolveWorkdir:sdk.getSandboxBackendWorkdirResolver('srt'),factory});}
 api.on('agent_end',(event,ctx)=>{state.ends.push({run_id:ctx.runId??event.runId,success:event.success});});
 api.on('after_tool_call',(event,ctx)=>{state.tool_results.push({run_id:ctx.runId??event.runId,tool:event.toolName,success:!event.error&&!event.result?.isError});});
 api.registerGatewayMethod('u14.counter',({respond})=>respond(true,state),{scope:'operator.read'});
}};
