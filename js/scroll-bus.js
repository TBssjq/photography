/* ============================================================
 * scroll-bus.js — 全站统一的滚动订阅中心
 *
 * 改造前：nav / scrollIndEnhanced / parallax / lenis 回调各自注册一个
 * scroll 监听，各自做一次 rAF 节流、各自读一遍 scrollY —— 同一帧里
 * 被重复调度、重复触发布局读取。
 *
 * 改造后：一个监听 + 一次 rAF + 一次读数，订阅者共享同一帧的结果。
 *
 * 注意：Lenis 1.x 驱动的是原生滚动，window 的 scroll 事件照常派发，
 * 因此这里不需要再挂 lenis.on('scroll')，否则同一帧会被调度两次。
 *
 * 依赖：需在 ui.js / animations.js 之前加载。
 * ============================================================ */
(function () {
  'use strict';

  var subs = [];
  var queued = false;

  function currentY() {
    return window.scrollY || window.pageYOffset || 0;
  }

  function flush() {
    queued = false;
    var y = currentY();
    for (var i = 0; i < subs.length; i++) {
      try {
        subs[i](y);
      } catch (e) {
        // 单个订阅者抛错不能拖垮整条总线
        console.error('[scroll-bus] 订阅者异常:', e);
      }
    }
  }

  function request() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(flush);
  }

  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);

  window.ScrollBus = {
    /* 注册订阅者，并立刻用当前滚动位置跑一次（调用方不必再自己初始化一次） */
    onScroll: function (fn) {
      subs.push(fn);
      fn(currentY());
      return function off() {
        var i = subs.indexOf(fn);
        if (i >= 0) subs.splice(i, 1);
      };
    },
    /* 内容或尺寸变化后主动触发一次重算 */
    kick: request
  };
})();
