// Opt-in local demonstration only. Bearers travel over authenticated RPC and
// private stdio; neither payloads nor child output are written to plugin logs.
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const moduleRoot=fileURLToPath(new URL('../../',import.meta.url));
const defaultRoot=path.resolve(moduleRoot,'../../.runtime/identity-demo');
export const demoDisabled=()=>({enabled:false,default_enabled:false,execution_enabled:false,
  production_oidc:false,label:'演示身份源（非生产）',user:null,users:[],requests:[]});

// Reuse the one private identity worker. A guard must never enable it implicitly.
export async function requireBusinessPermission(bearer,permission){
  const bridge=globalThis[Symbol.for('govagentsec.demoIdentity.bridge')];
  if(!bridge||typeof bearer!=='string'||!bearer.startsWith('Bearer ')||bearer.length>8192)throw Error('BUSINESS_IDENTITY_REQUIRED');
  let result;
  try{result=await bridge.request('authorize',{permission},bearer);}catch{throw Error('BUSINESS_IDENTITY_REQUIRED');}
  if(result?.status!=='ok')throw Error(result?.reason_code==='BUSINESS_PERMISSION_DENIED'?'BUSINESS_PERMISSION_DENIED':'BUSINESS_IDENTITY_REQUIRED');
  return {user:result.user,permission_summary:result.permission_summary};
}

export class DemoIdentityBridge {
  constructor({root=defaultRoot,personalConfirmation=false}={}){this.root=root;this.personalConfirmation=personalConfirmation;this.child=null;this.pending=new Map();this.queue=Promise.resolve();}
  request(operation,payload={},bearer){
    const next=this.queue.then(()=>this.run(operation,payload,bearer));
    this.queue=next.catch(()=>{});return next;
  }
  async run(operation,payload,bearer){
    if(!this.child&&operation!=='enable')return ['status','disable'].includes(operation)?demoDisabled():
      {...demoDisabled(),status:'blocked',http_status:403,reason_code:'DEMO_IDENTITY_DISABLED'};
    if(!this.child){
      this.traceCapture={captured:0,failed:0};
      this.evidenceId=randomUUID();
      const child=spawn(path.join(moduleRoot,'.venv/Scripts/python.exe'),['-u','-m','identity.demo_provider','--state-dir',path.join(this.root,this.evidenceId),...(this.personalConfirmation?['--personal-confirmation']:[])],
        {cwd:moduleRoot,windowsHide:true,shell:false,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'},stdio:['pipe','pipe','ignore']});
      this.child=child;
      createInterface({input:child.stdout}).on('line',line=>{
        try{const answer=JSON.parse(line),pending=this.pending.get(answer.id);if(pending){
          this.captureApprovals(answer);
          this.pending.delete(answer.id);pending.resolve(answer.result);
        }}
        catch{this.stop(true);}
      });
      const failed=()=>{if(this.child!==child)return;this.child=null;for(const p of this.pending.values())p.reject(Error('演示身份源进程不可用；默认拒绝'));this.pending.clear();};
      child.on('error',failed);child.on('exit',failed);
    }
    const result=await new Promise((resolve,reject)=>{
      const id=randomUUID(),timer=setTimeout(()=>{this.pending.delete(id);this.stop(true);reject(Error('演示身份源超时；已关闭并撤销会话'));},30000);
      this.pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
      this.child.stdin.write(JSON.stringify({id,operation,payload,bearer})+'\n',e=>{if(e){const p=this.pending.get(id);this.pending.delete(id);p?.reject(Error('演示身份源通道不可用'));}});
    });
    if(['enable','login'].includes(operation)&&Number.isFinite(result.expires_at)&&(result.enabled||result.access_token)){
      clearTimeout(this.expiry);
      this.expiry=setTimeout(()=>{void this.request('disable').catch(()=>this.stop());},Math.max(0,result.expires_at*1000-Date.now()));this.expiry.unref();
    }
    if(operation==='disable')this.stop();
    return {...result,evidence_id:this.evidenceId,trace_capture:{...this.traceCapture}};
  }
  captureApprovals(answer){
    if(answer.trace_projection_failed)this.traceCapture.failed++;
    for(const entry of answer.trace_events??[]){
      let captured=false;
      try{captured=globalThis[Symbol.for('govagentsec.trace.nativeApproval')]?.(entry)?.captured===true;}catch{}
      this.traceCapture[captured?'captured':'failed']++;
    }
  }
  stop(force=false){clearTimeout(this.expiry);this.chatRuns?.clear();if(force)this.child?.kill();else this.child?.stdin.end();this.child=null;}
}

export function registerDemoIdentity(api){
  // The fixed host registers gateway RPC and pre-warmed Agent hooks separately.
  // Both must use the same process-local worker; never persist its bearer/key.
  const bridge=globalThis[Symbol.for('govagentsec.demoIdentity.bridge')]??=new DemoIdentityBridge({personalConfirmation:true});
  for(const operation of ['status','enable','login','invoke','resolve','disable','task_create','task_read','task_escalate','bind_session','activate_chat','revoke','materials','select_materials','task_reapply']){
    api.registerGatewayMethod?.('govagentsec.demoIdentity.'+operation,async({params,respond})=>{
      try{
        const value=params??{};
        const allowed={status:['bearer'],enable:['bearer'],disable:['bearer'],login:['account','password','bearer'],revoke:['bearer'],invoke:['scenario','bearer'],resolve:['request_id','resolution','bearer'],
          task_create:['directory','bearer'],task_read:['task_id','document_id','bearer'],task_escalate:['request_id','bearer'],bind_session:['session_key','bearer'],activate_chat:['session_key','bearer'],
          materials:['session_key','bearer'],select_materials:['session_key','material_ids','bearer'],task_reapply:['request_id','bearer']}[operation];
        if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))return respond(true,{status:'blocked',http_status:403,reason_code:'DEMO_UNTRUSTED_FIELD',label:'演示身份源（非生产）',production_oidc:false});
        const {bearer,...payload}=value;
        if(bearer!==undefined&&(typeof bearer!=='string'||bearer.length>8192))throw Error('演示 Bearer 格式无效');
        if(operation==='login'&&(typeof payload.account!=='string'||typeof payload.password!=='string'||payload.account.length>64||payload.password.length>256))return respond(true,{status:'blocked',http_status:401,reason_code:'DEMO_LOGIN_FAILED',label:'演示身份源（非生产）',production_oidc:false});
        // Gateway operator.admin may bootstrap a disabled source. Once running,
        // only a live maintenance delegation can operate its enable/disable UI.
        if(['enable','disable'].includes(operation)&&bridge.child)await requireBusinessPermission(bearer,'settings.manage');
        respond(true,await bridge.request(operation,payload,bearer));
      }catch(error){respond(false,undefined,{code:error.message.startsWith('BUSINESS_')?error.message:'UNAVAILABLE',message:'演示身份源不可用或无维护权限；执行与审批保持禁用。'});}
    },{scope:['status','materials'].includes(operation)?'operator.read':'operator.admin'});
  }
  // Host plugin lifecycle; stopping the gateway revokes the in-memory signing key.
  api.registerService?.({id:'govagentsec-demo-identity',start(){},stop:()=>bridge.request('disable').catch(()=>bridge.stop())});
  return bridge;
}
