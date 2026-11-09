import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {Script} from 'node:vm';
import runtimePlugin from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/index.js';
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const hostRequire=createRequire(path.join(process.env.APPDATA,'npm/node_modules/openclaw/package.json'));
assert.equal(hostRequire('./package.json').version,'2026.7.1-2');
const sdkUrl=pathToFileURL(hostRequire.resolve('openclaw/plugin-sdk/plugin-entry')).href;
const hook=registerHooks({resolve:(specifier,context,next)=>specifier==='openclaw/plugin-sdk/plugin-entry'?{url:sdkUrl,shortCircuit:true}:next(specifier,context)});
const {default:plugin}=await import('../modules/aegis/demo_web/openclaw_plugin/aegis-admission-ui/index.js');
hook.deregister();
import {issuePageAccess,allowPage,issueCapability,allowCapability} from '../modules/govagentsec-ui/access.mjs';

const active=new Map([['Bearer u25-audit','audit'],['Bearer u25-maintenance','maintenance']]);
globalThis[Symbol.for('govagentsec.demoIdentity.bridge')]={request:async(operation,{permission},bearer)=>{
  assert.equal(operation,'authorize');const role=active.get(bearer);
  if(!role)return {status:'blocked',reason_code:'BUSINESS_IDENTITY_REQUIRED'};
  if(['admission.manage','settings.manage'].includes(permission)&&role!=='maintenance')return {status:'blocked',reason_code:'BUSINESS_PERMISSION_DENIED'};
  return {status:'ok',user:{id:role},permission_summary:{can_edit_rules:role==='maintenance'}};
}};
const routes=new Map();plugin.register({registerHttpRoute:r=>routes.set(r.path,r.handler)});
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(code,headers){this.statusCode=code;Object.assign(this.headers,headers);},end(value){this.body=String(value);}});
async function page(path,bearer){const grant=await issuePageAccess(path,bearer),res=response();await routes.get(path)({url:grant.url,method:'GET',headers:{}},res);return res;}
async function post(path,token,body){const req=Readable.from([Buffer.from(JSON.stringify(body))]);Object.assign(req,{url:path,method:'POST',headers:{'content-type':'application/json','x-aegis-demo-token':token,'x-aegis-token':token,'x-aegis-action':'create'}});const res=response();await routes.get(path)(req,res);return res;}

test('page issuance requires business identity and binds revocable delegation',async()=>{
  await assert.rejects(()=>issuePageAccess('/plugins/aegis-admin/rules'),/BUSINESS_IDENTITY_REQUIRED/);
  const grant=await issuePageAccess('/plugins/aegis-admin/rules','Bearer u25-audit');active.delete('Bearer u25-audit');
  const res=response();assert.equal(await allowPage({url:grant.url,method:'GET',headers:{}},res),false);assert.equal(res.statusCode,401);assert.doesNotMatch(res.body,/Bearer u25/);
  active.set('Bearer u25-audit','audit');
});
test('read-only rules, MCP and upload panels reject forged write API requests',async()=>{
  for(const path of ['/plugins/aegis-admin/rules','/plugins/aegis-admin/mcp','/plugins/aegis-admission/panel']){
    const res=await page(path,'Bearer u25-audit');assert.equal(res.statusCode,200);assert.match(res.body,/<fieldset disabled/);
    const token=res.body.match(/token="([a-f0-9]{64})"/)[1];
    for(const operation of ['upsert_rule','delete_rule','toggle_rule','admit_mcp','preview_mcp','resolve_review']){
      const denied=await post('/plugins/aegis-admin/api',token,{operation,actor:'maintenance',rule:{id:'U25_MUST_NOT_WRITE'},resolution:'approve',sequence:1});
      assert.equal(denied.statusCode,403,operation);assert.equal(JSON.parse(denied.body).error.code,'BUSINESS_PERMISSION_DENIED');
    }
    assert.equal((await post('/plugins/aegis-admission/api/run',token,{source_kind:'zip',target_name:'u25-must-not-create'})).statusCode,403);
  }
});
test('maintenance controls visible, logout invalidates all previously opened panel credentials',async()=>{
  const res=await page('/plugins/aegis-admin/rules','Bearer u25-maintenance');assert.equal(res.statusCode,200);assert.doesNotMatch(res.body,/<fieldset disabled/);
  const token=res.body.match(/token="([a-f0-9]{64})"/)[1];active.delete('Bearer u25-maintenance');
  for(const operation of ['list_rules','upsert_rule','list_reviews'])assert.equal((await post('/plugins/aegis-admin/api',token,{operation})).statusCode,403);
  active.set('Bearer u25-maintenance','maintenance');
});
test('shared panel capability verifies delegation on every read',async()=>{
  const token=issueCapability(['/protect-agent/ui/state'],{bearer:'Bearer u25-audit'}),req={url:'/protect-agent/ui/state',headers:{'x-govagentsec-panel':token}};
  assert.equal(await allowCapability(req,response()),true);active.delete('Bearer u25-audit');assert.equal(await allowCapability(req,response()),false);active.set('Bearer u25-audit','audit');
});

test('review page script parses and only maintenance gets review controls',async()=>{
  for(const bearer of ['Bearer u25-audit','Bearer u25-maintenance']){
    const res=await page('/plugins/aegis-admin/reviews',bearer);assert.equal(res.statusCode,200);
    for(const match of res.body.matchAll(/<script>([\s\S]*?)<\/script>/g))new Script(match[1]);
    assert.match(res.body,/Skill \/ MCP 人工复核/);assert.match(res.body,/复核通过后需重新检查/);
    assert(res.body.includes('const canManage='+String(bearer.endsWith('maintenance'))));
  }
});

test('non-maintenance cannot use shared capability for scan writes',async()=>{
  const token=issueCapability(['/plugins/supply-chain-security/api/scan'],{bearer:'Bearer u25-audit'});
  const req={url:'/plugins/supply-chain-security/api/scan',method:'POST',headers:{'x-govagentsec-panel':token}};
  assert.equal(await allowCapability(req,response()),false);
});
test('runtime legacy panel tokens expire with delegation and notifications require maintenance',async()=>{
  let handler;runtimePlugin.register({pluginConfig:{identityMode:'disabled'},registerHttpRoute:r=>handler=r.handler});
  const grant=await issuePageAccess('/plugins/agentguard-runtime-security/panel','Bearer u25-audit');
  const res=response();await handler({url:grant.url,method:'GET',socket:{remoteAddress:'127.0.0.1'},headers:{}},res);
  assert.equal(res.statusCode,200);const token=res.body.match(/let TOKEN="([a-f0-9]+)"/)[1];
  const req={url:'/plugins/agentguard-runtime-security/api/approvals/notify',method:'POST',socket:{remoteAddress:'127.0.0.1'},headers:{'x-agentguard-page-token':token}};
  const denied=response();await handler(req,denied);assert.equal(denied.statusCode,403);
  const bootstrap={...req,url:'/plugins/agentguard-runtime-security/api/bootstrap',method:'GET'};const valid=response();await handler(bootstrap,valid);assert.equal(valid.statusCode,200);
  const refreshed=JSON.parse(valid.body).page_token;active.delete('Bearer u25-audit');
  for(const candidate of [token,refreshed]){const expired=response();await handler({...bootstrap,headers:{'x-agentguard-page-token':candidate}},expired);assert.equal(expired.statusCode,401);}
  active.set('Bearer u25-audit','audit');
});
