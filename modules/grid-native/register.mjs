import path from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {requireBusinessPermission} from '../agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../..');
const defaultRoot=path.join(repo,'.runtime','native-grid');
const sha=text=>createHash('sha256').update(text).digest('hex');
const documents=['grid_curves','grid_records'];
const ID=/^[a-f0-9-]{36}$/;
const capabilities=globalThis[Symbol.for('govagentsec.grid.report-capabilities')]??=new Map();
const loadedPrompts=globalThis[Symbol.for('govagentsec.grid.loaded-prompts')]??=new Map();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function script(command,args,{timeout=30000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});
  let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('GRID_ANALYSIS_TIMEOUT'));},timeout);
  child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);
  child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(stdout):reject(Error('GRID_ANALYSIS_FAILED: '+stderr.slice(-600)));});
 });
}

export function loadedSkill(api,ctx={}){
 const agent=api.config?.agents?.list?.find(a=>a.id===(ctx.agentId||'main'));
 const workspace=agent?.workspace||api.config?.agents?.defaults?.workspace||path.join(homedir(),'.openclaw','workspace');
 const file=path.join(workspace,'skills','grid-anomaly-diagnosis','SKILL.md');
 if(!existsSync(file))throw Error('GRID_SKILL_NOT_INSTALLED');
 const text=readFileSync(file,'utf8'),version=text.match(/^version:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*$/m)?.[1];
 if(!/^name:\s*grid-anomaly-diagnosis\s*$/m.test(text)||!version||!text.includes('gov_analyze_grid')||!documents.every(id=>text.includes(id)))throw Error('GRID_SKILL_CONTRACT_INVALID');
 return {version,hash:sha(text),file,content:text};
}

function reportPath(root,id,file){if(!ID.test(id))throw Error('GRID_REPORT_NOT_FOUND');return path.join(root,id,file);}
function issueReport(root,id){
 const now=Date.now();for(const [k,v]of capabilities)if(v.expires<=now)capabilities.delete(k);
 if(capabilities.size>500)throw Error('GRID_REPORT_CAPACITY');
 const cap=randomBytes(32).toString('hex');capabilities.set(cap,{root,id,expires:now+2*3600000});
 return `/plugins/govagentsec/grid-reports/${id}?access=${cap}`;
}

export function librarySnapshot(api,root,identity){
 const skill=loadedSkill(api),dir=path.dirname(skill.file),json=file=>JSON.parse(readFileSync(file,'utf8'));
 let admission=null,release=null;
 if(existsSync(path.join(dir,'release.json'))){
  release=json(path.join(dir,'release.json'));
  if(release.artifact_hash!==skill.hash)release=null;
  if(release?.candidate_id&&ID.test(release.candidate_id)){
   const dataDir=api.config?.plugins?.entries?.['govagentsec-trace']?.config?.dataDir;
   const candidateFile=dataDir&&path.join(dataDir,'skill-workshop',release.candidate_id,'candidate.json');
   if(candidateFile&&existsSync(candidateFile)){
    const candidate=json(candidateFile),evidence=candidate.admission_passed;
    if(candidate.artifact_hash===skill.hash&&evidence?.artifact_hash===skill.hash&&evidence.response?.decision==='allow')admission=evidence;
   }
  }
 }
 if(!admission&&existsSync(path.join(dir,'admission.json'))){const baseline=json(path.join(dir,'admission.json'));if(baseline.artifact_hash===skill.hash&&baseline.response?.decision==='allow')admission=baseline;}
 const reports=existsSync(root)?readdirSync(root).filter(id=>ID.test(id)&&existsSync(reportPath(root,id,'receipt.json'))).map(id=>{
  try{const record=json(reportPath(root,id,'receipt.json'));if(record.subject_id!==identity.user.id&&!identity.permission_summary.can_assess)return null;
   return {id,created_at:record.created_at,session_key:record.session_key,skill_version:record.evidence.skill_version,summary:record.evidence.summary,source:record.source};
  }catch{return null;}
 }).filter(Boolean).sort((a,b)=>b.created_at.localeCompare(a.created_at)):[];
 return {skill:{name:'企业用电异常诊断与报告生成',id:'grid-anomaly-diagnosis',version:skill.version,hash:skill.hash,content:skill.content,status:admission?'admitted':'unverified',admission,release},reports};
}

export async function analyzeAuthorized({api,bridge,ctx,callId,params,root=defaultRoot,python=path.join(repo,'modules/agentguard-group2/.venv/Scripts/python.exe')}){
 if(!params||Object.keys(params).some(k=>k!=='period')||params.period!=='2024-09')throw Error('GRID_PERIOD_REQUIRED_2024_09');
 const authorized=await bridge.request('chat_grid_execute',{session_key:ctx.sessionKey,tool_call_id:callId,params});
 if(authorized?.status!=='ok'||!Array.isArray(authorized.documents)||!authorized.subject?.id)throw Error(authorized?.reason_code||'GRID_DATA_ACCESS_DENIED');
 const source=new Map(authorized.documents.map(d=>[d.document_id,d]));
 if(source.size!==2||documents.some(id=>typeof source.get(id)?.content!=='string'))throw Error('GRID_AUTHORIZED_INPUTS_INCOMPLETE');
 const skill=loadedSkill(api,ctx),loaded=loadedPrompts.get(ctx.sessionKey);
 if(!loaded||loaded.hash!==skill.hash||(loaded.runId&&loaded.runId!==authorized.run_id))throw Error('GRID_SKILL_PROMPT_NOT_LOADED_OR_CHANGED');
 const id=randomUUID(),directory=reportPath(root,id,'');mkdirSync(path.join(directory,'input'),{recursive:true});
 const files={grid_curves:'curves.csv',grid_records:'records.json'};
 for(const doc of documents){const item=source.get(doc);if(item.sha256&&sha(item.content)!==item.sha256)throw Error('GRID_DOCUMENT_HASH_CHANGED');writeFileSync(path.join(directory,'input',files[doc]),item.content);}
 // Manifest holds the public sample provenance; protected business contents come
 // exclusively from the identity worker's scoped, ticketed document reads above.
 writeFileSync(path.join(directory,'input','manifest.json'),readFileSync(path.join(repo,'modules/grid-demo/data/manifest.json')));
 await script(python,[path.join(repo,'modules/grid-demo/analysis.py'),'--data-dir',path.join(directory,'input'),'--output-dir',directory]);
 const report=JSON.parse(readFileSync(path.join(directory,'report.json'),'utf8'));
 const evidence={skill_version:skill.version,skill_hash:skill.hash,skill_name:'grid-anomaly-diagnosis',skill_prompt_loaded:true,document_ids:documents,report_id:id,period:params.period,summary:report.summary,
  documents:documents.map(document_id=>({document_id,sha256:sha(source.get(document_id).content),authorized:true})),report_sha256:sha(readFileSync(path.join(directory,'report.html')))};
 const record={id,created_at:new Date().toISOString(),subject_id:authorized.subject.id,session_key:ctx.sessionKey,tool_call_id:callId,source:'openclaw-native-tool',evidence};
 writeFileSync(path.join(directory,'receipt.json'),JSON.stringify(record,null,2));
 const reportUrl=issueReport(root,id),port=api.config?.gateway?.port||18789;
 const result={status:'completed',title:report.title,period:report.period,summary:report.summary,unit:report.unit,unit_note:report.unit_note,
  findings:report.meters.map(m=>({meter_id:m.meter_id,classification:m.classification_label,missing_dates:m.missing_dates,drop_dates:m.drop_dates,evidence:m.evidence,recommendation:m.recommendation})),
  source_notes:report.source_notes,report_url:`http://127.0.0.1:${port}${reportUrl}`,skill_version:skill.version,skill_hash:skill.hash,report_id:id};
 return {content:[{type:'text',text:JSON.stringify(result)}],details:{grid_evidence:evidence,skill:{name:'grid-anomaly-diagnosis',version:skill.version,hash:skill.hash,source:'native_prompt'},report_url:result.report_url}};
}

export function registerNativeGrid(api,bridge,{root=defaultRoot,python}={}){
 // The current approved skill is injected into the native OpenClaw model prompt.
 // This avoids giving the sandbox arbitrary host paths just to read SKILL.md.
 api.on?.('before_prompt_build',(event,ctx)=>{
  if(!ctx.sessionKey||(!/用电|电网|园区|grid_curves|grid_records|grid-anomaly-diagnosis/i.test(event.prompt||'')&&!loadedPrompts.has(ctx.sessionKey)))return;
  const skill=loadedSkill(api,ctx);
  loadedPrompts.set(ctx.sessionKey,{hash:skill.hash,version:skill.version,runId:ctx.runId,loaded_at:Date.now()});
  if(loadedPrompts.size>500)loadedPrompts.delete(loadedPrompts.keys().next().value);
  return {appendSystemContext:`当前已发布电网 Skill，版本 ${skill.version}，SHA256 ${skill.hash}。以下内容已由宿主从已准入的技能库读取，无需再用 read/exec 打开文件。遵循其中步骤，由 OpenClaw 自主调用已注册的受管工具。\n\n${skill.content}`};
 },{priority:90});
 api.registerTool?.(ctx=>({name:'gov_analyze_grid',label:'分析园区用电异常并生成报告',
  description:'使用当前登录身份，重新核验并读取登记资料 grid_curves 和已获批 grid_records，分析2024年9月A园区用电异常，生成可打开的HTML报告与图表。仅处理固定的匿名电网演示资料；不接受路径、身份、外发地址或代码。必须先使用gov_read_document读取两份资料；权限不足时先申请，不可绕过。',
  parameters:{type:'object',additionalProperties:false,properties:{period:{type:'string',enum:['2024-09']}},required:['period']},
  async execute(callId,params){try{return await analyzeAuthorized({api,bridge,ctx,callId,params,root,python});}catch(e){return {content:[{type:'text',text:'电网分析未完成：'+e.message}],isError:true,details:{reason:e.message}};}}
 }),{names:['gov_analyze_grid']});
 api.registerGatewayMethod?.('govagentsec.trace.gridLibrary',async({params,respond})=>{
  try{if(!params||Object.keys(params).some(k=>k!=='bearer'))throw Error('INVALID_REQUEST');
   const identity=await requireBusinessPermission(params.bearer,'audit.read');respond(true,librarySnapshot(api,root,identity));
  }catch(e){respond(false,undefined,{code:'GRID_LIBRARY_UNAVAILABLE',message:e.message});}
 },{scope:'operator.read'});
 const openReport=async({params,respond})=>{
  try{
   if(!params||Object.keys(params).some(k=>!['report_id','bearer'].includes(k)))throw Error('INVALID_REQUEST');
   const identity=await requireBusinessPermission(params.bearer,'audit.read');
   const receipt=JSON.parse(readFileSync(reportPath(root,params.report_id,'receipt.json'),'utf8'));
   if(receipt.subject_id!==identity.user.id&&!identity.permission_summary.can_assess)throw Error('BUSINESS_PERMISSION_DENIED');
   respond(true,{url:issueReport(root,params.report_id)});
  }catch(e){respond(false,undefined,{code:'GRID_REPORT_UNAVAILABLE',message:e.message});}
 };
 for(const method of ['govagentsec.grid.openReport','govagentsec.trace.gridOpenReport'])api.registerGatewayMethod?.(method,openReport,{scope:'operator.read'});
 api.registerHttpRoute?.({path:'/plugins/govagentsec/grid-native/view.mjs',match:'exact',auth:'plugin',handler:async(req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);res.end();return true;}
  res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(readFileSync(path.join(here,'view.mjs'),'utf8'));return true;
 }});
 api.registerHttpRoute?.({path:'/plugins/govagentsec/grid-reports',match:'prefix',auth:'plugin',handler:async(req,res)=>{
  const url=new URL(req.url,'http://local'),match=url.pathname.match(/^\/plugins\/govagentsec\/grid-reports\/([a-f0-9-]{36})$/),cap=capabilities.get(url.searchParams.get('access'));
  if(req.method!=='GET'||!match||!cap||cap.id!==match[1]||cap.root!==root||cap.expires<=Date.now()){
   res.writeHead(403,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end('<h1>报告链接已失效</h1><p>请在已登录的 OpenClaw 中打开“演进审计 → 当前 Skill 与分析报告”，重新打开报告。</p>');return true;
  }
  try{
   const file=reportPath(root,cap.id,'report.html'),record=JSON.parse(readFileSync(reportPath(root,cap.id,'receipt.json'),'utf8'));
   const html=readFileSync(file,'utf8');if(sha(html)!==record.evidence.report_sha256)throw Error('GRID_REPORT_CHANGED');
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'self'"});res.end(html);return true;
  }catch(e){res.writeHead(409,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end('<h1>报告不可用</h1><p>'+esc(e.message)+'</p>');return true;}
 }});
}
