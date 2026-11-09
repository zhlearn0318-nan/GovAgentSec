import test from 'node:test';import assert from 'node:assert/strict';
import {keyTraceGraph,traceGraph,nodePresentation} from '../view-model.mjs';
const event=(sequence,event_type,extra={})=>({sequence,event_id:'e'+sequence,trace_id:'t',timestamp:new Date(sequence*100).toISOString(),event_type,payload:{},...extra});
test('key graph pairs only exact calls and keeps approvals, blocks and failed results',()=>{
 const events=[event(1,'run.started'),event(2,'session.started'),event(3,'model.started',{model_call_id:'m'}),event(4,'model.ended',{model_call_id:'m',parent_event_id:'e3'}),event(5,'tool.started',{tool_call_id:'a'}),event(6,'protection.tools',{parent_event_id:'e5',payload:{decision:'BLOCK',enforced:true}}),event(7,'tool.ended',{tool_call_id:'a',parent_event_id:'e5',payload:{failed:true}}),event(8,'approval.requested',{parent_event_id:'e6'}),event(9,'run.ended')];
 const graph=keyTraceGraph({events,integrity:{valid:true}});
 assert.equal(graph.nodes.length,6);assert.equal(graph.total_events,9);
 const tool=graph.nodes.find(n=>n.event_id==='e5');assert.deepEqual(tool.members.map(e=>e.event_id),['e5','e7']);assert.equal(tool.state,'failed');
 assert(graph.nodes.some(n=>n.event_id==='e6'&&n.state==='blocked'));assert(graph.nodes.some(n=>n.event_id==='e8'));
 assert(graph.edges.some(e=>e.kind==='call'&&e.from==='e5'&&e.to==='e6'));assert.equal(traceGraph({events,integrity:{valid:true}}).nodes.length,9);
});
test('missing and ambiguous ends are never merged by proximity or tool name',()=>{
 const events=[event(1,'tool.started',{tool_call_id:'a'}),event(2,'tool.ended',{tool_call_id:'b'}),event(3,'model.started'),event(4,'model.ended'),event(5,'tool.ended',{tool_call_id:'a'}),event(6,'tool.ended',{tool_call_id:'a'})];
 const graph=keyTraceGraph({events});assert.equal(graph.nodes.length,6);assert(graph.nodes.every(n=>n.members.length===1));
});
test('unknown protection verdict is visibly pending verification rather than normal',()=>{
 const n=traceGraph({events:[event(1,'protection.agentguard',{payload:{decision:'UNKNOWN'}})]}).nodes[0];
 assert.equal(n.state,'risk');assert.match(nodePresentation(n).title,/待核对/);
});
test('trusted MCP business status distinguishes pending, blocked and executed despite successful transport',()=>{
 for(const [control_status,state,title] of [['pending_approval','pending',/待审批 · 尚未执行/],['blocked','blocked',/BLOCK · 已阻断/],['executed_isolated','normal',/工具调用/]]){
  const events=[event(1,'tool.started',{tool_call_id:'a',payload:{tool:'read_gov_document',transport:'mcp'}}),event(2,'tool.ended',{tool_call_id:'a',payload:{success:true,control_status}})];
  const full=traceGraph({events}).nodes[1],key=keyTraceGraph({events}).nodes[0];
  assert.equal(full.state,state);assert.equal(key.state,state);assert.match(nodePresentation(key).title,title);
  assert.match(nodePresentation(full).timing,/耗时未采集/);
 }
 const failed=traceGraph({events:[event(1,'tool.ended',{payload:{control_status:'pending_approval',failed:true}})]}).nodes[0];
 assert.equal(failed.state,'failed');assert.match(nodePresentation(failed).title,/失败/);assert.doesNotMatch(nodePresentation(failed).title,/待审批/);
});
