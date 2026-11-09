// Test-only observer. Load only in the isolated U22 gateway, after creating
// its synthetic target. The fixed host's Docker filesystem bridge is unchanged.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const key=Symbol.for('govagentsec.u22.docker-read-counter');
const sha=value=>createHash('sha256').update(value).digest('hex');

function installCounter(targetFile){
  if(typeof targetFile!=='string'||!path.isAbsolute(targetFile))throw Error('U22_ABSOLUTE_TARGET_REQUIRED');
  const target=path.resolve(targetFile),stat=fs.lstatSync(target,{bigint:true});
  if(stat.isSymbolicLink()||!stat.isFile()||stat.ino<=0n||stat.dev<0n)throw Error('U22_REAL_FILE_IDENTITY_REQUIRED');
  const canonical=fs.realpathSync(target);
  const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
  if(!samePath(canonical,target))throw Error('U22_TARGET_ALIAS_REJECTED');
  const existing=globalThis[key];
  if(existing){
    if(!samePath(existing.target,canonical)||existing.ino!==stat.ino||existing.dev!==stat.dev)throw Error('U22_COUNTER_TARGET_CHANGED');
    return existing.state;
  }
  const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
  const hostVersion=JSON.parse(fs.readFileSync(path.join(host,'package.json'),'utf8')).version;
  if(hostVersion!=='2026.7.1-2')throw Error('U22_HOST_VERSION_UNVERIFIED');
  const hostSource=path.join(host,'dist/sandbox-DtTssSMH.js'),hostUrl=pathToFileURL(hostSource).href;
  const source=fs.readFileSync(hostSource,'utf8');
  if(!source.includes('async readPinnedFile(target) {')||!source.includes('return fs.readFileSync(opened.fd);'))throw Error('U22_HOST_READ_PATH_UNVERIFIED');
  const state={source:'fixed-host-docker-pinned-fd',host_version:hostVersion,host_source_sha256:sha(source),
    target_identity:{dev:String(stat.dev),ino:String(stat.ino)},reads:0,completed:0,bytes:0,hashes:[],ends:[],tool_results:[]};
  const originalRead=fs.readFileSync,originalStat=fs.fstatSync;
  fs.readFileSync=function(...args){
    let matched=false;
    if(typeof args[0]==='number'){
      const pinnedCaller=String(new Error().stack).split(/\r?\n/).some(line=>
        line.includes('SandboxFsBridgeImpl.readPinnedFile')&&(line.includes(hostUrl)||line.includes(hostSource)));
      if(pinnedCaller){
        try{
          const opened=originalStat.call(fs,args[0],{bigint:true});
          matched=opened.dev===stat.dev&&opened.ino===stat.ino;
        }catch{
          // The original call below remains responsible for reporting bad FDs.
        }
      }
    }
    if(matched)state.reads++;
    const value=originalRead.apply(this,args);
    if(matched){state.completed++;state.bytes+=value.byteLength;state.hashes.push(sha(value));}
    return value;
  };
  globalThis[key]={target:canonical,dev:stat.dev,ino:stat.ino,state};
  return state;
}

export default {id:'u22-read-counter',register(api){
  const state=installCounter(api.pluginConfig?.targetFile);
  api.on('agent_end',(event,ctx)=>state.ends.push({run_id:ctx.runId??event.runId,success:event.success}));
  api.on('after_tool_call',(event,ctx)=>state.tool_results.push({run_id:ctx.runId??event.runId,
    tool:event.toolName,tool_call_id:ctx.toolCallId,success:!event.error&&!event.result?.isError}));
  // Retain the existing isolated E2E's RPC name; this plugin replaces U14's
  // SRT counter and must not be loaded alongside it.
  api.registerGatewayMethod('u14.counter',({respond})=>respond(true,state),{scope:'operator.read'});
}};
