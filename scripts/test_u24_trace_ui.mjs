import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {TraceStore} from '../modules/govagentsec-trace/store.mjs';import {traceGraph,graphLanes} from '../modules/govagentsec-trace/view-model.mjs';
const out=path.resolve(process.argv[2]??'local-validation/u24-trace-ui/'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(out,{recursive:true});
const store=new TraceStore(path.resolve('local-validation/real-evolution/2026-11-07-multi-trace-final/evidence/traces'));
const real=store.read('1a5fd19d-2474-4141-97e7-7a5fa5e40ebe');assert(real.integrity.valid);
const traces=[1,2,3].map(i=>{const t=structuredClone(real);t.summary={...t.summary,trace_id:'ui-'+i,title:'界面合成样例 '+i,source:'integration-test',task_key:'ui-task',task_confirmed:true};
 for(const e of t.events){e.trace_id=t.summary.trace_id;e.timestamp=new Date(Date.now()-1000+e.sequence*2).toISOString();}return t;});
const calls=[],report={source:'isolated-ui-fixtures-plus-read-only-real-history',passed:false,checks:[],screenshots:[],external_requests:0};let changed=false,jobPolls=0;
const candidate={id:'ui-candidate',name:'隔离界面候选',status:'draft',generation:{test_only:true,steps:[{step:1,tool:'read_gov_document',evidence:[{trace_id:'ui-1',event_id:traces[0].events.find(e=>e.event_type==='tool.started').event_id,event_hash:'synthetic'}]}]}};
const api=async(method,p)=>{
 calls.push({method,params:p});const isPack=p.pack_id==='real-history';
 if(method==='historyPacks')return {packs:[{id:'real-history',label:'台风历史真实记录',read_only:true}]};
 if(method==='list')return {traces:(isPack?[real]:traces).map(t=>t.summary),capture_failures:[{code:'synthetic-old-failure'}]};
 if(method==='detail'){const t=isPack?real:traces.find(t=>t.summary.trace_id===p.trace_id);assert(t);return t;}
 if(method==='assessmentStart'){assert.equal(p.trace_ids.length,3);return {job_id:'ui-job',status:'running',completed:0,total:3,rows:[],source:'本地界面测试评审'};}
 if(method==='assessmentStatus'){jobPolls++;return {job_id:'ui-job',status:'completed',completed:3,total:3,rows:[],source:'本地界面测试评审'};}
 if(method==='selectionPreview'){const selected=p.trace_ids.slice(0,Math.floor(p.trace_ids.length*.9)).map(trace_id=>({trace_id}));return {snapshot_hash:'ui-snapshot',can_generate:selected.length>=2,selection:{denominator:p.trace_ids.length,keep:.9,requested_count:selected.length,selected,decisions:p.trace_ids.map(trace_id=>({trace_id,selected:selected.some(x=>x.trace_id===trace_id),reason:'below_topk'}))}};}
 if(method==='generate'){assert.deepEqual(p.trace_ids,['ui-1','ui-2','ui-3']);assert.equal(p.snapshot_hash,'ui-snapshot');return {candidate};}
 if(method==='candidates')return {candidates:isPack?[]:[candidate]};
 if(method==='releaseGate')return {state:'draft',artifact_hash:'synthetic',summary:{test_only:true,steps:[]},counts:{participating:3,safe:3,quarantine:0},rows:[],admission:{decision:null,reason:'未完成',rule_ids:[]},confirmation:{enabled:false}};
 throw Error('unexpected API '+method);
};
const server=http.createServer(async(req,res)=>{try{
 if(req.url.startsWith('/api/')){const u=new URL(req.url,'http://local');const data=await api(u.pathname.slice(5),JSON.parse(u.searchParams.get('p')??'{}'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;}
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<html lang="zh-CN"><meta charset="utf-8"><body style="margin:24px;background:#f5f8f6"><main></main><script type="module">import {mountTraceAudit} from "/view.mjs";window.dispose=mountTraceAudit(document.querySelector("main").attachShadow({mode:"open"}),async(m,p={})=>{const r=await fetch("/api/"+m+"?p="+encodeURIComponent(JSON.stringify(p)));if(!r.ok)throw Error("request failed");return r.json()});</script></body></html>');return;}
 const file=req.url.slice(1);if(!['view.mjs','view-model.mjs','usage.mjs'].includes(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync('modules/govagentsec-trace/'+file));
}catch{res.writeHead(500);res.end('request failed');}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();report.external_requests++;return route.abort();});
const check=id=>report.checks.push(id);const shot=async name=>{await page.screenshot({path:path.join(out,name+'.png')});report.screenshots.push(name+'.png');};
const assertFullLaneGraph=async trace=>{
 const expected=traceGraph(trace);
 assert.deepEqual(await page.locator('.event').evaluateAll(nodes=>nodes.map(n=>n.dataset.eventId)),expected.nodes.map(n=>n.event_id));
 assert.deepEqual(await page.locator('.canvas svg path').evaluateAll(edges=>edges.map(e=>[e.dataset.from,e.dataset.to,e.dataset.kind])),expected.edges.map(e=>[e.from,e.to,e.kind]));
 assert.deepEqual(await page.locator('.lanes > span').allTextContents(),graphLanes);
 const geometry=await page.locator('.canvas').evaluate(canvas=>({
  lanes:[...canvas.querySelectorAll('.lanes > span')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};}),
  nodes:[...canvas.querySelectorAll('.event')].map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.eventId,lane:Number(e.dataset.lane),left:r.left,right:r.right,top:r.top};})
 }));
 for(const [i,n] of geometry.nodes.entries()){
  const lane=geometry.lanes[expected.nodes[i].lane];assert.equal(n.lane,expected.nodes[i].lane);
  assert(lane.width>=150,'lanes must stay readable rather than collapse into narrow cards');
  assert(n.left>=lane.left&&n.right<=lane.right,'event must stay within its named lane');
  assert(Math.abs((n.left+n.right)-(lane.left+lane.right))<2,'event must be centered in its named lane');
  if(i)assert(n.top>geometry.nodes[i-1].top,'events must remain in time order');
 }
 assert.equal(await page.getByRole('button',{name:'完整事件图',exact:true}).count(),0);
 return {nodes:expected.nodes.length,edges:expected.edges.length,lanes:graphLanes.length};
};
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('checkbox',{name:'包含本地合成测试'}).check();
 await page.locator('.event').first().waitFor();await assertFullLaneGraph(traces[0]);check('default-graph-matches-traceGraph-nodes-edges-and-lanes');
 await page.getByRole('button',{name:'毫秒时间线',exact:true}).click();assert.equal(await page.locator('.timeline-event').count(),traces[0].events.length);check('timeline-keeps-all-events');
 await page.getByRole('button',{name:'调用关系图',exact:true}).click();const node=page.locator('.event').nth(2);const eid=await node.getAttribute('data-event-id');await node.click();
 assert.equal(await page.locator('.detail details').evaluate(e=>e.open),false);await page.locator('.detail summary').click();
 await page.setViewportSize({width:680,height:900});await assertFullLaneGraph(traces[0]);
 assert(await page.locator('html').evaluate(e=>e.scrollWidth<=window.innerWidth),'graph must not widen the page');
 const scroll=await page.locator('.canvas-wrap').evaluate(e=>{e.scrollTop=160;e.scrollLeft=180;return {top:e.scrollTop,left:e.scrollLeft,width:e.clientWidth,scrollWidth:e.scrollWidth};});
 assert(scroll.scrollWidth>scroll.width&&scroll.left>0,'narrow graph must scroll horizontally inside its frame');
 const sticky=await page.locator('.canvas-wrap').evaluate(e=>({frame:e.getBoundingClientRect().top,header:e.querySelector('.lanes').getBoundingClientRect().top}));assert(Math.abs(sticky.header-sticky.frame)<=2,'lane headers must remain visible while scrolling');check('narrow-graph-scrolls-inside-page-with-sticky-lane-headings');
 const before=await page.locator('.event').count();const t=traces[0],last=t.events.at(-1);t.events.push({...last,event_id:'ui-approval-new',event_type:'approval.requested',sequence:last.sequence+1,timestamp:new Date().toISOString(),payload:{status:'pending_approval',source:'identity-audit'},parent_event_id:null});changed=true;
 await page.locator('.event[data-event-id="ui-approval-new"]').waitFor();assert.equal(await page.locator('.event').count(),before+1);assert.equal(await page.locator('.event.selected').getAttribute('data-event-id'),eid);assert.equal(await page.locator('.detail details').evaluate(e=>e.open),true);assert.deepEqual(await page.locator('.canvas-wrap').evaluate(e=>({top:e.scrollTop,left:e.scrollLeft})),{top:scroll.top,left:scroll.left});await assertFullLaneGraph(traces[0]);check('late-approval-auto-refresh-preserves-detail-and-both-scroll-axes');await shot('01-live-lane-graph-narrow');await page.setViewportSize({width:1440,height:900});
 for(const i of [1,2])await page.getByRole('checkbox',{name:'选择轨迹 界面合成样例 '+i,exact:true}).check();
 await page.getByRole('button',{name:'对比所选轨迹',exact:true}).click();await page.locator('.selection-preview').waitFor();assert(await page.getByRole('button',{name:'归纳候选 Skill',exact:true}).isDisabled());assert.match(await page.locator('.selection-preview').innerText(),/实际入选 1/);check('two-safe-cannot-generate-at-keep-point-nine');
 await page.getByRole('checkbox',{name:'选择轨迹 界面合成样例 3',exact:true}).check();await page.getByRole('button',{name:'对比所选轨迹',exact:true}).click();await page.locator('.selection-preview').waitFor();
 await page.getByRole('button',{name:'评估所选运行',exact:true}).click();await page.getByText('评估完成，可查看筛选结果',{exact:true}).waitFor();assert(jobPolls>0);check('local-assessment-progress');
 await page.getByRole('button',{name:'归纳候选 Skill',exact:true}).click();await page.locator('.candidate').waitFor();check('generation-binds-visible-selection-and-snapshot');
 await page.locator('.candidate details').filter({has:page.locator('summary',{hasText:'read_gov_document'})}).first().locator('summary').first().click();await page.getByRole('button',{name:/查看来源 1/}).click();await page.locator('.event.selected').waitFor();check('candidate-source-opens-exact-trace-event');
 await page.getByRole('combobox',{name:'记录来源',exact:true}).selectOption('real-history');await page.locator('section[aria-label="轨迹审计"][data-trace-id="'+real.summary.trace_id+'"]').waitFor();await page.locator('.event').first().waitFor();report.real_graph=await assertFullLaneGraph(real);await shot('02-real-history-call-graph');check('real-history-default-full-lane-graph');
 await page.getByRole('button',{name:'毫秒时间线',exact:true}).click();await shot('04-real-history-timeline');
 await page.setViewportSize({width:680,height:900});assert(await page.locator('main').evaluate(e=>e.scrollWidth<=680));check('narrow-layout');
 await page.evaluate(async sessionKey=>{window.dispose();const {mountTraceAudit}=await import('/view.mjs');window.dispose=mountTraceAudit(document.querySelector('main').shadowRoot,async(m,p={})=>{const r=await fetch('/api/'+m+'?p='+encodeURIComponent(JSON.stringify(p)));if(!r.ok)throw Error('request failed');return r.json();},{sessionKey,compact:true,followLatest:true});},traces[0].summary.session_key);
 assert.equal(await page.locator('.compact-filters').evaluate(e=>e.open),false);assert.equal(await page.locator('.bar > button').count(),2);
 await page.locator('.compact-filters > summary').click();await page.getByRole('checkbox',{name:'包含本地合成测试'}).check();await page.locator('.event').first().waitFor();await page.locator('.compact-filters > summary').click();
 assert.equal(await page.locator('.job-bar').innerText(),'');assert((await page.locator('.canvas-wrap').boundingBox()).y<450);await shot('05-compact-follow');check('compact-toolbar-collapsed-and-first-screen-graph');
 const addRun=(id,session=traces[0].summary.session_key)=>{const t=structuredClone(traces[0]);t.summary={...t.summary,trace_id:id,title:id,session_key:session,timestamp:new Date().toISOString()};for(const e of t.events)e.trace_id=id;traces.push(t);};
 addRun('ui-latest-4');await page.locator('section[aria-label="轨迹审计"][data-trace-id="ui-latest-4"]').waitFor();check('drawer-follows-new-run-in-same-session');
 await page.locator('.trace-row button[data-trace-id="ui-1"]').click();assert.equal(await page.getByRole('button',{name:'跟随最新运行',exact:true}).getAttribute('aria-pressed'),'false');
 addRun('ui-latest-5');await page.waitForTimeout(1800);assert.equal(await page.locator('section[aria-label="轨迹审计"]').getAttribute('data-trace-id'),'ui-1');
 await page.getByRole('button',{name:'跟随最新运行',exact:true}).click();await page.locator('section[aria-label="轨迹审计"][data-trace-id="ui-latest-5"]').waitFor();addRun('other-session-newest','unrelated');await page.waitForTimeout(1800);assert.equal(await page.locator('section[aria-label="轨迹审计"]').getAttribute('data-trace-id'),'ui-latest-5');check('manual-selection-pauses-follow-and-resume-is-session-scoped');
 const reads=calls.filter(c=>c.method==='detail').length;await page.evaluate(()=>window.dispose());await page.waitForTimeout(1800);assert.equal(calls.filter(c=>c.method==='detail').length,reads);check('dispose-stops-polling');assert.deepEqual(errors,[]);assert.equal(report.external_requests,0);
 report.passed=true;report.real_trace_id=real.summary.trace_id;
}catch(e){report.error=e.message;process.exitCode=1;}finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();server.close();console.log(JSON.stringify({passed:report.passed,error:report.error,report:path.join(out,'report.json')}));}
