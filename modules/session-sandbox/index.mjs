import {definePluginEntry} from 'openclaw/plugin-sdk/plugin-entry';
import {registerSandboxBackend} from 'openclaw/plugin-sdk/sandbox';
import path from 'node:path';
import {createSrtBackend} from './backend.mjs';
import {SandboxService} from './service.mjs';
import {rejectBypass} from './policy.mjs';
export default definePluginEntry({id:'govagentsec-session-sandbox',name:'GovAgentSec 会话执行隔离',register(api){
  const root=api.pluginConfig.dataDir;
  registerSandboxBackend('srt',{factory:p=>createSrtBackend(p,{root}),resolveWorkdir:p=>p.workspaceDir});
  const service=new SandboxService({configFile:process.env.OPENCLAW_CONFIG_PATH??path.join(process.env.USERPROFILE,'.openclaw/openclaw.json'),root});
  for(const [method,scope,run] of [
    ['status','operator.read',()=>service.status()],
    ['select','operator.admin',p=>{if(Object.keys(p).some(k=>k!=='engine'))throw Error('只接受 engine 参数');return service.select(p.engine);}],
  ])api.registerGatewayMethod('govagentsec.sandbox.'+method,async({params,respond})=>{
    try{respond(true,await run(params??{}));}catch(e){respond(false,undefined,{code:'INVALID_REQUEST',message:e.message});}
  },{scope});
  api.on('before_tool_call',event=>rejectBypass(event),{priority:120});
}});
