/* ================================================================
   隋北 — 交互层（特效拉满 · 有呼吸感）
   光标 / 光晕 / 进度 / 导航 / 描边渐显 / 细线绘制 / 差速视差 /
   首屏鼠标视差 / 磁吸 / 3D Tilt / 返回顶部 / 移动菜单 / 锚点
   ================================================================ */
(function () {
  'use strict';
  var isMobile = window.matchMedia('(max-width: 768px)').matches;

  /* ---------- 预加载（分阶段步骤指示器，由 load-steps.js 接管） ----------
     若 load-steps.js 已加载，则委托它驱动 preloader（真实里程碑驱动）；
     否则退回原本的随机进度兜底。 */
  function preloader() {
    if (window.LoadSteps && typeof window.LoadSteps.start === 'function') {
      window.LoadSteps.start();
      return;
    }
    var el = document.querySelector('.preloader');
    if (!el) { document.body.classList.add('loaded'); var h = document.getElementById('hero'); if (h) h.classList.add('show'); return; }
    var fill = el.querySelector('.preloader-fill');
    var count = el.querySelector('.preloader-count');
    var prog = 0;
    var timer = setInterval(function () {
      prog = Math.min(100, prog + Math.random() * 20);
      if (fill) fill.style.width = prog + '%';
      if (count) count.textContent = Math.floor(prog) + '%';
      if (prog >= 100) {
        clearInterval(timer);
        el.classList.add('done');
        document.body.classList.add('loaded');
        var hero = document.getElementById('hero');
        if (hero) hero.classList.add('show');
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
      }
    }, 170);
  }

  /* ---------- 自定义光标 ----------
     已移至 cursor.js 统一管理（前端/后台共用），此处不再重复初始化。
  ---------- */

  /* ---------- 滚动进度 ----------
     已由 animations.js 的中央 gsap.ticker 统一驱动（与 Lenis raf 同帧），
     避免多处 scroll 监听重复写同一进度条。此处保留兜底初始化。 */
  function progress() {
    var bar = document.querySelector('.scroll-progress');
    if (!bar) return;
    // 兜底：若 GSAP 未加载，用原生 scroll 驱动
    if (typeof window.gsap === 'undefined') {
      var upd = function () {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%';
      };
      window.addEventListener('scroll', upd, { passive: true });
      upd();
    }
  }

  /* ---------- 导航 + 返回顶部 ---------- */
  function nav() {
    var header = document.querySelector('header');
    var backTop = document.querySelector('.back-top');
    function onScroll() {
      var y = window.scrollY;
      if (header) header.classList.toggle('scrolled', y > 60);
      if (backTop) backTop.classList.toggle('show', y > 600);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    if (backTop) backTop.addEventListener('click', function () {
      if (lenis) lenis.scrollTo(0);
      else window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------- 进入视口加 class（统一由 ScrollTrigger 驱动） ----------
     替代原先散布的 IntersectionObserver，与 animations.js 的滚动调度共用
     同一套 ScrollTrigger，减少重复观察器与 scroll 监听。
     onEnterClass(sel, cls, threshold) */
  function revealClass(sel, cls, threshold) {
    if (typeof window.ScrollTrigger === 'undefined') {
      // 兜底：插件未加载时退回原生 IO
      var els = document.querySelectorAll(sel);
      if (!els.length) return;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add(cls); io.unobserve(en.target); } });
      }, { threshold: threshold || 0.4 });
      els.forEach(function (el) { io.observe(el); });
      return;
    }
    window.ScrollTrigger.batch(sel, {
      start: 'top ' + (100 - Math.min(100, (threshold || 0.4) * 100)) + '%',
      onEnter: function (batch) { batch.forEach(function (el) { el.classList.add(cls); }); }
    });
  }

  /* ---------- 描边渐显（标题滚动到时由描边变实色） ---------- */
  function strokeReveal() {
    revealClass('.stroke-reveal', 'lit', 0.5);
  }

  /* ---------- 细线绘制 ---------- */
  function rules() {
    revealClass('.rule', 'show', 0.4);
  }

  /* ---------- 差速视差（图片随滚动以不同速度位移） ---------- */
  function parallax() {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
    if (!items.length) return;
    var ticking = false;
    function upd() {
      var vh = window.innerHeight;
      items.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        var progress = (r.top + r.height / 2 - vh / 2) / vh; // -0.5 ~ 0.5
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.08;
        el.style.transform = 'translateY(' + (-progress * speed * 100).toFixed(1) + 'px)';
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(upd); }
    }, { passive: true });
    upd();
  }

  /* ---------- 首屏鼠标视差（仅 hero 背景随光标微动，不影响标题入场动画） ---------- */
  function heroParallax() {
    if (isMobile) return;
    var bg = document.getElementById('heroBg');
    if (!bg) return;
    var tx = 0, ty = 0, cx = 0, cy = 0;
    var hero = document.querySelector('.hero');
    if (!hero) return;
    hero.addEventListener('mousemove', function (e) {
      var r = e.currentTarget.getBoundingClientRect();
      tx = (e.clientX - r.left - r.width / 2) / r.width;
      ty = (e.clientY - r.top - r.height / 2) / r.height;
    });
    // hero 离开视口时暂停循环，避免长列表滚动期间空耗主线程
    var inView = true;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
      }, { threshold: 0 }).observe(hero);
    }
    (function loop() {
      if (inView) {
        cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
        bg.style.transform = 'translate(' + (cx * 18) + 'px,' + (cy * 18) + 'px) scale(1.06)';
      }
      requestAnimationFrame(loop);
    })();
  }

  /* ---------- 磁吸按钮（事件委托，支持动态创建的按钮） ----------
     使用 CSS translate 属性（独立于 transform），避免与
     lb-nav 的 translateY(-50%) 定位、lb-close 的 rotate(90deg) 悬停冲突。
  ---------- */
  function magnetic() {
    if (isMobile) return;
    document.addEventListener('mousemove', function (e) {
      var el = e.target.closest('[data-magnetic]');
      if (!el) return;
      var r = el.getBoundingClientRect();
      var x = (e.clientX - r.left - r.width / 2) * 0.25;
      var y = (e.clientY - r.top - r.height / 2) * 0.35;
      el.style.translate = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px';
    });
    document.addEventListener('mouseout', function (e) {
      var el = e.target.closest && e.target.closest('[data-magnetic]');
      if (!el) return;
      /* 仅当鼠标真正离开 magnetic 元素时才重置（避免进入子元素时误触发） */
      var related = e.relatedTarget;
      if (related && el.contains(related)) return;
      el.style.translate = '';
    });
  }

  /* ---------- 3D Tilt（仅显式 data-tilt，如精选大图） ---------- */
  function tilt() {
    if (isMobile) return;
    var MAX = 7;
    document.addEventListener('mousemove', function (e) {
      var t = e.target.closest('[data-tilt]');
      if (!t) return;
      var r = t.getBoundingClientRect();
      var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      t.style.transform = 'perspective(1000px) rotateY(' + (dx * MAX) + 'deg) rotateX(' + (-dy * MAX) + 'deg)';
    });
    document.addEventListener('mouseout', function (e) {
      var t = e.target.closest('[data-tilt]');
      if (t) t.style.transform = '';
    });
  }

  /* ---------- 移动菜单 ---------- */
  function mobileMenu() {
    var btn = document.querySelector('.menu-btn');
    var navEl = document.querySelector('.mobile-nav');
    if (!btn || !navEl) return;
    btn.addEventListener('click', function () { btn.classList.toggle('active'); navEl.classList.toggle('open'); });
    navEl.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { btn.classList.remove('active'); navEl.classList.remove('open'); });
    });
  }

  /* ---------- 锚点平滑 ---------- */
  function smoothAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        if (typeof Lenis !== 'undefined' && lenis) return; /* Lenis 接管锚点滚动 */
        var id = a.getAttribute('href');
        if (id.length > 1) {
          var t = document.querySelector(id);
          if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        }
      });
    });
  }

  /* ---------- 滚动指示器（细线版，点击平滑到画廊）---------- */
  function scrollIndicator() {
    var ind = document.querySelector('.scroll-ind');
    if (!ind) return;
    ind.style.cursor = 'pointer';
    ind.addEventListener('click', function () {
      var gallery = document.getElementById('gallery');
      if (!gallery) return;
      if (lenis) lenis.scrollTo(gallery, { offset: -80 });
      else gallery.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  /* ---------- Lenis 平滑滚动 ---------- */
  var lenis = null;
  window.lenis = null; // 暴露给 animations.js / share.js 等跨模块使用
  function lenisSmooth() {
    if (typeof Lenis === 'undefined') return;
    if (isMobile) return;
    lenis = new Lenis({
      duration: 1.1,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      smoothTouch: false,
      touchMultiplier: 1.5,
    });
    window.lenis = lenis;
    document.documentElement.classList.add('lenis', 'lenis-smooth', 'lenis-active');
    function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
    requestAnimationFrame(raf);

    /* 与滚动进度条联动（scaleX，避免 width 重排） */
    lenis.on('scroll', function (e) {
      var bar = document.querySelector('.scroll-progress');
      if (bar) {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = 'scaleX(' + (h > 0 ? (e.scroll / h) : 0).toFixed(4) + ')';
      }
      var header = document.querySelector('header');
      var backTop = document.querySelector('.back-top');
      if (header) header.classList.toggle('scrolled', e.scroll > 60);
      if (backTop) backTop.classList.toggle('show', e.scroll > 600);
    });

    /* 锚点平滑滚动走 Lenis */
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        var id = a.getAttribute('href');
        if (id.length > 1) {
          var t = document.querySelector(id);
          if (t) { e.preventDefault(); lenis.scrollTo(t, { offset: -80 }); }
        }
      });
    });
  }

  /* ---------- 主题感知导航 ---------- */
  function themeNav() {
    var header = document.querySelector('header');
    if (!header) return;
    var sections = document.querySelectorAll('[data-theme-section]');
    if (!sections.length) return;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var theme = en.target.getAttribute('data-theme-section');
          header.setAttribute('data-theme', theme);
        }
      });
    }, { rootMargin: '-40% 0px -55% 0px' });

    sections.forEach(function (s) { io.observe(s); });
  }

  /* ---------- 逐词渐显 ---------- */
  function wordReveal() {
    var els = document.querySelectorAll('.word-reveal');
    if (!els.length) return;
    els.forEach(function (el) {
      if (el._wordSplit) return;
      el._wordSplit = true;
      var text = el.textContent;
      el.textContent = '';
      var words = text.split(/(\s+)/);
      var wi = 0;
      words.forEach(function (w) {
        if (/^\s+$/.test(w)) {
          var sp = document.createElement('span');
          sp.className = 'word space';
          sp.innerHTML = '&nbsp;';
          el.appendChild(sp);
        } else {
          var span = document.createElement('span');
          span.className = 'word';
          span.style.setProperty('--wi', wi);
          span.textContent = w;
          el.appendChild(span);
          wi++;
        }
      });
    });

    revealClass('.word-reveal', 'show', 0.3);
  }

  /* ---------- 超大排版渐显 ---------- */
  function displayType() {
    var els = document.querySelectorAll('.display-words');
    if (!els.length) return;
    els.forEach(function (el) {
      if (el._displaySplit) return;
      el._displaySplit = true;
      var lines = el.querySelectorAll('.dw-line');
      lines.forEach(function (line, idx) {
        var spans = line.querySelectorAll('span');
        spans.forEach(function (sp, i) {
          sp.style.setProperty('--di', idx * 2 + i);
        });
      });
    });

    revealClass('.display-words', 'show', 0.2);
  }

  /* ---------- 横向滚动作品展示 ---------- */
  var _hsTries = 0;
  var _hsInit = false;
  function horizontalScroll() {
    var section = document.querySelector('.hs-section');
    if (!section) return;
    if (_hsInit) return; /* 仅初始化一次，避免重复创建 pin 造成空白/重复 */
    var track = section.querySelector('.hs-track');
    var progressFill = section.querySelector('.hs-progress-fill');
    var counter = section.querySelector('.hs-current');
    var panels = track ? track.querySelectorAll('.hs-panel') : [];
    /* 数据（.hs-panel）由 data.js 异步注入，若此时尚未就绪则下一帧重试 */
    if (!track || !panels.length) {
      if (_hsTries++ < 30) { requestAnimationFrame(horizontalScroll); }
      return;
    }
    _hsTries = 0;
    _hsInit = true; /* 标记已初始化，后续调用（含重试）直接跳过，避免重复 pin */

    /* 移动端：保留原生横向滚动（CSS overflow-x），不启用 pin */
    if (window.matchMedia('(max-width: 768px)').matches) return;

    /* 桌面端：用 GSAP ScrollTrigger 的 pin + x 补间（官方方案）。
       自动与 Lenis 同步（syncLenis 已绑定 lenis.on('scroll', ScrollTrigger.update)），
       不再自管 rAF / scroll 监听，彻底消除卡顿与过渡冲突。 */
    if (typeof window.ScrollTrigger === 'undefined' || typeof window.gsap === 'undefined') {
      // 兜底：插件未加载时退回旧版 rAF 实现
      return fallbackHorizontalScroll(section, track, progressFill, counter, panels);
    }

    var getMaxMove = function () {
      return Math.max(0, track.scrollWidth - track.parentElement.offsetWidth + 80);
    };

    /* 横向滚动提示动画：进入区域浮现"使劲滚动鼠标！"，持续横向脉冲提醒，
       滑动过中段后渐隐；离开区域淡出。由 GSAP 控制显隐（CSS 初始 opacity:0）。 */
    var hint = document.getElementById('hsHint');
    var hintPulse = null, hintShown = false;
    function showHint() {
      if (!hint || hintShown) return;
      hintShown = true;
      window.gsap.killTweensOf(hint);
      window.gsap.to(hint, { opacity: 1, duration: 0.5, ease: 'power2.out' });
      // 持续横向"使劲"脉冲：箭头来回滑动，整体轻微缩放呼吸
      hintPulse = window.gsap.timeline({ repeat: -1, yoyo: true })
        .fromTo(hint, { x: 0, scale: 1 }, { x: 10, scale: 1.04, duration: 0.9, ease: 'sine.inOut' });
    }
    function hideHint() {
      if (!hint || !hintShown) return;
      hintShown = false;
      if (hintPulse) { hintPulse.kill(); hintPulse = null; }
      window.gsap.to(hint, { opacity: 0, x: 0, scale: 1, duration: 0.4, ease: 'power2.in' });
    }

    var tween = window.gsap.to(track, {
      x: function () { return -getMaxMove(); },
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: function () { return '+=' + getMaxMove(); },
        pin: true,
        scrub: 1,                 // 平滑跟随（与 Lenis 手感一致）
        anticipatePin: 1,
        invalidateOnRefresh: true, // 图片加载/尺寸变化后重新测量
        onEnter: function () { showHint(); },
        onEnterBack: function () { showHint(); },
        onLeave: function () { hideHint(); },
        onLeaveBack: function () { hideHint(); },
        onUpdate: function (self) {
          var p = self.progress;
          if (progressFill) progressFill.style.width = (p * 100).toFixed(2) + '%';
          if (counter) {
            var idx = Math.min(panels.length, Math.floor(p * panels.length) + 1);
            counter.textContent = String(idx).padStart(2, '0');
          }
          // 滑动过中段（已浏览大部分）后让提示渐隐，避免一直挡视线
          if (hintShown && p > 0.82) hideHint();
        }
      }
    });

    /* 图片加载后刷新触发点（scrollWidth 变化） */
    track.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) img.addEventListener('load', function () { window.ScrollTrigger.refresh(); }, { once: true });
      img.addEventListener('error', function () { window.ScrollTrigger.refresh(); }, { once: true });
    });
    window.addEventListener('load', function () { window.ScrollTrigger.refresh(); });
  }

  /* 旧版 rAF 兜底（仅插件缺失时使用） */
  function fallbackHorizontalScroll(section, track, progressFill, counter, panels) {
    var sectionH = 0, totalScroll = 0, maxMove = 0;
    function measure() {
      sectionH = section.offsetHeight;
      var vh = window.innerHeight;
      totalScroll = sectionH - vh;
      maxMove = Math.max(0, track.scrollWidth - track.parentElement.offsetWidth + 80);
    }
    measure();
    var current = 0, target = 0, rafId = null;
    function frame() {
      current += (target - current) * 0.12;
      if (Math.abs(target - current) < 0.0005) current = target;
      track.style.transform = 'translateX(' + (-(current * maxMove)).toFixed(2) + 'px)';
      if (progressFill) progressFill.style.width = (current * 100).toFixed(2) + '%';
      if (counter) counter.textContent = String(Math.min(panels.length, Math.floor(current * panels.length) + 1)).padStart(2, '0');
      rafId = (current !== target) ? requestAnimationFrame(frame) : null;
    }
    function upd() {
      var rect = section.getBoundingClientRect();
      var vh = window.innerHeight;
      if (rect.bottom < 0 || rect.top > vh) return;
      var scrolled = Math.max(0, Math.min(totalScroll, -rect.top));
      target = totalScroll > 0 ? scrolled / totalScroll : 0;
      if (rafId === null) rafId = requestAnimationFrame(frame);
    }
    window.addEventListener('scroll', function () { requestAnimationFrame(upd); }, { passive: true });
    window.addEventListener('resize', function () { measure(); upd(); });
    upd();
  }

  /* ---------- Credits 弹窗 ---------- */
  function creditsPopup() {
    var btn = document.getElementById('creditsBtn');
    var popup = document.getElementById('creditsPopup');
    var close = document.getElementById('creditsClose');
    if (!btn || !popup) return;

    function open() { popup.classList.add('show'); if (lenis) lenis.stop(); document.body.style.overflow = 'hidden'; }
    function closeFn() { popup.classList.remove('show'); if (lenis) lenis.start(); document.body.style.overflow = ''; }

    btn.addEventListener('click', open);
    if (close) close.addEventListener('click', closeFn);
    popup.addEventListener('click', function (e) { if (e.target === popup) closeFn(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && popup.classList.contains('show')) closeFn(); });
  }

  /* ---------- 增强滚动指示器渐隐 ---------- */
  function scrollIndEnhanced() {
    var ind = document.getElementById('scrollIndEnhanced');
    if (!ind) return;
    var faded = false;
    function check() {
      var y = window.scrollY;
      var should = y > 100;
      if (should !== faded) {
        faded = should;
        ind.classList.toggle('faded', faded);
      }
    }
    window.addEventListener('scroll', check, { passive: true });
    check();
  }

  function init() {
    preloader();
    progress();
    nav();
    strokeReveal();
    rules();
    parallax();
    heroParallax();
    magnetic();
    tilt();
    mobileMenu();
    smoothAnchors();
    scrollIndicator();
    lenisSmooth();
    themeNav();
    wordReveal();
    displayType();
    horizontalScroll();
    creditsPopup();
    scrollIndEnhanced();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
