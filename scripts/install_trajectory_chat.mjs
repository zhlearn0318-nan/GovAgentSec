import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export function installChat(root,restore=false){
 const dir=path.join(root,'dist/control-ui/assets'),files=readdirSync(dir).filter(n=>/^chat-page-.*\.js$/.test(n));
 if(files.length!==1)throw new Error('Expected one chat-page asset');
 const file=path.join(dir,files[0]),backup=file+'.govagentsec-chat-backup',text=readFileSync(file,'utf8');
 if(restore){if(!existsSync(backup))throw new Error('No chat backup');writeFileSync(file,readFileSync(backup));return {restored:true,file}}
 if(text.includes('govagentsec-chat-traces')){
  const revised=text.replace("import('/plugins/govagentsec/trajectory-native.mjs')", "import('/plugins/govagentsec/trajectory-native.mjs?v=chat-entry-2')");
  if(revised!==text)writeFileSync(file,revised);
  return {installed:true,changed:revised!==text,file};
 }
 const marker='return s`${this.renderPaneHeader(e)}${ZC(o)}`';
 if(text.split(marker).length!==2)throw new Error('Unsupported chat frontend structure; no files changed');
 if(existsSync(backup)&&readFileSync(backup,'utf8')!==text)throw new Error('Existing backup differs from installed chat frontend');
 const replacement='return s`${this.renderPaneHeader(e)}<govagentsec-chat-traces .client=${e.client} .enabled=${!!e.hello?.controlUiTabs?.some(t=>t.pluginId==="govagentsec-trajectory"&&t.id==="history")}></govagentsec-chat-traces>${ZC(o)}`';
 const load="\nimport('/plugins/govagentsec/trajectory-native.mjs?v=chat-entry-2').then(m=>m.defineChatEntry()).catch(()=>{});\n";
 if(!existsSync(backup))writeFileSync(backup,text,{flag:'wx'});
 writeFileSync(file,load+text.replace(marker,replacement));return {installed:true,changed:true,file,backup};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const root=process.argv.slice(2).find(v=>v!=='--restore')||path.join(process.env.APPDATA,'npm/node_modules/openclaw');console.log(JSON.stringify(installChat(root,process.argv.includes('--restore'))));}
