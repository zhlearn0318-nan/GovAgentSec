import {readFileSync,writeFileSync,appendFileSync,renameSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {applySandboxPolicy} from './policy.mjs';
import {pathToFileURL} from 'node:url';
import {IMAGE,SRT_CLI,SRT_VERSION,SRT_LIMIT,HOST} from './constants.mjs';
async function validate(config){
  const {validateConfigObjectRaw}=await import(pathToFileURL(path.join(HOST,'dist/config/config.js')));
  if(!validateConfigObjectRaw(config).ok)throw Error('沙箱配置未通过固定版本校验；未保存');
}
export async function command(file,args,timeout=12000){
  return await new Promise(resolve=>{
    const c=spawn(file,args,{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});let out='';
    const timer=setTimeout(()=>c.kill(),timeout);
    c.stdout.on('data',b=>{if(out.length<64000)out+=b;});c.stderr.resume();
    c.once('error',()=>{clearTimeout(timer);resolve({ok:false,output:''});});
    c.once('close',code=>{clearTimeout(timer);resolve({ok:code===0,output:out});});
  });
}
export class SandboxService {
  constructor({configFile,root,check=checkEngines,validateConfig=validate}){this.configFile=configFile;this.root=root;this.check=check;this.validateConfig=validateConfig;this.busy=false;}
  audit(event){mkdirSync(this.root,{recursive:true});appendFileSync(path.join(this.root,'switch-audit.jsonl'),JSON.stringify({time:new Date().toISOString(),...event})+'\n');}
  async status(){const c=JSON.parse(readFileSync(this.configFile));return {
    current:c.agents?.defaults?.sandbox?.backend??'off',mode:c.agents?.defaults?.sandbox?.mode??'off',
    elevated_disabled:c.tools?.elevated?.enabled===false,engines:await this.check(),
    scope:'仅原生 exec 与文件工具；MCP 仍走 AgentGuard，模型 API 不受此网络策略约束。',
    effective:'切换用于下一次 Agent 运行；已在运行的任务保持原引擎，请结束后新建会话。'
  };}
  async select(engine,actor='operator.admin') {
    if(!['docker','srt'].includes(engine))throw Error('不支持的沙箱引擎');
    if(this.busy)throw Error('切换进行中，请稍后重试');this.busy=true;
    try {
      const health=await this.check();if(!health[engine]?.ready)throw Error('目标引擎未就绪；配置未变更');
      const original=readFileSync(this.configFile,'utf8'),config=JSON.parse(original),next=applySandboxPolicy(config,engine,this.root);
      await this.validateConfig(next);
      if(readFileSync(this.configFile,'utf8')!==original)throw Error('配置已被其他操作更新，请重新切换');
      const hash=v=>createHash('sha256').update(v).digest('hex');
      this.audit({event:'engine.switch.requested',from:config.agents?.defaults?.sandbox?.backend??'off',to:engine,actor,config_hash:hash(original)});
      const backup=this.configFile+'.before-session-sandbox-'+Date.now();writeFileSync(backup,original,{flag:'wx'});
      const temp=this.configFile+'.session-sandbox.tmp';
      writeFileSync(temp,JSON.stringify(next,null,2)+'\n',{flag:'wx'});renameSync(temp,this.configFile);
      this.audit({event:'engine.switch.applied',engine,actor,config_hash:hash(JSON.stringify(next))});
      return {engine,saved:true,effective:'下一次 Agent 运行；正在运行的任务不迁移',restart_required:false};
    }finally{this.busy=false;}
  }
}
export async function checkEngines(){
  const [docker,srt]=await Promise.all([command('docker',['image','inspect',IMAGE,'--format','{{.Id}}']),
    command(path.join(path.dirname(SRT_CLI),'../vendor/srt-win/x64/srt-win.exe'),['user','status'])]);
  let installed=false;try{const v=JSON.parse(srt.output);installed=v.cred_present===true&&v.marker_version===v.setup_version;}catch{}
  return {docker:{ready:docker.ok,label:'Docker',detail:docker.ok?'Linux 引擎与专用镜像可用':'请运行 Ensure-DockerReady.ps1 和 setup_session_sandbox.mjs'},
    srt:{ready:installed,label:'sandbox-runtime (srt)',version:SRT_VERSION,detail:installed?'已安装；每次执行仍由上游进行 WFP 行为自检':'请运行 Ensure-SrtReady.ps1',limitation:SRT_LIMIT}};
}
