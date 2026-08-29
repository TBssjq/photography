/* ================================================================
   自定义光标（液态玻璃跟随环）
   前端 / 后台共用，单一来源。复制自 ui.js 的 cursor 逻辑并扩展
   后台专属选择器（.an-item / .row-card / .rc-del 等）。
   ================================================================ */
(function () {
  'use strict';

  function init() {
    if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) return;
    var dot = document.querySelector('.cursor-dot');
    var ring = document.querySelector('.cursor-ring');
    if (!dot || !ring) return;

    /* 用 CSS 独立属性 `translate` 定位，而不是写 left/top：
       left/top 是布局属性，每帧写入会强制 layout，滚动时尤其明显。
       `translate` 与 CSS 里已有的 transform（居中 / scale）互不冲突，
       与 ui.js 的 magnetic() 用的是同一套写法。 */
    var rx = 0, ry = 0, mx = 0, my = 0;
    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.translate = mx + 'px ' + my + 'px';
    });

    var running = true;
    (function loop() {
      if (running) {
        var dx = mx - rx, dy = my - ry;
        // 位置已收敛时不再写样式：鼠标静止的空闲帧彻底不产生样式写入
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          rx += dx * 0.2; ry += dy * 0.2;
          ring.style.translate = rx.toFixed(1) + 'px ' + ry.toFixed(1) + 'px';
        }
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
    /* 悬停时光标环显示 "VIEW" 的媒体容器，mouseover / mouseout 两处共用 */
    var viewSel = '.featured-img-wrap, .fr-media, .card, .row-card, .thumb, .showcase-card';

    function clearStates() {
      ring.classList.remove('hover', 'view', 'drag', 'scroll', 'open');
    }

    /* e.target 不一定是 Element（事件被直接派发到 document 时就是 document），
       统一走 closestFrom 守卫；mouseout 分支早就有这层判断，mouseover 分支漏了。 */
    function closestFrom(e, sel) {
      return (e.target && e.target.closest) ? e.target.closest(sel) : null;
    }

    document.addEventListener('mouseover', function (e) {
      if (closestFrom(e, '.hs-panel')) { clearStates(); ring.classList.add('drag'); }
      else if (closestFrom(e, '.archive-row')) { clearStates(); ring.classList.add('open'); }
      else if (closestFrom(e, viewSel)) { clearStates(); ring.classList.add('view'); }
      else if (closestFrom(e, hoverSel)) { clearStates(); ring.classList.add('hover'); }
    });

    document.addEventListener('mouseout', function (e) {
      var related = e.relatedTarget;
      var staySel = hoverSel + ', .hs-panel, .archive-row';
      // 在两个同类元素之间移动不算离开，避免状态闪烁
      if (related && related.closest && closestFrom(e, staySel) && related.closest(staySel)) return;
      if (closestFrom(e, '.hs-panel')) ring.classList.remove('drag');
      else if (closestFrom(e, '.archive-row')) ring.classList.remove('open');
      else if (closestFrom(e, viewSel)) ring.classList.remove('view');
      else if (closestFrom(e, hoverSel)) ring.classList.remove('hover');
    });

    /* 按下/松开时缩放光标环 */
    document.addEventListener('mousedown', function () { ring.style.transform = 'translate(-50%,-50%) scale(.82)'; });
    document.addEventListener('mouseup', function () { ring.style.transform = 'translate(-50%,-50%) scale(1)'; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
