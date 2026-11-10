// Actual private identity worker, gateway handlers and sandbox registration.
// No running gateway configuration, business files or external APIs are used.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createRequire,registerHooks} from 'node:module';import {pathToFileURL} from 'node:url';
import {DemoIdentityBridge,registerDemoIdentity,requireBusinessPermission} from '../modules/agentguard-group2/integrations/openclaw_runtime_security_plugin/demo-identity.mjs';
const out=path.resolve(process.argv[2]??fs.readFileSync('.runtime/u25-evidence-path.txt','utf8').trim()+'/identity-rpc');fs.mkdirSync(out,{recursive:true});
const report={passed:false,source:'local-real-jwt-opa-public-rpc',production_oidc:false,checks:[],external_requests:0};
const passwords=Object.fromEntries([...fs.readFileSync('docs/OIDC_USAGE.md','utf8').matchAll(/\| (jingban|shenpi|shenji|weihu) \| ([^|]+?) \|/g)].map(m=>[m[1],m[2]]));
const bridge=new DemoIdentityBridge({root:path.join(out,'worker')});globalThis[Symbol.for('govagentsec.demoIdentity.bridge')]=bridge;
const methods=new Map(),registerGatewayMethod=(n,f)=>methods.set(n,f);registerDemoIdentity({registerGatewayMethod});
const rpc=async(name,params={})=>{let reply;await methods.get(name)({params,respond:(ok,data,error)=>{reply={ok,data,error};}});return reply;};
const login=async account=>{const r=await rpc('govagentsec.demoIdentity.login',{account,password:passwords[account]});assert(r.ok&&r.data.access_token);const claims=JSON.parse(Buffer.from(r.data.access_token.split('.')[1],'base64url'));assert.equal(claims.exp-claims.iat,1800);assert.equal(r.data.expires_at,claims.exp);assert(bridge.expiry._idleTimeout>1790000&&bridge.expiry._idleTimeout<=1800000,'worker timer must preserve the full login lifetime');return 'Bearer '+r.data.access_token;};
const check=name=>report.checks.push(name);
let hooks,oldConfig=process.env.OPENCLAW_CONFIG_PATH,selectPrototype;
try{
  assert.equal((await rpc('govagentsec.demoIdentity.login',{account:'jingban',password:passwords.jingban})).data.reason_code,'DEMO_IDENTITY_DISABLED');
  assert((await rpc('govagentsec.demoIdentity.enable')).data.enabled);check('gateway-admin-source-bootstrap-and-disabled-login');
  const before=await bridge.request('status');assert.equal(before.requests.length,0);assert.deepEqual(before.users.map(user=>user.account).sort(),['admin','jingban','shenji','shenpi','weihu']);
  for(const value of [{user:'office-test'},{account:'weihu'},{account:'weihu',password:'wrong'},{account:'weihu',password:passwords.weihu,roles:['workspace_maintainer']}]){
    const r=await rpc('govagentsec.demoIdentity.login',value);assert(!r.data?.access_token);
  }check('public-passwordless-wrong-and-role-injection-denied');
  const auditor=await login('shenji');assert.equal((await rpc('govagentsec.demoIdentity.status',{bearer:auditor})).data.execution_enabled,false);await assert.rejects(()=>requireBusinessPermission(auditor,'admission.manage'));assert.equal((await requireBusinessPermission(auditor,'audit.read')).user.id,'auditor-test');check('fourth-account-auditor-read-only');
  const officer=await login('jingban'),supervisor=await login('shenpi'),maintenance=await login('weihu');
  for(const [bearer,mode] of [[officer,'business_approval'],[supervisor,'business_approval'],[maintenance,'openclaw_native_only']]){
    assert.equal((await rpc('govagentsec.demoIdentity.status',{bearer})).data.permission_summary.approval_mode,mode);
  }
  const adminTask=(await rpc('govagentsec.demoIdentity.task_create',{directory:'A',bearer:maintenance})).data.task_id;
  const adminRead=await rpc('govagentsec.demoIdentity.task_read',{task_id:adminTask,document_id:'command_contacts',bearer:maintenance});
  assert.equal(adminRead.data.status,'executed_isolated');
  assert(!(await rpc('govagentsec.demoIdentity.status',{bearer:maintenance})).data.requests.some(r=>r.requester==='maintenance-test'&&r.status==='pending_approval'));
  check('high-tier-native-only-via-public-rpc-no-business-approval');
  for(const bearer of [undefined,'Bearer invalid',officer,supervisor])await assert.rejects(()=>requireBusinessPermission(bearer,'settings.manage'));
  assert.equal((await requireBusinessPermission(maintenance,'settings.manage')).user.id,'maintenance-test');
  assert(!(await rpc('govagentsec.demoIdentity.disable',{bearer:officer})).ok);assert((await rpc('govagentsec.demoIdentity.status')).data.enabled);check('maintenance-guard-and-source-disable-protected');
  const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');assert.equal(JSON.parse(fs.readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
  const requireHost=createRequire(path.join(host,'package.json'));
  const sdk=new Map(['openclaw/plugin-sdk/plugin-entry','openclaw/plugin-sdk/sandbox'].map(n=>[n,pathToFileURL(requireHost.resolve(n)).href]));
  hooks=registerHooks({resolve:(specifier,context,next)=>sdk.has(specifier)?{url:sdk.get(specifier),shortCircuit:true}:next(specifier,context)});
  const isolated=path.join(out,'isolated-config.json');const config='{"agents":{"defaults":{"sandbox":{"backend":"docker"}}}}\n';fs.writeFileSync(isolated,config);process.env.OPENCLAW_CONFIG_PATH=isolated;
  const {SandboxService}=await import('../modules/session-sandbox/service.mjs');selectPrototype=SandboxService.prototype.select;let writes=0;
  SandboxService.prototype.select=async function(engine){writes++;return {saved:true,engine};};
  const plugin=(await import('../modules/session-sandbox/index.mjs')).default;
  plugin.register({pluginConfig:{dataDir:path.join(out,'sandbox')},registerGatewayMethod,on(){}});
  for(const params of [{engine:'srt'},{engine:'srt',bearer:supervisor},{engine:'srt',bearer:officer},{engine:'srt',bearer:maintenance,roles:['workspace_maintainer']}])assert(!(await rpc('govagentsec.sandbox.select',params)).ok);
  assert.equal(writes,0);assert.equal(fs.readFileSync(isolated,'utf8'),config);check('sandbox-denial-zero-select-and-config-unchanged');
  assert((await rpc('govagentsec.sandbox.select',{engine:'docker',bearer:maintenance})).ok);assert.equal(writes,1);check('maintenance-reaches-existing-sandbox-service');
  SandboxService.prototype.select=selectPrototype;selectPrototype=null;
  assert((await rpc('govagentsec.demoIdentity.revoke',{bearer:maintenance})).ok);await assert.rejects(()=>requireBusinessPermission(maintenance,'settings.manage'));check('revoked-delegation-denied');
  report.passed=true;
}catch(e){report.error=e.message;process.exitCode=1;}finally{
  if(selectPrototype){const {SandboxService}=await import('../modules/session-sandbox/service.mjs');SandboxService.prototype.select=selectPrototype;}
  await bridge.request('disable').catch(()=>bridge.stop(true));hooks?.deregister();
  if(oldConfig===undefined)delete process.env.OPENCLAW_CONFIG_PATH;else process.env.OPENCLAW_CONFIG_PATH=oldConfig;
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks.length,error:report.error,report:path.join(out,'report.json')}));
}
