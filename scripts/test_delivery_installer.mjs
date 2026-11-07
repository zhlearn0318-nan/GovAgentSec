import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync,readdirSync,mkdirSync,mkdtempSync} from 'node:fs';
import path from 'node:path';
import {installDelivery,restoreDelivery} from './install_delivery.mjs';

test('all delivery adapters validate, install and restore the actual host baseline',()=>{
  const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
  mkdirSync('local-validation/installer-checks',{recursive:true});
  const folder=mkdtempSync('local-validation/installer-checks/check-');
  const root=path.join(folder,'host'),backup=path.join(folder,'backup');
  const assets='dist/control-ui/assets';
  const files=['dist/control-ui/index.html',
    ...readdirSync(path.join(host,assets)).filter(n=>/^(index-|plugin-page-|overview-page-|skills-page-|zh-CN-).*\.js$/.test(n)).map(n=>assets+'/'+n),
    ...readdirSync(path.join(host,'dist')).filter(n=>/^agent-tools\.before-tool-call-.*\.js$/.test(n)).map(n=>'dist/'+n),
  ];
  const originals=new Map();
  for(const file of files){
    const source=path.join(host,file);
    const suffix=['.gov-workspace-backup','.gov-delivery-backup','.gov-result-backup'].find(s=>existsSync(source+s));
    const data=readFileSync(source+(suffix??''));originals.set(file,data);
    mkdirSync(path.dirname(path.join(root,file)),{recursive:true});writeFileSync(path.join(root,file),data);
  }
  const report=installDelivery(root,backup);
  assert.ok(report.workspace.changed>=2);assert.equal(report.resultGuard.changed,1);assert.equal(report.deliveryUi.changed,5);
  restoreDelivery(root,backup);
  for(const [file,data]of originals)assert.deepEqual(readFileSync(path.join(root,file)),data);
  const plugin=files.find(f=>f.includes('plugin-page-'));writeFileSync(path.join(root,plugin),'unsupported upstream');
  assert.throws(()=>installDelivery(root,path.join(folder,'rejected-backup')),/Unsupported/);
  for(const [file,data]of originals)if(file!==plugin)assert.deepEqual(readFileSync(path.join(root,file)),data);
});
