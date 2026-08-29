/* ============================================================
 * sakura.js — 樱花飘落动画（纯 Canvas，零依赖）
 * 在 body 上注入一个固定全屏 canvas 层，持续生成柔和粉白花瓣飘落。
 * - 不依赖 GSAP / 任何库，独立运行，自洽自愈。
 * - 尊重 prefers-reduced-motion：开启时完全不渲染。
 * - 自适应 DPR 与窗口尺寸变化，视口外自动回收。
 * - pointer-events:none，不拦截任何点击/滚动。
 * ============================================================ */
(function () {
  'use strict';

  // 无障碍：用户要求减少动态时跳过
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  var canvas = document.createElement('canvas');
  canvas.className = 'sakura-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  // 样式交由 CSS（.sakura-canvas），这里仅设兜底，避免 CSS 未加载时错位
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;' +
    'pointer-events:none;z-index:800;';
  document.body.appendChild(canvas);

  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5); // 上限1.5，降低滚动期 GPU 占用
  var W = 0, H = 0;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  // 花瓣调色板（柔粉 / 暖白 / 浅绯），贴合站点纸张暖色基调
  var COLORS = [
    'rgba(255, 183, 197, 0.85)',
    'rgba(255, 209, 220, 0.80)',
    'rgba(255, 240, 244, 0.85)',
    'rgba(244, 194, 204, 0.78)'
  ];

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makePetal(initial) {
    var r = rand(6, 13);
    return {
      x: rand(-40, W + 40),
      // 初始铺满全屏以便一进来就有氛围；之后从顶部上方生成
      y: initial ? rand(-H, H) : rand(-60, -10),
      r: r,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      vy: rand(0.5, 1.4),            // 下落速度
      vx: rand(-0.4, 0.4),           // 基础横向漂移
      sway: rand(0.6, 1.6),          // 摇摆幅度
      swaySpeed: rand(0.01, 0.03),   // 摇摆频率
      phase: rand(0, Math.PI * 2),
      rot: rand(0, Math.PI * 2),
      vr: rand(-0.02, 0.02),          // 自转速度
      opacity: rand(0.55, 0.95)
    };
  }

  var COUNT = (function () {
    // 按屏幕面积估算数量，移动端更克制；收敛上限以减小持续绘制开销
    var base = Math.round(W / 22);
    if (W < 640) base = Math.round(W / 30);
    return Math.max(16, Math.min(base, 48));
  })();

  var petals = [];
  for (var i = 0; i < COUNT; i++) petals.push(makePetal(true));

  // 绘制一片花瓣（五瓣樱花简笔形状）
  function drawPetal(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;
    var r = p.r;
    ctx.beginPath();
    // 五瓣：以椭圆近似，绕中心旋转排布
    for (var k = 0; k < 5; k++) {
      var ang = (k / 5) * Math.PI * 2;
      var px = Math.cos(ang) * r * 0.55;
      var py = Math.sin(ang) * r * 0.55;
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(px * 0.6, py * 0.6 - r * 0.5, px, py);
      ctx.quadraticCurveTo(px * 0.6, py * 0.6 + r * 0.5, 0, 0);
    }
    ctx.fill();
    // 花心小点
    ctx.globalAlpha = p.opacity * 0.5;
    ctx.fillStyle = 'rgba(214, 130, 150, 0.6)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  var t = 0;
  var paused = false;
  function tick() {
    rafId = requestAnimationFrame(tick);
    if (paused) return;
    t += 1;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < petals.length; i++) {
      var p = petals[i];
      p.phase += p.swaySpeed;
      // 横向：基础漂移 + 正弦摇摆
      p.x += p.vx + Math.sin(p.phase) * p.sway * 0.4;
      p.y += p.vy;
      p.rot += p.vr;
      // 接近底部时轻微加速飘出
      if (p.y > H * 0.85) p.y += p.vy * 0.5;

      if (p.y - p.r > H || p.x < -60 || p.x > W + 60) {
        petals[i] = makePetal(false);
        continue;
      }
      drawPetal(p);
    }
  }

  var rafId = requestAnimationFrame(tick);

  // 滚动时暂停绘制，停止后延迟恢复——长列表滚动期间释放主线程，消除卡顿
  var _resumeTimer = null;
  function onScroll() {
    paused = true;
    if (_resumeTimer) clearTimeout(_resumeTimer);
    _resumeTimer = setTimeout(function () { paused = false; }, 200);
  }
  /* 挂在统一滚动总线上。原先这里挂了 scroll / wheel / touchmove 三个 window 监听，
     外加 lenis.on('scroll') 与 lenis:ready 兜底，其实前三者最终都会派发 scroll，
     而 Lenis 驱动的是原生滚动、总线照样收得到。 */
  if (window.ScrollBus) window.ScrollBus.onScroll(onScroll);
  else window.addEventListener('scroll', onScroll, { passive: true });

  // 页面隐藏时暂停，省电；恢复时继续
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    } else if (!rafId) {
      rafId = requestAnimationFrame(tick);
    }
  });
})();
