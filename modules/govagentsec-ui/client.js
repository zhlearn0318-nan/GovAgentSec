(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const runtimeState = document.querySelector('#system-state');
  if (runtimeState) {
    const updateState = () => { runtimeState.closest('.system-state').dataset.health = /不可用|失败/.test(runtimeState.textContent) ? 'unavailable' : /已连接/.test(runtimeState.textContent) ? 'online' : 'pending'; };
    new MutationObserver(updateState).observe(runtimeState, {childList:true,subtree:true,characterData:true});
    updateState();
  }
  const quote = document.querySelector('#gs-quote');
  if (quote) {
    const items = ['输入防护链关注输入与输出风险，为对话建立第一道防线。','运行时安全约束工具调用与任务执行，将策略、审批和回执连接起来。','供应链安全核验组件来源与风险，通过准入和规则管理守住使用边界。'];
    let index = 0;
    const show = delta => { index = (index + delta + items.length) % items.length; quote.textContent = items[index]; document.querySelector('#gs-quote-count').textContent = (index + 1) + ' / 3'; if (!reduce && window.gsap) gsap.fromTo(quote,{opacity:.3,y:8},{opacity:1,y:0,duration:.35}); };
    document.querySelector('#gs-prev').addEventListener('click', () => show(-1));
    document.querySelector('#gs-next').addEventListener('click', () => show(1));
  }
  if (!window.gsap || !window.ScrollTrigger || reduce) return;
  gsap.registerPlugin(ScrollTrigger);
  if (document.body.dataset.govKind !== 'hub') gsap.fromTo('.masthead,.product-header,.hero', {y:8,opacity:.75}, {y:0,opacity:1,duration:.45,clearProps:'transform,opacity'});
  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px)', () => {
    if (!document.querySelector('.gs-story')) return;
    gsap.fromTo('.gs-reveal span', {opacity:.2}, {opacity:1,stagger:.4,scrollTrigger:{trigger:'.gs-story',start:'top 75%',end:'bottom 80%',scrub:1}});
    gsap.utils.toArray('.gs-stack article').forEach((card,i) => gsap.to(card,{scale:1-(2-i)*.025,transformOrigin:'top center',scrollTrigger:{trigger:card,start:'top 150px',end:'bottom 120px',scrub:true}}));
    ScrollTrigger.create({trigger:'.gs-story-title',start:'top 130px',endTrigger:'.gs-story',end:'bottom bottom',pin:true,pinSpacing:false});
  });
  document.querySelectorAll('button[data-gov-view]').forEach(button => button.addEventListener('click', () => {
    requestAnimationFrame(() => { ScrollTrigger.refresh(); window.scrollTo({top:0,behavior:'auto'}); });
  }));
})();
