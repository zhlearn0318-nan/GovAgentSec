import path from 'node:path';
import {IMAGE,ROOT} from './constants.mjs';
const MANAGED_TOOLS=['agentguard-notices__list_notices','agentguard-notices__request_test_payment',
  'agentguard-notices__run_protected_command','agentguard-notices__get_control_request_status',
  'agentguard-notices__read_gov_document','agentguard-notices__submit_emergency_notice','supply-chain-security__security_scan'];
function retainManagedTools(tools,previouslyAllowed){
  // An existing explicit sandbox allowlist is a stricter operator decision.
  if(Array.isArray(tools.sandbox?.tools?.allow))return;
  const keep=MANAGED_TOOLS.filter(name=>previouslyAllowed.includes(name));
  if(!keep.length)return;
  tools.sandbox??={};tools.sandbox.tools??={};
  tools.sandbox.tools.alsoAllow=[...new Set([...(tools.sandbox.tools.alsoAllow??[]),...keep])];
}
export function sandboxPolicy(engine,root) {
  if(!['docker','srt'].includes(engine))throw Error('Unknown sandbox engine');
  // Windows srt intentionally has no user-profile traversal grant. Keep its
  // write roots outside that profile, and outside the installed runtime code.
  const workspaceRoot=engine==='srt'?path.join(ROOT,'.runtime/session-sandbox/workspaces'):path.join(root,'workspaces');
  return {mode:'all',backend:engine,scope:'session',workspaceAccess:'none',workspaceRoot,
    docker:{image:IMAGE,containerPrefix:'gov-session-',workdir:'/workspace',network:'none',readOnlyRoot:true,capDrop:['ALL'],
      user:'1000:1000',tmpfs:['/tmp:rw,nosuid,nodev,size=64m'],pidsLimit:128,memory:'512m',memorySwap:'512m',cpus:1,binds:[],env:{}},
    browser:{enabled:false,allowHostControl:false}};
}
export function applySandboxPolicy(config,engine,root) {
  const c=structuredClone(config);c.agents??={};c.agents.defaults??={};
  c.agents.defaults.sandbox=sandboxPolicy(engine,root);
  c.tools??={};c.tools.elevated={...c.tools.elevated,enabled:false};c.tools.exec={...c.tools.exec,host:'sandbox'};
  c.tools.fs={...c.tools.fs,workspaceOnly:true};
  // Sandbox applies an additional allowlist. Retain only already-authorized
  // managed tools; their MCP filters, identities and AgentGuard gates stay put.
  retainManagedTools(c.tools,c.tools.alsoAllow??[]);
  for(const agent of c.agents.list??[]) {
    // A per-agent exemption must not quietly bypass the selected session engine.
    if(agent.sandbox)agent.sandbox={...sandboxPolicy(engine,root)};
    if(agent.tools?.elevated)agent.tools.elevated.enabled=false;
    if(agent.tools?.exec)agent.tools.exec.host='sandbox';
    if(agent.tools?.sandbox)retainManagedTools(agent.tools,c.tools.alsoAllow??[]);
  }
  return c;
}
export function rejectBypass(event) {
  if(!['exec','shell','sandbox_exec'].includes(event.toolName))return;
  if(event.params?.elevated===true||['gateway','node'].includes(event.params?.host))
    return {block:true,blockReason:'SESSION_SANDBOX_HOST_BYPASS_DISABLED：会话执行必须经过所选隔离引擎。'};
}
