import {mkdirSync,writeFileSync,realpathSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {dataRoot,minimalEnv} from './constants.mjs';
export function contained(root,target){const r=path.relative(root,target);return r!== '..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);}
export function nodeCommand(code){return `"${process.execPath}" -e "eval(Buffer.from('${Buffer.from(code).toString('base64')}','base64').toString())"`;}
export async function executeSpec(spec,{stdin,signal,timeoutMs=180000}={}) {
  return await new Promise((resolve,reject)=>{
    const child=spawn(spec.argv[0],spec.argv.slice(1),{env:spec.env,shell:false,windowsHide:true,stdio:['pipe','pipe','pipe'],signal});
    const chunks={stdout:[],stderr:[]};let bytes=0;
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;child.kill();},timeoutMs);
    for(const stream of ['stdout','stderr'])child[stream].on('data',b=>{bytes+=b.length;if(bytes>2*1024*1024)child.kill();else chunks[stream].push(b);});
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('close',code=>{clearTimeout(timer);resolve({code:code??1,stdout:Buffer.concat(chunks.stdout),stderr:Buffer.concat([...chunks.stderr,...(timedOut?[Buffer.from('SRT_EXECUTION_TIMEOUT')]:[])])});});
    child.stdin.on('error',()=>{});child.stdin.end(stdin);
  });
}
export async function createSrtBackend(params,{root=dataRoot()}={}) {
  if(process.platform!=='win32')throw Error('This integration requires native Windows srt');
  const workspace=realpathSync(params.workspaceDir);
  const id=createHash('sha256').update(params.scopeKey+'\0'+workspace).digest('hex').slice(0,20);
  mkdirSync(path.join(root,'settings'),{recursive:true});mkdirSync(path.join(root,'protected'),{recursive:true});
  const settings=path.join(root,'settings',id+'.json');
  // No profile read grant. Denies are deliberately narrow; native Windows srt
  // is deny-read/allow-write, not a mount namespace. This is exposed in the UI.
  const policy={network:{allowedDomains:[],deniedDomains:[],allowLocalBinding:false},filesystem:{
    allowWrite:[workspace],allowRead:[workspace],denyWrite:[path.join(workspace,'.git')],
    denyRead:[path.join(root,'protected'),path.join(root,'settings'),path.join(process.env.USERPROFILE,'.ssh'),path.join(process.env.USERPROFILE,'.openclaw','.env')]
  }};
  writeFileSync(settings,JSON.stringify(policy));
  const mapped=value=>{
    const relative=value==='/'||value==='/workspace'?'.':value?.startsWith('/workspace/')?value.slice(11):value??'.';
    const target=path.resolve(workspace,relative);
    if(!contained(workspace,target))throw Error('SANDBOX_PATH_OUTSIDE_WORKSPACE');
    let ancestor=target;while(!existsSync(ancestor)&&ancestor!==path.dirname(ancestor))ancestor=path.dirname(ancestor);
    if(!contained(workspace,realpathSync(ancestor)))throw Error('SANDBOX_SYMLINK_ESCAPE');
    return target;
  };
  const spec=(command,cwd=workspace)=>({argv:[process.execPath,fileURLToPath(new URL('./runner.mjs',import.meta.url)),settings,mapped(cwd),Buffer.from(command).toString('base64')],env:minimalEnv(),stdinMode:'pipe-closed'});
  const run=async(command,options={})=>executeSpec(spec(command),options);
  const fsCall=async(operation,args,signal)=>{
    const script=`const fs=require('fs');const a=${JSON.stringify(args)};${operation}`;
    const result=await run(nodeCommand(script),{signal});
    if(result.code!==0)throw Error('SRT_FILE_OPERATION_DENIED_OR_FAILED');
    return result.stdout;
  };
  return {id:'srt',runtimeId:'gov-srt-'+id,runtimeLabel:'srt Windows 0.0.81',workdir:workspace,workdirValidation:'backend',workdirRoots:[workspace],capabilities:{browser:false},
    validateWorkdir:async workdir=>{try{return mapped(workdir);}catch{return null;}},
    buildExecSpec:async({command,workdir,usePty,env})=>{
      if(usePty)throw Error('SRT_PTY_UNSUPPORTED');
      if(Object.keys(env??{}).some(k=>!['PATH','HOME','OPENCLAW_SHELL','LANG','LC_ALL','TERM'].includes(k)))throw Error('SRT_CUSTOM_ENV_UNSUPPORTED');
      // Native Windows exec commands retain PowerShell semantics inside srt.
      // PowerShell can reset a restricted user's C: location to C:\. Set it
      // explicitly inside the isolated process, before any untrusted command.
      const cwd=mapped(workdir);
      const script=`try { Set-Location -LiteralPath '${cwd.replaceAll("'","''")}' -ErrorAction Stop } catch { Write-Error 'SRT_WORKDIR_UNAVAILABLE'; exit 125 }\n${command}`;
      const encoded=Buffer.from(script,'utf16le').toString('base64');
      return spec(`powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encoded}`,cwd);
    },
    runShellCommand:async({script,args=[],stdin,signal,allowFailure})=>{
      if(args.length)throw Error('SRT_POSIX_SHELL_ARGS_UNSUPPORTED');
      const result=await run(script,{stdin,signal});
      if(result.code&&!allowFailure)throw Error('SRT_COMMAND_DENIED_OR_FAILED');return result;
    },
    createFsBridge:()=>({
      resolvePath:({filePath})=>({hostPath:mapped(filePath),relativePath:path.relative(workspace,mapped(filePath)),containerPath:mapped(filePath)}),
      readFile:async({filePath,signal})=>Buffer.from((await fsCall('process.stdout.write(fs.readFileSync(a.path).toString("base64"))',{path:mapped(filePath)},signal)).toString(),'base64'),
      writeFile:async({filePath,data,mkdir,signal})=>{await fsCall('if(a.mkdir)fs.mkdirSync(require("path").dirname(a.path),{recursive:true});fs.writeFileSync(a.path,Buffer.from(a.data,"base64"));',{path:mapped(filePath),data:Buffer.from(data).toString('base64'),mkdir},signal);},
      mkdirp:async({filePath,signal})=>{await fsCall('fs.mkdirSync(a.path,{recursive:true})',{path:mapped(filePath)},signal);},
      remove:async({filePath,recursive,force,signal})=>{const target=mapped(filePath);if(target===workspace)throw Error('Cannot remove session root');await fsCall('fs.rmSync(a.path,{recursive:a.recursive,force:a.force})',{path:target,recursive:!!recursive,force:!!force},signal);},
      rename:async({from,to,signal})=>{await fsCall('fs.renameSync(a.from,a.to)',{from:mapped(from),to:mapped(to)},signal);},
      stat:async({filePath,signal})=>JSON.parse((await fsCall('try{const s=fs.statSync(a.path);process.stdout.write(JSON.stringify({type:s.isDirectory()?"directory":s.isFile()?"file":"other",size:s.size,mtimeMs:s.mtimeMs}));}catch(e){if(e.code!=="ENOENT")throw e;process.stdout.write("null");}',{path:mapped(filePath)},signal)).toString())
    }),
    // Used only by the verification script to probe OS-level denies directly.
    probe:run,
  };
}
