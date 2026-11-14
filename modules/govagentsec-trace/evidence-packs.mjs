import path from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TraceStore } from './store.mjs';

// Published repository evidence only. Browser input is an ID, never a path or URL.
const catalogue=[];
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
