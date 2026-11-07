import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const marker='gov-delivery-ui-v2';
const login=JSON.parse(readFileSync(new URL('../modules/govagentsec-ui/delivery-locale.json',import.meta.url),'utf8'));
export function installDeliveryUi(root,restore=false){
  const dir=path.join(root,'dist/control-ui/assets');
  const names=readdirSync(dir);
  function file(prefix){const found=names.filter(n=>n.startsWith(prefix)&&n.endsWith('.js'));if(found.length!==1)throw Error('Unsupported asset '+prefix);return path.join(dir,found[0]);}
  const locale=file('zh-CN-'),overview=file('overview-page-'),main=file('index-'),skills=file('skills-page-'),index=path.join(root,'dist/control-ui/index.html');
  const plans=[];
  for(const f of [locale,overview,main,skills,index]){
    const backup=f+'.gov-delivery-backup';
    if(restore){if(!existsSync(backup))throw Error('Missing delivery backup');plans.push({f,next:readFileSync(backup,'utf8')});continue;}
    let original=readFileSync(f,'utf8');if(original.includes(marker))continue;
    if(original.includes('gov-delivery-ui-v1')){if(!existsSync(backup))throw Error('Missing previous delivery backup');original=readFileSync(backup,'utf8');}
    let next=original;
    if(f===locale){
      const match=original.match(/export\{(\w+) as zh_CN\};/);if(!match)throw Error('Unsupported Chinese locale');
      next=original.replace(match[0],`/* ${marker} */Object.assign(${match[1]},{login:${JSON.stringify(login)}});Object.assign(${match[1]}.languages,{es:'西班牙语',jaJP:'日语',ko:'韩语',fr:'法语',hi:'印地语',ar:'阿拉伯语',it:'意大利语',tr:'土耳其语',uk:'乌克兰语',id:'印度尼西亚语',pl:'波兰语',th:'泰语',vi:'越南语',nl:'荷兰语',fa:'波斯语',ru:'俄语',ptBR:'葡萄牙语',de:'德语'});Object.assign(${match[1]}.overview.access,{wsUrl:'网关连接地址'});${match[0]}`);
    }else if(f===overview){
      // Remove the credential controls, rather than leaving a readable value in a hidden input.
      const tokenStart=original.indexOf('<label class="field">',original.indexOf('${o?``:a`'));
      const language=original.indexOf('overview.access.language');
      const languageStart=original.lastIndexOf('<label class="field">',language);
      const end=original.lastIndexOf('`}',languageStart);
      if(tokenStart<0||end<tokenStart||!original.slice(tokenStart,end).includes('e.settings.token'))throw Error('Unsupported access controls');
      next=original.slice(0,tokenStart)+'<p>登录凭据由管理员管理；更换连接请退出后重新登录。</p>'+original.slice(end);
      next+='\n/* '+marker+' */\n';
    }else if(f===skills){
      for(const [before,after] of [['All','全部'],['Ready','可用'],['Needs Setup','需配置'],['Disabled','已停用']]){
        const label='label:`'+before+'`';if(!next.includes(label))throw Error('Unsupported skill filter '+before);next=next.replace(label,'label:`'+after+'`');
      }
      next+='\n/* '+marker+' */\n';
    }else if(f===main){
      const title='<div class="login-gate__title">OpenClaw</div>';
      if(!original.includes(title))throw Error('Unsupported login title');
      next=original.replace(title,'<div class="login-gate__title">政安智枢</div>')+'\n/* '+marker+' */\n';
    }else{
      const assetNames=[locale,overview,main,skills].map(p=>path.basename(p));
      const start=`<script>/* ${marker} */try{if(!localStorage.getItem('openclaw.i18n.locale'))localStorage.setItem('openclaw.i18n.locale','zh-CN');}catch{};(async()=>{try{if(sessionStorage.getItem('${marker}'))return;sessionStorage.setItem('${marker}','1');if(!('caches'in window))return;let removed=false;for(const name of await caches.keys()){if(!name.startsWith('openclaw-control-'))continue;const c=await caches.open(name);for(const r of await c.keys()){const u=new URL(r.url);if(u.origin===location.origin&&${JSON.stringify(assetNames)}.some(n=>u.pathname.endsWith('/assets/'+n))){await c.delete(r);removed=true;}}}if(removed)location.reload();}catch{}})();</script><style>.login-gate{background:#f5f7f6;--accent:#1e695b}.login-gate__card{border-radius:14px;border:1px solid #dce5e1;box-shadow:0 12px 48px #163e3020}.login-gate__logo{display:none}.login-gate__title{color:#164e43}.login-gate .btn.primary,.login-gate button.btn--primary{background:#1b6655;border-color:#1b6655}</style>`;
      if(!original.includes('<head>'))throw Error('Unsupported index');next=original.replace('<head>','<head>'+start);
    }
    plans.push({f,original,next,backup});
  }
  for(const p of plans){if(!restore&&!existsSync(p.backup))writeFileSync(p.backup,p.original,{flag:'wx'});writeFileSync(p.f,p.next);}
  return {changed:plans.length,restored:restore};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(installDeliveryUi(process.argv.slice(2).find(x=>x!=='--restore')||path.join(process.env.APPDATA,'npm/node_modules/openclaw'),process.argv.includes('--restore'))));
