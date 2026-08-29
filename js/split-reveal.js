/* ============================================================
 * split-reveal.js — 文字逐字入场动画
 * 对 .split 元素拆分字符，从下方 110% 上浮并淡入，字间 0.05s 错落。
 * 用 ScrollTrigger 触发，确保「文字显示出来时」才播放。
 *
 * 重排策略（替代 SplitText 的 autoSplit）：autoSplit 把重排时机完全交给
 * GSAP 内部，在字体未就绪 / 容器尺寸变化时不保证字符一定落回 DOM，实测
 * 会出现「拆分后字符消失」的情况。这里改成显式重排——字体就绪与容器
 * 尺寸变化时 revert + 重建，行为完全可控，且已揭幕的不重复播、未揭幕的
 * 仍按滚动触发。
 * ============================================================ */
(function () {
  'use strict';

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function init() {
    if (typeof window.gsap === 'undefined' || typeof window.SplitText === 'undefined') {
      console.warn('[split-reveal] GSAP / SplitText 未加载，跳过文字逐字动画。');
      return;
    }
    // 降级偏好：标题保持原样文字，不做逐字动画（避免无障碍场景下的闪烁）
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);
    gsap.registerPlugin(window.SplitText);

    var els = Array.prototype.slice.call(document.querySelectorAll('.split'));
    if (!els.length) return;

    els.forEach(function (el) {
      if (el.dataset.splitReveal === 'done') return;
      el.dataset.splitReveal = 'done';

      var revealed = false;   // 已揭幕后再重排就直接落定，避免重复播 / 闪烁
      var split = null;
      var tween = null;

      function build() {
        // 重排前必须先 kill 旧动画（含其 ScrollTrigger）：否则旧的 once:true 触发器会在
        // ScrollTrigger.refresh() 时重新解析它引用的、已被 revert 的 split.chars
        // （此时已变成空集合），从而刷出 "GSAP target [object HTMLCollection] / not found" 警告。
        if (tween) {
          if (tween.scrollTrigger) tween.scrollTrigger.kill();
          tween.kill();
          tween = null;
        }
        if (split) split.revert();            // 还原到纯文本，避免嵌套拆分
        try {
          split = SplitText.create(el, { type: 'words, chars' });
        } catch (e) {
          console.warn('[split-reveal] SplitText 失败，跳过:', e);
          return;
        }
        if (revealed) {
          gsap.set(split.chars, { yPercent: 0, autoAlpha: 1 });
          return;
        }
        // immediateRender:false —— 尚未进入视口的标题先保持原样，滚动到达时才隐藏→揭幕，
        // 否则（首屏可见元素）会被 gsap.from 先藏起来却迟迟不触发。
        tween = gsap.from(split.chars, {
          yPercent: 110,
          autoAlpha: 0,
          stagger: 0.05,
          duration: 1,
          ease: 'power3.out',
          immediateRender: false,
          scrollTrigger: window.ScrollTrigger ? {
            trigger: el,
            start: 'top 85%',
            once: true,
            onEnter: function () { revealed = true; }
          } : undefined,
          onComplete: function () { revealed = true; }   // 无 ScrollTrigger 时的兜底
        });
      }

      build();   // 首次：带揭幕动画

      // 字体就绪后重排（回退字体 → 真实字体度量不同，必须重新拆分才对齐）
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () { build(); });
      }
      // 容器尺寸变化（窗口缩放 / 布局改变）后重排，debounce 避免频繁重建
      if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(debounce(function () { build(); }, 200));
        ro.observe(el);
      }
    });

    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
