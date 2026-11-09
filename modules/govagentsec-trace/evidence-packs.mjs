import path from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TraceStore } from './store.mjs';

// Published repository evidence only. Browser input is an ID, never a path or URL.
const catalogue=[{id:'typhoon-real-20261107',label:'台风应急简报 · 6条历史真实运行',source:'real-openclaw-traces',read_only:true,
  root:fileURLToPath(new URL('../../local-validation/real-evolution/2026-11-07-multi-trace-final/',import.meta.url))}];
export function historyPacks() {
  return {packs:catalogue.filter(p=>existsSync(path.join(p.root,'evidence/traces'))).map(({root,...p})=>p)};
}
export function openEvidencePack(id) {
  const pack=catalogue.find(p=>p.id===id);
  if (!pack || !existsSync(path.join(pack.root,'evidence/traces'))) throw Error('HISTORY_PACK_NOT_FOUND');
  // Reject links/reparse points that redirect this fixed evidence package elsewhere.
  const root=path.resolve(pack.root), traces=path.join(root,'evidence/traces'), workshop=path.join(root,'skill-workshop');
  for(const dir of [root,traces,workshop]) if(realpathSync(dir).toLowerCase()!==dir.toLowerCase())throw Error('LINKED_HISTORY_PACK');
  return {store:new TraceStore(traces),workshopRoot:workshop,read_only:true};
}
