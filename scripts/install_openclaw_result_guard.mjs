import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const marker='govagentsec-result-guard-v1';
export function adaptResultGuard(source,helperUrl){
  if(source.includes(marker))return source;
  const before='const result = await execute(toolCallId, executeParams, signal, onUpdate);';
  if(source.split(before).length!==2||!source.includes('function wrapToolWithBeforeToolCallHook(')||!source.includes('getRuntimeConfig'))throw Error('Unsupported tool wrapper; no changes made');
  return `import {executeWithResultGuard as govExecuteGuard,activateToolResultGate as govActivateGuard} from ${JSON.stringify(helperUrl)};\n/* ${marker} */govActivateGuard();\n`+source.replace(before,
    'const result = await govExecuteGuard(execute, [toolCallId, executeParams, signal, onUpdate], {...ctx, toolCallId, toolName: normalizedToolName}, (ctx?.config ?? getRuntimeConfig())?.plugins?.entries?.["protect-agent"]?.enabled === true);');
}
export function installResultGuard(root,restore=false){
  const dir=path.join(root,'dist');
  const names=readdirSync(dir).filter(n=>/^agent-tools\.before-tool-call-.*\.js$/.test(n));
  if(names.length!==1)throw Error('Unsupported host tool wrapper count');
  const file=path.join(dir,names[0]),backup=file+'.gov-result-backup';
  if(restore){if(!existsSync(backup))throw Error('Missing result guard backup');writeFileSync(file,readFileSync(backup));return {restored:true};}
  const source=readFileSync(file,'utf8');
  const helperUrl=new URL('../modules/protect-agent-group1/智能体安全/integrations/openclaw/plugin/result-gate.mjs',import.meta.url).href;
  const next=adaptResultGuard(source,helperUrl);
  if(next===source)return {changed:0};
  if(existsSync(backup)&&readFileSync(backup,'utf8')!==source)throw Error('Existing backup differs; inspect installed host before adapting');
  if(!existsSync(backup))writeFileSync(backup,source,{flag:'wx'});
  writeFileSync(file,next);return {changed:1,file};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(installResultGuard(process.argv.slice(2).find(x=>x!=='--restore')||path.join(process.env.APPDATA,'npm/node_modules/openclaw'),process.argv.includes('--restore'))));
