// Pinned-host UI fix. No safety hooks, gateway settings, or model requests changed.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function patchModelPicker(source) {
  // Remove the earlier diagnostic patch; startup never reached that loader.
  source=source.replace('/* gov-model-metadata-settled */o.finally(()=>n({commands:!1,models:!1})).catch(()=>{}),','');
  const marker='/* gov-model-session-init */';
  if(source.includes(marker))return decorateSpeed(source);
  const needle='(e.has(`active`)||e.has(`sessionKey`))&&this.syncActiveBindings(),e.has(`draft`)';
  if(source.split(needle).length!==2)throw Error('Pinned chat pane lifecycle changed');
  // Canonicalizing "main" returns early from applyGatewaySnapshot. When the
  // canonical sessionKey lands, finish connecting this pane before rendering.
  return decorateSpeed(source.replace(needle,`${marker}e.has(\`sessionKey\`)&&this.state?.connected&&this.connectedClient!==this.state.client&&this.applyGatewaySnapshot(this.context.gateway.snapshot),${needle}`));
}
function decorateSpeed(source) {
  return source.replace('<div class="chat-controls__inline-select-section-label">Speed</div>',
    '<div class="chat-controls__inline-select-section-label" title="快速模式是供应商加速服务。OpenClaw 2026.7.1-2 不支持 DeepSeek 的此项服务；请选 Flash 或降低思考强度。">速度（灰色表示当前不可用）</div>');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const host=path.join(process.env.APPDATA,'npm/node_modules/openclaw');
  if(JSON.parse(readFileSync(path.join(host,'package.json'))).version!=='2026.7.1-2')throw Error('Pinned OpenClaw version required');
  const assets=path.join(host,'dist/control-ui/assets');
  const files=readdirSync(assets).filter(f=>/^chat-page-.*\.js$/.test(f));
  if(files.length!==1)throw Error('Expected exactly one chat bundle');
  const file=path.join(assets,files[0]),source=readFileSync(file,'utf8'),updated=patchModelPicker(source);
  if(source===updated)console.log('Model picker startup fix already installed');
  else {
    writeFileSync(file+'.before-model-picker-'+Date.now(),source,{flag:'wx'});
    writeFileSync(file,updated);console.log('Installed pinned model picker startup fix; reload browser');
  }
}
