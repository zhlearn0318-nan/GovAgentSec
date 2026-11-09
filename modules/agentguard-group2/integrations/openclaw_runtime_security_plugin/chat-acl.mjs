import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {reportTaskAccessDenied} from '../../../protect-agent-group1/智能体安全/integrations/openclaw/plugin/result-gate.mjs';

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

export function hostExecutionResult(event){
  const failed=Boolean(event.error||event.result?.isError||event.result?.details?.isError);
  if(!event.toolName?.startsWith('agentguard-notices__'))return {success:!failed};
  // MCP transport success can still mean waiting for approval. Only its typed
  // business receipt proves execution; never count a pending response as a read.
  const control=event.result?.details?.structuredContent;
  if(['pending_approval','blocked'].includes(control?.status))return {success:false,control_status:control.status};
  if(failed)return {success:false};
  if(control?.status==='executed_isolated')return {success:true,control_status:control.status};
  return {success:null};
}

export function registerChatAcl(api,bridge,{workspaceResolver=ctx=>hostWorkspace(api.config,ctx)}={}){
  // Gateway and pre-warmed Agent registries share the authenticated bridge.
  const runs=bridge.chatRuns??=new Map();
  api.registerTool?.(ctx=>({name:'gov_read_document',label:'按登录身份读取受管资料',
    description:'读取合成受管资料，以当前登录账号授权。document_id 可为 emergency_plan、material_inventory、duty_contacts、command_contacts、protected_resource。代替独立 MCP 的 read_gov_document，禁止传入路径或身份。',
    parameters:{type:'object',additionalProperties:false,properties:{document_id:{type:'string'}},required:['document_id']},
    async execute(callId,params){
      const value=await bridge.request('chat_document_execute',{session_key:ctx.sessionKey,tool_call_id:callId,params});
      // Return business text once. The worker keeps protocol/audit metadata;
      // every byte of the actual document still passes the existing result guard.
      if(value.status==='executed_isolated' && value.executed===true && typeof value.content==='string')
        return {content:[{type:'text',text:value.content}],details:{document_id:value.document_id,executed:true}};
      return {content:[{type:'text',text:'资料未读取：'+(value.reason_code??'DOCUMENT_UNAVAILABLE')}],isError:true};
    }}),{names:['gov_read_document']});
  const block=(code,event,ctx)=>{
    reportTaskAccessDenied({...ctx,runId:ctx.runId??event.runId,toolCallId:ctx.toolCallId??event.toolCallId},code);
    const reason={P024_TOOL_NOT_IN_CATALOG:'不在工具库，已阻断',P025_TOOL_PERMISSION_DENIED:'当前身份无权调用此工具，已阻断',P026_TOOL_ADMISSION_REQUIRED:'工具尚未通过准入，已阻断'}[code];
    return {block:true,blockReason:reason?`${reason}（${code}）`:`任务权限阻断：${code}。请在动态权限核对身份、任务范围与审批状态。`};
  };
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
    if(!run||run.session!==ctx.sessionKey)return block('P001_CONTRACT_REQUIRED',event,ctx);
    try{
      if(bridge.personalConfirmation && event.toolName==='agentguard-notices__read_gov_document')return {block:true,blockReason:'请改用 gov_read_document(document_id=原文档ID)，它按当前登录账号执行。旧 MCP 静态身份入口未读取资料。'};
      const operation=event.toolName==='gov_read_document'?'chat_document_prepare':'chat_tool';
      const payload={run_id:id,session_key:ctx.sessionKey,
        tool_call_id:ctx.toolCallId,
        tool_name:event.toolName,params:event.params,action:nativeAction(event.toolName,event.params,run.root)};
      let result=await bridge.request(operation,payload);
      if(result.status==='pending_approval' && bridge.personalConfirmation){
        const deadline=Date.now()+61000;
        while(Date.now()<deadline){
          await new Promise(resolve=>setTimeout(resolve,500));
          const pending=await bridge.request('chat_confirmation_status',{run_id:id,request_id:result.request_id});
          if(pending.status==='authorized'){result=await bridge.request(operation,payload);break;}
          if(pending.status!=='pending_approval')return block('PERSONAL_CONFIRMATION_REJECTED_OR_EXPIRED',event,ctx);
        }
      }
      if(!['host_authorized','document_prepared'].includes(result.status))return block(result.reason_code??'P012_TASK_POLICY_UNAVAILABLE',event,ctx);
    }catch(e){return block(e.message==='P018_PATH_REJECTED'?e.message:'P012_TASK_POLICY_UNAVAILABLE',event,ctx);}
  },{priority:-10000});
  api.on?.('after_tool_call',async(event,ctx)=>{
    const id=ctx.runId??event.runId;if(!runs.has(id))return;
    await bridge.request('chat_result',{run_id:id,session_key:ctx.sessionKey,tool_call_id:ctx.toolCallId,
      tool_name:event.toolName,...hostExecutionResult(event)}).catch(()=>api.logger?.warn('U11 host result audit unavailable'));
  });
  api.on?.('agent_end',async(event,ctx)=>{
    const id=ctx.runId??event.runId;runs.delete(id);
    await bridge.request('chat_end',{run_id:id}).catch(()=>{});
  });
}
