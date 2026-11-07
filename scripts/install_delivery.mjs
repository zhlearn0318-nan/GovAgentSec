// Validate all host adapters against a temporary copy before changing the host.
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {installWorkspace} from './install_openclaw_workspace.mjs';
import {installDeliveryUi} from './install_openclaw_delivery_ui.mjs';
import {installResultGuard} from './install_openclaw_result_guard.mjs';

function hostFiles(root) {
  const assets='dist/control-ui/assets';
  return ['dist/control-ui/index.html',
    ...readdirSync(path.join(root,assets)).filter(n=>/^(index-|plugin-page-|overview-page-|skills-page-|zh-CN-).*\.js$/.test(n)).map(n=>assets+'/'+n),
    ...readdirSync(path.join(root,'dist')).filter(n=>/^agent-tools\.before-tool-call-.*\.js$/.test(n)).map(n=>'dist/'+n),
  ];
}
function copyFiles(from,to,files) {
  for(const file of files){
    const target=path.join(to,file);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(path.join(from,file),target);
  }
}
export function installDelivery(root,backup) {
  root=path.resolve(root);backup=path.resolve(backup);
  if(existsSync(path.join(backup,'manifest.json')))throw Error('Use a new backup directory for each delivery');
  const files=hostFiles(root);
  const temporary=mkdtempSync(path.join(tmpdir(),'gov-delivery-'));
  try {
    copyFiles(root,temporary,files);
    // Existing adapter backups are needed when upgrading v1 to v2.
    for(const file of files)for(const suffix of ['.gov-workspace-backup','.gov-delivery-backup','.gov-result-backup']){
      if(existsSync(path.join(root,file+suffix)))copyFiles(root,temporary,[file+suffix]);
    }
    installWorkspace(temporary);installResultGuard(temporary);installDeliveryUi(temporary);
    copyFiles(root,backup,files);writeFileSync(path.join(backup,'manifest.json'),JSON.stringify({root,files}));
    try {return {workspace:installWorkspace(root),resultGuard:installResultGuard(root),deliveryUi:installDeliveryUi(root),backup};}
    catch(error){copyFiles(backup,root,files);throw error;}
  } finally {
    if(path.dirname(temporary)===path.resolve(tmpdir())&&path.basename(temporary).startsWith('gov-delivery-'))rmSync(temporary,{recursive:true,force:true});
  }
}
export function restoreDelivery(root,backup) {
  const manifest=JSON.parse(readFileSync(path.join(backup,'manifest.json'),'utf8'));
  if(path.resolve(root)!==manifest.root)throw Error('Backup belongs to a different host');
  const allowed=new Set(hostFiles(root));
  if(manifest.files.some(f=>!allowed.has(f)))throw Error('Backup file list differs from the installed host');
  copyFiles(backup,root,manifest.files);return {restored:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const [root,backup]=process.argv.slice(2).filter(a=>a!=='--restore');
  if(!root||!backup)throw Error('Usage: node scripts/install_delivery.mjs OPENCLAW_ROOT BACKUP_DIR [--restore]');
  console.log(JSON.stringify(process.argv.includes('--restore')?restoreDelivery(root,backup):installDelivery(root,backup)));
}
