// Explicit task-boundary policy complements the model detector. Input only.
// It never interprets a quoted tool result as a new user instruction.
export function gridInputPolicy(text) {
  if (typeof text !== 'string' || !/(?:园区|用电|电网|grid_curves|grid_records)/i.test(text)) return null;
  const bypass = /(?:忽略|绕过)[^。\n]{0,80}(?:限制|规则|安全|指令)|\b(?:ignore|bypass)\b[^.\n]{0,80}\b(?:rules|restrictions|instructions|safety)\b/gi;
  const outbound = /(?:发送|外发|上传|传输)[^。\n]{0,120}(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/\S+|外部邮箱)/gi;
  const matches=[...text.matchAll(bypass),...text.matchAll(outbound)];
  if(![...text.matchAll(bypass)].length || ![...text.matchAll(outbound)].length) return null;
  const spans=matches.map(m=>({start:m.index,end:m.index+m[0].length,text:m[0]})).sort((a,b)=>a.start-b.start);
  return {version:'1',decision:'BLOCK',riskLevel:'HIGH',riskScore:1,policyAction:'block',
    reasonCode:'GRID_TASK_EXFILTRATION_OVERRIDE',categories:['task_boundary_override','data_exfiltration'],
    detectorsAvailable:true,retained:false,source:'explicit-grid-task-policy',spans,
    message:'电网任务边界检查已阻断请求：包含绕过限制并外发资料的指令。\n\n'+spans.map(s=>'危险片段：「'+s.text+'」').join('\n')+'\n\n未进入工具执行，未读取资料或发送邮件。请删除上述指令后重新提交。'};
}
