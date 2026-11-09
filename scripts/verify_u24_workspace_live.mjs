// Read-only live workspace inspection. No model calls, identity changes or configuration writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';import {configPath,sha,version} from './lib/config-recovery.mjs';
import {goWorkspace} from './lib/identity-ui.mjs';
import {traceGraph,graphLanes} from '../modules/govagentsec-trace/view-model.mjs';
const out=path.resolve(process.env.GOV_U24_LIVE_EVIDENCE??'local-validation/u24-workspace-live/'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});version();const before=fs.readFileSync(configPath()),config=JSON.parse(before),base='http://127.0.0.1:'+config.gateway.port;
const report={passed:false,source:'real-current-openclaw-readonly-ui',version:'2026.7.1-2',external_requests:0,checks:[],screenshots:[]};let browser;
const check=(name,details={})=>report.checks.push({name,...details});
try{
  let reachable=false;for(let i=0;i<30;i++){try{const r=await fetch(base+'/plugins/govagentsec/welcome',{signal:AbortSignal.timeout(1000)});if(r.status===200){reachable=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(reachable,'GATEWAY_WELCOME_NOT_READY_AFTER_30S');
  const welcome=await fetch(base+'/plugins/govagentsec/welcome');assert.equal(welcome.status,200);assert((await welcome.text()).includes('政安纵深'));check('anonymous-welcome-has-no-private-data');
  const audit=await fetch(base+'/plugins/govagentsec/trajectories');assert.equal(audit.status,401);check('anonymous-audit-denied');
  const {chromium}=await import(pathToFileURL(path.join(process.env.APPDATA,'npm/node_modules/openclaw/node_modules/playwright-core/index.mjs')));
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(['127.0.0.1','localhost','[::1]'].includes(u.hostname))return route.continue();report.external_requests++;return route.abort();});page.on('pageerror',e=>errors.push(e.message));
  const shot=async name=>{await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});report.screenshots.push(name+'.png');};
  await page.goto(base+'/plugins/govagentsec/welcome#token='+encodeURIComponent(config.gateway.auth.token));await page.getByRole('heading',{name:'政安纵深',exact:true}).waitFor();assert.equal(new URL(page.url()).hash,'');await shot('01-welcome');
  await page.getByRole('button',{name:'进入工作区',exact:true}).click();await page.waitForFunction(()=>!!document.querySelector('openclaw-app-shell')?.context?.gateway?.snapshot?.client,null,{timeout:60000});
  const work=page.locator('govagentsec-workspace'),shell=page.locator('govagentsec-shell');
  const rpc=(method,params={})=>page.locator('openclaw-app-shell').evaluate((el,{method,params})=>el.context.gateway.snapshot.client.request(method,params),{method,params});
  await work.getByRole('heading',{name:'登录演示身份',exact:true}).waitFor();await shot('02-business-login');check('welcome-enters-gateway-authenticated-business-login');
  assert.equal(await shell.locator('.dock button').count(),1);assert.equal(await shell.getByRole('button',{name:'查看过程',exact:true}).isVisible(),true);check('single-persistent-process-entry');
  await goWorkspace(page,'home');await work.getByRole('heading',{name:'工作台',exact:true}).waitFor();await work.getByText('正在读取本机记录…',{exact:true}).waitFor({state:'hidden'});await shot('03-task-workbench');
  await goWorkspace(page,'admission');await work.getByRole('button',{name:'MCP 接入',exact:true}).click();await work.frameLocator('iframe').getByRole('button',{name:'检查配置',exact:true}).waitFor();await shot('04-mcp-admission');check('authenticated-mcp-template-with-preview');
  await goWorkspace(page,'settings');await work.getByRole('button',{name:'准入规则',exact:true}).click();await work.frameLocator('iframe').getByRole('heading',{name:'自定义规则',exact:true}).waitFor();await work.getByRole('button',{name:'返回防护设置',exact:true}).click();await work.getByRole('heading',{name:'实际防护状态',exact:true}).waitFor();check('settings-subpanel-auth-and-one-step-return');await shot('05-settings');
  const rows=await rpc('govagentsec.trace.list',{});let complete;
  for(const row of rows.traces.filter(t=>t.source==='openclaw'&&t.trace_status==='complete')){const d=await rpc('govagentsec.trace.detail',{trace_id:row.trace_id});if(d.events.some(e=>e.event_type==='tool.started')){complete=row;break;}}assert(complete,'REAL_COMPLETE_TRACE_WITH_TOOL_REQUIRED');
  await shell.evaluate((el,trace)=>el.open(trace),complete);const graph=shell.getByRole('region',{name:'轨迹审计',exact:true});await graph.locator('.event[data-event-id]').first().waitFor();
  const detail=await rpc('govagentsec.trace.detail',{trace_id:complete.trace_id});assert.equal(detail.integrity.valid,true);const expectedGraph=traceGraph(detail);
  assert.deepEqual(await graph.locator('.event[data-event-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.eventId)),expectedGraph.nodes.map(n=>n.event_id));
  assert.deepEqual(await graph.locator('.canvas svg path').evaluateAll(edges=>edges.map(e=>[e.dataset.from,e.dataset.to,e.dataset.kind])),expectedGraph.edges.map(e=>[e.from,e.to,e.kind]));
  assert.deepEqual(await graph.locator('.lanes > span').allTextContents(),graphLanes);assert.equal(await graph.getByRole('button',{name:'完整事件图',exact:true}).count(),0);
  const laneGeometry=await graph.locator('.canvas').evaluate(canvas=>{
    const lanes=[...canvas.querySelectorAll('.lanes > span')].map(e=>e.getBoundingClientRect());
    return [...canvas.querySelectorAll('.event')].map(e=>{const r=e.getBoundingClientRect(),lane=lanes[Number(e.dataset.lane)];return {lane:Number(e.dataset.lane),inside:r.left>=lane.left&&r.right<=lane.right,centered:Math.abs(r.left+r.right-lane.left-lane.right)<2};});
  });
  assert(laneGeometry.every((n,i)=>n.lane===expectedGraph.nodes[i].lane&&n.inside&&n.centered));
  const assertWideLanesVisible=async()=>{
    const visible=await graph.locator('.canvas-wrap').evaluate(e=>{
      const frame=e.getBoundingClientRect();return {width:e.clientWidth,scrollWidth:e.scrollWidth,lanes:[...e.querySelectorAll('.lanes > span')].map(l=>{const r=l.getBoundingClientRect();return {name:l.textContent,visible:r.left>=frame.left-1&&r.right<=frame.right+1};})};
    });
    assert.equal(visible.lanes.length,graphLanes.length);assert(visible.lanes.every(l=>l.visible),'all lane headings must fit in the default wide panel');
    assert(visible.scrollWidth<=visible.width+1,'wide panel must show all graph lanes without horizontal scrolling');return visible;
  };
  await shell.getByRole('button',{name:'收窄面板',exact:true}).waitFor();assert((await shell.locator('.drawer').boundingBox()).width>=1200);
  const wideGraph=await assertWideLanesVisible();
  await shot('06-current-real-call-graph');check('default-real-graph-matches-jsonl-and-all-lanes-visible',{trace_id:complete.trace_id,nodes:expectedGraph.nodes.length,edges:expectedGraph.edges.length,lanes:graphLanes,hash_valid:true,width:wideGraph.width});
  await shell.getByRole('button',{name:'收窄面板',exact:true}).click();await shell.getByRole('button',{name:'展开查看',exact:true}).waitFor();
  const collapsedGraph=await graph.locator('.canvas-wrap').evaluate(e=>{e.scrollLeft=180;return {width:e.clientWidth,scrollWidth:e.scrollWidth,left:e.scrollLeft};});
  assert(collapsedGraph.scrollWidth>collapsedGraph.width&&collapsedGraph.left>0);assert.equal(await graph.getAttribute('data-trace-id'),complete.trace_id);
  await shot('06-current-real-call-graph-collapsed');check('drawer-can-narrow-with-contained-graph-scroll',collapsedGraph);
  await shell.getByRole('button',{name:'展开查看',exact:true}).click();await shell.getByRole('button',{name:'收窄面板',exact:true}).waitFor();await assertWideLanesVisible();
  assert.equal(await graph.getAttribute('data-trace-id'),complete.trace_id);
  assert.deepEqual(await graph.locator('.event[data-event-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.eventId)),expectedGraph.nodes.map(n=>n.event_id));
  assert.deepEqual(await graph.locator('.canvas svg path').evaluateAll(edges=>edges.map(e=>[e.dataset.from,e.dataset.to,e.dataset.kind])),expectedGraph.edges.map(e=>[e.from,e.to,e.kind]));
  check('drawer-expand-preserves-selected-trace-and-full-graph');
  await page.setViewportSize({width:680,height:1000});
  const narrowGraph=await graph.locator('.canvas-wrap').evaluate(e=>{e.scrollLeft=180;return {width:e.clientWidth,scrollWidth:e.scrollWidth,left:e.scrollLeft};});
  assert(narrowGraph.scrollWidth>narrowGraph.width&&narrowGraph.left>0);assert(await page.locator('html').evaluate(e=>e.scrollWidth<=window.innerWidth));
  await shot('06-current-real-call-graph-narrow');check('real-graph-narrow-scroll-is-contained',narrowGraph);await page.setViewportSize({width:1500,height:1000});
  await graph.getByRole('button',{name:'毫秒时间线',exact:true}).click();await graph.locator('.timeline').waitFor();assert.equal(await graph.locator('.timeline-event').count(),detail.events.length);await shot('07-real-timeline');
  await shell.getByRole('button',{name:'关闭面板',exact:true}).click();await goWorkspace(page,'audit');
  const packs=await rpc('govagentsec.trace.historyPacks',{});assert(packs.packs.length>0);await work.getByRole('combobox',{name:'记录来源',exact:true}).selectOption(packs.packs[0].id);await work.getByRole('button',{name:'候选 Skill',exact:true}).click();await work.getByRole('heading',{name:'候选 Skill 与步骤来源',exact:true}).waitFor();await work.getByText(/历史记录只读/).first().waitFor();await shot('08-historical-real-candidate');check('historical-pack-candidate-readonly',{pack_id:packs.packs[0].id});
  report.page_errors=errors;assert.deepEqual(errors,[]);assert.equal(report.external_requests,0);report.passed=true;
}catch(e){report.error=String(e.message).replaceAll(config.gateway.auth.token,'[REDACTED]');process.exitCode=1;const p=browser?.contexts()[0]?.pages()[0];await p?.screenshot({path:path.join(out,'FAILED.png'),fullPage:true}).catch(()=>{});}finally{await browser?.close();report.config_sha256=sha(before);report.config_unchanged=sha(before)===sha(fs.readFileSync(configPath()));if(!report.config_unchanged){report.passed=false;process.exitCode=1;}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,report:path.join(out,'report.json'),error:report.error}));}
