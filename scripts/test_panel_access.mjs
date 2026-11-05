import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {issuePageAccess,allowPage,issueCapability,allowCapability,injectCapability,registerUiAccess} from '../modules/govagentsec-ui/access.mjs';
import {createGuardEventStore} from '../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/guard-events.mjs';
function response(){return {writeHead(status){this.status=status},end(){}};}
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
test('panel API capabilities are restricted to the issued routes',()=>{
  const token=issueCapability(['/protect-agent/ui/state']);
  assert.equal(allowCapability({url:'/protect-agent/ui/state',headers:{'x-govagentsec-panel':token}},response()),true);
  assert.equal(allowCapability({url:'/plugins/supply-chain-security/api/scan',headers:{'x-govagentsec-panel':token}},response()),false);
  assert.equal(allowCapability({url:'/protect-agent/ui/state'},response()),false);
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
