/* ============================================================
 * text-scramble.js — 文字解扰入场（ScrambleTextPlugin）
 * 进入视口时，目标文本先用随机字符「洗」一遍再逐段落定，
 * 像暗房里影像慢慢显影。
 *
 * 目标以 TARGETS 配置，只对纯拉丁短句使用：中文字符被随机字符替换时
 * 字宽不同，会明显抖动。
 * 依赖 gsap / ScrollTrigger / ScrambleTextPlugin，全部可选；插件缺失或
 * 用户开启 prefers-reduced-motion 时静默跳过（保留原始文本）。
 * ============================================================ */
(function () {
  'use strict';

  var gsap = window.gsap;
  if (!gsap || !window.ScrambleTextPlugin) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var hasST = typeof window.ScrollTrigger !== 'undefined';
  if (hasST) gsap.registerPlugin(window.ScrollTrigger, window.ScrambleTextPlugin);
  else gsap.registerPlugin(window.ScrambleTextPlugin);

  var TARGETS = [
    {
      sel: '.display-sub',
      chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ·',
      duration: 1.6,
      revealDelay: 0.25,
      speed: 0.55
    }
  ];

  function init() {
    TARGETS.forEach(function (cfg) {
      var els = document.querySelectorAll(cfg.sel);
      Array.prototype.forEach.call(els, function (el) {
        if (el.dataset.scrambled === '1') return;
        el.dataset.scrambled = '1';

        var text = el.textContent.trim();
        if (!text) return;

        var vars = {
          duration: cfg.duration,
          scrambleText: {
            text: text,
            chars: cfg.chars,
            revealDelay: cfg.revealDelay,
            speed: cfg.speed
          }
        };
        /* 用 scrollTrigger 把播放时机推迟到真正进入视口：
           scrambleText 是 tween 属性，只有给它挂 ScrollTrigger，
           GSAP 才会在触发前保持原文本不洗牌。 */
        if (hasST) vars.scrollTrigger = { trigger: el, start: 'top 85%', once: true };

        gsap.to(el, vars);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
