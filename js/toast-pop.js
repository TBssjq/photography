/* ============================================================
 * toast-pop.js — 滚动进入版块时，从右侧弹出的搞怪消息框
 * 动画与配色移植自 GSAP 官方 CodePen（Menu example）:
 *   https://codepen.io/GreenSock/pen/qEaKJZr
 *   · 进入：面板从右侧 x:110% 滑入，回弹 back.out(1.4)
 *   · 退出：向下降落 + 随机旋转 rotation:random(-25,25)，power3.in
 *   · 配色：冲击波绿 #0ae448 / 浅绿 #abff84 / 近黑 #0e100f / 米白 #fffce1
 * 仅借用其「动画 + 颜色」，文案为站点原创搞怪颜文字。
 * 依赖 gsap / ScrollTrigger。
 * ============================================================ */
(function () {
  'use strict';

  var TOASTS = [
    '你又往下滚啦，隋北的照片可不会跑 (￣▽￣)~*',
    '这张曝光我赌五毛是对的 (｡･ω･｡)',
    '悄悄说：对焦对了一半 (´・ω・｀)',
    '光是借来的，看完记得还 (｡•̀ᴗ-)✧',
    '此处应有掌声，但相机在录 (╯°□°)╯',
    '你 scroll 得比我还快 (・∀・)',
    '隋北：这张拍了四小时，你两秒划过 (；´Д｀)',
    '别眨眼，下一张更绝 (◕‿◕)',
    '暗房里洗出来的，香不香 (✿◡‿◡)',
    '你已经看这么多张了，惊不惊喜 (≧▽≦)',
    '风停了，光刚落，正好被你看见 (｡ﾟ▽ﾟ｡)',
    '这帧不完美，但刚好是当时的样子 (´･_･`)'
  ];

  function init() {
    if (typeof window.gsap === 'undefined' || typeof window.ScrollTrigger === 'undefined') {
      console.warn('[toast-pop] GSAP/ScrollTrigger 未加载，跳过弹出消息。');
      return;
    }
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.registerPlugin(window.ScrollTrigger);

    var stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-hidden', 'true');
    document.body.appendChild(stack);

    var MAX_VISIBLE = 3;
    var shown = {};

    function pickText() {
      return TOASTS[Math.floor(Math.random() * TOASTS.length)];
    }

    function pop() {
      if (stack.children.length >= MAX_VISIBLE) return;
      var el = document.createElement('div');
      el.className = 'toast';
      el.textContent = pickText();
      stack.appendChild(el);
      stack.setAttribute('aria-hidden', 'false');

      // 进入：复刻 pen 的 fromTo x:110% → 0，回弹 back.out(1.4)
      gsap.fromTo(el,
        { xPercent: 120, rotation: gsap.utils.random(-8, 8), autoAlpha: 0 },
        {
          xPercent: 0, rotation: 0, autoAlpha: 1,
          duration: 0.6, ease: 'back.out(1.4)',
          onComplete: function () {
            // 停留后退出：复刻 pen 的「坠落 + 随机旋转」
            gsap.to(el, {
              yPercent: 130, rotation: gsap.utils.random(-25, 25),
              autoAlpha: 0, duration: 0.9, ease: 'power3.in',
              delay: 2.6 + Math.random() * 1.4,
              onComplete: function () {
                if (el.parentNode) el.parentNode.removeChild(el);
                if (!stack.children.length) stack.setAttribute('aria-hidden', 'true');
              }
            });
          }
        }
      );
    }

    // 给页面主要版块绑定：进入视口时各弹一次（避免重复打扰）。
    // 修正：原先写的是 #quote / #gear / #archive / #testimonials，这四个 ID 在
    // index.html 里并不存在（真实节点是 .quote-section / .gear-section，另两个压根没有），
    // 等于这四个配置项一直是死配置。
    var sections = document.querySelectorAll(
      '#featured, #showcase, #hsSection, .quote-section, #about, #gallery, .gear-section, #contact'
    );
    sections.forEach(function (sec, i) {
      ScrollTrigger.create({
        trigger: sec,
        start: 'top 70%',
        once: true,
        onEnter: function () {
          // 轻微错峰，避免同屏多条同时砸出
          setTimeout(pop, (i % 2) * 350 + Math.random() * 400);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
