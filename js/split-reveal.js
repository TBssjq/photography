/* ============================================================
 * split-reveal.js — 文字逐字入场动画
 * 采用用户指定的 SplitText + GSAP 逻辑：对 .split 元素拆分字符，
 * 从下方 100px 上浮并淡入，字间 0.05s 错落（stagger）。
 * 用 ScrollTrigger 触发，确保「文字显示出来时」才播放，并修复
 * gsap.from 对首屏可见元素「永久隐藏」的经典 bug（immediateRender:false）。
 * 零侵入：未引入 GSAP/SplitText 时静默跳过。
 * ============================================================ */
(function () {
  'use strict';

  function init() {
    if (typeof window.gsap === 'undefined' || typeof window.SplitText === 'undefined') {
      console.warn('[split-reveal] GSAP / SplitText 未加载，跳过文字逐字动画。');
      return;
    }
    if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);
    gsap.registerPlugin(window.SplitText);

    var els = Array.prototype.slice.call(document.querySelectorAll('.split'));
    if (!els.length) return;

    els.forEach(function (el) {
      if (el.dataset.splitReveal === 'done') return;
      el.dataset.splitReveal = 'done';

      var split;
      try {
        split = SplitText.create(el, { type: 'words, chars' });
      } catch (e) {
        console.warn('[split-reveal] SplitText 失败，跳过:', e);
        return;
      }

      // —— 用户指定核心逻辑 ——
      gsap.from(split.chars, {
        duration: 1,
        y: 100,            // 从 100px 下方
        autoAlpha: 0,      // 由 opacity:0 + visibility:hidden 淡入
        stagger: 0.05,     // 每字错落 0.05s
        ease: 'power3.out',
        immediateRender: false, // 关键：首屏可见元素不会先被隐藏后永远不触发
        scrollTrigger: window.ScrollTrigger ? {
          trigger: el,
          start: 'top 85%',
          once: true
        } : undefined
      });
    });

    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
