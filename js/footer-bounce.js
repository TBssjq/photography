/* ============================================================
 * footer-bounce.js — 页脚波浪随滚动速度弹性形变
 * 移植自 GSAP 官方 CodePen: Footer Bounce Based on Scroll Speed
 *   https://codepen.io/GreenSock/pen/bGeZvpO
 * 用 MorphSVGPlugin 让 path 在 down（下垂）与 center（拉平）之间形变，
 * 滚动越快，elastic 回弹越强。依赖 gsap / ScrollTrigger / MorphSVGPlugin。
 * ============================================================ */
(function () {
  'use strict';

  function init() {
    if (typeof window.gsap === 'undefined' ||
        typeof window.ScrollTrigger === 'undefined' ||
        typeof window.MorphSVGPlugin === 'undefined') {
      console.warn('[footer-bounce] GSAP/ScrollTrigger/MorphSVGPlugin 未加载，跳过波浪动画。');
      return;
    }
    gsap.registerPlugin(window.ScrollTrigger, window.MorphSVGPlugin);

    var path = document.querySelector('#bouncy-path');
    if (!path) return;

    var down = 'M0-0.3C0-0.3,464,156,1139,156S2278-0.3,2278-0.3V683H0V-0.3z';
    var center = 'M0-0.3C0-0.3,464,0,1139,0s1139-0.3,1139-0.3V683H0V-0.3z';

    ScrollTrigger.create({
      trigger: '.footer-wave',
      start: 'top bottom',
      toggleActions: 'play pause resume reverse',
      onEnter: function (self) {
        var velocity = self.getVelocity();
        var variation = velocity / 10000;

        gsap.fromTo('#bouncy-path', {
          morphSVG: down
        }, {
          duration: 2,
          morphSVG: center,
          ease: 'elastic.out(' + (1 + variation) + ', ' + (1 - variation) + ')',
          overwrite: 'true'
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
