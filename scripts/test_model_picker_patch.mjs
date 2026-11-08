import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {patchModelPicker} from './fix_openclaw_model_picker.mjs';
const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
assert.equal(JSON.parse(readFileSync(path.join(host,'package.json'))).version,'2026.7.1-2');
const dir=path.join(host,'dist/control-ui/assets');
const source=readFileSync(path.join(dir,readdirSync(dir).find(f=>/^chat-page-.*\.js$/.test(f))),'utf8');
const patched=patchModelPicker(source);
assert.equal(patchModelPicker(patched),patched);
assert.throws(()=>patchModelPicker('unexpected host build'));
const start=patched.indexOf('willUpdate(e){if(e.has(`sessionKey`)&&this.state)');
const end=patched.indexOf('updated(){',start);
assert(start>0&&end>start);
const Pane=new Function('We',`return class {${patched.slice(start,end)}}`)(key=>key);
const pane=new Pane(),client={};let connections=0;
Object.assign(pane,{sessionKey:'agent:main:main',state:{sessionKey:'agent:main:main',connected:true,client},
  connectedClient:null,context:{gateway:{snapshot:{client}}},chatState:{restoreCreatedSessionComposer(){}},
  syncActiveBindings(){},applyGatewaySnapshot(){connections++;this.connectedClient=client;}});
pane.willUpdate(new Set(['sessionKey']));assert.equal(connections,1);
pane.willUpdate(new Set(['sessionKey']));assert.equal(connections,1);
pane.connectedClient=null;pane.state.connected=false;
pane.willUpdate(new Set(['sessionKey']));assert.equal(connections,1);
console.log('PASS: canonical session initializes model metadata once; offline remains disconnected; patch idempotent');
