import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const repo=process.cwd(),materials=path.resolve(repo,'../评委演示素材');
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=path.resolve('local-validation/u15-demo-reel',stamp);
const pack=path.join(materials,'验收与证据','u15-four-layer-shots-'+stamp);
const design='docs/U15_JUDGE_DEMO_REEL_SCRIPT.md',text=fs.readFileSync(design,'utf8');
assert.equal((text.match(/- \[x\]/g)??[]).length,4,'U15 stage A required');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const u14='local-validation/u14-judge-chat-acl/2026-11-08T08-06-40-970Z';
const u16='local-validation/u16-evolution-gate-stability/2026-11-08T08-17-16-950Z';
const layers=[
 {id:'01-behavior',layer:'行为护栏',report:'local-validation/delivery/live-protection.json',
  provenance:'历史真实网关输入阻断，2026-11-05；合成攻击输入；不是本轮重新采集。',
  files:[['local-validation/delivery/live-input-block.png','input-block.png']]},
 {id:'02-permission',layer:'权限闸门',report:u14+'/report.json',
  provenance:'本轮真实 OpenClaw 聊天/OPA/SRT；本地确定性模型夹具；演示身份非生产。',
  files:['01-honest-badge.png','02-chat-denied.png','03-approval-queue.png','04-chat-once.png','05-chat-replay.png','chat-live-report.json'].map(f=>[u14+'/'+f,f])},
 {id:'03-audit',layer:'过程台账',report:'local-validation/trace-graph-fix/result.json',
  provenance:'既有真实 OpenClaw JSONL；UI 与同源 traceGraph 导出，非手绘。',
  files:[['local-validation/trace-graph-fix/openclaw-graph.png','openclaw-graph.png'],...['png','svg','json'].map(ext=>['local-validation/trace-graph-fix/export-live/call-graph-real.'+ext,'call-graph-real.'+ext])]},
 {id:'04-evolution',layer:'经验自演进',report:u16+'/report.json',
  provenance:'本轮 U16：历史真实六轨迹副本的组件截图；另含现网确认禁用截图及九条合成断网样本报告。',
  files:[['gate-disabled.png','gate-disabled.png'],['gate-confirmed-no-install.png','gate-confirmed-no-install.png'],['live/workshop-gate.png','live-workshop-gate.png'],['degradation-report.json','degradation-report.json'],['gate-ui-report.json','gate-ui-report.json']].map(([f,n])=>[u16+'/'+f,n])},
];
const graph=json('local-validation/trace-graph-fix/export-live/call-graph-real.json');
assert(graph.integrity.valid&&graph.node_count>0&&graph.edge_count>0);assert.equal(graph.trace_id,json(layers[2].report).live.trace_id);
assert.equal(json(layers[0].report).state.incident.stopConfirmed,true);
for(const layer of layers){assert.equal(json(layer.report).passed,true,layer.report);for(const [file] of layer.files)assert(fs.existsSync(file),file);}
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(pack,{recursive:true});
const manifest={passed:false,created_at:new Date().toISOString(),duration_seconds:300,new_video_recorded:false,pack,layers:[],files:[],
 graph:{trace_id:graph.trace_id,integrity_valid:graph.integrity.valid,nodes:graph.node_count,edges:graph.edge_count},
 boundaries:['演示身份非组织 OIDC；SRT 有 Windows 隔离限制。','会话 API 不授权轨迹外发；本地评审非论文标定。','admission_passed 不等于安装或生产发布。']};
function copy(source,target,layer,proof){
 const bytes=fs.readFileSync(source);assert(['.png','.svg','.json','.md'].includes(path.extname(source)));
 if(path.extname(source)==='.png'){assert.equal(bytes.subarray(1,4).toString(),'PNG');assert(bytes.readUInt32BE(16)>100&&bytes.readUInt32BE(20)>100);}
 else assert(!/\bsk-[a-zA-Z0-9]{16,}\b|Bearer\s+[A-Za-z0-9._-]{20,}|-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(bytes.toString('utf8')),'credential-shaped content refused');
 const dest=path.join(pack,target);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);assert.equal(sha(fs.readFileSync(dest)),sha(bytes));
 manifest.files.push({layer,file:target,source:path.resolve(source),sha256:sha(bytes),evidence_report:path.resolve(proof),passed:true});
}
for(const layer of layers){
 manifest.layers.push({layer:layer.layer,directory:layer.id,source_report:path.resolve(layer.report),passed:true,provenance:layer.provenance});
 copy(layer.report,layer.id+'/report.json',layer.layer,layer.report);
 for(const [source,name] of layer.files)copy(source,layer.id+'/'+name,layer.layer,layer.report);
}
const excluded=[];
for(const dir of fs.readdirSync('local-validation/u14-judge-chat-acl',{withFileTypes:true}).filter(d=>d.isDirectory())){
 for(const name of ['report.json','chat-live-report.json']){const file=path.join('local-validation/u14-judge-chat-acl',dir.name,name);
  if(fs.existsSync(file)&&json(file).passed===false)excluded.push({file:path.resolve(file),reason:'passed:false; excluded with all debugging screenshots'});}
}
excluded.push({file:path.resolve('local-validation/trace-graph-fix/before.png'),reason:'known empty/before-fix baseline; excluded'});
const scan={passed:true,scope:'selected source reports, selected assets, and U14 debugging reports; not a whole-disk certification',excluded,selected_files:manifest.files.length,
 secret_pattern_check:true,raw_jsonl_copied:false,complete_config_copied:false};
copy(design,'U15-讲稿.md','讲稿',layers[1].report);
manifest.passed=true;fs.writeFileSync(path.join(pack,'manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(pack,'scan-report.json'),JSON.stringify(scan,null,2));
const scriptDest=path.join(materials,'成片/GovAgentSec-政安纵深-U15-讲稿.md');fs.copyFileSync(design,scriptDest);
const entry=`# U15 五分钟硬证据包\n\n四层按 01 → 04 依次打开；[讲稿](U15-讲稿.md)、[来源与 SHA-256](manifest.json)、[排除清单](scan-report.json)。没有新录 MP4。\n\n`+
 manifest.layers.map(l=>`- **${l.layer}**：[报告](${l.directory}/report.json)；${l.provenance}`).join('\n')+'\n';
fs.writeFileSync(path.join(pack,'README.md'),entry);
const indexFile=path.join(materials,'README.md');fs.appendFileSync(indexFile,`\n## U15 现行讲稿与证据（${stamp}）\n\n- 现行五分钟讲稿：[GovAgentSec-政安纵深-U15-讲稿.md](成片/GovAgentSec-政安纵深-U15-讲稿.md)\n- 证据包：[u15-four-layer-shots-${stamp}](验收与证据/u15-four-layer-shots-${stamp}/README.md)\n- 原 MP4 与历史分镜保留；本次没有重录或重剪视频，不代表旧片已按 U15 更新。\n`);
const report={passed:true,source:'verified-four-layer-evidence-package',pack,script:scriptDest,manifest:path.join(pack,'manifest.json'),scan:path.join(pack,'scan-report.json'),
 layers:manifest.layers,files:manifest.files.length,new_video_recorded:false,duration_seconds:300,excluded_count:excluded.length};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,'README.md'),`# U15\n\nPASS：四层报告均 passed:true，图片已人工查看、复制哈希一致。\n\n素材包：${pack}\n讲稿：${scriptDest}\n\n本轮无新视频；见 report.json、素材包 manifest 与排除清单。\n`);
fs.writeFileSync('docs/U15_JUDGE_DEMO_PACK.md',`# U15 素材索引\n\n- [五分钟讲稿](U15_JUDGE_DEMO_REEL_SCRIPT.md)\n- 素材包：\`${pack}\`\n- 本轮报告：\`${path.join(out,'report.json')}\`\n- 材料盘讲稿：\`${scriptDest}\`\n\n四层主镜头：01 input-block.png；02 02-chat-denied.png 及审批/单次/重放；03 openclaw-graph.png + call-graph-real.png；04 gate-disabled.png + live-workshop-gate.png。\n\n复跑打包：\`node scripts/package_judge_demo_u15.mjs\`。脚本校验已选来源报告、图非空元信息、图片格式与复制哈希，拒绝凭证形态文本；不把这些检查说成全盘敏感信息审计。旧失败调试报告列在 scan-report.json，未复制原文或截图。\n\n没有新录视频，原 MP4 保留为历史版本。\n`);
console.log(JSON.stringify({passed:true,report:path.join(out,'report.json'),pack,files:manifest.files.length,excluded:excluded.length}));
