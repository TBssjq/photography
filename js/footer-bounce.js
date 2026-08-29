/* ============================================================
 * footer-bounce.js — 页脚波浪随滚动速度弹性形变
 * 移植自 GSAP 官方 CodePen: Footer Bounce Based on Scroll Speed
 *   https://codepen.io/GreenSock/pen/bGeZvpO
 * 用 MorphSVGPlugin 让 path 在 down（下垂）与 center（拉平）之间形变，
 * 滚动越快，elastic 回弹越强。依赖 gsap / ScrollTrigger / MorphSVGPlugin。
 * ============================================================ */
(function () {
  'use strict';

  /* 波浪的两个形变状态：down（下垂）与 center（拉平） */
  var DOWN = 'M0-0.3C0-0.3,464,156,1139,156S2278-0.3,2278-0.3V683H0V-0.3z';
  var CENTER = 'M0-0.3C0-0.3,464,0,1139,0s1139-0.3,1139-0.3V683H0V-0.3z';

  function init() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof window.gsap === 'undefined' ||
        typeof window.ScrollTrigger === 'undefined' ||
        typeof window.MorphSVGPlugin === 'undefined') {
      console.warn('[footer-bounce] GSAP/ScrollTrigger/MorphSVGPlugin 未加载，跳过波浪动画。');
      return;
    }
    gsap.registerPlugin(window.ScrollTrigger, window.MorphSVGPlugin);

    var path = document.querySelector('#bouncy-path');
    if (!path) return;

    /* elastic.out(amplitude, period) 要求 period > 0：把滚动速度换算出的形变量夹在
       安全区间，避免快速滚动时算出负值导致缓动失效（原先未夹取，快滚时参数非法）。 */
    var clampVariation = gsap.utils.clamp(-0.6, 0.6);

    ScrollTrigger.create({
      trigger: '.footer-wave',
      start: 'top bottom',
      onEnter: function (self) {
        var variation = clampVariation(self.getVelocity() / 10000);

        gsap.fromTo(path, {
          morphSVG: DOWN
        }, {
          duration: 2,
          morphSVG: CENTER,
          ease: 'elastic.out(' + (1 + variation) + ', ' + (1 - variation) + ')',
          /* 必须是布尔 true：字符串 'true' 不参与 GSAP 的严格比较，overwrite 会静默失效，
             导致快速反复进入时多个 morph tween 互相叠加。 */
          overwrite: true
        });
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
