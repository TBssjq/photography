/* ============================================================
 * reveal.js — 「进入视口 → 加 class」的统一实现
 *
 * ui.js 与 data.js 原先各有一份几乎一样的 revealClass()，差别只在
 * 「是否接受 NodeList / 单个元素入参」和默认阈值，此处合并为单一来源。
 *
 * 优先用 ScrollTrigger.batch（与 Lenis 平滑滚动同步），插件缺失时
 * 退回原生 IntersectionObserver，保证降级可用。
 *
 * 依赖：需在 ui.js / data.js 之前加载。
 * ============================================================ */
(function () {
  'use strict';

  /* sel 可以是：选择器字符串 / 单个元素 / NodeList / 数组 */
  function toElements(sel) {
    if (typeof sel === 'string') return document.querySelectorAll(sel);
    if (sel && sel.nodeType) return [sel];
    if (sel && sel.length !== undefined) return sel;
    return null;
  }

  function revealClass(sel, cls, threshold) {
    var els = toElements(sel);
    if (!els || !els.length) return;

    if (typeof window.ScrollTrigger === 'undefined') {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add(cls);
          io.unobserve(en.target);
        });
      }, { threshold: threshold || 0.2 });
      Array.prototype.forEach.call(els, function (el) { io.observe(el); });
      return;
    }

    /* threshold 0.4 → start: 'top 60%'：元素顶部到达视口 60% 高度处才触发 */
    window.ScrollTrigger.batch(els, {
      start: 'top ' + (100 - Math.min(100, (threshold || 0.2) * 100)) + '%',
      onEnter: function (batch) {
        batch.forEach(function (el) { el.classList.add(cls); });
      }
    });
  }

  window.Reveal = { class: revealClass };
})();
