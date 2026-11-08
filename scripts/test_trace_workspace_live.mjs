import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const configPath=path.join(process.env.USERPROFILE,'.openclaw/openclaw.json');
const before=readFileSync(configPath,'utf8'),config=JSON.parse(before);
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
assert.equal(JSON.parse(readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
const {chromium}=await import(pathToFileURL(path.join(host,'node_modules/playwright-core/index.mjs')));
const out='local-validation/trace-ui/u2-live';mkdirSync(out,{recursive:true});
const report={passed:false,source:'real-openclaw-jsonl',checks:[]};
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1600,height:1050}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=`http://127.0.0.1:${config.gateway.port??18789}`;
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const url=base+'/plugin?plugin=protect-agent&id=govagentsec&section=audit';
  await page.goto(url+'#token='+encodeURIComponent(config.gateway.auth.token));
  const shell=page.locator('govagentsec-shell');
  await shell.getByRole('button',{name:'任务与轨迹',exact:true}).waitFor({timeout:60000});
  const rpc=(m,p={})=>page.locator('openclaw-app-shell').evaluate((e,{m,p})=>e.context.gateway.snapshot.client.request(m,p),{m,p});
  assert.equal((await rpc('govagentsec.trace.health')).content_mode,'hash');
  const list=await rpc('govagentsec.trace.list');
  const real=list.traces.filter(t=>t.source==='openclaw'&&t.trace_status==='complete');
  const paired=real.find(t=>t.task_confirmed&&real.some(o=>o.trace_id!==t.trace_id&&o.task_confirmed&&o.task_key===t.task_key));
  assert(paired,'Need two real confirmed same-task traces');
  const other=real.find(t=>t.trace_id!==paired.trace_id&&t.task_confirmed&&t.task_key===paired.task_key);
  report.trace_ids=[paired.trace_id,other.trace_id];
  const work=page.locator('govagentsec-workspace');
  await work.getByRole('checkbox',{name:'包含本地合成测试'}).waitFor();
  assert.equal(await work.getByRole('checkbox',{name:'包含本地合成测试'}).isChecked(),false);
  await work.locator(`.trace-row button[data-trace-id="${paired.trace_id}"]`).click();
  await work.locator('.event').first().waitFor();assert(await work.locator('.canvas svg path').count()>0);
  await page.getByRole('button',{name:'折叠侧边栏',exact:true}).click();
  assert(await shell.getByRole('button',{name:'审计中心',exact:true}).isVisible());
  await page.reload();await shell.getByRole('button',{name:'任务与轨迹',exact:true}).waitFor();
  report.checks.push('topbar_entries_survive_collapse_and_refresh');
  // Select the genuine run through the same event dispatched by workspace task rows.
  await page.evaluate(trace=>window.dispatchEvent(new CustomEvent('gov-inspect',{detail:{trace}})),paired);
  await shell.locator('.event').first().waitFor();assert(await shell.locator('.canvas svg path').count()>0);
  await shell.getByText('防护摘要：',{exact:false}).waitFor();
  await shell.locator('.canvas-wrap').scrollIntoViewIfNeeded();
  const graphBox=await shell.locator('.canvas-wrap').boundingBox();
  const firstNode=await shell.locator('.event').first().boundingBox();
  assert(firstNode.x>=graphBox.x&&firstNode.x+firstNode.width<=graphBox.x+graphBox.width+1,'drawer first event must be visible without horizontal scrolling');
  await page.screenshot({path:out+'/task-drawer.png'});
  report.checks.push('current_task_uses_jsonl_graph_and_protection_summary');
  await shell.getByRole('button',{name:'关闭面板'}).click();
  // Use the real comparison button, then reload its shareable URL.
  for(const t of [paired,other]) {
    const row=work.locator('.trace-row').filter({has:page.locator(`button[data-trace-id="${t.trace_id}"]`)});
    await row.getByRole('checkbox').check();
  }
  await work.getByRole('button',{name:'对比所选轨迹'}).click();await work.locator('table').waitFor();
  const link=new URL(page.url());assert.equal(link.searchParams.get('section'),'compare');
  assert.deepEqual(link.searchParams.getAll('trace_id'),report.trace_ids);
  await page.reload();await work.locator('table').waitFor();assert.equal(await work.locator('table tr').count(),3);
  await page.screenshot({path:out+'/compare-deep-link.png'});
  report.compare_url=link.pathname+link.search;
  report.checks.push('button_and_reloaded_compare_deep_link_match');
  await work.getByRole('button',{name:'候选 Skill',exact:true}).click();
  await work.getByRole('heading',{name:'候选 Skill 与步骤来源'}).waitFor();
  report.checks.push('candidate_entry_available');
  const orphan=list.traces.find(t=>t.missing_fields?.includes('orphan_result')&&t.source==='openclaw');
  assert(orphan,'Need captured orphan evidence');
  await page.goto(url+'&trace='+encodeURIComponent(orphan.trace_id));
  await work.getByText('工具结果缺少对应的开始事件',{exact:false}).waitFor();
  await page.screenshot({path:out+'/real-orphan.png'});
  report.orphan_trace=orphan.trace_id;report.checks.push('real_orphan_explicitly_ineligible');
  assert.equal(readFileSync(configPath,'utf8'),before);assert.deepEqual(errors,[]);
  report.config_unchanged=true;report.passed=true;
} catch(e){report.error=String(e.message).replaceAll(config.gateway.auth.token,'[REDACTED]');process.exitCode=1;}
finally {await browser.close();writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
