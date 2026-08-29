/* ============================================================
 * animations.js — 大量 GSAP 动画（纯增强，不改动现有逻辑）
 * 统一由 ScrollTrigger 驱动（替代散布的 IntersectionObserver），
 * 并与 Lenis 平滑滚动同步，避免多套 IO 与 scroll 监听的重复开销。
 * ============================================================ */
(function () {
  'use strict';

  if (typeof window.gsap === 'undefined') {
    console.warn('[animations] GSAP 未加载，跳过 GSAP 动画。');
    return;
  }
  var gsap = window.gsap;
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasST = (typeof window.ScrollTrigger !== 'undefined');
  if (hasST) gsap.registerPlugin(window.ScrollTrigger);

  /* 接入 Lenis：让 ScrollTrigger 跟随 Lenis 的滚动位置更新（消除不同步）。
     Lenis 1.x 默认驱动 window 原生滚动，故无需 scrollerProxy，只需在
     Lenis 的 scroll 事件中刷新 ScrollTrigger，并关闭 lagSmoothing 以保证同步。 */
  function syncLenis() {
    if (!hasST || typeof window.lenis === 'undefined' || !window.lenis) return;
    window.lenis.on('scroll', window.ScrollTrigger.update);
    window.gsap.ticker.lagSmoothing(0);
  }

  /* 进入视口触发：优先用 ScrollTrigger（与 Lenis 同步、可批量、不重复建 IO） */
  function onEnter(selector, fn, opts) {
    var els;
    if (typeof selector === 'string') {
      els = Array.prototype.slice.call(document.querySelectorAll(selector));
    } else if (selector && selector.nodeType) {
      els = [selector]; // 单个 DOM 元素
    } else if (selector && selector.length !== undefined) {
      els = Array.prototype.slice.call(selector); // NodeList / 数组
    } else {
      return;
    }
    if (!els.length) return;
    if (prefersReduced) return;
    if (!hasST) {
      // 兜底：ScrollTrigger 未加载时退回原生 IO
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { fn(en.target); io.unobserve(en.target); }
        });
      }, opts || { threshold: 0.2 });
      els.forEach(function (el) { io.observe(el); });
      return;
    }
    var th = (opts && opts.threshold) || 0.2;
    els.forEach(function (el) {
      // 修复 GSAP from 经典坑：元素初始已在视口内时，ScrollTrigger 的 onEnter 不会触发，
      // 而 gsap.from 默认 immediateRender 会先把元素藏起来 → 永久隐藏。
      // 故初始可见的立即执行回调，不再依赖 onEnter。
      if (el.getBoundingClientRect().top < window.innerHeight) { fn(el); return; }
      window.ScrollTrigger.create({
        trigger: el,
        start: 'top ' + (100 - Math.min(100, th * 100)) + '%',
        once: true,
        onEnter: function () { fn(el); }
      });
    });
  }

  /* 对一组元素批量进入视口触发 */
  function onEnterAll(selector, fn, opts) {
    var els;
    if (typeof selector === 'string') {
      els = Array.prototype.slice.call(document.querySelectorAll(selector));
    } else if (selector && selector.length !== undefined) {
      els = Array.prototype.slice.call(selector); // NodeList / 数组
    } else if (selector && selector.nodeType) {
      els = [selector]; // 单个 DOM 元素
    } else {
      return;
    }
    if (!els.length) return;
    if (prefersReduced) return;
    if (!hasST) {
      var io = new IntersectionObserver(function (entries) {
        var hits = entries.filter(function (e) { return e.isIntersecting; });
        if (!hits.length) return;
        fn(hits.map(function (e) { return e.target; }));
        hits.forEach(function (e) { io.unobserve(e.target); });
      }, opts || { threshold: 0.15 });
      els.forEach(function (el) { io.observe(el); });
      return;
    }
    var th = (opts && opts.threshold) || 0.15;
    // 同上修复：初始已在视口内的元素立即执行，避免 gsap.from 永久隐藏
    var visibleNow = [], pending = [];
    els.forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) visibleNow.push(el);
      else pending.push(el);
    });
    if (visibleNow.length) fn(visibleNow);
    if (pending.length) window.ScrollTrigger.batch(pending, {
      start: 'top ' + (100 - Math.min(100, th * 100)) + '%',
      onEnter: function (batch) { fn(batch); }
    });
  }

  /* 让无限循环 tween 只在元素处于视口内时运行（离屏暂停，避免长列表里持续空耗主线程）。
     ScrollTrigger 缺失时保持常驻运行，保证降级仍有动效。 */
  function playInView(tween, trigger) {
    if (!hasST) return tween;
    tween.pause();
    window.ScrollTrigger.create({
      trigger: trigger, start: 'top bottom', end: 'bottom top',
      onToggle: function (self) { self.isActive ? tween.play() : tween.pause(); }
    });
    return tween;
  }

  /* 事件委托版 hover：只挂 2 个 document 级监听，而不是给 N 个元素各挂一对
     mouseenter/mouseleave（画廊有上百张卡片时可省下数百个监听器）。
     在同一元素内部子元素之间移动不会误判为「离开」。 */
  function delegateHover(selector, onEnter, onLeave) {
    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest && e.target.closest(selector);
      if (!t || (e.relatedTarget && t.contains(e.relatedTarget))) return;
      onEnter(t);
    });
    document.addEventListener('mouseout', function (e) {
      var t = e.target.closest && e.target.closest(selector);
      if (!t || (e.relatedTarget && t.contains(e.relatedTarget))) return;
      onLeave(t);
    });
  }

  /* 等 DOM 与 data.js 动态注入完成后初始化 */
  function init() {
    if (prefersReduced) {
      // 仍保留功能性动画（进度条/灯箱）但关闭装饰性动画
      setupScrollProgress();
      setupLightbox();
      return;
    }

    setupScrollProgress();
    setupPreloaderCount();
    setupHeroIntro();
    setupMagnetic();
    setupNumberCounters();
    setupShowcaseHover();
    setupLightbox();
    setupMouseParallax();
    setupGalleryParallax();
    setupFloatingDecor();
    setupButtonSheen();
    setupBackTopFloat();
    setupFooterStagger();
    setupHeadingFloat();
    setupRollingText();
    setupMarquee();
    setupDedication();
    setupDisplayWords();
    setupCardHover();
    setupTextReveal();
    setupCursorPulse();
    setupAnchorBreath();
    setupImageLoad();
    setupEaseReverseUI();
    setupMarqueeEaseReverse();

    /* 接入 Lenis（若存在）并与 ScrollTrigger 同步 */
    syncLenis();
    /* 画廊图片由 data.js 动态注入，统一刷新触发点 */
    if (hasST) window.ScrollTrigger.refresh();
  }

  /* ---------- 中央滚动调度（性能核心） ----------
     把「滚动进度条 / 画廊视差」收进同一个 rAF 帧循环，避免多个独立监听各自读 layout。
     约定：
     - 只在滚动时调度，停止滚动即空转归零；
     - 文档高度缓存，尺寸变化时才重算（每帧读 scrollHeight 会强制同步 layout）；
     - 进度条写 transform:scaleX，视差写 CSS 变量 --fy（与 data.js 一致，零重排）。 */
  var _scrollBar = null;
  var _parallaxItems = null;  // [{img, wrap}] —— 预解析容器，逐帧循环里不再调 closest()
  var _docHeight = 0;         // 缓存「可滚动高度」，避免每帧读 scrollHeight 触发强制 layout

  /* 收集视差图片，并把容器节点一次性解析好 */
  function collectParallax() {
    var imgs = document.querySelectorAll('.featured-img-wrap img, .fr-media img');
    var out = [];
    for (var i = 0; i < imgs.length; i++) {
      var wrap = imgs[i].closest('.featured-img-wrap, .fr-media, .about-img');
      if (wrap) out.push({ img: imgs[i], wrap: wrap });
    }
    return out;
  }

  function measureDoc() {
    _docHeight = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  function setupScrollProgress() {
    _scrollBar = document.querySelector('.scroll-progress');
    if (!_scrollBar) {
      _scrollBar = document.createElement('div');
      _scrollBar.className = 'scroll-progress';
      _scrollBar.style.cssText = 'position:fixed;top:0;left:0;height:3px;width:100%;z-index:120;' +
        'background:linear-gradient(90deg,var(--accent),var(--accent-ink));' +
        'box-shadow:0 0 12px rgba(120,170,150,.6);pointer-events:none;' +
        'transform:scaleX(0);transform-origin:left center;will-change:transform;';
      document.body.appendChild(_scrollBar);
    }
    if (!_parallaxItems) _parallaxItems = collectParallax();

    var frame = function () {
      if (_scrollBar) {
        var p = _docHeight > 0 ? (window.scrollY / _docHeight) : 0;
        // 写 transform:scaleX 而非 width，避免每帧触发 layout 重排（滚动卡顿主因之一）
        _scrollBar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      }
      if (prefersReduced || !_parallaxItems.length) return;
      var vh = window.innerHeight;
      for (var i = 0; i < _parallaxItems.length; i++) {
        var item = _parallaxItems[i];
        var rect = item.wrap.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) continue; // 视口外跳过，避免无谓布局查询
        var offset = (rect.top + rect.height / 2 - vh / 2);
        // 写 CSS 变量，由 CSS transform: translateY(var(--fy)) 消费（零重排）
        item.img.style.setProperty('--fy', (-offset * 0.04).toFixed(1) + 'px');
      }
    };

    /* 文档高度只在真正变化时重算：原先每帧读 scrollHeight 会强制同步 layout，
       是长列表滚动时的主要开销之一。 */
    measureDoc();
    window.addEventListener('resize', measureDoc);
    if (hasST) window.ScrollTrigger.addEventListener('refresh', measureDoc);
    if (window.ResizeObserver) {
      // 图片加载 / 画廊分批注入都会让文档变高，交给 ResizeObserver 兜底重算，
      // 否则进度条会随内容增长越走越偏。
      new ResizeObserver(measureDoc).observe(document.body);
    }

    /* 挂在统一滚动总线上：全站只保留一个 scroll 监听 + 一次 rAF 节流，
       不再每个模块各挂一套。onScroll 注册时会立即跑一次，即原来的首帧初始化。 */
    window.ScrollBus.onScroll(frame);
  }

  /* ---------- 预加载计数强化（视觉脉冲，不影响原逻辑） ---------- */
  function setupPreloaderCount() {
    var pre = document.querySelector('.preloader');
    var count = pre && pre.querySelector('.preloader-count');
    if (!count) return;
    var tweens = [gsap.fromTo(count, { scale: 0.9 }, {
      scale: 1, duration: 0.6, ease: 'sine.inOut',
      repeat: -1, yoyo: true
    })];
    var ring = pre.querySelector('.preloader-ring');
    if (ring) tweens.push(gsap.to(ring, { rotation: 360, duration: 4, ease: 'none', repeat: -1 }));

    /* preloader 会被移除，必须同时 kill 它的无限 tween：
       否则这些 tween 会一直挂在全局时间线上空转（既泄漏又每帧白算）。 */
    if (typeof MutationObserver === 'undefined') return;
    var mo = new MutationObserver(function () {
      if (!pre.isConnected || pre.classList.contains('done')) {
        mo.disconnect();
        tweens.forEach(function (t) { t.kill(); });
      }
    });
    mo.observe(pre, { attributes: true, attributeFilter: ['class'] });
    if (pre.parentNode) mo.observe(pre.parentNode, { childList: true });
  }

  /* ---------- Hero 入场时间线（匹配真实 DOM：#heroDisplay .hd-line） ---------- */
  function setupHeroIntro() {
    var hero = document.getElementById('hero');
    if (!hero) return;
    var display = hero.querySelector('#heroDisplay');
    var lines = display ? display.querySelectorAll('.hd-line') : [];
    var corners = hero.querySelectorAll('.hero-corner');
    var asterisk = hero.querySelector('.hero-asterisk');
    var scrollInd = hero.querySelector('.scroll-ind, .scroll-ind-enhanced, #scrollIndEnhanced');

    var tl = gsap.timeline({ delay: 0.2, defaults: { ease: 'power4.out' } });
    if (asterisk) tl.from(asterisk, { scale: 0, rotate: -90, opacity: 0, duration: 0.7 }, 0);
    if (corners.length) tl.from(corners, { y: 18, opacity: 0, duration: 0.7, stagger: 0.06 }, 0.1);
    if (lines.length) tl.from(lines, { y: 60, opacity: 0, duration: 1.0, stagger: 0.12 }, 0.2);
    if (scrollInd) tl.from(scrollInd, { y: 16, opacity: 0, duration: 0.6, ease: 'power2.out' }, 0.9);

    // 滚动提示持续上下浮动
    if (scrollInd) gsap.to(scrollInd, { y: 10, duration: 1.2, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 1.6 });
    // hero 背景光斑缓慢漂移（data-parallax 元素交由 ui.js 驱动，这里只动 .hero-blob 装饰层）
    var blob = hero.querySelector('.hero-blob');
    if (blob) gsap.to(blob, { x: 40, y: -30, scale: 1.08, duration: 8, ease: 'sine.inOut', repeat: -1, yoyo: true });
  }

  /* ---------- 磁性按钮 ----------
     注意：磁吸的 transform 驱动已由 ui.js 的 magnetic() 用 CSS `translate`
     属性统一处理（避免与 transform 定位冲突）。此处不再重复绑定 mousemove，
     否则两套机制会同时写 transform/translate 导致抖动与覆盖。
     仅保留灯箱导航按钮等需要 GSAP elastic 回弹的增强（不冲突场景）。 */
  function setupMagnetic() {
    // 仅对「无 transform 定位依赖」的普通磁吸按钮做 GSAP 弹性增强已由 ui.js 接管，
    // 这里不再对 [data-magnetic] 全局绑定，消除冲突。如未来需要 GSAP 弹性，
    // 应改为只接受明确带 data-magnetic-gsap 的元素。
    var enhanced = document.querySelectorAll('[data-magnetic-gsap]');
    enhanced.forEach(function (el) {
      var strength = 0.35;
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var x = e.clientX - r.left - r.width / 2;
        var y = e.clientY - r.top - r.height / 2;
        gsap.to(el, { x: x * strength, y: y * strength, duration: 0.4, ease: 'power2.out' });
      });
      el.addEventListener('mouseleave', function () {
        gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
      });
    });
  }

  /* ---------- 数字滚动统计 ---------- */
  function setupNumberCounters() {
    onEnterAll('.stat', function (nodes) {
      nodes.forEach(function (stat) {
        // ScrollTrigger.batch 在 refresh 后可能再次 onEnter，加一次性守卫避免重复计数
        if (stat.dataset.counted === '1') return;
        stat.dataset.counted = '1';
        var h = stat.querySelector('h4');
        if (!h) return;
        var raw = h.textContent.trim();
        var num = parseInt(raw, 10);
        if (isNaN(num)) return;
        // 后缀（如「台机身走天下」里的非数字部分）只算一次，别放进每帧的 onUpdate
        var suffix = raw.replace(/[0-9]/g, '');
        var obj = { v: 0 };
        gsap.to(obj, {
          v: num, duration: 1.4, ease: 'power2.out',
          onUpdate: function () {
            h.textContent = Math.round(obj.v) + suffix;
          }
        });
        // 注意：.stat 的入场位移已由 data.js 的 setupReveal（CSS .show）统一负责，
        // 此处不再 gsap.from 位移，避免与 CSS transform 双重位移冲突。
      });
    }, { threshold: 0.4 });
  }

  /* ---------- 作品集 showcase 卡片入场 ---------- */
  function setupShowcaseHover() {
    var stage = document.querySelector('.showcase-stage');
    if (!stage) return;
    var cards = stage.querySelectorAll('.showcase-card');
    cards.forEach(function (card, i) {
      // 入场 stagger（一次性，不写 transform 终态，hover 放大完全交给 CSS :hover + !important）
      gsap.from(card, {
        y: 60, opacity: 0, rotation: (i % 2 ? 1 : -1) * 8, duration: 0.9,
        delay: i * 0.08, ease: 'back.out(1.4)'
      });
      // 注意：悬停放大/回正已由 CSS（.showcase-card:hover { transform: ...!important }）负责，
      // 此处不再对 card 绑定 scale 的 gsap.to——否则 GSAP 写 transform 会与 CSS !important
      // 争抢，导致每帧 transform 被反复覆盖、卡片抖动/滑动卡顿。
    });
    // 舞台轻微浮动（离屏暂停，避免长列表中持续空耗）
    playInView(gsap.to(stage, {
      y: 8, duration: 3, ease: 'sine.inOut', repeat: -1, yoyo: true
    }), stage);
  }

  /* ---------- 灯箱 GSAP 入场 ---------- */
  function setupLightbox() {
    var lb = document.getElementById('lightbox');
    if (!lb) return;
    var media = document.getElementById('lbMedia');
    var info = document.getElementById('lbInfo');
    var actions = document.getElementById('lbActions');
    var stage = lb.querySelector('.lb-stage');
    var btns = [document.getElementById('lbPrev'), document.getElementById('lbNext'), document.getElementById('lbClose')];

    var mo = new MutationObserver(function () {
      if (lb.classList.contains('open')) {
        if (stage) gsap.fromTo(stage, { opacity: 0, scale: 0.92, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.5, ease: 'power3.out' });
        if (media) gsap.fromTo(media, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'power2.out' });
        if (info) gsap.fromTo(info, { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.6, delay: 0.1, ease: 'power3.out' });
        if (actions) gsap.fromTo(actions, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, delay: 0.2, ease: 'power2.out' });
        btns.forEach(function (b, i) {
          if (b) gsap.fromTo(b, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, delay: 0.15 + i * 0.05, ease: 'back.out(2)' });
        });
      }
    });
    mo.observe(lb, { attributes: true, attributeFilter: ['class'] });
  }

  /* ---------- 鼠标视差（hero 内部元素） ----------
     使用独立属性 data-mouse-parallax（数值=最大像素偏移），避免与
     fx-suite 的滚动视差 data-parallax 冲突。跟随幅度更克制、更柔。 */
  function setupMouseParallax() {
    var hero = document.getElementById('hero');
    if (!hero) return;
    var layers = hero.querySelectorAll('[data-mouse-parallax]');
    if (!layers.length) {
      layers = hero.querySelectorAll('.hero-title, .hero-sub');
    }
    if (!layers.length) return;
    // 性能：用 quickTo 复用同一个 tween，避免每次 mousemove 新建 gsap.to（零分配、更顺滑）；
    // 视差深度在建立时解析一次并缓存，避免每个 mousemove 都读属性再 parseFloat。
    var setters = [];
    layers.forEach(function (el) {
      setters.push({
        depth: parseFloat(el.getAttribute('data-mouse-parallax')) || 10,
        x: gsap.quickTo(el, 'x', { duration: 1.4, ease: 'power3.out' }),
        y: gsap.quickTo(el, 'y', { duration: 1.4, ease: 'power3.out' })
      });
    });
    hero.addEventListener('mousemove', function (e) {
      var cx = (e.clientX / window.innerWidth - 0.5);
      var cy = (e.clientY / window.innerHeight - 0.5);
      for (var i = 0; i < setters.length; i++) {
        setters[i].x(cx * setters[i].depth);
        setters[i].y(cy * setters[i].depth);
      }
    });
    // 鼠标离开 hero 时缓回原位
    hero.addEventListener('mouseleave', function () {
      for (var i = 0; i < setters.length; i++) { setters[i].x(0); setters[i].y(0); }
    });
  }

  /* ---------- 画廊图片滚动视差 ----------
     已整合进 setupScrollProgress 的中央 gsap.ticker（写 CSS 变量 --fy，零重排）。
     保留此函数仅作兼容占位，不再单独绑定 scroll 监听。 */
  function setupGalleryParallax() {
    // 兼容：确保 parallax 图片节点在帧循环里可用（data.js 动态注入后重建一次缓存）。
    if (!_parallaxItems || !_parallaxItems.length) {
      _parallaxItems = collectParallax();
    }
  }

  /* ---------- 装饰性持续浮动 ---------- */
  function setupFloatingDecor() {
    // 章节序号缓慢上下浮动（离屏时暂停，避免长列表多处持续 tween 空耗）
    gsap.utils.toArray('.sec-num').forEach(function (el, i) {
      playInView(gsap.to(el, {
        y: 6, duration: 2.4 + i * 0.1, ease: 'sine.inOut', repeat: -1, yoyo: true
      }), el);
    });
    // 注意：.rule 下划线绘制已由 ui.js.rules()（CSS .show 过渡 ::after 的 scaleX）统一负责，
    // 此处不再用 gsap.fromTo 缩放 .rule 本体，避免与伪元素 scaleX 双重绘制。
  }

  /* ---------- 按钮高光扫过 ---------- */
  function setupButtonSheen() {
    var btns = document.querySelectorAll('.btn, .lb-act, .sp-opt');
    btns.forEach(function (btn) {
      var sheen = document.createElement('span');
      sheen.className = 'gsap-sheen';
      // 起点 left:0 + width:50%，后续只用 xPercent 位移（-100% → 200% 正好扫过整个按钮）
      sheen.style.cssText = 'position:absolute;top:0;left:0;width:50%;height:100%;' +
        'background:linear-gradient(120deg,transparent,rgba(255,255,255,.35),transparent);' +
        'transform:skewX(-20deg);pointer-events:none;will-change:transform;';
      var pos = getComputedStyle(btn).position;
      if (pos === 'static') btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      btn.appendChild(sheen);
      btn.addEventListener('mouseenter', function () {
        // 用 xPercent（transform）代替 left：left 是布局属性，每帧都会触发重排
        gsap.fromTo(sheen, { xPercent: -100 }, { xPercent: 200, duration: 0.7, ease: 'power2.inOut' });
      });
    });
  }

  /* ---------- 返回顶部按钮浮动 ---------- */
  function setupBackTopFloat() {
    var bt = document.querySelector('.back-top');
    if (!bt) return;
    gsap.to(bt, { y: -6, duration: 1.6, ease: 'sine.inOut', repeat: -1, yoyo: true });
  }

  /* ---------- 页脚链接 stagger ---------- */
  function setupFooterStagger() {
    onEnterAll('.links', function (nodes) {
      nodes.forEach(function (l) {
        // l.children 是 live HTMLCollection，GSAP 不收（会报 "GSAP target [object HTMLCollection] not found"）；先转数组
        gsap.from(gsap.utils.toArray(l.children), { y: 14, opacity: 0, duration: 0.5, stagger: 0.06, ease: 'power2.out' });
      });
    }, { threshold: 0.3 });
  }

  /* ---------- 章节区块轻微入场 ----------
     已由 setupTextReveal 的 '.contact .wrap' 分支统一负责（避免对 .contact .wrap > * 双重位移）。 */

  /* ---------- 大标题悬浮呼吸（已显示的 stroke-reveal） ----------
     性能：无限重复 tween 仅在元素进入视口时运行（ScrollTrigger 暂停离屏动画），
     避免长列表中大量离屏标题空耗主线程。 */
  function setupHeadingFloat() {
    if (!hasST) {
      gsap.utils.toArray('.stroke-reveal.lit, .stroke-reveal').forEach(function (el, i) {
        if (i % 2 === 0) gsap.to(el, { y: -4, duration: 3 + i * 0.2, ease: 'sine.inOut', repeat: -1, yoyo: true });
      });
      return;
    }
    gsap.utils.toArray('.stroke-reveal.lit, .stroke-reveal').forEach(function (el, i) {
      if (i % 2 !== 0) return;
      gsap.to(el, {
        y: -4, duration: 3 + i * 0.2, ease: 'sine.inOut', repeat: -1, yoyo: true,
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', toggleActions: 'play pause resume pause' }
      });
    });
  }

  /* ---------- Rolling Text（GSAP 官方 SplitText 滚动文本效果） ----------
     进入视口时，将目标文本按词拆分，逐词从下方滚入（yPercent + opacity 错开）。
     作用于部分内容：引言、献词、精选标题、联系标题。
     需要 SplitText 插件（已在 index.html 引入）。
  */
  function setupRollingText() {
    if (typeof window.SplitText === 'undefined') {
      console.warn('[animations] SplitText 未加载，跳过 rolling text。');
      return;
    }
    gsap.registerPlugin(window.SplitText);

    // 目标配置：选择器 + 拆分类型（为部分内容加入 rolling text 逐词/逐字滚入）
    var targets = [
      { sel: '.quote-text', type: 'words' },
      { sel: '.dedication p', type: 'words' },
      { sel: '.showcase-title', type: 'chars' },
      { sel: '#contactTitle', type: 'chars' },
      { sel: '.about-text p', type: 'words' }   // 关于段落：逐词滚入
    ];

    targets.forEach(function (cfg) {
      var els = Array.prototype.slice.call(document.querySelectorAll(cfg.sel));
      els.forEach(function (el) {
        // 已被 split-reveal.js 处理过的 .split 元素不再重复拆分，避免双重动画冲突/抖动
        if (el.classList.contains('split')) return;
        // 与 split-reveal.js 统一用 SplitText.create（v3.13 起的推荐工厂写法）
        var split = window.SplitText.create(el, { type: cfg.type, wordsClass: 'rt-word', charsClass: 'rt-char' });
        var units = cfg.type === 'words' ? split.words : split.chars;
        gsap.set(units, { yPercent: 110, opacity: 0 });

        onEnter(el, function () {
          gsap.to(units, {
            yPercent: 0, opacity: 1,
            duration: 0.9, ease: 'power4.out',
            stagger: cfg.type === 'words' ? 0.08 : 0.025
          });
        }, { threshold: 0.3 });
      });
    });
  }

  /* ---------- 跑马灯无限横向滚动 ---------- */
  function setupMarquee() {
    var track = document.querySelector('.marquee-track');
    if (!track) return;
    // 轨道内含两份相同内容，平移 -50% 即可无缝循环（离屏时暂停）
    playInView(gsap.to(track, { xPercent: -50, duration: 22, ease: 'none', repeat: -1 }), track);
  }

  /* ---------- 献词区：细线展开由 ui.js.rules() 统一（CSS .show），此处仅占位兼容 ---------- */
  function setupDedication() {
    // .dedication .rule 是 .rule 类，已交由 ui.js.rules() 通过 ::after scaleX 绘制，
    // 不再用 gsap 缩放 .rule 本体，避免双重绘制。
  }

  /* ---------- 光影捕手大字：进入后逐字弹性 + 持续呼吸 ---------- */
  function setupDisplayWords() {
    var dw = document.querySelector('.display-words');
    if (!dw) return;
    var spans = dw.querySelectorAll('.dw-line span');
    dw.classList.add('show'); // 兜底：非 JS 环境也可见
    gsap.from(spans, {
      yPercent: 110, opacity: 0, rotateX: -75, z: -60,
      transformOrigin: '50% 100%',
      duration: 1.0, stagger: 0.07, ease: 'power3.out',
      immediateRender: false,
      scrollTrigger: {
        trigger: dw,
        start: 'top 80%',
        toggleActions: 'play none none none',
        once: true
      }
    });
    // 持续轻微浮动呼吸（叠加在 CSS 显示之上；离屏暂停，避免整站离屏时仍在跑无限 tween）
    playInView(gsap.to(spans, {
      y: -6, duration: 3, ease: 'sine.inOut', repeat: -1, yoyo: true,
      stagger: { each: 0.2, from: 'center' }
    }), dw);
    /* 副标题：入场交给 text-scramble.js 做 ScrambleText 解扰；
       插件缺失时退化成原来的淡入，保证「没有解扰也还有入场」，两者不会叠加。 */
    var sub = dw.parentElement && dw.parentElement.querySelector('.display-sub');
    if (sub && typeof window.ScrambleTextPlugin === 'undefined') {
      onEnter(sub, function () { gsap.from(sub, { opacity: 0, y: 14, duration: 0.8, ease: 'power2.out' }); }, { threshold: 0.4 });
    }
  }

  /* ---------- 卡片悬停增强：图片放大 + 标题上滑 + 信息层滑入 ---------- */
  function setupCardHover() {
    var CARD_MEDIA = '.media-wrap img, .media-wrap video';

    // featured 交错行图片：悬停时图片缓慢 zoom（委托，天然兼容动态注入）
    delegateHover('.fr-media', function (wrap) {
      var img = wrap.querySelector('img');
      if (img) gsap.to(img, { scale: 1.06, duration: 0.9, ease: 'power2.out', overwrite: 'auto' });
    }, function (wrap) {
      var img = wrap.querySelector('img');
      if (img) gsap.to(img, { scale: 1, duration: 1.0, ease: 'power2.out', overwrite: 'auto' });
    });

    // gallery 卡片：悬停时内部图片轻微 zoom + 标题上滑（不碰 bee3d 的整体 3D）
    delegateHover('.card', function (card) {
      var img = card.querySelector(CARD_MEDIA);
      var h3 = card.querySelector('.overlay h3');
      if (img) gsap.to(img, { scale: 1.08, duration: 0.7, ease: 'power2.out', overwrite: 'auto' });
      if (h3) gsap.to(h3, { y: -6, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
    }, function (card) {
      var img = card.querySelector(CARD_MEDIA);
      var h3 = card.querySelector('.overlay h3');
      if (img) gsap.to(img, { scale: 1, duration: 0.8, ease: 'power2.out', overwrite: 'auto' });
      if (h3) gsap.to(h3, { y: 0, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
    });

    // showcase 卡片：信息层滑入（scale 由 setupShowcaseHover 负责）
    delegateHover('.showcase-card', function (card) {
      var meta = card.querySelector('.sc-meta');
      if (meta) gsap.fromTo(meta, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
    }, function () { /* 回正由 CSS :hover 负责 */ });
  }

  /* ---------- 文本类入场：kicker / quote / section-head ---------- */
  function setupTextReveal() {
    // 小标签 kicker：进入视口时缩放淡入
    onEnterAll('.kicker', function (nodes) {
      gsap.from(nodes, { y: 14, opacity: 0, scale: 0.96, duration: 0.6, stagger: 0.05, ease: 'power2.out' });
    }, { threshold: 0.6 });

    // 引言区：引号放大弹入 + 细线展开 + 作者上滑（正文滚动由 setupRollingText 接管）
    onEnterAll('.quote-section', function (nodes) {
      nodes.forEach(function (sec) {
        var mark = sec.querySelector('.quote-mark');
        var line = sec.querySelector('.quote-line');
        var author = sec.querySelector('.quote-author');
        if (mark) gsap.from(mark, { scale: 0, opacity: 0, duration: 0.8, ease: 'back.out(2)' });
        if (line) gsap.fromTo(line, { scaleX: 0 }, { scaleX: 1, transformOrigin: 'left', duration: 0.9, ease: 'power3.out', delay: 0.3 });
        if (author) gsap.from(author, { y: 16, opacity: 0, duration: 0.7, ease: 'power2.out', delay: 0.4 });
      });
    }, { threshold: 0.3 });

    // 各 section-head 内的子元素 stagger（showcase / hs / gallery / about / gear / contact）
    // 注意：带 .split 的子元素（#contactTitle / .showcase-title）已由 split-reveal.js
    // 做逐字动画，若这里再对它们整体做一次 y/opacity 位移就是双重入场，视觉上会「跳两下」。
    onEnterAll('.showcase-head, .hs-header, .gallery-head, .about-text, .gear-head, .contact .wrap', function (nodes) {
      nodes.forEach(function (head) {
        var kids = Array.prototype.filter.call(head.children, function (el) {
          return !el.classList.contains('split');
        });
        if (kids.length) {
          gsap.from(kids, { y: 22, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power3.out' });
        }
      });
    }, { threshold: 0.2 });
  }

  /* ---------- 自定义光标：跟随点弹性脉冲（hover 时） ---------- */
  function setupCursorPulse() {
    var dot = document.querySelector('.cursor-dot');
    if (!dot) return;
    var hoverSel = 'a, button, [data-magnetic], .card, .featured-img-wrap, .showcase-card, .hs-panel, .gear-item, .archive-row, .ci-link';
    // 委托：原先对每个匹配元素都绑一对监听（.card 一张一个，长画廊下是数百个监听器）
    delegateHover(hoverSel, function () {
      gsap.to(dot, { scale: 1.8, duration: 0.3, ease: 'back.out(2)', overwrite: 'auto' });
    }, function () {
      gsap.to(dot, { scale: 1, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
    });
  }

  /* ---------- 锚点点击：目标区块轻微呼吸 ---------- */
  function setupAnchorBreath() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href');
      if (id.length <= 1) return;
      var target;
      // href 可能是非法选择器（如 "#123"），包一层避免抛异常中断后续逻辑
      try { target = document.querySelector(id); } catch (err) { return; }
      if (!target) return;
      gsap.fromTo(target, { scale: 0.985 }, { scale: 1, duration: 0.6, ease: 'back.out(1.6)' });
    });
  }

  /* ---------- 大图加载淡入 ---------- */
  function setupImageLoad() {
    var imgs = document.querySelectorAll('.featured-img-wrap img, .fr-media img, .about-img img');
    imgs.forEach(function (img) {
      if (img.complete && img.naturalWidth > 0) {
        gsap.fromTo(img, { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 0.9, ease: 'power2.out' });
      } else {
        img.addEventListener('load', function () {
          gsap.fromTo(img, { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 0.9, ease: 'power2.out' });
        }, { once: true });
        // 加载失败也淡入，避免一直隐藏
        img.addEventListener('error', function () {
          gsap.fromTo(img, { opacity: 0 }, { opacity: 1, duration: 0.6 });
        }, { once: true });
      }
    });
  }

  /* 将 #rrggbb / 带 alpha 的十六进制或已含 rgb() 的颜色转为带透明度的 rgba()。
     若本身就是 rgba()/rgb()，直接返回，避免重复包裹。 */
  function hexToRgba(color, alpha) {
    if (!color) return color;
    color = color.trim();
    if (color.indexOf('rgb') === 0) return color;
    var m = color.match(/^#([0-9a-f]{6})$/i);
    if (!m) return color;
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /* ---------- 按钮 / 选择框：easeReverse UI 交互 ----------
     灵感：gsap.com/demo/easereverse-ui-interactions
     - 悬停/聚焦时背景从左向右扫过填充，离开时平滑倒放（ease reverse）。
     - 非破坏性：按钮用独立覆盖层 .er-fill，不干扰既有 :hover 配色与 transform。
     - 选择框（<select>）无法内嵌覆盖层，改为缓动背景/边框填充。
     - 通过 MutationObserver 覆盖 data.js 动态注入的按钮与筛选下拉框。 */
  var ER_SELECTOR =
    'button, .btn, .abtn, .an-item, .mini-btn, .ca-btn, .flink, .lb-act, ' +
    '.sp-opt, .gb-close, .credits-close, .footer-credits-btn, ' +
    '.menu-btn, .back-top, .filter-select, .field select, .chip';

  function attachEaseReverseUI(el) {
    if (el.dataset.erBound === '1') return;
    el.dataset.erBound = '1';

    var isSelect = el.tagName === 'SELECT';

    if (isSelect) {
      // 选择框：缓动背景与边框填充（聚焦/悬停），离开时倒放。
      // 颜色取自站点主题色，避免硬编码破坏配色。
      var accent = (getComputedStyle(el).getPropertyValue('--accent') || '#B5683B').trim();
      var sTl = gsap.timeline({ paused: true });
      sTl.to(el, {
        backgroundColor: hexToRgba(accent, 0.16),
        borderColor: hexToRgba(accent, 0.9),
        duration: 0.4,
        ease: 'power4.inOut'
      });
      el.addEventListener('mouseenter', function () { sTl.play(); });
      el.addEventListener('mouseleave', function () { sTl.reverse(); });
      el.addEventListener('focus', function () { sTl.play(); });
      el.addEventListener('blur', function () { sTl.reverse(); });
      return;
    }

    // 按钮：注入覆盖层，做从左向右扫过的填充。
    var cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    if (cs.overflow === 'visible') el.style.overflow = 'hidden';

    var fill = document.createElement('span');
    fill.className = 'er-fill';
    fill.setAttribute('aria-hidden', 'true');
    // 注入到最前，避免遮挡后续文本
    el.insertBefore(fill, el.firstChild);

    gsap.set(fill, { scaleX: 0, transformOrigin: 'left center' });
    // 填充色取自按钮的 --er-fill 主题变量，缺省回退为琥珀赭。
    var fillColor = cs.getPropertyValue('--er-fill').trim() ||
      'rgba(181,104,59,0.85)';
    gsap.set(fill, { backgroundColor: fillColor });

    var tl = gsap.timeline({ paused: true });
    tl.to(fill, { scaleX: 1, duration: 0.5, ease: 'power4.inOut' });

    // 弹跳放大：鼠标靠近时按钮放大并带弹性回弹（easeReverse 的「变大」手感）。
    // 排除依赖 transform 做定位/旋转的元素（lb-nav/lb-close），避免被 scale 覆盖定位。
    // 其余按钮的磁吸用 CSS `translate` 独立属性，与 GSAP 的 scale(transform) 不冲突，可叠加。
    // 排除依赖 transform 做定位/旋转或持续浮动的元素，避免被 scale 覆盖：
    // lb-nav(lb-prev/lb-next 用 translateY(-50%) 定位)、lb-close(rotate 悬停)、
    // back-top(持续 y 浮动动画占用 transform)。
    var noScale = el.classList.contains('lb-nav') || el.classList.contains('lb-close') ||
                  el.classList.contains('back-top');

    el.addEventListener('mouseenter', function () {
      tl.play();
      if (!noScale) gsap.to(el, { scale: 1.08, duration: 0.4, ease: 'back.out(2)' });
    });
    el.addEventListener('mouseleave', function () {
      tl.reverse();
      if (!noScale) gsap.to(el, { scale: 1, duration: 0.55, ease: 'elastic.out(1, 0.5)' });
    });
    el.addEventListener('focus', function () {
      tl.play();
      if (!noScale) gsap.to(el, { scale: 1.08, duration: 0.4, ease: 'back.out(2)' });
    });
    el.addEventListener('blur', function () {
      tl.reverse();
      if (!noScale) gsap.to(el, { scale: 1, duration: 0.55, ease: 'elastic.out(1, 0.5)' });
    });
  }

  function setupEaseReverseUI() {
    if (typeof gsap === 'undefined') return;
    if (prefersReduced) return; // 尊重无障碍

    var nodes = document.querySelectorAll(ER_SELECTOR);
    Array.prototype.forEach.call(nodes, attachEaseReverseUI);

    // 覆盖动态注入的按钮 / 选择框（筛选下拉、分享面板等）。
    // 观察整棵子树，data.js 批量渲染画廊时会一次性涌入成百上千条 mutation，
    // 因此在 rAF 里合并成一批再处理，避免每条记录都跑一次全量 querySelectorAll。
    if (typeof MutationObserver === 'undefined') return;
    var pending = [];
    var scheduled = false;

    function flushPending() {
      scheduled = false;
      var batch = pending;
      pending = [];
      for (var i = 0; i < batch.length; i++) {
        var n = batch[i];
        if (!n.isConnected) continue;      // 已被移除的节点不必处理
        if (n.matches(ER_SELECTOR)) attachEaseReverseUI(n);
        var inner = n.querySelectorAll(ER_SELECTOR);
        for (var k = 0; k < inner.length; k++) attachEaseReverseUI(inner[k]);
      }
    }

    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var k = 0; k < added.length; k++) {
          if (added[k].nodeType === 1) pending.push(added[k]);
        }
      }
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(flushPending);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- 页脚跑马灯文字：easeReverse 填充 ----------
     对首页底部「隋北 / PHOTOGRAPHY / 光影作品集 / 2026」每段文字，
     悬停时从左向右扫过填充（与按钮一致的 ease reverse 效果）。 */
  function setupMarqueeEaseReverse() {
    if (typeof gsap === 'undefined' || prefersReduced) return;
    var items = document.querySelectorAll('.marquee-track > span:not(.dot)');
    Array.prototype.forEach.call(items, function (el) {
      var cs = getComputedStyle(el);
      if (cs.position === 'static') el.style.position = 'relative';
      if (cs.overflow === 'visible') el.style.overflow = 'hidden';
      el.style.display = 'inline-block';

      var fill = document.createElement('span');
      fill.className = 'er-fill';
      fill.setAttribute('aria-hidden', 'true');

      // 将原有文字包裹为上层标签，确保填充层不会遮挡文字
      var label = document.createElement('span');
      label.className = 'er-label';
      while (el.firstChild) label.appendChild(el.firstChild);
      el.appendChild(fill);
      el.appendChild(label);

      var fillColor = cs.getPropertyValue('--er-fill').trim() ||
        'rgba(181,104,59,0.85)';
      gsap.set(fill, {
        scaleX: 0,
        transformOrigin: 'left center',
        backgroundColor: fillColor
      });

      var tl = gsap.timeline({ paused: true });
      tl.to(fill, { scaleX: 1, duration: 0.45, ease: 'power4.inOut' });

      el.addEventListener('mouseenter', function () { tl.play(); });
      el.addEventListener('mouseleave', function () { tl.reverse(); });
    });
  }

  /* 启动 */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
