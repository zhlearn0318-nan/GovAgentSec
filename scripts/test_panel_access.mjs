import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import runtimePlugin from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/index.js';
import {identityStatus} from '../modules/govagentsec-ui/identity-status.mjs';
import {TaskLinks} from '../modules/trajectory-governance/task-links.mjs';
import {issuePageAccess,allowPage,issueCapability,allowCapability,injectCapability,registerUiAccess} from '../modules/govagentsec-ui/access.mjs';
import {createGuardEventStore} from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/guard-events.mjs';
function response(){return {writeHead(status,headers){this.status=status;this.headers=headers},end(body){this.body=body}};}

test('business badge distinguishes config, optional healthy probe, demo and ready OIDC',()=>{
  const ready={ok:true,payload:{ready:true,dependencies:{identity:{healthy:true}}}};
  const version={ok:true,payload:{oidc_enabled:true}};
  assert.equal(identityStatus('oidc',null,ready).label,'未配置组织身份（OIDC）');
  assert.equal(identityStatus('oidc',{ok:true,payload:{oidc_enabled:false}},ready).state,'unconfigured');
  assert.equal(identityStatus('oidc',version,{ok:false}).state,'oidc_unavailable');
  assert.equal(identityStatus('oidc',version,ready).label,'组织身份已启用');
  assert.equal(identityStatus('loopback_static_dev',version,ready).label,'演示身份（非生产）');
  assert.equal(identityStatus('oidc',{ok:true,payload:{oidc_enabled:true,demo_identity:true}},ready).label,'演示身份源（非生产）');
  for(const mode of ['disabled','oidc','loopback_static_dev'])assert.equal(identityStatus(mode,version,ready).executionEnabled,false);
});

test('authenticated management pages cannot invoke or approve with gateway/dev identity',async()=>{
  const original=globalThis.fetch;let outbound=0;globalThis.fetch=async()=>{outbound++;throw Error('must not reach service');};
  try {for(const identityMode of ['disabled','loopback_static_dev','oidc']){
    let handler;runtimePlugin.register({pluginConfig:{identityMode},registerHttpRoute:r=>handler=r.handler});
    const res=()=>({headers:{},setHeader(k,v){this.headers[k]=v},writeHead(code,headers){this.statusCode=code;Object.assign(this.headers,headers)},end(b){this.body=String(b)}});
    const page=res(),grant=issuePageAccess('/plugins/agentguard-runtime-security/panel');
    await handler({url:grant.url,method:'GET',socket:{remoteAddress:'127.0.0.1'},headers:{}},page);
    assert.equal(page.statusCode,200);const token=page.body.match(/let TOKEN="([^"]+)"/)[1];
    for(const target of ['evaluate','approvals/resolve','demo/gov-documents']){
      const denied=res();await handler({url:'/plugins/agentguard-runtime-security/api/'+target,method:'POST',socket:{remoteAddress:'127.0.0.1'},headers:{'x-agentguard-page-token':token}},denied);
      assert.equal(denied.statusCode,403);assert.equal(JSON.parse(denied.body).error.code,'BUSINESS_IDENTITY_REQUIRED');
    }
    assert.match(page.body,/id="run-action" disabled/);assert.match(page.body,/id="run-gov-documents" disabled/);
    assert.match(page.body,/未配置组织身份（OIDC）/);
  }assert.equal(outbound,0);}finally{globalThis.fetch=original;}
});

test('linked task approval also refuses developer identity without user delegation',async()=>{
  const links=new TaskLinks({}, {plugins:{entries:{'agentguard-runtime-security':{config:{identityMode:'loopback_static_dev',approvalPath:'unused'}}}}});
  const id='mcp-req-'+'a'.repeat(32);
  links.trace=()=>({events:[{event_type:'tool.ended',tool_call_id:'c',request_id:id,payload:{correlation_verified:true,tool:'agentguard-notices__read_gov_document'}}]});
  links.request=async()=>({});
  await assert.rejects(links.resolve({control_request_id:id,resolution:'approve'}),/逐用户 OIDC/);
});
test('management page grant RPC requires administrator scope',()=>{
  const calls=[];
  registerUiAccess({registerGatewayMethod:(...args)=>calls.push(args)});
  assert.equal(calls[0][0],'govagentsec.ui.open');
  assert.equal(calls[0][2].scope,'operator.admin');
});
test('management navigation grants bind full target and are single-use',()=>{
  const target='/plugins/protect-agent/panel?workspace=1';
  const grant=issuePageAccess(target);
  assert.equal(allowPage({url:grant.url,method:'GET'},response()),true);
  const denied=response();assert.equal(allowPage({url:grant.url,method:'GET'},denied),false);assert.equal(denied.status,401);
  assert.equal(allowPage({url:target,method:'GET'},response()),false);
  const changed=issuePageAccess(target).url.replace('workspace=1','workspace=2');
  assert.equal(allowPage({url:changed,method:'GET'},response()),false);
  for(const path of ['https://example.com/plugins/protect-agent/panel','//example.com/plugins/protect-agent/panel','/plugins/protect-agent/../nope'])assert.throws(()=>issuePageAccess(path));
});

test('page denials distinguish missing, expired, reused and mismatched grants without echoing tokens',()=>{
  const target='/plugins/aegis-admission/panel?embed=1';
  const check=(url,code)=>{const res=response();assert.equal(allowPage({url,method:'GET'},res),false);assert.equal(res.status,401);
    assert.equal(res.headers['X-GovAgentSec-Reason'],code);assert.match(res.body,new RegExp(code));
    assert.match(res.body,/需要管理员签发的一次性访问凭据/);assert.doesNotMatch(res.body,/gov_access=/);};
  check(target,'UI_PAGE_TOKEN_MISSING');
  const grant=issuePageAccess(target),now=Date.now;
  try {Date.now=()=>now()+61000;check(grant.url,'UI_PAGE_TOKEN_EXPIRED');} finally {Date.now=now;}
  const used=issuePageAccess(target);assert(allowPage({url:used.url,method:'GET'},response()));check(used.url,'UI_PAGE_TOKEN_USED');
  check(issuePageAccess(target).url.replace('embed=1','embed=2'),'UI_PAGE_TOKEN_TARGET_MISMATCH');
});
test('panel API capabilities are restricted to the issued routes',()=>{
  const token=issueCapability(['/protect-agent/ui/state']);
  assert.equal(allowCapability({url:'/protect-agent/ui/state',headers:{'x-govagentsec-panel':token}},response()),true);
  assert.equal(allowCapability({url:'/plugins/supply-chain-security/api/scan',headers:{'x-govagentsec-panel':token}},response()),false);
  assert.equal(allowCapability({url:'/protect-agent/ui/state'},response()),false);
});

test('expired page access offers recovery without weakening API authentication',()=>{
  const page=response();
  assert.equal(allowPage({url:'/plugins/aegis-admin/rules',method:'GET'},page),false);
  assert.equal(page.status,401);
  assert.match(page.headers['Content-Type'],/text\/html/);
  assert.match(page.body,/返回防护设置/);
  assert.match(page.headers['Content-Security-Policy'],/default-src 'none'/);
  const embedded=response();
  allowPage({url:'/plugins/aegis-admin/rules',method:'GET',headers:{'sec-fetch-dest':'iframe'}},embedded);
  assert.match(embedded.body,/重新加载/);
  assert.doesNotMatch(embedded.body,/<a /);
  const api=response();
  assert.equal(allowCapability({url:'/protect-agent/ui/state'},api),false);
  assert.equal(api.status,401);
  assert.match(api.headers['Content-Type'],/application\/json/);
  assert.equal(typeof JSON.parse(api.body).error,'string');
});
test('injected capability stays on the panel origin',async()=>{
  const html=injectCapability('<head></head>',['/protect-agent/ui/state']);
  const calls=[],ctx={URL,Headers,location:{href:'http://localhost:18789/plugins/protect-agent/panel'},window:{fetch:async(...args)=>calls.push(args)}};
  new Script(html.match(/<script>(.*?)<\/script>/s)[1]).runInNewContext(ctx);
  await ctx.window.fetch('/protect-agent/ui/state');
  await ctx.window.fetch('https://example.com/protect-agent/ui/state');
  assert.ok(calls[0][1].headers.get('X-GovAgentSec-Panel'));
  assert.equal(calls[1][1].headers,undefined);
});
test('live chain is scoped to the requested conversation',()=>{
  const store=createGuardEventStore();
  store.beginRun('run-a','digest-a');store.completeInput('run-a',{decision:'ALLOW'});
  store.beginRun('run-b','digest-b');store.completeInput('run-b',{decision:'BLOCK'});
  assert.equal(store.snapshot('digest-a').status,'running');
  assert.equal(store.snapshot('digest-b').status,'blocked');
  assert.equal(store.snapshot('unknown').status,'idle');
});
