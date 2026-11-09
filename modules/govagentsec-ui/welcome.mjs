// Public entry contains no configuration or data. Gateway authentication is unchanged.
export function renderWelcomePage() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>政安纵深 · 进入工作区</title><style>
:root{color-scheme:light;font:16px/1.6 "Segoe UI Variable","Microsoft YaHei UI",sans-serif;color:#233e3b;background:#f5f7f7}*{box-sizing:border-box}body{margin:0}main{max-width:600px;margin:12vh auto;padding:32px}header{border-left:4px solid #1e695b;padding-left:18px;margin-bottom:30px}h1{font-size:30px;letter-spacing:-.5px;margin:0}p{margin:8px 0;color:#62756d}.entry{background:#fff;border:1px solid #dce5e1;border-radius:12px;padding:26px}h2{font-size:18px;margin:0 0 10px}.flow{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;color:#62756d;padding:14px 0 22px}button,input,a{font:inherit}button{width:100%;border:1px solid #1e695b;border-radius:7px;padding:12px;background:#1e695b;color:white;cursor:pointer}button:hover{background:#175548}button:focus-visible,input:focus-visible,summary:focus-visible,a:focus-visible{outline:3px solid #7eb1a3;outline-offset:3px}details{margin-top:24px;border-top:1px solid #dce5e1;padding-top:16px}summary{cursor:pointer;font-size:14px}label{display:block;margin-top:14px;font-size:14px}input{display:block;width:100%;padding:10px;border:1px solid #ccdcd6;border-radius:6px;background:#fff;color:#233e3b;margin:7px 0 14px}small{font-size:12px;color:#62756d}#message{min-height:24px;font-size:14px;color:#9c6524}footer{font-size:12px;margin-top:22px;color:#70817e}a{color:#1e695b}@media(max-width:600px){main{margin:5vh auto;padding:20px}.entry{padding:20px}}</style></head><body><main>
<header><h1>政安纵深</h1><p>从一项任务开始，材料、权限和过程在同一处。</p></header>
<section class="entry" aria-label="进入工作区"><h2>开始处理任务</h2><p>连接已配置的工作区，再登录业务身份。</p><div class="flow"><span>登录身份</span><span>→</span><span>确认材料</span><span>→</span><span>处理任务</span></div><button id="enter">进入工作区</button><p id="message" role="status"></p>
<details><summary>管理员连接设置</summary><p>首次使用时，由工作区管理员提供当前网关令牌。它用于连接工作区，业务权限在登录身份后确定。</p><label for="token">网关令牌<input id="token" type="password" autocomplete="off" spellcheck="false" placeholder="填写管理员提供的令牌"></label><button id="connect">连接并继续登录</button><small>此页不保存令牌。密码认证请使用下方网关连接页。</small><p><a href="/">打开网关连接页</a></p></details>
</section><footer>本机工作区 · 业务身份与任务权限由服务端核验</footer></main><script>
let entryToken=new URLSearchParams(location.hash.slice(1)).get('token')||'';
if(location.hash)history.replaceState({},'',location.pathname+location.search);
const target='/plugin?plugin=protect-agent&id=govagentsec&section=login';
function enter(token){const value=token.trim();document.getElementById('token').value='';entryToken='';location.assign(target+(value?'#token='+encodeURIComponent(value):''));}
document.getElementById('enter').onclick=()=>enter(entryToken);
document.getElementById('connect').onclick=()=>{const value=document.getElementById('token').value.trim();if(!value){document.getElementById('message').textContent='请填写网关令牌，或使用已连接的工作区。';document.getElementById('token').focus();return;}enter(value);};
</script></body></html>`;
}
