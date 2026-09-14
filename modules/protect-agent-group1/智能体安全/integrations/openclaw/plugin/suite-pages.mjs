const SHARED_STYLE = `
:root{color-scheme:light;--canvas:#f3f6fa;--surface:#fff;--ink:#102a43;--muted:#61758a;--line:#dce5ee;--blue:#2457d6;--blue-soft:#edf2ff;--green:#0b8f68;--green-soft:#eaf8f3;--amber:#a86500;--amber-soft:#fff5de;--red:#cc3d55;--red-soft:#fff0f2;--shadow:0 14px 36px rgba(22,50,76,.08)}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:14px/1.55 "Segoe UI Variable","Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.shell{width:min(1180px,100%);margin:auto;padding:30px}.eyebrow{color:var(--blue);font:800 11px/1.2 "Cascadia Mono",Consolas,monospace;letter-spacing:.13em;text-transform:uppercase}
h1{margin:7px 0 5px;font-size:30px;line-height:1.18;letter-spacing:-.035em}.lead{max-width:760px;margin:0;color:var(--muted)}
.hero{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:22px}.live{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid #cce8dd;border-radius:10px;background:#f5fbf9;color:#24644f;font-weight:750}.live:before{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 0 4px rgba(11,143,104,.1);content:""}
.grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(300px,.75fr);gap:16px}.panel{border:1px solid var(--line);border-radius:16px;background:var(--surface);box-shadow:var(--shadow);padding:20px}.panel h2{margin:0 0 4px;font-size:18px}.sub{margin:0 0 17px;color:var(--muted);font-size:12px}
.rail{position:relative;display:grid;gap:2px;padding-left:30px}.rail:before{position:absolute;top:18px;bottom:18px;left:11px;width:2px;background:linear-gradient(var(--blue) 0 25%,var(--green) 25% 50%,#dc8b16 50% 75%,var(--red) 75%);content:""}
.step{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;min-height:72px;padding:13px 15px;border:1px solid var(--line);background:#fbfcfe}.step:first-child{border-radius:12px 12px 4px 4px}.step:last-child{border-radius:4px 4px 12px 12px}.step:before{position:absolute;left:-26px;width:12px;height:12px;border:3px solid var(--surface);border-radius:50%;background:#a8b5c2;box-shadow:0 0 0 1px #a8b5c2;content:""}.step[data-status="passed"]:before,.step[data-status="monitoring"]:before{background:var(--green);box-shadow:0 0 0 1px var(--green)}.step[data-status="active"]:before{background:var(--blue);box-shadow:0 0 0 4px var(--blue-soft)}.step[data-status="blocked"]:before,.step[data-status="error"]:before{background:var(--red);box-shadow:0 0 0 3px var(--red-soft)}.step[data-status="review"]:before{background:#dc8b16;box-shadow:0 0 0 3px var(--amber-soft)}
.step strong{display:block;font-size:14px}.step small{display:block;margin-top:2px;color:var(--muted)}.state{border-radius:999px;padding:4px 9px;background:#eef2f6;color:#5b7085;font:700 10px/1.2 "Cascadia Mono",Consolas,monospace}.step[data-status="passed"] .state,.step[data-status="monitoring"] .state{background:var(--green-soft);color:var(--green)}.step[data-status="active"] .state{background:var(--blue-soft);color:var(--blue)}.step[data-status="blocked"] .state,.step[data-status="error"] .state{background:var(--red-soft);color:var(--red)}.step[data-status="review"] .state{background:var(--amber-soft);color:var(--amber)}
.metrics{display:grid;gap:10px}.metric{padding:15px;border:1px solid var(--line);border-radius:12px;background:#fbfcfe}.metric span{display:block;color:var(--muted);font-size:11px}.metric strong{display:block;margin-top:4px;font-size:22px;letter-spacing:-.025em}.metric code{color:#3c5870;font:11px/1.45 "Cascadia Mono",Consolas,monospace;word-break:break-all}
label{display:grid;gap:6px;color:#415970;font-size:12px;font-weight:750}input{width:100%;border:1px solid #b9c8d8;border-radius:10px;background:#fff;color:var(--ink);padding:11px 12px;font:13px "Cascadia Mono",Consolas,monospace;outline:none}input:focus{border-color:#7d9ee8;box-shadow:0 0 0 3px rgba(36,87,214,.1)}button{min-height:40px;border:0;border-radius:10px;padding:9px 15px;background:var(--blue);color:#fff;font:750 13px inherit;cursor:pointer}button:hover{background:#1e49b5}button:focus-visible{outline:3px solid rgba(36,87,214,.25);outline-offset:2px}button:disabled{opacity:.5;cursor:wait}.actions{display:flex;align-items:center;gap:12px;margin-top:12px}.hint{color:var(--muted);font-size:11px}.result{margin-top:16px;padding:15px;border:1px solid var(--line);border-radius:12px;background:#fbfcfe}.result[hidden]{display:none}.result[data-level="高风险"]{border-color:#efbec6;background:var(--red-soft)}.result[data-level="低风险"]{border-color:#bce3d5;background:var(--green-soft)}.result-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:12px}.result-cell{padding:10px;border:1px solid rgba(102,126,151,.18);border-radius:9px;background:rgba(255,255,255,.66)}.result-cell span{display:block;color:var(--muted);font-size:10px}.result-cell strong{display:block;margin-top:2px;font-size:17px}.mono{font-family:"Cascadia Mono",Consolas,monospace;font-size:11px;word-break:break-all}.error{color:var(--red)}
.assessment-shell{--audit:#a83f4c;--audit-soft:#fff1f2;--navy:#152a43;--cyan:#147f88;--cyan-soft:#e9f7f7;width:min(1240px,100%)}
.assessment-hero{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:32px;margin-bottom:18px;padding:28px;border:1px solid #cfdbe8;border-radius:20px;background:linear-gradient(118deg,#fff 0 65%,#eef5fb 65%);box-shadow:var(--shadow)}
.assessment-hero:after{position:absolute;right:232px;top:-42px;width:1px;height:190px;background:#c9d8e7;transform:rotate(18deg);content:""}.assessment-hero h1{max-width:740px;font-size:36px}.assessment-hero .lead{font-size:14px}
.hero-stamp{position:relative;z-index:1;align-self:stretch;display:grid;align-content:center;gap:10px;padding-left:23px;border-left:1px solid #c9d8e7}.stamp-line{display:flex;align-items:center;justify-content:space-between;gap:12px}.stamp-line span{color:var(--muted);font-size:11px}.stamp-line strong{font-size:12px}.stamp-line .online{color:var(--green)}
.mode-legend{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.tag{display:inline-flex;align-items:center;gap:6px;width:max-content;padding:5px 9px;border-radius:999px;font:750 10px/1.2 "Cascadia Mono",Consolas,monospace}.tag:before{width:6px;height:6px;border-radius:50%;content:""}.tag-real{background:var(--green-soft);color:#087254}.tag-real:before{background:var(--green)}.tag-demo{border:1px dashed #d7a9ae;background:var(--audit-soft);color:var(--audit)}.tag-demo:before{background:var(--audit)}.tag-source{background:var(--blue-soft);color:var(--blue)}.tag-source:before{background:var(--blue)}
.assessment-tabs{display:flex;gap:5px;margin-bottom:14px;padding:5px;border:1px solid var(--line);border-radius:13px;background:#e9eef4}.assessment-tabs button{min-height:38px;flex:1;border:1px solid transparent;background:transparent;color:#536b82}.assessment-tabs button:hover{background:rgba(255,255,255,.7)}.assessment-tabs button[aria-selected="true"]{border-color:#d3deea;background:#fff;color:var(--navy);box-shadow:0 3px 10px rgba(30,55,80,.06)}
.assessment-view[hidden]{display:none}.assessment-layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.7fr);gap:16px}.assessment-card{border:1px solid var(--line);border-radius:17px;background:#fff;box-shadow:var(--shadow);padding:21px}.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:17px}.section-head h2{margin:0;font-size:19px}.section-head p{margin:4px 0 0;color:var(--muted);font-size:12px}
.evidence-chain{display:grid;grid-template-columns:repeat(3,1fr);margin:20px 0 22px;border:1px solid #cfdae6;border-radius:13px;background:#f8fafc}.chain-node{position:relative;min-height:92px;padding:15px}.chain-node+.chain-node{border-left:1px solid #cfdae6}.chain-node+.chain-node:before{position:absolute;left:-7px;top:40px;width:12px;height:12px;border-top:2px solid var(--cyan);border-right:2px solid var(--cyan);background:#f8fafc;transform:rotate(45deg);content:""}.chain-node span{display:block;color:var(--cyan);font:800 10px/1 "Cascadia Mono",Consolas,monospace}.chain-node strong{display:block;margin:8px 0 2px;font-size:13px}.chain-node small{color:var(--muted)}.chain-node[data-state="working"]{background:var(--blue-soft)}.chain-node[data-state="done"]{background:var(--green-soft)}.chain-node[data-state="failed"]{background:var(--red-soft)}
.scan-form{padding:16px;border:1px solid #d7e1eb;border-radius:13px;background:#fbfcfe}.scan-note{display:flex;gap:8px;align-items:flex-start;margin-top:11px;color:var(--muted);font-size:11px}.scan-note strong{color:var(--navy)}
.assessment-result{margin-top:16px}.assessment-result[data-level="高危"]{border-color:#efbec6;background:var(--red-soft)}.assessment-result[data-level="警告"]{border-color:#ead09a;background:var(--amber-soft)}.assessment-result[data-level="安全"]{border-color:#bce3d5;background:var(--green-soft)}.result-title{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.result-title h2{margin:4px 0}.trace{max-width:55%;text-align:right;color:#536d83;font:10px/1.45 "Cascadia Mono",Consolas,monospace;word-break:break-all}.assessment-result .result-grid{grid-template-columns:repeat(4,1fr)}
.system-facts{display:grid;gap:9px}.fact-row{display:grid;grid-template-columns:100px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.fact-row:last-child{border:0}.fact-row span{color:var(--muted);font-size:11px}.fact-row strong{font-size:12px}.safety-note{margin-top:14px;padding:13px;border-left:3px solid var(--cyan);background:var(--cyan-soft);color:#315a60;font-size:11px}
.capability-map{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.capability{min-height:155px;padding:17px;border:1px solid var(--line);border-radius:14px;background:#fff}.capability.demo{border-style:dashed;border-color:#d7a9ae;background:linear-gradient(150deg,#fff 0 76%,#fff4f5 76%)}.capability.wide{grid-column:span 2}.capability h3{margin:12px 0 6px;font-size:15px}.capability p{margin:0;color:var(--muted);font-size:12px}.capability ul{margin:11px 0 0;padding-left:17px;color:#405b72;font-size:11px}.capability button{margin-top:13px;background:var(--audit)}.capability button:hover{background:#8e3440}
.demo-console{margin-top:14px;padding:14px;border:1px dashed #d7a9ae;border-radius:13px;background:#fff8f8}.demo-console[hidden]{display:none}.demo-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:11px}.demo-title strong{font-size:13px}.demo-flow{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.demo-step{padding:10px;border-radius:9px;background:#edf1f5;color:#607286;font-size:10px}.demo-step.active{background:var(--blue-soft);color:var(--blue)}.demo-step.done{background:var(--green-soft);color:var(--green)}
.audit-empty{display:grid;place-items:center;min-height:250px;padding:28px;border:1px dashed #b9c9d8;border-radius:15px;background:#fbfcfe;text-align:center}.audit-empty strong{font-size:16px}.audit-empty p{max-width:480px;margin:7px 0;color:var(--muted)}.audit-record[hidden],.audit-empty[hidden]{display:none}.audit-record{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:16px}.audit-ledger{padding:20px;border:1px solid var(--line);border-radius:15px;background:#fff}.audit-ledger h2{margin:6px 0 16px}.ledger-line{display:grid;grid-template-columns:118px 1fr;gap:14px;padding:11px 0;border-top:1px solid var(--line)}.ledger-line span{color:var(--muted);font-size:11px}.ledger-line strong{font-size:12px;word-break:break-all}.audit-proof{padding:20px;border-radius:15px;background:var(--navy);color:#fff}.audit-proof span{color:#adc0d1;font-size:10px}.audit-proof strong{display:block;margin:8px 0 18px;font:14px/1.5 "Cascadia Mono",Consolas,monospace;word-break:break-all}.audit-proof p{margin:0;color:#c8d7e4;font-size:11px}
.gov-shell{--gov-navy:#102942;--gov-deep:#081d31;--gov-jade:#118477;--gov-jade-soft:#e7f6f2;--gov-seal:#a53d49;--gov-gold:#b5802d;width:min(1320px,100%)}
.gov-hero{display:grid;grid-template-columns:minmax(0,1fr) 430px;gap:34px;overflow:hidden;min-height:282px;margin-bottom:15px;border:1px solid #cbd9e5;border-radius:22px;background:linear-gradient(120deg,#fff 0 58%,#eaf1f7 58%);box-shadow:0 20px 48px rgba(21,50,75,.1)}
.gov-copy{display:grid;align-content:center;padding:34px 0 34px 34px}.gov-brand{display:flex;align-items:center;gap:12px;margin-bottom:17px}.gov-mark{position:relative;display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:var(--gov-navy);color:#fff;font:900 18px/1 "Microsoft YaHei UI",sans-serif;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}.gov-mark:before,.gov-mark:after{position:absolute;background:rgba(255,255,255,.24);content:""}.gov-mark:before{width:1px;height:28px}.gov-mark:after{width:28px;height:1px}.gov-brand strong{display:block;font-size:16px}.gov-brand small{display:block;color:var(--muted);font:10px/1.4 "Cascadia Mono",Consolas,monospace;letter-spacing:.12em}.gov-copy h1{max-width:680px;margin:0;font-size:40px;line-height:1.14;letter-spacing:-.055em}.gov-copy .lead{margin-top:12px;font-size:14px}.gov-summary{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}.gov-summary span{padding:6px 9px;border:1px solid #cedbe7;border-radius:8px;background:rgba(255,255,255,.7);color:#526a7f;font-size:10px}
.hub-field{position:relative;min-height:282px;background-image:linear-gradient(90deg,transparent calc(50% - .5px),rgba(17,132,119,.22) 50%,transparent calc(50% + .5px)),linear-gradient(transparent calc(50% - .5px),rgba(17,132,119,.22) 50%,transparent calc(50% + .5px));background-size:100% 100%}.hub-field:after{position:absolute;inset:28px;border:1px solid rgba(72,105,131,.18);border-radius:50%;content:""}.hub-core{position:absolute;z-index:2;left:50%;top:50%;display:grid;place-items:center;width:112px;height:112px;border:1px solid #7891a5;border-radius:50%;background:var(--gov-deep);color:#fff;transform:translate(-50%,-50%);box-shadow:0 0 0 9px rgba(255,255,255,.72),0 12px 28px rgba(15,40,63,.22);text-align:center}.hub-core strong{display:block;font-size:18px;letter-spacing:.03em}.hub-core small{color:#9fc7c2;font:9px/1.3 "Cascadia Mono",Consolas,monospace}.hub-node{position:absolute;z-index:3;min-width:94px;padding:8px 10px;border:1px solid #c4d3df;border-radius:9px;background:#fff;color:var(--gov-navy);box-shadow:0 6px 16px rgba(23,53,78,.08);font-size:10px;text-align:center}.hub-node[data-node="aegis"]{left:50%;top:20px;transform:translateX(-50%)}.hub-node[data-node="agentguard"]{right:16px;top:50%;transform:translateY(-50%)}.hub-node[data-node="protect"]{left:50%;bottom:20px;transform:translateX(-50%)}.hub-node[data-node="assessment"]{left:16px;top:50%;transform:translateY(-50%)}.hub-node span{display:block;margin-top:2px;color:var(--gov-jade);font-size:9px}
.gov-tabs{display:flex;gap:5px;margin-bottom:15px;padding:5px;border:1px solid #d0dce7;border-radius:13px;background:#e7edf3}.gov-tabs button{min-height:40px;flex:1;border:1px solid transparent;background:transparent;color:#526a7e;white-space:nowrap}.gov-tabs button:hover{background:rgba(255,255,255,.7)}.gov-tabs button[aria-selected="true"]{border-color:#cbd9e4;background:#fff;color:var(--gov-navy);box-shadow:0 3px 10px rgba(23,50,74,.07)}
.gov-view[hidden]{display:none}.gov-section{border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:var(--shadow);padding:22px}.gov-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}.gov-section-head h2{margin:0;font-size:20px}.gov-section-head p{margin:5px 0 0;color:var(--muted);font-size:12px}.sync-state{display:flex;align-items:center;gap:7px;color:#557085;font-size:10px}.sync-state:before{width:7px;height:7px;border-radius:50%;background:var(--gov-jade);box-shadow:0 0 0 4px var(--gov-jade-soft);content:""}
.gov-modules{display:grid;grid-template-columns:repeat(4,1fr);gap:11px}.gov-module{position:relative;display:grid;align-content:start;min-height:196px;padding:17px;border:1px solid #d5e0e9;border-radius:14px;background:#fbfcfe;overflow:hidden}.gov-module:after{position:absolute;right:-25px;bottom:-25px;width:70px;height:70px;border:1px solid rgba(17,132,119,.16);border-radius:50%;content:""}.gov-module .module-code{color:var(--gov-jade);font:800 9px/1 "Cascadia Mono",Consolas,monospace;letter-spacing:.1em}.gov-module h3{margin:10px 0 5px;font-size:15px}.gov-module p{min-height:52px;margin:0;color:var(--muted);font-size:11px}.gov-module footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:15px}.module-health{display:flex;align-items:center;gap:5px;color:#758697;font-size:9px}.module-health:before{width:6px;height:6px;border-radius:50%;background:#a8b5c2;content:""}.module-health.online{color:var(--green)}.module-health.online:before{background:var(--green)}.module-health.offline{color:var(--red)}.module-health.offline:before{background:var(--red)}.gov-module button{position:relative;z-index:1;min-height:32px;padding:6px 10px;background:var(--gov-navy);font-size:10px}.gov-module button:hover{background:#1d4262}
.gov-flow{display:grid;grid-template-columns:repeat(4,1fr);margin-top:15px;border:1px solid #d4dfe9;border-radius:13px;background:#f5f8fa}.flow-cell{position:relative;padding:13px}.flow-cell+.flow-cell{border-left:1px solid #d4dfe9}.flow-cell+.flow-cell:before{position:absolute;left:-5px;top:21px;width:8px;height:8px;border-top:1px solid var(--gov-jade);border-right:1px solid var(--gov-jade);background:#f5f8fa;transform:rotate(45deg);content:""}.flow-cell span{display:block;color:var(--muted);font-size:9px}.flow-cell strong{display:block;margin-top:3px;font-size:11px}
.module-frame-shell{overflow:hidden;border:1px solid #c9d7e3;border-radius:18px;background:#fff;box-shadow:var(--shadow)}.module-frame-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:13px 16px;border-bottom:1px solid #d9e2ea;background:#f7f9fb}.frame-identity{display:flex;align-items:center;gap:10px}.frame-identity span{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--gov-navy);color:#fff;font:800 10px/1 "Cascadia Mono",Consolas,monospace}.frame-identity strong{display:block;font-size:13px}.frame-identity small{display:block;color:var(--muted);font-size:9px}.frame-actions{display:flex;align-items:center;gap:9px}.frame-actions a{padding:6px 9px;border:1px solid #c6d5e1;border-radius:8px;color:#38546b;text-decoration:none;font-size:10px}.frame-actions a:focus-visible{outline:3px solid rgba(36,87,214,.2);outline-offset:2px}.module-frame{display:block;width:100%;height:max(690px,calc(100vh - 185px));border:0;background:#f3f6fa}
@media(max-width:1050px){.gov-hero{grid-template-columns:1fr 360px}.gov-modules{grid-template-columns:1fr 1fr}}
@media(max-width:800px){.shell{padding:20px}.hero{display:block}.live{margin-top:14px}.grid{grid-template-columns:1fr}.result-grid{grid-template-columns:1fr}.gov-hero{grid-template-columns:1fr;background:#fff}.gov-copy{padding:26px}.hub-field{min-height:250px;background-color:#edf3f7}.gov-tabs{overflow-x:auto}.gov-tabs button{min-width:130px}.gov-flow{grid-template-columns:1fr 1fr}.flow-cell:nth-child(3){border-left:0;border-top:1px solid #d4dfe9}.flow-cell:nth-child(4){border-top:1px solid #d4dfe9}.module-frame{height:720px}}
@media(max-width:560px){.gov-shell{padding:12px}.gov-copy h1{font-size:32px}.gov-modules,.gov-flow{grid-template-columns:1fr}.flow-cell+.flow-cell{border-left:0;border-top:1px solid #d4dfe9}.flow-cell+.flow-cell:before{display:none}.gov-section{padding:15px}.module-frame-head{align-items:flex-start}.module-frame{height:760px}}
@media(max-width:900px){.assessment-hero,.assessment-layout,.audit-record{grid-template-columns:1fr}.assessment-hero:after{display:none}.hero-stamp{padding:16px 0 0;border-left:0;border-top:1px solid #c9d8e7}.capability-map{grid-template-columns:1fr 1fr}.capability.wide{grid-column:span 2}}
@media(max-width:640px){.assessment-shell{padding:14px}.assessment-hero{padding:20px}.assessment-hero h1{font-size:29px}.assessment-tabs{overflow-x:auto}.assessment-tabs button{min-width:120px}.evidence-chain,.demo-flow,.capability-map{grid-template-columns:1fr}.chain-node+.chain-node{border-left:0;border-top:1px solid #cfdae6}.chain-node+.chain-node:before{display:none}.capability.wide{grid-column:span 1}.assessment-result .result-grid{grid-template-columns:1fr 1fr}.result-title{display:block}.trace{max-width:none;text-align:left}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;

function page(title, body, script) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${SHARED_STYLE}</style></head><body>${body}<script>${script}</script></body></html>`;
}

export function renderGovAgentSecPanel() {
  const body = `<main class="shell gov-shell">
  <header class="gov-hero">
    <div class="gov-copy">
      <div class="gov-brand"><div class="gov-mark" aria-hidden="true">安</div><div><strong>政安智枢 GovAgentSec</strong><small>GOVERNMENT AGENT SECURITY HUB</small></div></div>
      <h1>四域联防，一个安全中枢</h1>
      <p class="lead">统一承载供应链准入、运行时决策、对话防护与安全测评。四套模块保持独立执行，在同一入口完成观察与操作。</p>
      <div class="gov-summary"><span>本机闭环</span><span>四模块联动</span><span>真实后端保持不变</span><span>审计证据留存</span></div>
    </div>
    <div class="hub-field" aria-label="四模块联防拓扑">
      <div class="hub-core"><div><strong>智枢</strong><small>CONTROL HUB</small></div></div>
      <div class="hub-node" data-node="aegis">Aegis 供应链安全中心<span>供应链准入</span></div>
      <div class="hub-node" data-node="agentguard">AgentGuard<span>运行时决策</span></div>
      <div class="hub-node" data-node="protect">输入防护链<span>对话防护</span></div>
      <div class="hub-node" data-node="assessment">安全测评<span>审计追溯</span></div>
    </div>
  </header>
  <nav class="gov-tabs" aria-label="政安智枢模块">
    <button type="button" aria-selected="true" data-gov-view="overview">安全总览</button>
    <button type="button" aria-selected="false" data-gov-view="aegis">Aegis 供应链安全中心</button>
    <button type="button" aria-selected="false" data-gov-view="agentguard">AgentGuard 运行时</button>
    <button type="button" aria-selected="false" data-gov-view="protect">输入防护链</button>
    <button type="button" aria-selected="false" data-gov-view="assessment">测评与审计</button>
  </nav>
  <section id="gov-overview" class="gov-view">
    <article class="gov-section">
      <div class="gov-section-head"><div><h2>安全能力总览</h2><p>状态来自四个本机模块页面或受保护状态接口。</p></div><div id="sync-state" class="sync-state" role="status" aria-live="polite">正在核对模块状态</div></div>
      <div class="gov-modules">
        <article class="gov-module"><span class="module-code">SUPPLY CHAIN</span><h3>Aegis 供应链安全中心</h3><p>安装前准入、供应链报告、审计记录与安全规则管理。</p><footer><span id="health-aegis" class="module-health">检查中</span><button type="button" data-open-module="aegis">进入模块</button></footer></article>
        <article class="gov-module"><span class="module-code">RUNTIME CONTROL</span><h3>AgentGuard 安全中心</h3><p>工具调用三态决策、人工审批、执行票据与隔离回执。</p><footer><span id="health-agentguard" class="module-health">检查中</span><button type="button" data-open-module="agentguard">进入模块</button></footer></article>
        <article class="gov-module"><span class="module-code">CONVERSATION GUARD</span><h3>输入防护链</h3><p>输入、策略、工具与模型输出的完整对话防护链。</p><footer><span id="health-protect" class="module-health">检查中</span><button type="button" data-open-module="protect">进入模块</button></footer></article>
        <article class="gov-module"><span class="module-code">ASSESSMENT & AUDIT</span><h3>智能体安全测评与审计</h3><p>三阶段 Skill 测评、防护能力矩阵与审计追踪证据。</p><footer><span id="health-assessment" class="module-health">检查中</span><button type="button" data-open-module="assessment">进入模块</button></footer></article>
      </div>
      <div class="gov-flow" aria-label="统一安全链路">
        <div class="flow-cell"><span>准入前</span><strong>Aegis 核验来源与风险</strong></div>
        <div class="flow-cell"><span>执行中</span><strong>AgentGuard 管控工具行为</strong></div>
        <div class="flow-cell"><span>对话链</span><strong>输入防护链审查输入输出</strong></div>
        <div class="flow-cell"><span>证据层</span><strong>测评系统生成审计报告</strong></div>
      </div>
    </article>
  </section>
  <section id="gov-module-view" class="gov-view" hidden>
    <article class="module-frame-shell">
      <header class="module-frame-head">
        <div class="frame-identity"><span id="frame-code">—</span><div><strong id="frame-title">模块</strong><small id="frame-detail">正在加载</small></div></div>
        <div class="frame-actions"><span id="frame-state" class="module-health">等待加载</span><a id="frame-open" href="#" target="_blank" rel="noopener">单独打开</a></div>
      </header>
      <iframe id="module-frame" class="module-frame" title="政安智枢模块页面"></iframe>
    </article>
  </section>
  </main>`;
  const script = `
  const modules={
    aegis:{title:'Aegis 供应链安全中心',detail:'供应链准入与规则治理',code:'AG',path:'/plugins/aegis-security-center/panel',statusPath:'/plugins/aegis-security-center/panel'},
    agentguard:{title:'AgentGuard 安全中心',detail:'运行时策略、审批与回执',code:'RG',path:'/plugins/agentguard-runtime-security/panel',statusPath:'/plugins/agentguard-runtime-security/panel'},
    protect:{title:'输入防护链',detail:'输入、工具、检索与输出防护',code:'PA',path:'/plugins/protect-agent/panel',statusPath:'/protect-agent/ui/state'},
    assessment:{title:'智能体安全测评与审计',detail:'三阶段测评与审计追溯',code:'EA',path:'/plugins/supply-chain-security/panel',statusPath:'/plugins/supply-chain-security/panel'}
  };
  const tabs=[...document.querySelectorAll('[data-gov-view]')],overview=document.getElementById('gov-overview'),moduleView=document.getElementById('gov-module-view'),frame=document.getElementById('module-frame');
  function selectTab(name){for(const tab of tabs)tab.setAttribute('aria-selected',String(tab.dataset.govView===name))}
  function openView(name){
    if(name==='overview'){selectTab(name);overview.hidden=false;moduleView.hidden=true;history.replaceState(null,'',location.pathname);return}
    const item=modules[name];if(!item)return;selectTab(name);overview.hidden=true;moduleView.hidden=false;document.getElementById('frame-code').textContent=item.code;document.getElementById('frame-title').textContent=item.title;document.getElementById('frame-detail').textContent=item.detail;document.getElementById('frame-open').href=item.path;document.getElementById('frame-state').textContent='正在加载';document.getElementById('frame-state').className='module-health';frame.title=item.title;frame.src=item.path;history.replaceState(null,'','#'+name)
  }
  for(const tab of tabs)tab.addEventListener('click',()=>openView(tab.dataset.govView));
  for(const button of document.querySelectorAll('[data-open-module]'))button.addEventListener('click',()=>openView(button.dataset.openModule));
  frame.addEventListener('load',()=>{document.getElementById('frame-state').textContent='模块已加载';document.getElementById('frame-state').className='module-health online'});
  async function checkModule(key,item){const badge=document.getElementById('health-'+key);try{const response=await fetch(item.statusPath,{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error();badge.textContent='在线';badge.className='module-health online';return true}catch{badge.textContent='需要检查';badge.className='module-health offline';return false}}
  async function checkAll(){const results=await Promise.all(Object.entries(modules).map(([key,item])=>checkModule(key,item)));const online=results.filter(Boolean).length;document.getElementById('sync-state').textContent=online===4?'四个模块全部在线':online+' / 4 个模块在线'}
  const initial=location.hash.slice(1);openView(modules[initial]?initial:'overview');checkAll();`;
  return page("政安智枢 GovAgentSec", body, script);
}

export function renderProtectAgentPanel() {
  const body = `<main class="shell"><header class="hero"><div><div class="eyebrow">输入防护链 · Runtime guard</div><h1>输入防护链</h1><p class="lead">输入、工具、外部内容和模型输出在同一条链路中检查；任何检测器异常都会按失败关闭处理。</p></div><div id="connection" class="live">正在连接</div></header><section class="grid"><article class="panel"><h2>当前防护过程</h2><p class="sub">状态来自本机 Sidecar，不包含会话内容或敏感标识。</p><div id="steps" class="rail"></div></article><aside class="metrics"><div class="metric"><span>本轮状态</span><strong id="overall">等待运行</strong></div><div class="metric"><span>风险等级</span><strong id="risk">—</strong></div><div class="metric"><span>风险分数</span><strong id="score">—</strong></div><div class="metric"><span>运行模式</span><code>离线基线防护 · 127.0.0.1:19171</code></div></aside></section></main>`;
  const script = `
  const definitions=[['input','输入安全检查','提示注入与内容安全'],['policy','风险策略决策','融合评分与处置策略'],['tools','工具与外部内容','权限、参数与检索结果'],['output','模型输出复检','泄密、越权与攻击传播']];
  const labels={pending:'等待',active:'检查中',passed:'通过',monitoring:'监控中',review:'待确认',blocked:'已阻断',skipped:'跳过',error:'异常'};
  const steps=document.getElementById('steps');
  for(const [id,name,detail] of definitions){const row=document.createElement('div');row.className='step';row.dataset.id=id;const copy=document.createElement('div');const strong=document.createElement('strong');strong.textContent=name;const small=document.createElement('small');small.textContent=detail;copy.append(strong,small);const state=document.createElement('span');state.className='state';state.textContent='等待';row.append(copy,state);steps.append(row)}
  async function refresh(){try{const response=await fetch('/protect-agent/ui/state',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw new Error();const data=await response.json();document.getElementById('connection').textContent='防护服务在线';document.getElementById('overall').textContent=data.status==='allowed'?'检查通过':data.status==='blocked'?'已阻断':data.status==='running'?'检查中':'等待运行';document.getElementById('risk').textContent=data.riskLevel||'—';document.getElementById('score').textContent=Number.isFinite(data.riskScore)?Math.round(data.riskScore*100)+'%':'—';for(const item of data.steps||[]){const row=steps.querySelector('[data-id="'+CSS.escape(item.id)+'"]');if(row){row.dataset.status=item.status;row.querySelector('.state').textContent=labels[item.status]||'未知'}}}catch{document.getElementById('connection').textContent='防护服务离线';document.getElementById('connection').classList.add('error')}finally{setTimeout(refresh,900)}}refresh();`;
  return page("输入防护链", body, script);
}

export function renderSupplyChainPanel() {
  const body = `<main class="shell assessment-shell">
  <header class="assessment-hero">
    <div>
      <div class="eyebrow">第四组 · 智能体安全测评与审计</div>
      <h1>把一次安全测评，变成一条可追溯的证据链</h1>
      <p class="lead">面向 OpenClaw Skill 的准入测评、权限核验、行为识别与审计留痕。真实能力与演示能力在界面中明确区分。</p>
      <div class="mode-legend"><span class="tag tag-real">真实能力</span><span class="tag tag-demo">演示 / 待接入</span><span class="tag tag-source">第四组原始设计</span></div>
    </div>
    <aside class="hero-stamp" aria-label="系统状态">
      <div class="stamp-line"><span>测评引擎</span><strong class="online">在线</strong></div>
      <div class="stamp-line"><span>检测模式</span><strong>只读静态分析</strong></div>
      <div class="stamp-line"><span>目标代码</span><strong>不执行</strong></div>
      <div class="stamp-line"><span>审计输出</span><strong>独立留存</strong></div>
    </aside>
  </header>
  <nav class="assessment-tabs" aria-label="系统功能">
    <button type="button" role="tab" aria-selected="true" aria-controls="view-assess" data-view="assess">测评任务</button>
    <button type="button" role="tab" aria-selected="false" aria-controls="view-defense" data-view="defense">防护矩阵</button>
    <button type="button" role="tab" aria-selected="false" aria-controls="view-audit" data-view="audit">审计追溯</button>
  </nav>
  <section id="view-assess" class="assessment-view" role="tabpanel">
    <div class="assessment-layout">
      <article class="assessment-card">
        <div class="section-head"><div><h2>新建 Skill 安全测评</h2><p>执行第四组原始三阶段流水线，并生成正式审计记录。</p></div><span class="tag tag-real">真实运行</span></div>
        <div class="evidence-chain" aria-label="三阶段测评证据链">
          <div class="chain-node" data-chain="static"><span>证据 01</span><strong>静态文档筛查</strong><small>提示投毒、恶意链接与可疑元数据</small></div>
          <div class="chain-node" data-chain="permission"><span>证据 02</span><strong>数据权限评估</strong><small>授权等级、文件密级与越权风险</small></div>
          <div class="chain-node" data-chain="behavior"><span>证据 03</span><strong>代码行为识别</strong><small>危险命令、删除、外联与敏感写入</small></div>
        </div>
        <form id="form" class="scan-form">
          <label>待测评 Skill 目录<input id="target" required maxlength="1024" placeholder="输入 OpenClaw 工作区内的 Skill 完整路径" spellcheck="false" autocomplete="off"></label>
          <div class="actions"><button id="scan" type="button">开始真实测评</button><span id="status" class="hint" role="status" aria-live="polite">等待选择目录</span></div>
          <div class="scan-note"><strong>安全边界</strong><span>仅允许扫描管理员配置范围内的普通目录；不会运行待测评代码。</span></div>
        </form>
        <section id="result" class="result assessment-result" hidden aria-live="polite">
          <div class="result-title"><div><div class="eyebrow">正式测评结论</div><h2 id="decision">—</h2><p id="recommendation" class="sub"></p></div><div id="trace" class="trace"></div></div>
          <div class="result-grid"><div class="result-cell"><span>静态风险</span><strong id="static-risk">—</strong></div><div class="result-cell"><span>权限评估</span><strong id="permission-status">—</strong></div><div class="result-cell"><span>行为风险</span><strong id="behavior-risk">—</strong></div><div class="result-cell"><span>高危项</span><strong id="high-risk">—</strong></div></div>
          <p class="mono" id="report"></p>
        </section>
      </article>
      <aside class="assessment-card">
        <div class="section-head"><div><h2>测评边界</h2><p>当前接入 OpenClaw 的真实能力。</p></div></div>
        <div class="system-facts">
          <div class="fact-row"><span>检查对象</span><strong>SKILL.md、skill_config.json、首个 Python 脚本</strong></div>
          <div class="fact-row"><span>处置等级</span><strong>安全 / 警告 / 高危</strong></div>
          <div class="fact-row"><span>调用方式</span><strong>OpenClaw MCP 安全工具</strong></div>
          <div class="fact-row"><span>报告位置</span><strong>独立审计目录</strong></div>
          <div class="fact-row"><span>执行策略</span><strong>只读、限路径、限文件大小</strong></div>
        </div>
        <div class="safety-note">当前“代码行为识别”采用源码规则分析，不是执行代码的隔离沙箱。</div>
      </aside>
    </div>
  </section>
  <section id="view-defense" class="assessment-view" role="tabpanel" hidden>
    <div class="assessment-card">
      <div class="section-head"><div><h2>纵深防护能力矩阵</h2><p>按第四组原始系统设计还原；未落地能力统一标注为演示。</p></div><span class="tag tag-source">设计全景</span></div>
      <div class="capability-map">
        <article class="capability wide"><span class="tag tag-real">真实能力</span><h3>三阶段准入测评</h3><p>静态文档、数据权限与代码行为共同形成测评结论，并输出正式报告。</p><ul><li>风险位置精确到行</li><li>未知权限等级按最高风险处理</li><li>高危结果建议禁止运行</li></ul></article>
        <article class="capability"><span class="tag tag-real">真实能力</span><h3>审计追踪</h3><p>每次测评生成唯一追踪 ID、时间、目标、结论与报告路径。</p></article>
        <article class="capability demo"><span class="tag tag-demo">演示</span><h3>网关自动准入拦截</h3><p>设计目标是在 Skill 加载前自动触发测评，并阻止高危 Skill 进入运行态。</p><button id="run-demo" type="button">演示拦截流程</button></article>
        <article class="capability demo"><span class="tag tag-demo">演示</span><h3>运行时数据访问控制</h3><p>按 Skill 授权等级和文件密级，对每次访问执行放行或阻断。</p><ul><li>公开数据：放行</li><li>敏感数据：权限校验</li><li>绝密数据：默认阻断</li></ul></article>
        <article class="capability demo"><span class="tag tag-demo">演示</span><h3>增强隔离沙箱</h3><p>展示系统命令、文件删除、网络外发和敏感路径写入四类行为策略。</p></article>
        <article class="capability"><span class="tag tag-real">已接入</span><h3>OpenClaw 工具调用</h3><p>通过安全工具发起本机目录测评，目标路径受管理员允许范围约束。</p></article>
      </div>
      <div id="demo-console" class="demo-console" hidden>
        <div class="demo-title"><strong>网关准入拦截流程</strong><span class="tag tag-demo">模拟数据</span></div>
        <div class="demo-flow"><div class="demo-step">发现新 Skill</div><div class="demo-step">触发三阶段测评</div><div class="demo-step">聚合风险结论</div><div class="demo-step">放行或阻断</div></div>
        <p id="demo-status" class="hint" role="status" aria-live="polite">点击上方按钮开始演示。</p>
      </div>
    </div>
  </section>
  <section id="view-audit" class="assessment-view" role="tabpanel" hidden>
    <div id="audit-empty" class="audit-empty"><div><strong>当前页面尚无测评记录</strong><p>完成一次真实测评后，这里将展示追踪 ID、目标目录、测评结论和报告位置。</p><button id="go-assess" type="button">前往测评任务</button></div></div>
    <div id="audit-record" class="audit-record" hidden>
      <article class="audit-ledger"><div class="eyebrow">本次会话 · 正式审计记录</div><h2 id="audit-level">—</h2><div class="ledger-line"><span>测评对象</span><strong id="audit-target">—</strong></div><div class="ledger-line"><span>执行建议</span><strong id="audit-recommendation">—</strong></div><div class="ledger-line"><span>报告文件</span><strong id="audit-report">—</strong></div><div class="ledger-line"><span>目标代码执行</span><strong>否</strong></div></article>
      <aside class="audit-proof"><span>审计追踪 ID</span><strong id="audit-trace">—</strong><p>追踪 ID 与独立报告共同构成本次测评的基础审计证据。当前版本未提供防篡改签名或集中审计数据库。</p></aside>
    </div>
  </section>
  </main>`;
  const script = `
  const tabs=[...document.querySelectorAll('[data-view]')];
  function showView(name){for(const tab of tabs){const active=tab.dataset.view===name;tab.setAttribute('aria-selected',String(active));document.getElementById('view-'+tab.dataset.view).hidden=!active}}
  for(const tab of tabs){tab.addEventListener('click',()=>showView(tab.dataset.view))}
  document.getElementById('go-assess').addEventListener('click',()=>showView('assess'));
  const form=document.getElementById('form'),button=document.getElementById('scan'),status=document.getElementById('status'),result=document.getElementById('result');
  const chain=[...document.querySelectorAll('[data-chain]')];
  function setChain(state){for(const node of chain)node.dataset.state=state}
  async function runAssessment(event){
    event?.preventDefault();if(button.disabled)return;button.disabled=true;status.textContent='正在执行真实只读测评…';status.classList.remove('error');result.hidden=true;setChain('working');
    try{
      const response=await fetch('/plugins/supply-chain-security/api/scan',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({targetPath:document.getElementById('target').value})});
      const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'测评未完成');const data=payload.data;
      setChain('done');result.dataset.level=data.security_level||'';document.getElementById('decision').textContent=data.security_level||'已完成';document.getElementById('recommendation').textContent=data.recommendation||'测评完成';document.getElementById('static-risk').textContent=String(data.static_risk_count??0);document.getElementById('permission-status').textContent=data.permission_status||'未知';document.getElementById('behavior-risk').textContent=String(data.behavior_risk_count??0);document.getElementById('high-risk').textContent=String(data.high_risk_count??0);document.getElementById('trace').textContent='TRACE '+(data.trace_id||'未生成');document.getElementById('report').textContent='正式报告：'+(data.report_path||'未生成');result.hidden=false;status.textContent='真实测评完成 · 目标代码未执行';
      document.getElementById('audit-empty').hidden=true;document.getElementById('audit-record').hidden=false;document.getElementById('audit-level').textContent=data.security_level||'已完成';document.getElementById('audit-target').textContent=data.target||document.getElementById('target').value;document.getElementById('audit-recommendation').textContent=data.recommendation||'测评完成';document.getElementById('audit-report').textContent=data.report_path||'未生成';document.getElementById('audit-trace').textContent=data.trace_id||'未生成';
    }catch(error){setChain('failed');status.textContent=error.message;status.classList.add('error')}finally{button.disabled=false}
  }
  button.addEventListener('click',runAssessment);
  form.addEventListener('submit',runAssessment);
  document.getElementById('target').addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();runAssessment(event)}});
  const demoButton=document.getElementById('run-demo'),demoConsole=document.getElementById('demo-console'),demoStatus=document.getElementById('demo-status'),demoSteps=[...document.querySelectorAll('.demo-step')];
  demoButton.addEventListener('click',async()=>{demoConsole.hidden=false;demoButton.disabled=true;for(const item of demoSteps)item.className='demo-step';const delay=matchMedia('(prefers-reduced-motion: reduce)').matches?80:420;for(let index=0;index<demoSteps.length;index++){demoSteps[index].classList.add('active');demoStatus.textContent='演示：'+demoSteps[index].textContent;await new Promise(resolve=>setTimeout(resolve,delay));demoSteps[index].classList.remove('active');demoSteps[index].classList.add('done')}demoStatus.textContent='演示完成：模拟高危 Skill 在加载前被阻断；未执行真实拦截。';demoButton.disabled=false});`;
  return page("智能体安全测评与审计", body, script);
}
