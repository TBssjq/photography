/* ============================================================
 * gear-elastic.js — 把 TEST/index.html 的 GSAP 弹性交互
 * （easeReverse + timeScale 平滑反向）移植到机身/器材区。
 *
 * 对应 TEST 的三类效果：
 *   1) Button hover 弹性放大   -> gear-item 悬停时弹性放大 + 上移
 *   2) Tooltip 弹性弹出        -> .gear-tip 气泡用 elastic.out 弹出
 *   3) tipTarget 脉冲缩放      -> 图标 gear-icon 同步弹性脉冲
 *
 * 反向（mouseleave）用 tl.timeScale(exit).reverse() + easeReverse，
 * 退出顺滑不回弹，与 TEST 完全一致。
 * 受 prefers-reduced-motion 保护（降级为简单位移/淡入）。
 * 本脚本在 GSAP 加载之后引入（index.html 末尾），可安全使用 window.gsap。
 * ============================================================ */
(function () {
  'use strict';

  var gsap = window.gsap;
  if (!gsap) { console.warn('[gear-elastic] GSAP 未加载'); return; }

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 进场缓动 / 反向缓动（TEST 的 easeReverse 模式）
  var IN_EASE = reduce ? 'power2.out' : 'elastic.out(1.2, 0.32)';
  var OUT_EASE = reduce ? 'power2.in' : 'power3.out';
  var EXIT_TS = reduce ? 1 : 2.2;          // 反向时间倍率，越大退出越快越稳
  var HOVER_SCALE = reduce ? 1.03 : 1.06;  // 卡片弹性放大
  var ICON_SCALE = reduce ? 1.1 : 1.22;    // 图标脉冲

  function bindOne(item) {
    if (item._elasticBound) return;
    item._elasticBound = true;

    var icon = item.querySelector('.gear-icon');
    var tip = item.querySelector('.gear-tip');
    if (!icon) return;

    // 初始隐藏态（对应 TEST tooltip 的 gsap.set）
    if (tip) {
      gsap.set(tip, { autoAlpha: 0, xPercent: -50, y: reduce ? 6 : 12, scale: reduce ? 1 : 0.6 });
    }
    gsap.set(icon, { transformOrigin: '50% 50%' });

    var tl = gsap.timeline({ paused: true });
    tl.to(item, {
          scale: HOVER_SCALE,
          y: -6,
          duration: reduce ? 0.35 : 1.0,
          ease: IN_EASE,
          easeReverse: OUT_EASE
        }, 0)
      .to(icon, {
          scale: ICON_SCALE,
          duration: reduce ? 0.3 : 0.8,
          ease: reduce ? 'power2.out' : 'elastic.out(1.2, 0.3)',
          easeReverse: OUT_EASE
        }, 0);

    if (tip) {
      tl.to(tip, {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: reduce ? 0.3 : 0.9,
            ease: reduce ? 'power2.out' : 'elastic.out(1.2, 0.3)',
            easeReverse: OUT_EASE
          }, 0);
    }

    item.addEventListener('mouseenter', function () { tl.timeScale(1).play(); });
    item.addEventListener('mouseleave', function () { tl.timeScale(EXIT_TS).reverse(); });
    item.addEventListener('focusin', function () { tl.timeScale(1).play(); });
    item.addEventListener('focusout', function () { tl.timeScale(EXIT_TS).reverse(); });
  }

  function init() {
    var items = Array.prototype.slice.call(document.querySelectorAll('.gear-item'));
    items.forEach(bindOne);

    // gear-list 由 data.js 在 GSAP 之前同步渲染，通常此时已存在；
    // 用 MutationObserver 兜底动态注入的卡片。
    var list = document.getElementById('gearList');
    if (list && 'MutationObserver' in window) {
      var mo = new MutationObserver(function () {
        Array.prototype.slice.call(list.querySelectorAll('.gear-item')).forEach(bindOne);
      });
      mo.observe(list, { childList: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
