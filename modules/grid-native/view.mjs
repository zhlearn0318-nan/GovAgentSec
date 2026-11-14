const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
const button=(text,fn)=>{const node=el('button',text);node.type='button';node.onclick=fn;return node;};
export function mountGridLibrary(root,request){
 let closed=false,busy=false;
 const details=el('details'),summary=el('summary','当前 Skill 与分析报告'),body=el('section'),status=el('p');
 details.className='grid-native-library';details.style.cssText='border:1px solid #d6e2de;border-radius:8px;padding:12px 16px;margin:0 0 14px;background:#fbfdfc';
 summary.style.cssText='cursor:pointer;font-weight:600';body.style.cssText='margin-top:14px';details.append(summary,body);root.append(details);
 const refresh=async()=>{
  if(closed||busy)return;busy=true;status.textContent='正在核对当前技能与报告…';
  try{
   const data=await request('gridLibrary',{});if(closed)return;
   const skill=data.skill,contentOpen=body.querySelector('details')?.open===true;body.replaceChildren();
   const head=el('div');head.style.cssText='display:flex;gap:12px;align-items:center;flex-wrap:wrap';
   head.append(el('strong',skill.name),el('span',`v${skill.version} · ${skill.status==='admitted'?'已准入，可供新会话使用':'准入证据待核验'}`),button('刷新 Skill 与报告',refresh));
   summary.textContent=`当前 Skill v${skill.version} · ${skill.status==='admitted'?'已准入':'待核验'} · ${data.reports.length} 份分析报告`;
   const content=el('details');content.open=contentOpen;content.append(el('summary','查看技能步骤、版本与准入证据'));
   const raw=el('pre',skill.content);raw.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 Consolas,monospace';
   const evidence=el('pre',JSON.stringify({artifact_hash:skill.hash,admission:skill.admission,release:skill.release},null,2));evidence.style.cssText=raw.style.cssText;
   content.append(raw,evidence);body.append(head,content);
   const reports=el('div');reports.style.cssText='display:grid;gap:8px;margin-top:12px';
   for(const r of data.reports){const row=el('div');row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:10px;border-top:1px solid #e0e7e4;padding-top:8px';
    row.append(el('span',`${new Date(r.created_at).toLocaleString('zh-CN')} · A园区诊断报告 · Skill ${r.skill_version}`),button('打开报告与图表',async()=>{
     // Open synchronously to preserve the browser's user-gesture popup allowance.
     const target=window.open('about:blank','_blank');if(target)target.opener=null;
     try{const value=await request('gridOpenReport',{report_id:r.id});if(target)target.location.replace(value.url);else{const link=el('a','点击打开报告');link.href=value.url;link.target='_blank';link.rel='noopener';status.replaceChildren(link);}}
     catch(error){target?.close();status.textContent='报告暂不可用：'+error.message;}
    }));reports.append(row);
   }
   if(!data.reports.length)reports.append(el('p','尚无分析报告。请在当前 OpenClaw 会话完成电网诊断任务。'));
   body.append(reports,status);status.textContent='报告链接在打开时重新授权；旧会话中的链接过期后可从这里再次打开。';
  }catch(error){if(!closed){status.textContent='当前 Skill 与报告暂不可用：'+error.message;body.replaceChildren(status);}}
  finally{busy=false;}
 };
 details.addEventListener('toggle',()=>{if(details.open)void refresh();});void refresh();
 return ()=>{closed=true;details.remove();};
}
