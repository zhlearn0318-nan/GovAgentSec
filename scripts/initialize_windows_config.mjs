// Fresh installs only. Existing credentials, model choices and settings are untouched.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export function initialConfig(state, model='qwen2.5:7b-instruct-q4_K_M') {
  return {
    gateway:{mode:'local',bind:'loopback',port:18789,auth:{mode:'token',token:randomBytes(32).toString('hex')},
      controlUi:{allowInsecureAuth:false,embedSandbox:'scripts'}},
    agents:{defaults:{workspace:path.join(state,'workspace'),model:{primary:'ollama/'+model}}},
    models:{providers:{ollama:{baseUrl:'http://127.0.0.1:11434',api:'ollama',apiKey:'ollama-local',
      models:[{id:model,name:model,input:['text'],contextWindow:32768,maxTokens:4096}]}}},
  };
}
export function initialize(state, validate) {
  const file=path.join(state,'openclaw.json');
  if(fs.existsSync(file))return {created:false,existing_preserved:true};
  const config=initialConfig(state);
  if(!validate(config).ok)throw Error('Fresh configuration does not match the pinned OpenClaw schema');
  fs.mkdirSync(state,{recursive:true});
  fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
  return {created:true,existing_preserved:false,model:'local-ollama',gateway:'loopback-token'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [host,state]=process.argv.slice(2);
  if(!host||!state)throw Error('Usage: node initialize_windows_config.mjs OPENCLAW_ROOT STATE_DIR');
  if(JSON.parse(fs.readFileSync(path.join(host,'package.json'),'utf8')).version!=='2026.7.1-2')throw Error('Pinned OpenClaw required');
  const {validateConfigObjectRaw}=await import(pathToFileURL(path.join(host,'dist/config/config.js')));
  console.log(JSON.stringify(initialize(path.resolve(state),validateConfigObjectRaw)));
}
