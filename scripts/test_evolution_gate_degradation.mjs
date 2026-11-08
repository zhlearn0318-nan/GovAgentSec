import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {TraceStore} from '../modules/govagentsec-trace/store.mjs';
import {createCalibrationFixtures,CALIBRATION_VERSION} from '../modules/govagentsec-trace/calibration-fixtures.mjs';
import {OllamaLocalJudge} from '../modules/govagentsec-trace/local-judges.mjs';
import {assess} from '../modules/govagentsec-trace/scoring.mjs';
import {loadRouting} from '../modules/model-routing/routing.mjs';
const out=path.resolve(process.env.GOV_U16_EVIDENCE??'local-validation/u16-evolution-gate-stability/'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});const originalFetch=globalThis.fetch;
const report={passed:false,source:'synthetic-degradation-matrix',synthetic:true,external_requests:0,installed:false,rows:[],checks:[]};
try{
 const policy=loadRouting();assert.equal(policy.external_review_enabled,false);
 const store=new TraceStore(path.join(out,'degradation-traces'));const fixtures=createCalibrationFixtures(store);
 // Fault injection before the transport; no real trace or network required.
 globalThis.fetch=async url=>{if(!/^http:\/\/(127\.0\.0\.1|\[::1\])(?::|\/)/.test(String(url)))report.external_requests++;throw Error('U16_ALL_NETWORK_DISABLED');};
 for(const fixture of fixtures){
  const judge=new OllamaLocalJudge({allowSynthetic:true,timeoutMs:100});
  const result=await assess(store.read(fixture.trace_id),judge,{allowSynthetic:true,t_star:.75,calibration_version:CALIBRATION_VERSION,calibrated:false});
  if(fixture.trace_id.endsWith('missing_tool_result'))assert.equal(result.quality.Q,null);
  else{assert.equal(judge.lastMode,'heuristic-fallback');assert.match(result.source,/启发式/);}
  report.rows.push({trace_id:fixture.trace_id,synthetic:true,S:result.safety.S,Q:result.quality.Q,decision:result.safety.decision,reason:result.safety.reason,source:result.source,mode:judge.lastMode});
 }
 assert(report.rows.filter(r=>r.decision==='pass').length>=2);assert(report.rows.filter(r=>r.decision==='quarantine').length>=2);
 assert(new Set(report.rows.map(r=>r.Q)).size>2);report.checks.push({id:'offline-labelled-fallback-and-missing-quarantine',passed:true});
 const wrong=path.join(out,'external-review-rejected.fixture.json');fs.writeFileSync(wrong,JSON.stringify({...policy,external_review_enabled:true}));assert.throws(()=>loadRouting(wrong));
 report.checks.push({id:'external-review-config-fail-closed',passed:true});
 assert.throws(()=>new OllamaLocalJudge({endpoint:'https://api.deepseek.com'}));
 const tampered=new OllamaLocalJudge({allowSynthetic:true});tampered.endpoint='https://api.deepseek.com';await tampered.review(store.read(fixtures[0].trace_id));
 assert.equal(tampered.lastMode,'heuristic-fallback');assert.equal(report.external_requests,0);
 report.checks.push({id:'runtime-endpoint-tamper-no-transport',passed:true});report.calibration_version=CALIBRATION_VERSION;report.passed=true;
}catch(e){report.error=e.message;process.exitCode=1;}finally{
 globalThis.fetch=originalFetch;fs.writeFileSync(path.join(out,'degradation-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:report.passed,report:path.join(out,'degradation-report.json'),error:report.error}));
}
