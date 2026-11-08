// Page-memory Bearer only: refresh/navigation destroys the selected user session.
export function mountDemoIdentity(parent,gateway,onStatus=()=>{}){
  const statusText=status=>({ok:'任务已绑定',authorized:'已批准，等待原会话单次重试',pending_approval:'待人工审批',executed_isolated:'已执行（合成）',blocked:'已阻断',rejected:'已拒绝',interrupted:'已中断',approval_error:'审批失败'}[status]??status);
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const card=el('section');card.className='section';card.setAttribute('aria-label','演示身份源');
  const heading=el('div');heading.className='section-head';heading.append(el('h2','演示身份源'));
  const body=el('div');body.style.cssText='padding:16px;display:grid;gap:12px';
  card.append(heading,body);parent.prepend(card);
  let bearer=null,tokenExpires=0,busy=false,disposed=false,lastState='',loadGeneration=0;
  let chatSessionKey=new URL(location.href).searchParams.get('session')??'agent:main:main';
  const call=(operation,payload={})=>gateway.request('govagentsec.demoIdentity.'+operation,payload);
  const message=el('p');message.setAttribute('role','status');
  const act=(label,fn,disabled=false)=>{
    const b=el('button',label);b.disabled=disabled||busy;b.className='secondary';
    b.onclick=async()=>{
      if(busy)return;busy=true;loadGeneration++;body.querySelectorAll('button,select').forEach(n=>n.disabled=true);
      try{await fn();}catch{bearer=null;tokenExpires=0;message.textContent='演示操作失败；已清除当前页面身份，请刷新或重新选人。';}
      finally{busy=false;await load(true);}
    };return b;
  };
  const showResult=result=>{
    message.textContent=`${result.label??'演示身份源（非生产）'} · ${statusText(result.status)} · ${result.reason_code??''}`+
      (result.executed?' · 仅合成记录已执行；未发送外部消息':' · 未执行业务动作');
  };
  async function load(force=false){
    const generation=++loadGeneration;
    try{
      if(tokenExpires&&Date.now()/1000>=tokenExpires){bearer=null;tokenExpires=0;}
      const state=await call('status',bearer?{bearer}:{});
      if(disposed||generation!==loadGeneration)return;
      if(!state.enabled||!state.user){bearer=null;tokenExpires=0;}
      onStatus(state);const fingerprint=JSON.stringify(state);
      if(!force&&fingerprint===lastState)return;
      lastState=fingerprint;body.replaceChildren();
      const badge=el('strong','演示身份源（非生产）');badge.className='chip bad';body.append(badge);
      body.append(el('p','组织 OIDC 未接；当前为演示身份源，校验路径与生产同源。网关登录 ≠ 业务身份；MFA 为合成测试声明。'));
      if(!state.enabled){
        body.append(el('p','当前已关闭：演示执行与审批不可用。原有业务身份限制保持生效。'));
        body.append(act('开启演示身份源',async()=>{await call('enable');message.textContent='已开启，仅可操作独立合成数据；15 分钟后自动关闭。';}));
      }else{
        const row=el('div');row.className='row';
        const select=el('select');select.setAttribute('aria-label','选择演示用户');
        for(const user of state.users??[]){const option=el('option',`${user.label} · ${user.id}`);option.value=user.id;select.append(option);}
        if(state.user)select.value=state.user.id;
        row.append(select,act('建立演示会话',async()=>{
          const login=await call('login',{user:select.value,...(bearer?{bearer}:{})});
          if(!login.access_token)throw Error('DEMO_LOGIN_FAILED');
          bearer='Bearer '+login.access_token;tokenExpires=login.expires_at;
          message.textContent='已验证演示用户：'+login.user.id+'；Bearer 仅保留于当前页面内存。';
        }),act('关闭当前委托',async()=>{const result=await call('revoke',{bearer});if(result.status!=='ok')throw Error('REVOKE_FAILED');bearer=null;tokenExpires=0;message.textContent='当前用户委托已撤销；执行和聊天绑定已收回。';},!state.user),
          act('关闭演示身份源',async()=>{await call('disable');bearer=null;tokenExpires=0;message.textContent='已关闭；演示令牌及待审批请求已失效，执行与审批已禁用。';}));
        body.append(row,el('p',state.user?`当前已验证：${state.user.id} · ${state.user.department} · 密级 ${state.user.clearance} · 角色 ${state.user.roles.join('、')}`:'尚未建立演示用户会话；执行与审批已禁用。'));
        body.append(el('p',`当前委托：${state.user?.id??'无'} · 执行评估${state.execution_enabled?'可提交':'已禁用'} · ${state.delegation_reason??'DEMO_DELEGATION_REQUIRED'}`));
        const operations=el('div');operations.className='row';
        operations.append(act('发起台风通知送审（合成）',async()=>showResult(await call('invoke',{scenario:'notice',bearer})),!state.execution_enabled),
          act('发起测试付款 600 元（合成）',async()=>showResult(await call('invoke',{scenario:'payment',bearer})),!state.execution_enabled));
        body.append(operations,el('p','合成通知只写本地送审箱；测试付款只写隔离账本。普通经办没有审批角色，处长也不能审批自己的动作。'));
        const tasks=el('section');tasks.setAttribute('aria-label','任务最小权限');
        tasks.append(el('h3','任务最小权限'));
        const directory=el('select');directory.setAttribute('aria-label','任务绑定目录');
        for(const [value,label] of [['A','目录 A · 公开台风通知'],['B','目录 B · 内部物资清单']]){
          const o=el('option',label);o.value=value;directory.append(o);
        }
        const canCreate=state.execution_enabled&&state.user?.roles.includes('office_user');
        const session=el('input');session.setAttribute('aria-label','绑定聊天会话');session.placeholder='agent:main:会话标识';
        session.value=chatSessionKey;session.oninput=()=>{chatSessionKey=session.value;};
        tasks.append(el('p','聊天任务：先绑定业务身份，每条新消息自动建立最小范围。仅从本条消息的 /workspace/目录/文件 或公开预案意图授权只读；未声明路径不授予文件范围。'),
          session,act('绑定聊天身份',async()=>{
            const result=await call('bind_session',{session_key:chatSessionKey.trim(),bearer});showResult(result);
            if(result.status==='ok')message.textContent+=' · 会话 '+chatSessionKey.trim();
          },!canCreate));
        tasks.append(directory,act('创建只读任务',async()=>showResult(await call('task_create',{directory:directory.value,bearer})),!canCreate),
          el('p','仅绑定所选合成目录与 file.read。运行中不扩大基础范围；越权须人工批准原动作，一次执行。'));
        for(const task of state.tasks??[]){
          const box=el('article');box.dataset.taskId=task.task_id;
          box.style.cssText='padding:12px;border:1px solid var(--border,#d6e2df);margin-top:8px';
          box.append(el('strong',task.task_id),el('p',`允许目录：${task.resource_prefixes?.join('、')??'未声明'} · 工具：${task.allowed_tools.join('、')||'无'}`),
            el('p',`Scope SHA-256：${task.scope_digest} · 票据 ${task.ticket_ttl_seconds} 秒 / 单次`));
          const available=el('div');available.setAttribute('aria-label','任务可用文档');
          for(const id of task.available_documents)available.append(act('读取 '+id,async()=>showResult(await call('task_read',{task_id:task.task_id,document_id:id,bearer})),!canCreate||task.subject_id!==state.user.id));
          if(!task.available_documents.length)available.append(el('p','没有可用文档'));
          box.append(available);
          if(!task.available_documents.includes('material_inventory'))box.append(act('尝试读取目录 B（未授权演示）',async()=>showResult(await call('task_read',{task_id:task.task_id,document_id:'material_inventory',bearer})),!canCreate||task.subject_id!==state.user.id));
          tasks.append(box);
        }
        body.append(tasks);
        const list=el('div');list.setAttribute('aria-label','演示审批队列');
        for(const request of (state.requests??[]).toReversed()){
          const item=el('article');item.style.cssText='padding:12px;border:1px solid var(--border,#d6e2df);border-radius:8px;margin-top:8px';item.dataset.requestId=request.request_id;
          item.append(el('strong',`${request.scenario==='chat'?'聊天工具 '+request.host_tool:request.scenario==='document'?'受控文档 '+request.document_id:request.scenario==='notice'?'台风通知送审':'测试付款'} · ${statusText(request.status)}`),
            el('p',`${request.requester} · ${request.tool} · ${request.data_level} / ${request.risk_level}`),
            el('p',`命中规则：${(request.policy_reason_codes??[]).join('、')||request.reason_code||'无'} · ${request.request_id}`));
          if(request.scope_digest)item.append(el('p',`任务 ${request.task_id} · 基础目录 ${request.resource_prefixes.join('、')} · Scope ${request.scope_digest} · 审批授权 ${request.approval_ttl_seconds} 秒 / 执行票据 ${request.ticket_ttl_seconds} 秒`));
          if(request.scenario==='chat')item.append(el('p',`本次目标：${request.target_resource} · 参数 SHA-256：${request.parameters_hash}`));
          if(request.status==='blocked'&&['P014_RESOURCE_OUTSIDE_TASK','P015_TOOL_OUTSIDE_TASK'].includes(request.reason_code)){
            item.append(el('p','DENY：不在任务授权范围，底层读取未执行。'),act('申请一次性扩权',async()=>showResult(await call('task_escalate',{request_id:request.request_id,bearer})),!state.execution_enabled||state.user?.id!==request.requester));
          }
          if(request.status==='pending_approval'){
            const self=state.user?.id===request.requester;
            const canApprove=state.execution_enabled&&state.user.roles.includes('business_approver')&&!self;
            item.append(act(request.scenario==='chat'?'批准原动作单次重试':'人工确认并执行',async()=>showResult(await call('resolve',{request_id:request.request_id,resolution:'approve',bearer})),!canApprove),
              act('拒绝',async()=>showResult(await call('resolve',{request_id:request.request_id,resolution:'reject',bearer})),!canApprove));
            if(!canApprove)item.append(el('p',self?'禁止自批：请切换处长审批身份。':'需要已验证的 business_approver 演示身份。'));
          }else if(request.approver)item.append(el('p','人工确认人：'+request.approver+'；仅执行一次。'));
          list.append(item);
        }
        body.append(list);
        const ledger=el('details');ledger.setAttribute('aria-label','演示过程台账');ledger.append(el('summary','过程台账（脱敏 / 本地）'));
        for(const entry of (state.audit??[]).toReversed())ledger.append(el('p',`${entry.at} · ${entry.event} · ${entry.subject??''} · ${entry.task_id??''} · ${entry.reason_code??entry.status??''} · ${entry.scope_digest??''} · ${entry.receipt_id??''}`));
        body.append(ledger);
      }
      body.append(message);
    }catch{
      if(disposed||generation!==loadGeneration)return;
      lastState='';
      bearer=null;tokenExpires=0;onStatus({enabled:false});
      body.replaceChildren(el('p','演示身份源不可用，执行与审批已禁用。'),act('重试读取状态',async()=>{}));
    }
  }
  void load();
  const timer=setInterval(()=>{if(!busy)void load();},5000);
  return ()=>{disposed=true;bearer=null;clearInterval(timer);};
}
