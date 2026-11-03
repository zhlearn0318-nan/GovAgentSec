import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
// A narrow, reversible extension of OpenClaw's first-class plugin view registry.
export function install(root,restore=false){
 const dir=path.join(root,'dist/control-ui/assets');
 const names=readdirSync(dir).filter(n=>/^plugin-page-.*\.js$/.test(n));
 if(names.length!==1)throw new Error('Expected one plugin-page asset; inspect installed OpenClaw before adapting.');
 const file=path.join(dir,names[0]),backup=file+'.govagentsec-backup';
 const original=readFileSync(file,'utf8'),key='"govagentsec-trajectory/history"';
 if(restore){if(!existsSync(backup))throw new Error('No backup');writeFileSync(file,readFileSync(backup));return {restored:true,file};}
 if(original.includes(key))return {installed:true,changed:false,file};
 const lit=original.match(/import\{([^}]+)\}from"\.\/(lit-runtime-[^"]+)"/);
 const htmlName=lit?.[1].match(/(?:^|,)g as (\w+)/)?.[1];
 const marker='var f={';
 if(!htmlName||!original.includes(marker)||!original.includes('"logbook/logbook"'))throw new Error('Unsupported OpenClaw frontend shape; no files changed.');
 if(existsSync(backup)&&readFileSync(backup,'utf8')!==original)throw new Error('Existing backup does not match current asset.');
 if(!existsSync(backup))writeFileSync(backup,original,{flag:'wx'});
 const entry=`${key}:async()=>{const m=await import('/plugins/govagentsec/trajectory-native.mjs');return m.createView(${htmlName})},`;
 writeFileSync(file,original.replace(marker,marker+entry));
 return {installed:true,changed:true,file,backup};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const root=process.argv.slice(2).find(arg=>arg!=='--restore')||path.join(process.env.APPDATA,'npm/node_modules/openclaw');console.log(JSON.stringify(install(root,process.argv.includes('--restore'))));}
