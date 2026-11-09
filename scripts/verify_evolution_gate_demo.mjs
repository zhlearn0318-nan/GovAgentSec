import fs from 'node:fs';import path from 'node:path';import {evidence,python} from './lib/backlog-evidence.mjs';
const e=evidence('u16-evolution-gate-stability');
const design=fs.readFileSync('docs/U16_EVOLUTION_GATE_DEMO_STABILITY.md','utf8');if((design.match(/- \[x\]/g)??[]).length!==4)throw Error('U16_STAGE_A_INCOMPLETE');
const results={};
const run=(id,exe,args,env)=>results[id]=e.run(id,exe,args,env);
run('model-routing',python,['scripts/check_model_routing.py']);
run('isolated-release-loader',process.execPath,['scripts/verify_trajectory_release.mjs']);
run('evolution-and-gate-units',process.execPath,['--test','scripts/test_real_evolution.mjs','modules/govagentsec-trace/test/release-gate.test.mjs']);
run('gate-ui',process.execPath,['scripts/test_evolution_release_gate_ui.mjs']);
run('gate-live',process.execPath,['scripts/test_evolution_release_gate_live.mjs'],{GOV_U16_UI_EVIDENCE:path.join(e.out,'live')});
run('degradation',process.execPath,['scripts/test_evolution_gate_degradation.mjs'],{GOV_U16_EVIDENCE:e.out});
const links={};
for(const [id,result] of Object.entries(results)){
 const values=(result.stdout??'').split(/\r?\n/).flatMap(line=>{try{return[JSON.parse(line)];}catch{return[];}});
 const pointer=values.findLast(v=>v.report||v.root);
 if(pointer){const source=pointer.report??path.join(pointer.root,'report.json');if(fs.existsSync(source)){links[id]=source;fs.copyFileSync(source,path.join(e.out,id+'-report.json'));}}
}
if(links['gate-ui'])for(const file of ['gate-disabled.png','gate-test-only-no-confirm.png'])fs.copyFileSync(path.join(path.dirname(links['gate-ui']),file),path.join(e.out,file));
const matrix=JSON.parse(fs.readFileSync(path.join(e.out,'degradation-report.json')));
const liveFile=path.join(e.out,'live/report.json'),live=fs.existsSync(liveFile)?JSON.parse(fs.readFileSync(liveFile)):null;
e.finish({valid:matrix.passed&&live?.passed===true,source_reports:links,matrix,live,
 limitations:['合成断网/端点攻击夹具；本轮不重新标定论文阈值。','隔离 loader 测试显式发布合成技能；现网发布闸没有安装或发布调用。','会话 API 配置与本地评审分离；本轮没有云端连通性测试。']});
