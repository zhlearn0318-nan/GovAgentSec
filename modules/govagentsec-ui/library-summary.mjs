const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
const names={emergency_plan:'公开台风预案',material_inventory:'应急物资清单',duty_contacts:'内部值班通信录',command_contacts:'指挥中心联络表',protected_resource:'受保护物资材料'};
const levels={public:'公开',internal:'内部',confidential:'机密',secret:'机密 · 秘密样例'};
export function librarySummary(summary,{toolsOnly=false}={}){
  const section=node('section',undefined,'library-summary');section.setAttribute('aria-label',toolsOnly?'工具库':'资料与工具权限');
  const style=node('style');style.textContent=`.library-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px}.library-panel{padding:14px;border:1px solid #e0e7e4;border-radius:9px;background:#fff;min-width:0}.library-panel h3{font-size:14px;font-weight:650;margin:0 0 6px}.library-panel p{font-size:12px;color:#70817e;margin:0 0 10px}.library-scroll{max-height:248px;overflow:auto}.library-list{list-style:none;margin:0;padding:0}.library-list li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-top:1px solid #e0e7e4}.library-list small{display:block;color:#70817e;font-size:11px;line-height:1.55}.library-chip{font-size:11px;white-space:nowrap;padding:3px 7px;border-radius:6px;color:#1e695b;background:#e9f1ee}.library-chip[data-blocked=true]{color:#b14942;background:#f9eae8}.library-chip{transition:background-color 140ms ease-out}@media(prefers-reduced-motion:reduce){.library-chip{transition:none}}`;
  section.append(style);
  const panel=(title,note,rows,render)=>{
    const box=node('section',undefined,'library-panel');box.setAttribute('aria-label',title);
    box.append(node('h3',title),node('p',note));
    if(!Array.isArray(rows)||!rows.length){box.append(node('p','清单暂不可用，请刷新后核对。'));section.append(box);return;}
    const scroll=node('div',undefined,'library-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label',title+'清单');
    const list=node('ul',undefined,'library-list');for(const row of rows)list.append(render(row));scroll.append(list);box.append(scroll);section.append(box);
  };
  const item=(title,meta,label,blocked)=>{const li=node('li'),text=node('span',title),chip=node('span',label,'library-chip');text.append(node('small',meta));chip.dataset.blocked=String(blocked);li.append(text,chip);return li;};
  if(!toolsOnly)panel('内部资料库','按当前账号权限自动判断可读范围',summary?.materials,row=>item(names[row.document_id]??row.document_id,levels[row.data_level]??'密级待核验',row.readable?'身份可读':'无权读取',!row.readable));
  const tools=summary?.tool_catalog?.slice().sort((a,b)=>{
    const rank=row=>row.tool_name==='agentguard-notices__read_gov_document'?0:row.source==='builtin-managed'?2:1;
    return rank(a)-rank(b);
  });
  panel('工具库',tools?.length?`已收录 ${tools.length} 项 · 当前身份可用 ${tools.filter(t=>t.available).length} 项`:'仅调用已收录且当前身份有权使用的工具',tools,row=>{
    const label=row.available?'身份可用':row.reason_code==='P025_TOOL_PERMISSION_DENIED'?'无调用权限':'准入未通过';
    return item(row.label,row.tool_name==='agentguard-notices__read_gov_document'?'按当前账号执行 · 受控资料适配器':row.source==='builtin-managed'?'内置受管':row.admission==='ALLOW'?'MCP · 声明检查通过':'MCP · 等待检查',label,!row.available);
  });
  return section;
}
