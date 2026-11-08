import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const inside=(root,target)=>{const r=path.relative(root,target);return r!== '..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};

export function workspacePath(value,root){
  if(typeof value!=='string'||!root||/[\0%\\:]/.test(value)||value.split('/').some(s=>s==='..'||s==='.')||value.includes('//'))throw Error('P018_PATH_REJECTED');
  const relative=value.startsWith('/workspace/')?value.slice(11):value;
  if(relative.startsWith('/')||!relative||relative.endsWith('/'))throw Error('P018_PATH_REJECTED');
  const realRoot=fs.realpathSync(root),target=path.resolve(root,relative);
  if(!inside(path.resolve(root),target))throw Error('P018_PATH_REJECTED');
  let ancestor=target;
  while(!fs.existsSync(ancestor)&&ancestor!==path.dirname(ancestor))ancestor=path.dirname(ancestor);
  if(!inside(realRoot,fs.realpathSync(ancestor)))throw Error('P018_PATH_REJECTED');
  for(let p=ancestor;p!==path.dirname(p)&&inside(path.resolve(root),p);p=path.dirname(p)){
    if(fs.lstatSync(p).isSymbolicLink())throw Error('P018_PATH_REJECTED');
    if(p===path.resolve(root))break;
  }
  return 'nativefs://workspace/'+relative;
}

export function nativeAction(name,params,root){
  const paramsHash=hash(params);
  const workspaceHash=hash(path.resolve(root));
  if(['read','write','edit'].includes(name)){
    const keys=['path','file_path'].filter(k=>params[k]!==undefined);
    if(keys.length!==1)throw Error('P018_PATH_REJECTED');
    const resource=workspacePath(params[keys[0]],root);
    return {tool:name==='read'?'native.read':'file.write',operation:name==='read'?'read':'write',
      resource,parameters:{path:resource,params_hash:paramsHash,workspace_hash:workspaceHash,host_tool:name},data_level:'internal',risk_level:name==='read'?'low':'high'};
  }
  if(name==='exec')return {tool:'shell.execute',operation:'execute',resource:'nativefs://workspace/exec',
    parameters:{command:params.command,params_hash:paramsHash,workspace_hash:workspaceHash},data_level:'internal',risk_level:'high'};
  return undefined;
}

export async function hostWorkspace(config,ctx){
  const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
  if(JSON.parse(fs.readFileSync(path.join(host,'package.json'))).version!=='2026.7.1-2')throw Error('P019_HOST_VERSION_UNVERIFIED');
  // Use the fixed host's own layout function, not the agent's ordinary working
  // directory: U9 workspaceAccess=none points tools at a different directory.
  const {i:resolveConfig}=await import(pathToFileURL(path.join(host,'dist/config-Dy4vED5-.js')));
  const {h:layout}=await import(pathToFileURL(path.join(host,'dist/docker-Hq4HIYYD.js')));
  const cfg=resolveConfig(config,ctx.agentId??ctx.sessionKey.split(':')[1]);
  if(cfg.mode!=='all'||cfg.scope!=='session'||cfg.workspaceAccess!=='none'||!['docker','srt'].includes(cfg.backend))throw Error('P020_ISOLATION_REQUIRED');
  return layout({cfg,rawSessionKey:ctx.sessionKey,workspaceDir:ctx.workspaceDir}).workspaceDir;
}

export function registerChatAcl(api,bridge,{workspaceResolver=ctx=>hostWorkspace(api.config,ctx)}={}){
  // Gateway and pre-warmed Agent registries share the authenticated bridge.
  const runs=bridge.chatRuns??=new Map();
  const block=code=>({block:true,blockReason:`任务权限阻断：${code}。请在防护设置绑定演示业务身份；越权动作须由另一人审批。`});
  api.on?.('before_agent_run',async(event,ctx)=>{
    if(!ctx.runId||!ctx.sessionKey||!ctx.workspaceDir)return;
    runs.delete(ctx.runId);
    try{
      const root=await workspaceResolver(ctx);
      // Parse only the current user input. Never consult tool outputs/history.
      const paths=[...new Set((event.prompt.match(/\/workspace\/[\p{L}\p{N}_./-]+/gu)??[])
        .map(p=>workspacePath(p,root)))];
      const result=await bridge.request('chat_start',{run_id:ctx.runId,session_key:ctx.sessionKey,paths,
        public_notice:/公开.*(?:预案|通知)|emergency_plan/.test(event.prompt)});
      if(result.status==='ok')runs.set(ctx.runId,{...result,session:ctx.sessionKey,root});
    }catch{api.logger?.warn('U11 scope creation failed; all tools denied (P012_TASK_POLICY_UNAVAILABLE)');}
  },{priority:90});
  api.on?.('before_tool_call',async(event,ctx)=>{
    const id=ctx.runId??event.runId,run=runs.get(id);
    if(!run||run.session!==ctx.sessionKey)return block('P001_CONTRACT_REQUIRED');
    try{
      const result=await bridge.request('chat_tool',{run_id:id,session_key:ctx.sessionKey,
        tool_name:event.toolName,params:event.params,action:nativeAction(event.toolName,event.params,run.root)});
      if(result.status!=='host_authorized')return block(result.reason_code??'P012_TASK_POLICY_UNAVAILABLE');
    }catch(e){return block(e.message==='P018_PATH_REJECTED'?e.message:'P012_TASK_POLICY_UNAVAILABLE');}
  },{priority:-10000});
  api.on?.('after_tool_call',async(event,ctx)=>{
    const id=ctx.runId??event.runId;if(!runs.has(id))return;
    await bridge.request('chat_result',{run_id:id,tool_name:event.toolName,success:!event.error&&!event.result?.isError}).catch(()=>api.logger?.warn('U11 host result audit unavailable'));
  });
  api.on?.('agent_end',async(event,ctx)=>{
    const id=ctx.runId??event.runId;runs.delete(id);
    await bridge.request('chat_end',{run_id:id}).catch(()=>{});
  });
}
