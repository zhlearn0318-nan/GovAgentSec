import { existsSync, readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const logo = read('./logo.svg');
const css = read('./design.css');
const client = read('./client.js');
const vendor = ['gsap.min.js', 'ScrollTrigger.min.js'].map(name => read('./vendor/' + name).replace(/\/\/# sourceMappingURL=.*$/gm, '')).join('\n');
const fontPath = new URL('./vendor/CabinetGrotesk-Bold.woff2', import.meta.url);
const font = existsSync(fontPath) ? readFileSync(fontPath).toString('base64') : null;
const fontFace = font ? `@font-face{font-family:Cabinet;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:700;font-display:swap}` : '';
const lockup = `<a class="gs-brand" href="/plugins/govagentsec/panel" aria-label="政安智枢安全总览">${logo}<span><strong>政安智枢 <b>GovAgentSec</b></strong><small>GOVERNMENT AGENT SECURITY</small></span></a>`;
const hero = `<header class="gs-hero"><div class="gs-hero-copy"><p class="gs-overline">以信任为帆 · 以安全为界</p><h1>让智能体行有所界，<br>让每一步安全可见。</h1><p class="gs-intro">从输入到执行，从组件来源到风险处置。<br>三域联防，在一个安全中枢中协同。</p><div class="gs-hero-actions"><button data-open-module="protect" type="button">进入输入防护链 <span aria-hidden="true">↗</span></button><a href="#capabilities">探索防护能力 <span aria-hidden="true">↓</span></a></div></div><div class="gs-emblem" aria-label="融合暨南大学校徽青色与帆形意象的原创帆盾标识"><div class="gs-orbit"></div><div class="gs-emblem-inner">${logo}</div><span class="gs-emblem-caption">三域协同 / 守护智能</span><span class="gs-axis">TRUST BY DESIGN</span></div></header>`;
const story = `<section class="gs-story" aria-label="三域联防说明"><div class="gs-story-title"><p class="gs-overline">一条完整的防护路径</p><h2>安全，贯穿<br>智能体的每一步。</h2><p class="gs-reveal"><span>看清输入，</span><span>约束执行，</span><span>信任来源。</span><span>让风险有处可查，</span><span>让处置有据可循。</span></p></div><div class="gs-stack"><article><span>输入防护链</span><h3>先理解风险，再交给模型。</h3><p>在输入、策略、工具与模型输出环节持续检查，建立完整对话防线。</p><button data-open-module="protect">查看输入防护 <span aria-hidden="true">↗</span></button></article><article><span>运行时安全</span><h3>每次工具调用，都有边界。</h3><p>通过允许、审批与阻断三态决策，把权限控制落实到具体执行动作。</p><button data-open-module="agentguard">查看运行控制 <span aria-hidden="true">↗</span></button></article><article><span>供应链安全</span><h3>可信组件，始于来源核验。</h3><p>集中管理组件准入、风险报告与安全规则，让供应链风险清晰可查。</p><button data-open-module="aegis">查看供应链防护 <span aria-hidden="true">↗</span></button></article></div></section><section class="gs-carousel" aria-label="防护能力说明"><span class="gs-overline">协同，而不混淆职责</span><p id="gs-quote" aria-live="polite">输入防护链关注输入与输出风险，为对话建立第一道防线。</p><div><span id="gs-quote-count">1 / 3</span><button type="button" id="gs-prev" aria-label="上一条能力说明">←</button><button type="button" id="gs-next" aria-label="下一条能力说明">→</button></div></section><section class="gs-cta"><div><p class="gs-overline">从这里，开始安全协同</p><h2>让防护回到每一次行动。</h2></div><button type="button" data-open-module="protect">打开工作台 <span aria-hidden="true">↗</span></button></section>`;

export function brandPage(html, kind) {
  if (html.includes('data-gov-design="2026"')) return html;
  if (kind === 'hub') {
    const nav = html.match(/<nav class="gov-tabs"[\s\S]*?<\/nav>/)?.[0] || '';
    html = html.replace(nav, '').replace(/<header class="gov-hero">[\s\S]*?<\/header>/, `<div class="gs-topbar">${lockup}<span class="gs-local">本机安全工作台</span></div>${nav}`);
    html = html.replace('<section id="gov-overview" class="gov-view">', `<section id="gov-overview" class="gov-view">${hero}<div class="gs-marquee" aria-hidden="true"><div>INPUT GUARD / RUNTIME SECURITY / SUPPLY CHAIN / TRUST BY DESIGN / INPUT GUARD / RUNTIME SECURITY / SUPPLY CHAIN / TRUST BY DESIGN / </div></div>`);
    html = html.replace('<article class="gov-section">', '<article class="gov-section" id="capabilities">');
    html = html.replace('  <section id="gov-module-view"', `  ${story}</section><section id="gov-module-view"`);
    // Move the storytelling chapters into the overview, keeping module pages compact.
    html = html.replace(/<\/article>\s*<\/section>\s*(<section class="gs-story")/, '</article>$1');
  } else {
    html = html.replace(/<body([^>]*)>/, `<body$1><nav class="gs-topbar gs-module-top" aria-label="品牌导航">${lockup}<span class="gs-local">${{protect:'输入防护链',runtime:'运行时安全',aegis:'供应链安全'}[kind]}</span></nav>`);
    html = html.replace(/<div class="brand-mark">[\s\S]*?<\/div>/, `<div class="brand-mark">${logo}</div>`);
    html = html.replace(/<div class="product-mark"[^>]*>[\s\S]*?<\/div>/, `<div class="product-mark">${logo}</div>`);
  }
  html = html.replace(/<body([^>]*)>/, `<body$1 data-gov-design="2026" data-gov-kind="${kind}">`);
  return html.replace('</head>', () => `<style>${fontFace}${css}</style></head>`).replace('</body>', () => `<footer class="gs-footer"><span>政安智枢 GovAgentSec</span><span>三域联防 · 本机协同</span></footer><script>${vendor}</script><script>${client}</script></body>`);
}
