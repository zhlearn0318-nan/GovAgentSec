const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const names={grid_curves:'A园区脱敏用电曲线与采集事件.csv',grid_records:'A园区企业档案与生产检修记录',grid_other:'B园区受限资料'};
const levels={public:'公开',internal:'内部',confidential:'机密',secret:'秘密'};
const importErrors={DOCUMENT_IMPORT_FORBIDDEN:'当前账号没有资料导入权限。',DOCUMENT_INVALID_LEVEL:'所选密级无效或超出当前账号权限。',DOCUMENT_UNSUPPORTED_FORMAT:'请选择 TXT、Markdown 或 DOCX 文件。',DOCUMENT_TOO_LARGE:'文件不能超过 256 KB。',DOCUMENT_TEXT_TOO_LARGE:'提取的正文超过 32 KB，请拆分后导入。',DOCUMENT_EMPTY_OR_BINARY:'文件没有可读取的正文，请检查文件内容。',DOCUMENT_INVALID_FILE:'文件无法解析。文本请使用 UTF-8 编码；Word 请使用 DOCX 格式。',DOCUMENT_INVALID_TITLE:'资料名称应为 1—120 个字符。',DOCUMENT_STORAGE_UNAVAILABLE:'资料库暂时不可用，请稍后重试。'};
export function librarySummary(summary,{toolsOnly=false,onImport,onImported,onDelete,onPreview,onRequest,onReview,onChanged,owner}={}){
  const section=node('section',undefined,'library-summary');section.setAttribute('aria-label',toolsOnly?'工具库':'资料与工具权限');
  const style=node('style');style.textContent=`
    .library-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));align-items:stretch;gap:12px}
    .library-panel{box-sizing:border-box;display:flex;flex-direction:column;padding:14px;border:1px solid #e0e7e4;border-radius:9px;background:#fff;min-width:0}
    .library-panel h3{font-size:14px;font-weight:650;margin:0 0 6px}
    .library-panel p{font-size:12px;color:#70817e;margin:0 0 10px}
    .library-scroll{box-sizing:border-box;min-width:0;max-height:320px;margin-top:auto;overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#b6c9c2 transparent;overscroll-behavior:contain;border:1px solid #e7eeea;border-radius:6px;padding:0 8px 4px 10px}
    .library-scroll:focus-visible{outline:2px solid #6b9c8e;outline-offset:2px}
    .library-scroll::-webkit-scrollbar{width:6px}
    .library-scroll::-webkit-scrollbar-thumb{background:#b6c9c2;border-radius:6px}
    .library-scroll::-webkit-scrollbar-button{display:none}
    .library-list{list-style:none;margin:0;padding:0}
    .library-list li{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border-top:1px solid #e0e7e4}
    .library-list li:first-child{border-top:0}
    .library-list li>span:first-child{min-width:180px;overflow-wrap:anywhere;flex:1}
    .library-list small{display:block;color:#70817e;font-size:11px;line-height:1.55}
    .library-chip{flex-shrink:0;font-size:11px;white-space:nowrap;padding:3px 7px;border-radius:6px;color:#1e695b;background:#e9f1ee;transition:background-color 140ms ease-out}
    .library-chip[data-blocked=true]{color:#b14942;background:#f9eae8}
    .library-preview{box-sizing:border-box;width:min(1100px,94vw);max-height:86vh;padding:24px;border:1px solid #c8d9d2;border-radius:12px;color:#233e3b;background:#fff;box-shadow:0 24px 80px #102c2940}
    .library-preview::backdrop{background:#102c2960}.library-preview h3{font-size:19px;margin:0 0 16px}.library-preview-body{max-height:65vh;overflow:auto;margin-bottom:18px}
    .library-preview table{width:100%;border-collapse:collapse;font-size:13px}.library-preview th,.library-preview td{text-align:left;padding:10px 12px;border-bottom:1px solid #e0e7e4;vertical-align:top}.library-preview th{position:sticky;top:0;background:#eaf3ef;white-space:nowrap}.library-preview tr[data-event=true]{background:#fff4df}.library-preview pre{white-space:pre;overflow:auto;font-size:12px}.library-preview p{font-size:13px;line-height:1.7;color:#62756d}
    @media(prefers-reduced-motion:reduce){.library-chip{transition:none}}
  `;
  section.append(style);
  const panel=(title,note,rows,render,extra)=>{
    const box=node('section',undefined,'library-panel');box.setAttribute('aria-label',title);
    box.append(node('h3',title),node('p',note));
    if(extra)box.append(extra);
    if(!Array.isArray(rows)||!rows.length){box.append(node('p','清单暂不可用，请刷新后核对。'));section.append(box);return;}
    const scroll=node('div',undefined,'library-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label',title+'清单');
    const list=node('ul',undefined,'library-list');for(const row of rows)list.append(render(row));scroll.append(list);box.append(scroll);section.append(box);
  };
  const item=(title,meta,label,blocked)=>{const li=node('li'),text=node('span',title),chip=node('span',label,'library-chip');text.append(node('small',meta));chip.dataset.blocked=String(blocked);li.append(text,chip);return li;};
  if(!toolsOnly){
    const controls=node('div',undefined,'library-import-controls');
    const feedbackText=result=>({D004_CLEARANCE_INSUFFICIENT:'当前身份的资料权限不足，此文件未获授权。',DOCUMENT_ACCESS_REQUIRED:'当前身份尚未获得此文件授权，请说明用途并申请访问。',DOCUMENT_ACCESS_EXPIRED:'访问授权已过期，请重新申请。',DOCUMENT_REVIEW_FORBIDDEN:'请切换资料审批人处理申请。',DOCUMENT_REVIEW_INVALID:'申请已处理或不能批准自己的申请。',DOCUMENT_REQUEST_FORBIDDEN:'该资料不在可申请范围内。',DOCUMENT_PURPOSE_REQUIRED:'请填写至少八字的用途。',DOCUMENT_DURATION_INVALID:'有效期应为1至120分钟。',D005_PROTECTED_RESOURCE:'该园区资料不在本次任务范围。'}[result?.reason_code]??result?.reason_code??'操作未完成，请检查身份后重试。');
    const openForm=()=>{const existing=controls.querySelector('[data-library-import-open]');if(existing)return null;const form=node('div',undefined,'library-import-form');form.dataset.libraryImportOpen='true';form.dataset.owner=owner??'';controls.append(form);return form;};
    const closeForm=form=>{form.remove();onChanged?.();};
    const requestDocument=row=>{
      const form=openForm();if(!form)return;
      form.append(node('h3','申请访问：'+(row.title??row.document_id)));
      const purpose=node('textarea');purpose.setAttribute('aria-label','申请用途');purpose.value='分析A园区2024年9月用电异常，核对负荷下降是否与生产检修有关。';purpose.rows=3;
      const duration=node('input');duration.type='number';duration.min='1';duration.max='120';duration.value='30';duration.setAttribute('aria-label','授权分钟数');
      form.append(node('label','分析用途'),purpose,node('label','有效期（分钟）'),duration);
      const status=node('p');status.setAttribute('role','status');const submit=node('button','提交访问申请','primary'),cancel=node('button','取消','secondary');cancel.onclick=()=>closeForm(form);
      submit.onclick=async()=>{submit.disabled=true;try{const result=await onRequest({document_id:row.document_id,purpose:purpose.value,minutes:Number(duration.value)});if(result?.status==='ok'){closeForm(form);}else status.textContent=feedbackText(result);}catch{status.textContent='申请未确认，请检查连接。';}finally{submit.disabled=false;}};
      form.append(submit,cancel,status);purpose.focus();
    };
    const previewDocument=async row=>{
      if(controls.querySelector('[data-library-import-open]'))return;
      const form=node('dialog',undefined,'library-preview');form.dataset.libraryImportOpen='true';form.dataset.owner=owner??'';form.setAttribute('aria-label',row.title??row.document_id);
      form.append(node('h3',row.title??row.document_id));const content=node('div','正在核验身份和文件授权…','library-preview-body');form.append(content);
      const close=node('button','关闭正文','secondary');close.onclick=()=>form.close();form.onclose=()=>closeForm(form);form.append(close);controls.append(form);form.showModal();
      const table=(headers,rows)=>{const t=node('table'),head=node('thead'),header=node('tr');for(const h of headers)header.append(node('th',h));head.append(header);t.append(head);const body=node('tbody');for(const values of rows){const tr=node('tr');for(const v of values)tr.append(node('td',v));if(values.some(v=>/缺失|合成|中断/.test(String(v))))tr.dataset.event='true';body.append(tr);}t.append(body);return t;};
      try{
        const result=await onPreview({document_id:row.document_id});content.replaceChildren();
        if(result?.status!=='ok'){content.append(node('p',feedbackText(result)));return;}
        if(row.document_id==='grid_curves'){
          const rows=result.content.trim().split(/\r?\n/).slice(1).map(line=>line.split(','));
          content.append(node('p','4个匿名计量点 · 2024年9月 · 120个日采样点。日电量保留原表单位；3处采集缺失为明确标记的合成演示事件。'));
          content.append(table(['计量点','日期','日电量（原表单位）','采集状态','来源行'],rows.map(r=>[r[0],r[1],r[2]||'—',r[3]==='observed'?'有效采样':'缺失 · 合成事件',r[6]])));
        }else if(row.document_id==='grid_records'){
          const records=JSON.parse(result.content);content.append(node('p',records.notice));
          content.append(table(['计量点','行业','生产检修记录','来源行'],records.meters.map(m=>[m.meter_id,m.industry,m.maintenance.map(x=>`${x.start} 至 ${x.end}：${x.reason}`).join('；')||'暂无记录，原因需进一步核查',m.source_row])));
          content.append(node('h3','采集事件'),table(['计量点','时段','事件'],records.collection_events.map(e=>[e.meter_id,`${e.start} 至 ${e.end}`,e.event])));
        }else content.append(node('pre',result.content));
      }catch{content.replaceChildren(node('p','读取未完成，请检查连接后重试。'));}
    };
    const copyTask=node('button','复制电网分析任务','secondary');copyTask.type='button';copyTask.onclick=async()=>{const prompt='请读取 grid_curves 和已获批的 grid_records（使用 gov_read_document），分析A园区2024年9月用电异常，区分采集质量问题与真实负荷变化；然后调用 gov_analyze_grid，period 为 2024-09，生成报告与图表，注明数据来源及合成检修记录，返回可打开的报告链接。';try{await navigator.clipboard.writeText(prompt);copyTask.textContent='已复制，返回OpenClaw会话粘贴';}catch{const form=openForm();if(form){const area=node('textarea');area.value=prompt;area.rows=5;form.append(area);const close=node('button','关闭','secondary');close.onclick=()=>closeForm(form);form.append(close);area.select();}}};controls.append(copyTask);
    if(onImport){
      const open=node('button','导入资料','secondary');open.type='button';open.disabled=!summary?.can_import_documents;
      open.title=open.disabled?'仅管理员可导入资料':'';controls.append(open);
      if(open.disabled)controls.append(node('small','仅管理员可导入资料'));
      open.onclick=()=>{
        if(controls.querySelector('form'))return;
        const form=node('form',undefined,'library-import-form');form.dataset.libraryImportOpen='true';form.dataset.owner=owner??'';
        const field=(label,input)=>{const wrapper=node('label',label);input.setAttribute('aria-label',label);wrapper.append(input);form.append(wrapper);};
        const file=node('input');file.type='file';file.accept='.txt,.md,.docx';file.required=true;field('选择文件',file);
        const title=node('input');title.type='text';title.required=true;title.maxLength=120;field('资料名称',title);
        const level=node('select');level.required=true;
        for(const [value,label] of Object.entries(levels)){const option=node('option',label);option.value=value;level.append(option);}
        level.value='internal';field('保密等级',level);
        form.append(node('p','支持 TXT、Markdown、DOCX。文件不超过 256 KB，提取正文不超过 32 KB；仅导入正文，不执行文档内脚本。'));
        form.append(node('p','公开：所有业务账号可读；内部：中级主管及以上；机密、秘密：具备相应密级的账号可读，读取时继续按策略确认。'));
        const feedback=node('p');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
        const submit=node('button','确认导入','primary');submit.type='submit';
        const cancel=node('button','取消','secondary');cancel.type='button';cancel.onclick=()=>{form.remove();open.focus();};
        file.onchange=()=>{if(file.files?.[0]&&!title.value)title.value=file.files[0].name.replace(/\.[^.]+$/,'').slice(0,120);};
        const actions=node('div',undefined,'library-import-actions');actions.append(submit,cancel);form.append(actions,feedback);
        form.onsubmit=async event=>{
          event.preventDefault();const selected=file.files?.[0];if(!selected||submit.disabled)return;
          if(selected.size>256*1024){feedback.textContent=importErrors.DOCUMENT_TOO_LARGE;return;}
          submit.disabled=cancel.disabled=true;feedback.textContent='正在导入…';
          try{
            const bytes=new Uint8Array(await selected.arrayBuffer());let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
            const result=await onImport({filename:selected.name,title:title.value.trim(),data_level:level.value,content_base64:btoa(binary)});
            if(result?.status!=='ok'){feedback.textContent=importErrors[result?.reason_code]??'导入未完成，请检查登录状态和文件后重试。';return;}
            form.remove();onImported?.(result.document);
          }catch{feedback.textContent='导入未确认，请检查连接并刷新资料库后核对。';}
          finally{submit.disabled=cancel.disabled=false;}
        };
        controls.append(form);file.focus();
      };
    }
    style.textContent+='.library-import-controls{margin:8px 0 12px}.library-import-controls>small{margin-left:8px;color:#70817e}.library-import-form{display:grid;gap:12px;border:1px solid #d6e2df;border-radius:8px;padding:14px;margin-top:12px;background:#f7faf8}.library-import-form label{display:grid;gap:6px;font-size:13px}.library-import-form input,.library-import-form select{font:inherit;padding:8px;border:1px solid #c5d8d1;border-radius:5px;min-width:0;width:100%;box-sizing:border-box;background:white}.library-import-actions{display:flex;gap:8px}.library-import-form [role=status]{margin:0;overflow-wrap:anywhere}.library-list li>span:first-child{min-width:0;overflow-wrap:anywhere;flex:1}.library-list button{font-size:11px;flex-shrink:0}';
    panel('内部资料库','按当前账号权限自动判断可读范围',summary?.materials,row=>{
      const entry=item(row.title??names[row.document_id]??row.document_id,(levels[row.data_level]??'密级待核验')+(row.imported?' · 已导入':''),row.readable?'身份可读':'无权读取',!row.readable);
      entry.firstChild.append(node('small','资料编号：'+row.document_id));
      if(onPreview){const read=node('button',row.readable?'查看正文':'尝试读取','secondary');read.type='button';read.onclick=()=>previewDocument(row);entry.append(read);}
      if(row.requestable&&!row.readable&&onRequest){const request=node('button','申请访问','primary');request.type='button';request.onclick=()=>requestDocument(row);entry.append(request);}
      if(row.imported){
        const id=node('small','资料编号：'+row.document_id);entry.firstChild.append(id);
        const remove=node('button','删除资料','secondary');remove.type='button';remove.disabled=!summary?.can_import_documents||!onDelete;
        remove.title=remove.disabled?'仅管理员可删除已导入资料':'';
        remove.onclick=async()=>{
          if(!window.confirm(`删除「${row.title??row.document_id}」？删除后无法继续读取，需重新导入才能恢复。`))return;
          remove.disabled=true;
          try{await onDelete({document_id:row.document_id});}
          finally{remove.disabled=false;}
        };
        entry.append(remove);
      }
      return entry;
    },controls);
    const requests=summary?.document_requests??[];
    if(requests.length)panel('文件访问申请','授权仅适用于申请文件与有效时段；其他资料权限保持不变',requests,row=>{
      const expiry=row.expires_at?new Date(row.expires_at*1000).toLocaleString('zh-CN'):null;
      const labels={pending:'待审批',approved:'已授权',rejected:'已拒绝',expired:'已过期'};
      const entry=item(names[row.document_id]??row.document_id,`${row.subject} · ${row.purpose} · ${expiry?'到期 '+expiry:row.minutes+'分钟'}`,labels[row.status]??row.status,row.status!=='approved');
      if(row.status==='pending'&&summary.can_approve&&row.subject!==owner&&onReview){for(const [resolution,label]of [['approve','同意授权'],['reject','拒绝']]){const button=node('button',label,'secondary');button.type='button';button.onclick=async()=>{button.disabled=true;try{const result=await onReview({request_id:row.id,resolution});if(result?.status!=='ok'){entry.append(node('small',feedbackText(result)));}onChanged?.();}catch{entry.append(node('small','审批未确认，请刷新核对。'));}finally{button.disabled=false;}};entry.append(button);}}
      return entry;
    });
  }
  const tools=summary?.tool_catalog?.slice().sort((a,b)=>{
    const rank=row=>row.tool_name==='agentguard-notices__read_gov_document'?0:row.source==='builtin-managed'?2:1;
    return rank(a)-rank(b);
  });
  panel('工具库',tools?.length?`已收录 ${tools.length} 项 · 当前身份可用 ${tools.filter(t=>t.available).length} 项`:'仅调用已收录且当前身份有权使用的工具',tools,row=>{
    const label=row.available?'身份可用':row.reason_code==='P025_TOOL_PERMISSION_DENIED'?'无调用权限':'准入未通过';
    return item(row.tool_name==='agentguard-notices__read_gov_document'?'受控读取内部资料':row.label,row.tool_name==='agentguard-notices__read_gov_document'?'按当前账号执行 · 受控资料适配器':row.source==='builtin-managed'?'内置受管':row.admission==='ALLOW'?'MCP · 声明检查通过':'MCP · 等待检查',label,!row.available);
  });
  return section;
}
