/* ================================================================
   自定义光标（液态玻璃跟随环）
   前端 / 后台共用，单一来源。复制自 ui.js 的 cursor 逻辑并扩展
   后台专属选择器（.an-item / .row-card / .rc-del 等）。
   ================================================================ */
(function () {
  'use strict';

  function init() {
    window.__cursorReady = true; // 供 load-steps.js 作为「初始化光标与光晕」步骤信号
    if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) return;
    var dot = document.querySelector('.cursor-dot');
    var ring = document.querySelector('.cursor-ring');
    if (!dot || !ring) return;

    var rx = 0, ry = 0, mx = 0, my = 0;
    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.left = mx + 'px'; dot.style.top = my + 'px';
    });

    var running = true;
    (function loop() {
      if (running) {
        rx += (mx - rx) * 0.2; ry += (my - ry) * 0.2;
        ring.style.left = rx + 'px'; ring.style.top = ry + 'px';
      }
      requestAnimationFrame(loop);
    })();

    // 滚动时停一帧推算，恢复滚轮后继续；标签页隐藏时彻底停
    document.addEventListener('visibilitychange', function () { running = !document.hidden; });
    if (window.lenis) {
      window.lenis.on('scroll', function () { running = false; });
      window.lenis.on('scrollend', function () { running = true; });
    }
    window.addEventListener('mousemove', function () { running = true; });

    var hoverSel = 'a, button, .card, .featured-img-wrap, .fr-media, .gear-item, .contact-item, ' +
      '.filters button, [data-magnetic], .rc-del, .an-item, .row-card, .thumb, .tag-chip, ' +
      '.hs-panel, .archive-row, .showcase-card';

    function clearStates() {
      ring.classList.remove('hover', 'view', 'drag', 'scroll', 'open');
    }

    document.addEventListener('mouseover', function (e) {
      if (e.target.closest('.hs-panel')) { clearStates(); ring.classList.add('drag'); }
      else if (e.target.closest('.archive-row')) { clearStates(); ring.classList.add('open'); }
      else if (e.target.closest('.featured-img-wrap, .fr-media, .card, .row-card, .thumb, .showcase-card')) {
        clearStates(); ring.classList.add('view');
      }
      else if (e.target.closest(hoverSel)) { clearStates(); ring.classList.add('hover'); }
    });
    document.addEventListener('mouseout', function (e) {
      var related = e.relatedTarget;
      if (related && e.target.closest && related.closest && e.target.closest(hoverSel + ', .hs-panel, .archive-row') && related.closest(hoverSel + ', .hs-panel, .archive-row')) return;
      if (e.target.closest('.hs-panel')) ring.classList.remove('drag');
      else if (e.target.closest('.archive-row')) ring.classList.remove('open');
      else if (e.target.closest('.featured-img-wrap, .fr-media, .card, .row-card, .thumb, .showcase-card')) { ring.classList.remove('view'); }
      else if (e.target.closest(hoverSel)) ring.classList.remove('hover');
    });

    /* 按下/松开时缩放光标环 */
    document.addEventListener('mousedown', function () { ring.style.transform = 'translate(-50%,-50%) scale(.82)'; });
    document.addEventListener('mouseup', function () { ring.style.transform = 'translate(-50%,-50%) scale(1)'; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
