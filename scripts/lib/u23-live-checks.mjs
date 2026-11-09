import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {inputMatrix} from '../fixtures/u23-input-matrix.mjs';
import {createScreeningClient,parsePluginConfig} from '../../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/client.mjs';

export async function u23Checks({page,rpc,identity,out,shot,nav,report,request,localModelOnly,modelRequests,live}){
 const delay=ms=>new Promise(r=>setTimeout(r,ms)),work=page.locator('govagentsec-workspace');
 const original=await rpc('govagentsec.trace.detail',{trace_id:request.run_id});
 const approvals=original.events.filter(e=>e.request_id===request.request_id&&e.event_type.startsWith('approval.'));
 assert(original.integrity.valid);
 for(const type of ['approval.requested','approval.denied','approval.approved'])assert(approvals.some(e=>e.event_type===type),type+' missing');
 assert(approvals.every(e=>e.payload.source==='identity-audit'&&e.payload.audit_id));
 const executed=await rpc('govagentsec.trace.detail',{trace_id:request.execution_run_id});
 const execution=executed.events.find(e=>e.event_type==='approval.execution'&&e.request_id===request.request_id);
 assert(executed.integrity.valid&&execution?.payload.status==='succeeded');
 assert.equal(execution.payload.origin_run_id,request.run_id);
 // Use the existing trace view on the real workspace with its actual RPC data.
 await nav(page,'audit');
 const audit=work.getByRole('region',{name:'轨迹审计',exact:true});
 const synthetic=work.getByRole('checkbox',{name:/合成/});if(await synthetic.count())await synthetic.check();
 await work.locator('button[data-trace-id="'+request.run_id+'"]').click();
 const node=audit.locator('.event[data-event-id="'+approvals.find(e=>e.event_type==='approval.approved').event_id+'"]');
 await node.click();await shot(page,'u23-approval-graph');
 await audit.getByRole('button',{name:'毫秒时间线',exact:true}).click();
 await audit.locator('.timeline-event[data-event-id="'+approvals.find(e=>e.event_type==='approval.approved').event_id+'"]').click();await shot(page,'u23-approval-timeline');
 const projection=events=>events.map(e=>({event_id:e.event_id,event_hash:e.event_hash,prev_hash:e.prev_hash,sequence:e.sequence,
  event_type:e.event_type,trace_id:e.trace_id,parent_event_id:e.parent_event_id,request_id:e.request_id,task_id:e.task_id,
  tool_call_id:e.tool_call_id,timestamp:e.timestamp,payload:e.payload}));
 fs.writeFileSync(path.join(out,'approval-events.json'),JSON.stringify({source:'real-identity-audit-private-stdio',original:projection(approvals),execution:projection([execution])},null,2));
 fs.writeFileSync(path.join(out,'chain-verify.json'),JSON.stringify({original:original.integrity,retry:executed.integrity},null,2));
 report.u23={approval_events:approvals.length+1,original_trace_id:request.run_id,retry_trace_id:request.execution_run_id,hash_chain_valid:true};

 await nav(page,'settings');const card=work.getByRole('region',{name:'会话沙箱引擎',exact:true});
 await card.getByText('当前：Docker',{exact:true}).waitFor();
 assert.equal((await rpc('govagentsec.sandbox.status')).elevated_disabled,true);
 // click, not check: selection must stay on Docker until explicit confirmation.
 await card.locator('input[value="srt"]').click();
 const dialog=card.getByRole('alertdialog',{name:'确认切换 srt'});await dialog.waitFor();
 assert.match(await dialog.innerText(),/首次\/冷启动可能数十秒至数分钟，可能超过业务委托期限/);
 assert.equal((await rpc('govagentsec.sandbox.status')).current,'docker');
 await shot(page,'u23-srt-cold-start-confirmation');
 await dialog.getByRole('button',{name:'保留当前引擎'}).click();
 assert.equal((await rpc('govagentsec.sandbox.status')).current,'docker');assert(await card.locator('input[value="docker"]').isChecked());
 report.u23.srt_cancel_kept_docker=true;

 localModelOnly();const screening=createScreeningClient(parsePluginConfig(live.plugins.entries['protect-agent'].config));
 report.u23.fp=[];
 for(const fixture of inputMatrix){
   const session='agent:main:u23-fp-'+randomUUID();
   const bearer='Bearer '+(await identity('login',{user:'office-test'})).access_token;
   assert.equal((await identity('bind_session',{session_key:session,bearer})).status,'ok');
   const before=await rpc('u14.counter'),modelBefore=modelRequests();
   await page.locator('openclaw-app-shell').evaluate((el,session)=>el.navigate('chat',{search:'?session='+encodeURIComponent(session)}),session);
   const draft=page.locator('openclaw-chat-pane textarea').first();await draft.waitFor();await draft.fill(fixture.text);await draft.press('Enter');
   let after,protection;const deadline=Date.now()+90000;
   do{after=await rpc('u14.counter');protection=await rpc('govagentsec.protection.state',{sessionKey:session});
    if(after.ends.length>before.ends.length&&(fixture.expected==='ALLOW'||protection.incident?.stopConfirmed))break;
    await delay(250);
   }while(Date.now()<deadline);
   assert(after.ends.length>before.ends.length,fixture.id+' missing agent_end');
   const run=after.ends.at(-1),trace=await rpc('govagentsec.trace.detail',{trace_id:run.run_id});
   const input=trace.events.find(e=>e.event_type==='protection.input');
   assert.equal(input?.payload.decision,fixture.expected,fixture.id);assert(trace.integrity.valid);
   const toolEvents=trace.events.filter(e=>e.event_type==='tool.started');assert.equal(toolEvents.length,0);
   assert.equal(after.reads,before.reads);assert.equal(after.tool_results.length,before.tool_results.length);
   if(fixture.expected==='BLOCK'){
     assert(protection.incident?.stopConfirmed,fixture.id+' missing stop confirmation');
     assert.equal(modelRequests(),modelBefore,fixture.id+' reached model despite input stop');
     await page.locator('#protect-agent-alert').getByText('当前任务已停止',{exact:true}).waitFor();
   }else{assert.equal(run.success,true,fixture.id+' failed');assert(modelRequests()>modelBefore);assert.notEqual(protection.status,'blocked');}
   const row={id:fixture.id,synthetic:true,input_sha256:createHash('sha256').update(fixture.text).digest('hex'),expected:fixture.expected,
     decision:input.payload.decision,enforced:input.payload.enforced,trace_id:run.run_id,hash_chain_valid:trace.integrity.valid,
     agent_end:true,success:run.success,stop_confirmed:protection.incident?.stopConfirmed??false,
     model_requests:modelRequests()-modelBefore,tool_calls:toolEvents.length,read_delta:after.reads-before.reads};
   report.u23.fp.push(row);await shot(page,'u23-'+fixture.id);
   await identity('revoke',{bearer});
 }
 // Historical tool-return failure uses the actual RAG path too, no prompt output in evidence.
 const old=inputMatrix.find(f=>f.id==='historical_u14_provenance');
 const result=await screening.screen({kind:'tool_result',text:old.text,toolName:'read',query:'请读取材料并报告结果。',conversationId:'u23-tool-'+randomUUID()});
 assert.equal(result.decision,'ALLOW');report.u23.historical_tool_result=result;
 fs.writeFileSync(path.join(out,'fp-matrix.json'),JSON.stringify({source:'real-openclaw-local-protect-local-deterministic-model',rows:report.u23.fp,historical_tool_result:result},null,2));
}
