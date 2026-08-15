/* ================================================================
   隋北 — 数据与内容渲染
   负责：加载数据 / 写入首屏 / 画廊 / 精选 / 引言 / 关于 / 器材 / 联系 / 灯箱 / 滚动动画
   数据格式以 site-data.js 为准。
   ================================================================ */
(function () {
  'use strict';

  /* 进入视口加 class（统一由 ScrollTrigger 驱动，与 animations.js 共用调度层）。
     插件缺失时退回原生 IO，保证降级可用。 */
  function revealClass(sel, cls, threshold) {
    var els;
    if (typeof sel === 'string') {
      els = document.querySelectorAll(sel);
    } else if (sel && sel.nodeType) {
      els = [sel]; // 单个 DOM 元素
    } else if (sel && sel.length !== undefined) {
      els = sel; // NodeList / 数组
    } else {
      return;
    }
    if (!els.length) return;
    if (typeof window.ScrollTrigger === 'undefined') {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add(cls); io.unobserve(en.target); } });
      }, { threshold: threshold || 0.2 });
      els.forEach(function (el) { io.observe(el); });
      return;
    }
    window.ScrollTrigger.batch(els, {
      start: 'top ' + (100 - Math.min(100, (threshold || 0.2) * 100)) + '%',
      onEnter: function (batch) { batch.forEach(function (el) { el.classList.add(cls); }); }
    });
  }

  var SITE = {};
  var SSG_MODE = false;
  (function loadData() {
    /* SSG 模式：Go 后端在 HTML 中嵌入了 <script type="application/json" id="site-data">，
       直接从中读取数据，无需 localStorage 缓存。 */
    var ssgEl = document.getElementById('site-data');
    if (ssgEl) {
      try {
        SITE = JSON.parse(ssgEl.textContent);
        SSG_MODE = true;
        window.SITE = SITE;
        return;
      } catch (e) {
        console.error('[SSG] 嵌入数据解析失败，回退到旧模式', e);
      }
    }
    /* 旧模式：从 window.SITE_DATA 或 localStorage 读取 */
    var defaults = window.SITE_DATA || {};
    var CACHE_VERSION = '20260815_v7'; // 更新数据时递增此版本号
    try {
      var savedVer = localStorage.getItem('lumen_cache_version');
      // 版本不匹配时，清除旧缓存数据
      if (savedVer !== CACHE_VERSION) {
        localStorage.removeItem('lumen_site_data');
        localStorage.setItem('lumen_cache_version', CACHE_VERSION);
        SITE = defaults;
        window.SITE = SITE;
        return;
      }
      var saved = localStorage.getItem('lumen_site_data');
      if (saved) {
        SITE = Object.assign({}, defaults, JSON.parse(saved));
        window.SITE = SITE;
        return;
      }
    } catch (e) {}
    SITE = defaults;
    window.SITE = SITE;
  })();

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---------- 生成 SVG 占位图（图片加载失败时的优雅降级） ---------- */
  function placeholderDataURI(title, cat, isVideo) {
    var palettes = {
      nature:   ['#2e2a1f', '#4a4232', '#6b5f47'],
      portrait: ['#3d2a2e', '#6b4448', '#9c6468'],
      city:     ['#23201c', '#34302a', '#49423a'],
      mono:     ['#1a1714', '#33302c', '#5a544c'],
      video:    ['#211b16', '#342a22', '#4a3a2e'],
      default:  ['#211b16', '#342a22', '#4a3a2e']
    };
    var p = palettes[cat] || palettes.default;
    var w = 800, h = 600;
    var safeTitle = String(title || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    var icon = isVideo
      ? '<polygon points="340,220 340,380 480,300" fill="rgba(255,255,255,0.7)"/>'
      : '<circle cx="400" cy="260" r="36" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="2"/><circle cx="400" cy="260" r="14" fill="rgba(255,255,255,0.2)"/><rect x="356" y="232" width="88" height="56" rx="8" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="' + p[0] + '"/>' +
      '<stop offset="50%" stop-color="' + p[1] + '"/>' +
      '<stop offset="100%" stop-color="' + p[2] + '"/>' +
      '</linearGradient></defs>' +
      '<rect width="100%" height="100%" fill="url(#g)"/>' +
      '<circle cx="' + (w*0.75) + '" cy="' + (h*0.25) + '" r="120" fill="rgba(255,255,255,0.04)"/>' +
      '<circle cx="' + (w*0.2) + '" cy="' + (h*0.8) + '" r="80" fill="rgba(255,255,255,0.03)"/>' +
      icon +
      '<text x="400" y="430" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="28" font-weight="500" fill="rgba(255,255,255,0.75)" text-anchor="middle">' + safeTitle + '</text>' +
      '<text x="400" y="465" font-family="monospace" font-size="11" letter-spacing="3" fill="rgba(255,255,255,0.35)" text-anchor="middle">' + (cat || 'PHOTO').toUpperCase() + '</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ---------- 图片加载失败时的优雅降级 ---------- */
  function imgOnError(img, title, cat, isVid) {
    function handleError() {
      if (img._fallbackApplied) return;
      img._fallbackApplied = true;
      var src = placeholderDataURI(title, cat, isVid);
      if (img.tagName === 'IMG') {
        img.src = src;
        img.style.objectFit = 'cover';
        img.style.width = '100%';
        img.style.height = 'auto';
      } else {
        img.style.display = 'none';
        var wrap = img.closest('.media-wrap, .featured-img-wrap, .about-img');
        if (wrap) {
          var ph = document.createElement('img');
          ph.src = src;
          ph.style.width = '100%';
          ph.style.height = 'auto';
          ph.style.objectFit = 'cover';
          wrap.insertBefore(ph, img);
        }
      }
    }
    img.addEventListener('error', handleError);
    /* 如果图片已经加载失败（error 事件在监听器注册前已触发） */
    if (img.complete && img.naturalWidth === 0) {
      handleError();
    }
  }

  /* ---------- 写入首屏与各区块文本内容 ---------- */
  function applyContent() {
    var h = SITE.hero || {}, f = SITE.featured || [], q = SITE.quote || {};
    var a = SITE.about || {}, g = SITE.gear || {}, c = SITE.contact || {}, ft = SITE.footer || {};

    if (h.kicker) { var ek = document.getElementById('heroKicker'); if (ek) ek.textContent = h.kicker; }
    if (h.subtitle) { var es = document.getElementById('heroSub'); if (es) es.textContent = h.subtitle; }
    if (h.btnPrimary) {
      var btn1 = document.getElementById('heroCta'); if (btn1) {
      var ts1 = btn1.querySelector('span:not(.glass-ring)');
      if (ts1) ts1.textContent = h.btnPrimary; else btn1.textContent = h.btnPrimary; }
    }
    if (h.btnSecondary) {
      var btn2 = document.getElementById('heroCta2'); if (btn2) {
      var ts2 = btn2.querySelector('span:not(.glass-ring)');
      if (ts2) ts2.textContent = h.btnSecondary; else btn2.textContent = h.btnSecondary; }
    }
    if (h.bg) { var ebg = document.getElementById('heroBg'); if (ebg) ebg.style.backgroundImage = 'url("' + h.bg + '")'; }

    // 打字机：保留 <em> 高亮片段
    var tw = document.getElementById('heroTitle');
    if (tw && Array.isArray(h.typewriter)) tw.dataset.segments = JSON.stringify(h.typewriter);

    renderFeatured(f);
    renderShowcase();

    if (q.text) {
      var qt = document.getElementById('quoteText');
      var em = q.emphasize;
      var html = esc(q.text);
      if (em) {
        var idx = q.text.indexOf(em);
        if (idx >= 0) {
          html = esc(q.text.slice(0, idx)) + '<em>' + esc(em) + '</em>' + esc(q.text.slice(idx + em.length));
        }
      }
      if (qt) qt.innerHTML = html;
    }
    if (q.author) document.getElementById('quoteAuthor').textContent = q.author;

    if (a.title) document.getElementById('aboutTitle').textContent = a.title;
    if (a.img) {
      var aboutImg = document.getElementById('aboutImg');
      aboutImg.src = a.img;
      imgOnError(aboutImg, '摄影师', 'portrait');
    }
    if (a.imgTag) document.getElementById('aboutTag').textContent = a.imgTag;
    if (a.paragraphs) {
      var ab = document.getElementById('aboutBody');
      ab.innerHTML = '';
      a.paragraphs.forEach(function (p) {
        var el = document.createElement('p');
        el.textContent = p;
        ab.appendChild(el);
      });
    }
    if (a.stats) {
      var sWrap = document.getElementById('aboutStats');
      sWrap.innerHTML = '';
      a.stats.forEach(function (s) {
        var d = document.createElement('div');
        d.className = 'stat';
        d.innerHTML = '<h4>' + esc(s.value) + '</h4><p>' + esc(s.label) + '</p>';
        sWrap.appendChild(d);
      });
    }

    if (g.title) document.getElementById('gearTitle').textContent = g.title;
    if (g.desc) document.getElementById('gearSub').textContent = g.desc;
    if (Array.isArray(g.items)) {
      var gl = document.getElementById('gearList');
      gl.innerHTML = '';
      g.items.forEach(function (it) {
        var d = document.createElement('div');
        d.className = 'gear-item';
        d.innerHTML =
          '<div class="gear-icon">' + (it.svg || defaultGearIcon()) + '</div>' +
          '<div class="gear-info"><h4>' + esc(it.name) + '</h4><p>' + esc(it.value || it.spec || '') + '</p></div>' +
          (it.note ? '<div class="gear-tip">' + esc(it.note) + '</div>' : '');
        gl.appendChild(d);
      });
    }

    if (c.title) document.getElementById('contactTitle').textContent = c.title;
    if (c.subtitle) document.getElementById('contactSub').textContent = c.subtitle;

    if (ft.copyright) {
      document.getElementById('footYear').textContent = ft.copyright;
      document.getElementById('footTagline').textContent = '';
    }
    // 页脚文字链接（液态玻璃 + 磁性位移）
    var flBox = document.getElementById('footer-links');
    if (flBox) {
      var fl = ft.links || [];
      flBox.innerHTML = fl.map(function (l) {
        var label = l.label || l.text || l;
        var url = l.url || l.href || '';
        if (url) {
          return '<a href="' + esc(url) + '" target="_blank" rel="noopener" data-magnetic>' + esc(label) + '</a>';
        }
        return '<a href="javascript:void(0)" data-magnetic>' + esc(label) + '</a>';
      }).join('');
    }
  }

  function defaultGearIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">' +
      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>';
  }

  /* ---------- Split Text（字符级入场动画） ---------- */
  function splitText(el) {
    if (!el || el.dataset.split === 'done') return;
    var text = el.textContent;
    el.textContent = '';
    var frag = document.createDocumentFragment();
    var chars = Array.from(text);
    chars.forEach(function (ch, i) {
      var span = document.createElement('span');
      span.className = 'char' + (ch === ' ' ? ' space' : '');
      span.textContent = ch === ' ' ? ' ' : ch;
      span.style.setProperty('--i', i);
      frag.appendChild(span);
    });
    el.appendChild(frag);
    el.dataset.split = 'done';
  }

  /* ---------- 文字拆分逐词渐显（拆分后用 ScrollTrigger 统一触发 .show） ---------- */
  function initSplitText() {
    var items = document.querySelectorAll('.split-text');
    items.forEach(function (el) {
      splitText(el);
      revealClass(el, 'show', 0.3);
    });
  }

  /* ---------- 精选区渲染 ---------- */
  function renderFeatured(f) {
    if (!Array.isArray(f) || !f.length) return;
    var list = document.getElementById('featuredList');
    if (!list) return;
    // 全部精选项以「一左一右」交错行呈现：奇数行图在左、偶数行图在右（由 CSS :nth-child 控制）
    list.innerHTML = '';
    f.forEach(function (fi) {
      var row = document.createElement('div');
      row.className = 'featured-row reveal';
      row.setAttribute('data-tilt', '');
      row.innerHTML =
        '<div class="fr-media">' +
          '<img src="' + fi.img + '" alt="' + esc(fi.title) + '" loading="lazy">' +
        '</div>' +
        '<div class="fr-text">' +
          (fi.kicker ? '<span class="kicker">' + esc(fi.kicker) + '</span>' : '') +
          (fi.title ? '<h3>' + esc(fi.title) + '</h3>' : '') +
          (fi.desc ? '<p>' + esc(fi.desc) + '</p>' : '') +
        '</div>';
      var img = row.querySelector('img');
      imgOnError(img, fi.title, undefined, false);
      row._data = fi;
      list.appendChild(row);
    });
  }

  /* ---------- HERO SHOWCASE：不规则重贴图片墙（悬停前置） ---------- */
  // 用一组"锚点 + 偏移 + 旋转"把照片排成不规整、彼此重叠的一排，
  // 鼠标移到某张时该卡片回正、放大、提升层级，盖住相邻图（详见 css/site.css）。
  var SHOWCASE_ANCHORS = [
    // left%,  top,  width,  rot,  z   —— 相对 stage 的定位
    { l: -2,  t: 120, w: 210, r: -7,  z: 3 },
    { l: 11,  t: 18,  w: 250, r: 5,   z: 5 },
    { l: 25,  t: 150, w: 190, r: -4,  z: 2 },
    { l: 37,  t: 60,  w: 270, r: 8,   z: 6 },
    { l: 52,  t: 175, w: 200, r: -6,  z: 4 },
    { l: 62,  t: 20,  w: 230, r: -3,  z: 5 },
    { l: 75,  t: 130, w: 220, r: 6,   z: 3 },
    { l: 86,  t: 55,  w: 240, r: -5,  z: 4 }
  ];

  function renderShowcase() {
    var stage = document.getElementById('showcaseStage');
    if (!stage) return;
    var empty = document.getElementById('showcaseEmpty');
    var photos = (SITE.photos || []).slice();
    if (!photos.length) {
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    // 用固定锚点做错落重叠的"精选墙"。展示数量受锚点数约束（避免重叠成一团）。
    // 取数优先级：① content.json 的 showcase.count（默认锚点数）；
    //            ② 优先展示用户在「精选区」选定的作品，其余按作品顺序补齐。
    // 全部作品请在下方画廊（renderGallery）查看。
    var anchors = SHOWCASE_ANCHORS;
    // 展示数量受锚点数约束（避免重叠成一团）；默认取满锚点，超出部分放到下方画廊。
    var count = Math.max(1, Math.min(anchors.length, photos.length));

    // 收集 featured 引用的图片（img 字段），按其在 featured 中的顺序匹配 photos
    var featuredImgs = (SITE.featured || []).map(function (f) { return f.img; });
    var picked = [];
    var used = {};
    featuredImgs.forEach(function (src) {
      for (var k = 0; k < photos.length; k++) {
        if (!used[k] && photos[k].src === src) { picked.push(photos[k]); used[k] = true; break; }
      }
    });
    // 其余按作品顺序补齐到 count 张
    for (var k = 0; k < photos.length && picked.length < count; k++) {
      if (!used[k]) { picked.push(photos[k]); used[k] = true; }
    }
    picked = picked.slice(0, count);

    stage.innerHTML = '';

    for (var i = 0; i < picked.length; i++) {
      var p = picked[i];
      var a = anchors[i % anchors.length];
      var card = document.createElement('div');
      card.className = 'showcase-card';
      // 用 CSS 变量驱动位置/旋转，便于 hover 时整体回正
      card.style.left = a.l + '%';
      card.style.top = a.t + 'px';
      card.style.width = a.w + 'px';
      card.style.zIndex = a.z;
      card.style.setProperty('--rot', a.r + 'deg');
      card.style.transform = 'rotate(' + a.r + 'deg)';
      card.style.transitionDelay = (i * 0.04) + 's';

      var isVid = isVideo(p.src);
      var media = isVid
        ? '<video src="' + p.src + '" muted playsinline preload="metadata"></video>'
        : '<img loading="lazy" src="' + p.src + '" alt="' + esc(p.title) + '">';
      card.innerHTML =
        media +
        '<div class="sc-meta">' +
          '<div class="sc-title">' + esc(p.title || '') + '</div>' +
          (p.tag || p.cat ? '<div class="sc-cat">' + esc(p.tag || catLabel(p.cat)) + '</div>' : '') +
        '</div>';

      var img = card.querySelector('img, video');
      if (img && img.tagName === 'IMG') imgOnError(img, p.title, p.cat, false);

      // 悬停前置：给 stage 加 has-hover，让其余卡片后退
      card.addEventListener('mouseenter', function () { stage.classList.add('has-hover'); });
      card.addEventListener('mouseleave', function () { stage.classList.remove('has-hover'); });
      // 点击打开灯箱
      card.addEventListener('click', function () { if (window.openWorkBySrc) window.openWorkBySrc(p.src); });

      stage.appendChild(card);
    }
  }

  /* ---------- 横向滚动作品展示 ---------- */
  // 横向区只展示前 HS_MAX 张作为概览，避免 29 张全塞进去滚得太长；
  // 全部作品请在下方画廊查看。
  var HS_MAX = 12;
  function renderHorizontalScroll() {
    var track = document.getElementById('hsTrack');
    if (!track) return;
    var photos = (SITE.photos || []).slice();
    if (!photos.length) return;

    var n = Math.min(photos.length, HS_MAX);
    var totalEl = document.getElementById('hsTotal');
    if (totalEl) totalEl.textContent = String(n).padStart(2, '0');

    track.innerHTML = '';
    for (var i = 0; i < n; i++) {
      var p = photos[i];
      var panel = document.createElement('div');
      panel.className = 'hs-panel';
      panel.setAttribute('data-magnetic', '');

      var isVid = isVideo(p.src);
      var mediaHtml = isVid
        ? '<video class="hs-panel-img" src="' + p.src + '" muted playsinline preload="metadata"></video>'
        : '<img class="hs-panel-img" loading="lazy" src="' + p.src + '" alt="' + esc(p.title) + '">';

      panel.innerHTML =
        mediaHtml +
        '<div class="hs-panel-overlay">' +
          '<div class="hs-panel-num">' + String(i + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0') + '</div>' +
          '<div class="hs-panel-title">' + esc(p.title || '') + '</div>' +
          '<div class="hs-panel-cat">' + esc(p.tag || catLabel(p.cat)) + '</div>' +
        '</div>';

      var img = panel.querySelector('img, video');
      if (img && img.tagName === 'IMG') imgOnError(img, p.title, p.cat, isVid);

      (function (src) {
        panel.addEventListener('click', function () { if (window.openWorkBySrc) window.openWorkBySrc(src); });
      })(p.src);

      track.appendChild(panel);
    }
  }

  /* ---------- 打字机效果（保留 <em> 高亮） ---------- */
  function typewriter() {
    var el = document.getElementById('heroTitle');
    if (!el) return;
    var segs;
    try { segs = JSON.parse(el.dataset.segments); } catch (e) { segs = null; }
    if (!segs || !segs.length) return;

    var parts = [];
    segs.forEach(function (s) {
      var lines = String(s.text).split('\n');
      lines.forEach(function (ln, i) {
        parts.push({ text: ln, em: !!s.em });
        if (i < lines.length - 1) parts.push({ text: '\n', em: false });
      });
    });
    var full = parts.map(function (p) { return p.text; }).join('');
    var ranges = [];
    var acc = 0;
    parts.forEach(function (p) {
      if (p.em && p.text !== '\n') ranges.push([acc, acc + p.text.length]);
      acc += p.text.length;
    });

    function buildHTML(n) {
      var html = '';
      var count = 0;
      for (var i = 0; i < full.length && count < n; i++, count++) {
        var ch = full[i];
        if (ch === '\n') { html += '<br>'; continue; }
        var inEm = false;
        for (var r = 0; r < ranges.length; r++) {
          if (i >= ranges[r][0] && i < ranges[r][1]) { inEm = true; break; }
        }
        html += inEm ? '<em>' + ch + '</em>' : ch;
      }
      return html;
    }

    var cursor = document.getElementById('cursor');
    if (!cursor) { cursor = document.createElement('span'); cursor.className = 'cursor'; }
    var i = 0;
    el.innerHTML = '';

    function tick() {
      if (i <= full.length) {
        el.innerHTML = buildHTML(i);
        el.appendChild(cursor);
        i++;
        var delay = (i > 2 && full[i - 2] === ' ') ? 90 : 55;
        if (full[i - 1] === '\n') delay = 420;
        setTimeout(tick, delay);
      } else {
        setTimeout(function () {
          el.innerHTML = buildHTML(full.length);
          el.appendChild(cursor);
        }, 1400);
        setTimeout(tick, 1400 + 2600);
      }
    }
    setTimeout(tick, 600);
  }

  /* ---------- 画廊渲染 + 多维筛选 ---------- */
  var galleryItems = [];
  var filterState = { cat: 'all', year: 'all', tags: [], sort: 'default' };

  function isVideo(m) {
    if (!m) return false;
    return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(m) || /^data:video\//i.test(m);
  }

  function catLabel(key) {
    var c = (SITE.categories || []).filter(function (x) { return x.key === key; })[0];
    return c ? c.label : key;
  }

  // 返回当前筛选状态下的作品列表
  function getFilteredPhotos() {
    var photos = (SITE.photos || []).slice();
    var st = filterState;

    if (st.cat && st.cat !== 'all') photos = photos.filter(function (p) { return (p.cat || '') === st.cat; });
    if (st.year && st.year !== 'all') photos = photos.filter(function (p) { return (p.date || '').slice(0, 4) === st.year; });
    if (st.tags && st.tags.length) {
      photos = photos.filter(function (p) {
        var pt = p.tags || [];
        return st.tags.every(function (t) { return pt.indexOf(t) >= 0; });
      });
    }

    if (st.sort === 'new')      photos.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    else if (st.sort === 'old') photos.sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });

    return photos;
  }

  // 画廊分批渲染：首屏渲染一批，滚动接近底部再渲染下一批，支撑大量作品不卡顿
  var BATCH = 24;
  var batchState = { photos: [], rendered: 0, grid: null, sentinel: null, io: null };

  function buildCard(p, idx) {
    var card = document.createElement('div');
    card.className = 'card';
    card.style.setProperty('--card-i', idx % 9);
    // 迁移自 Hero Showcase：每张卡片一个轻微随机的倾斜角度，形成"重贴"层叠感
    // 与 --card-i 同源，保证同一张卡片在分批渲染时角度稳定不跳变
    var ROT_TABLE = [-4, 3, -2, 5, -5, 2, -3, 4, -1.5];
    card.style.setProperty('--rot', ROT_TABLE[idx % ROT_TABLE.length] + 'deg');
    card.dataset.index = galleryItems.length;

    var hasVideoSrc = isVideo(p.src);
    var isVid = hasVideoSrc || p.type === 'video';
    var media = hasVideoSrc
      ? '<video src="' + p.src + '" muted playsinline preload="metadata"></video>'
      : '<img loading="lazy" src="' + p.src + '" alt="' + esc(p.title) + '">';

    var catName = p.tag || catLabel(p.cat);
    var badges = (isVid ? '<span class="vid-badge">VIDEO</span>' : '') +
      (p.note ? '<span class="note-badge">NOTE</span>' : '');

    var links = renderLinks(p.links);
    var actions =
      '<div class="card-actions">' +
        '<button class="ca-btn" data-act="share" data-magnetic title="分享" aria-label="分享">分享</button>' +
        '<button class="ca-btn" data-act="download" data-magnetic title="下载" aria-label="下载">下载</button>' +
      '</div>';

    card.innerHTML =
      '<div class="media-wrap">' + badges + media + actions + '</div>' +
      '<div class="overlay"><h3>' + esc(p.title || '') + '</h3>' +
      (catName ? '<span>' + esc(catName) + '</span>' : '') + '</div>' +
      (links ? '<div class="card-links">' + links + '</div>' : '');

    card._data = p;
    galleryItems.push(p);

    card.querySelector('[data-act="share"]').addEventListener('click', function (e) {
      e.stopPropagation(); openShare(p);
    });
    card.querySelector('[data-act="download"]').addEventListener('click', function (e) {
      e.stopPropagation(); downloadMedia(p);
    });

    var img = card.querySelector('img, video');
     if (img && img.tagName === 'IMG') imgOnError(img, p.title, p.cat, false);

    // 按真实图片比例设定跨行数，实现错落有序的 masonry 布局
    function applySpan(el) {
      if (!el || !el.naturalWidth) return;
      var ratio = el.naturalWidth / el.naturalHeight; // >1 横图, <1 竖图
      // 基准行高 8px + 行间隙 14px：跨行数 ≈ 期望高度 / (8+14)
      var row;
      if (ratio >= 1.15) {
        // 横图：偏矮
        row = 20 + (idx % 2);            // 20~21，交替避免完全齐平
      } else if (ratio <= 0.85) {
        // 竖图：偏高（约为横图的 1.5 倍）
        row = 30 + (idx % 3);            // 30~32
      } else {
        row = 24;                         // 近正方形
      }
      card.style.setProperty('--row', row);
    }
    if (img && img.tagName === 'IMG') {
      if (img.naturalWidth) applySpan(img);
      else img.addEventListener('load', function () { applySpan(img); });
    }
     if (img && img.tagName === 'VIDEO') {
       (function (vEl) {
         function handleVideoError() {
           if (vEl._fallbackApplied) return;
           vEl._fallbackApplied = true;
           var wrap = vEl.closest('.media-wrap');
           if (wrap) {
             vEl.style.display = 'none';
             var ph = document.createElement('img');
             ph.src = placeholderDataURI(p.title, p.cat, true);
             ph.style.width = '100%';
             ph.style.height = 'auto';
             ph.style.objectFit = 'cover';
             wrap.insertBefore(ph, vEl);
           }
         }
         vEl.addEventListener('error', handleVideoError);
         setTimeout(function () {
           if (vEl.readyState === 0 && vEl.networkState === 3) handleVideoError();
         }, 3000);
       })(img);
     }
    return card;
  }

  function renderNextBatch() {
    if (!batchState.grid) return;
    var list = batchState.photos;
    var end = Math.min(batchState.rendered + BATCH, list.length);
    for (var i = batchState.rendered; i < end; i++) {
      batchState.grid.appendChild(buildCard(list[i], i));
    }
    batchState.rendered = end;
    if (batchState.rendered >= list.length && batchState.io) {
      batchState.io.disconnect();
      if (batchState.sentinel && batchState.sentinel.parentNode) {
        batchState.sentinel.parentNode.removeChild(batchState.sentinel);
      }
      batchState.sentinel = null;
    }
  }

  function renderGallery() {
    var grid = document.getElementById('galleryGrid');
    if (!grid) return;
    // 清理上一次的滚动监听与哨兵
    if (batchState.io) { batchState.io.disconnect(); batchState.io = null; }
    if (batchState.sentinel && batchState.sentinel.parentNode) {
      batchState.sentinel.parentNode.removeChild(batchState.sentinel);
    }
    grid.innerHTML = '';
    galleryItems = [];
    if (batchState.sentinel) batchState.sentinel = null;

    var photos = getFilteredPhotos();
    var empty = document.getElementById('gridEmpty');
    if (!photos.length) {
      if (empty) empty.style.display = 'block';
      updateGalleryCount(0);
      return;
    }
    if (empty) empty.style.display = 'none';

    batchState.photos = photos;
    batchState.rendered = 0;
    batchState.grid = grid;
    renderNextBatch();
    updateGalleryCount(photos.length);

    // 迁移自 Hero Showcase：悬停某张卡片时给网格加 has-hover，
    // 让其余卡片后退压暗（事件委托，绑定一次即可）
    if (!grid._hoverBound) {
      grid.addEventListener('mouseenter', function (e) {
        var c = e.target.closest && e.target.closest('.card');
        grid.classList.toggle('has-hover', !!c);
      }, true);
      grid.addEventListener('mouseover', function (e) {
        var c = e.target.closest && e.target.closest('.card');
        grid.classList.toggle('has-hover', !!c);
      });
      grid.addEventListener('mouseleave', function () { grid.classList.remove('has-hover'); });
      grid._hoverBound = true;
    }

    // 临近底部时自动渲染下一批
    if (photos.length > BATCH) {
      var sentinel = document.createElement('div');
      sentinel.className = 'grid-sentinel';
      sentinel.style.cssText = 'grid-column:1/-1;height:1px;';
      grid.appendChild(sentinel);
      batchState.sentinel = sentinel;
      batchState.io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) renderNextBatch();
        });
      }, { rootMargin: '600px 0px' });
      batchState.io.observe(sentinel);
    }
  }

  // 渲染友情链接（每行 "标题|网址"）
  function renderLinks(links) {
    if (!links || !links.length) return '';
    return links.map(function (l) {
      var parts = String(l).split('|');
      var title = (parts[1] || parts[0] || '').trim();
      var url = parts[0].trim();
      if (!/^https?:\/\//.test(url)) { url = parts[1] ? parts[1].trim() : ''; title = parts[0].trim(); }
      if (!url) return '';
      return '<a class="flink" href="' + esc(url) + '" target="_blank" rel="noopener" data-magnetic>' +
        '<span class="flink-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>' + esc(title) + '</a>';
    }).join('');
  }

  // 下载图片/视频
  function downloadMedia(p) {
    var name = (p.title || 'photo').replace(/[^\w一-龥-]+/g, '_') +
      (isVideo(p.src) ? '.mp4' : '.jpg');
    window.ShareKit && window.ShareKit.download(p.src, name);
  }

  // 生成指向"主页 + 该作品灯箱"的分享链接（保留主页背景，打开即呈现灯箱状态）
  function shareUrl(p) {
    return location.href.split('#')[0] + '#work-' + encodeURIComponent(p.src);
  }

  // 打开分享面板：复制 / QQ / 微信 均使用主页深链
  function openShare(p) {
    var url = shareUrl(p);
    window.ShareKit && window.ShareKit.sharePanel({
      url: url,
      title: p.title || '摄影作品',
      pageUrl: url
    });
  }

  function updateGalleryCount(n) {
    var el = document.getElementById('galleryCount');
    if (!el) return;
    var start = parseInt(el.textContent, 10) || 0;
    if (start === n) { el.textContent = n; return; }
    var t0 = performance.now(), dur = 700;
    function step(now) {
      var p = Math.min(1, (now - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(start + (n - start) * eased);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- 多维筛选器（栏目 / 年份 / 标签 / 排序） ---------- */
  function renderFilters() {
    var fw = document.getElementById('filters');
    if (!fw) return;

    // 收集所有年份
    var years = {};
    (SITE.photos || []).forEach(function (p) {
      if (p.date) { var y = p.date.slice(0, 4); if (y) years[y] = true; }
    });
    var yearList = Object.keys(years).sort(function (a, b) { return b - a; });

    var cats = SITE.categories || [];
    var catHtml = '<button class="chip active" data-cat="all" data-magnetic>全部</button>';
    cats.forEach(function (c) {
      catHtml += '<button class="chip" data-cat="' + c.key + '" data-magnetic>' + esc(c.label) + '</button>';
    });

    var yearHtml = '<select class="filter-select" id="filterYear" data-magnetic><option value="all">全部年份</option>';
    yearList.forEach(function (y) { yearHtml += '<option value="' + y + '">' + y + ' 年</option>'; });
    yearHtml += '</select>';

    var sortHtml = '<select class="filter-select" id="filterSort" data-magnetic>' +
      '<option value="default">默认排序</option>' +
      '<option value="new">最新拍摄</option>' +
      '<option value="old">最早拍摄</option></select>';

    fw.innerHTML =
      '<div class="filter-group"><span class="filter-label">栏目</span><div class="chip-row">' + catHtml + '</div></div>' +
      '<div class="filter-group"><span class="filter-label">年份</span>' + yearHtml + '</div>' +
      '<div class="filter-group"><span class="filter-label">排序</span>' + sortHtml + '</div>' +
      '<div class="filter-group filter-tags" id="tagGroup" style="display:none;"><span class="filter-label">标签</span><div class="chip-row" id="tagRow"></div></div>';

    // 栏目
    fw.querySelectorAll('[data-cat]').forEach(function (b) {
      b.addEventListener('click', function () {
        fw.querySelectorAll('[data-cat]').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        filterState.cat = b.dataset.cat;
        filterState.tags = []; // 切换栏目时清空已选标签
        updateTagChips();
        renderGallery();
      });
    });
    // 年份
    var ySel = document.getElementById('filterYear');
    if (ySel) ySel.addEventListener('change', function () { filterState.year = ySel.value; filterState.tags = []; updateTagChips(); renderGallery(); });
    // 排序
    var sSel = document.getElementById('filterSort');
    if (sSel) sSel.addEventListener('change', function () { filterState.sort = sSel.value; renderGallery(); });

    // 初始化标签
    updateTagChips();
  }

  // 根据当前 cat/year 筛选结果动态生成标签芯片
  function updateTagChips() {
    var tagRow = document.getElementById('tagRow');
    var tagGroup = document.getElementById('tagGroup');
    if (!tagRow || !tagGroup) return;

    // 当栏目为"全部"时，不显示标签（标签太多影响体验）
    if (filterState.cat === 'all') {
      tagGroup.style.display = 'none';
      return;
    }

    // 获取当前 cat+year 筛选下的作品（不含标签筛选）
    var photos = (SITE.photos || []).slice();
    if (filterState.cat && filterState.cat !== 'all') photos = photos.filter(function (p) { return (p.cat || '') === filterState.cat; });
    if (filterState.year && filterState.year !== 'all') photos = photos.filter(function (p) { return (p.date || '').slice(0, 4) === filterState.year; });

    // 收集这些作品的标签
    var tagsMap = {};
    photos.forEach(function (p) { (p.tags || []).forEach(function (t) { if (t) tagsMap[t] = true; }); });
    var tagList = Object.keys(tagsMap).sort();

    if (!tagList.length) {
      tagGroup.style.display = 'none';
      return;
    }
    tagGroup.style.display = '';

    tagRow.innerHTML = tagList.map(function (t) {
      var isActive = filterState.tags.indexOf(t) >= 0;
      return '<button class="chip tag-chip' + (isActive ? ' active' : '') + '" data-tag="' + esc(t) + '" data-magnetic>#' + esc(t) + '</button>';
    }).join('');

    // 绑定标签点击事件
    tagRow.querySelectorAll('[data-tag]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = b.dataset.tag;
        var i = filterState.tags.indexOf(t);
        if (i >= 0) { filterState.tags.splice(i, 1); b.classList.remove('active'); }
        else { filterState.tags.push(t); b.classList.add('active'); }
        renderGallery();
      });
    });
  }

  /* ---------- 联系区渲染 ---------- */
  function renderContact() {
    var c = SITE.contact || {};
    var list = document.getElementById('contactList');
    if (!list || !Array.isArray(c.contacts)) return;
    list.innerHTML = '';
    c.contacts.forEach(function (k) {
      var a = document.createElement('a');
      a.className = 'ci-link';
      a.setAttribute('data-magnetic', '');
      var href = k.url || 'javascript:void(0)';
      a.href = href;
      a.target = (k.url && k.url.indexOf('http') === 0) ? '_blank' : '_self';
      a.innerHTML =
        '<div class="contact-item">' +
        '<span class="ci-label">' + esc(k.label) + '</span>' +
        '<span class="ci-value">' + esc(k.value) + '</span>' +
        '</div>';
      list.appendChild(a);
    });
  }

  /* ---------- 灯箱 ---------- */
  var lbIndex = 0, lbItems = [];
  function setupLightbox() {
    var lb = document.getElementById('lightbox');
    if (!lb) return;
    var media = lb.querySelector('.lb-media');
    var info = lb.querySelector('.lb-info');
    var counter = lb.querySelector('.lb-counter');

    function show(i) {
      lbIndex = (i + lbItems.length) % lbItems.length;
      var p = lbItems[lbIndex];
      if (p && !p.src && p.img) p.src = p.img; // 兼容 featured 等使用 img 字段的数据
      var hasVideoSrc = isVideo(p.src);
      var isVid = hasVideoSrc || p.type === 'video';
      media.classList.add('fading');
      setTimeout(function () {
        media.innerHTML = hasVideoSrc
          ? '<video src="' + p.src + '" controls autoplay></video>'
          : '<img src="' + p.src + '" alt="' + esc(p.title) + '">';
        var lbMediaEl = media.querySelector('img, video');
        if (lbMediaEl) {
          lbMediaEl.addEventListener('error', function () {
            media.innerHTML = '<img src="' + placeholderDataURI(p.title, p.cat, isVid) + '" alt="' + esc(p.title || '媒体加载失败') + '" style="max-width:90vw;max-height:80vh;object-fit:contain;">';
          });
        }
        media.classList.remove('fading');
        // 始终显示标题和标签，仅在无备注时隐藏备注区
        info.classList.add('visible');
        info.querySelector('.lb-title').textContent = p.title || '';
        info.querySelector('.lb-tag').textContent = p.tag || catLabel(p.cat) || 'NOTE';
        var noteEl = info.querySelector('.lb-note');
        if (p.note) {
          noteEl.textContent = p.note;
          noteEl.style.display = '';
        } else {
          noteEl.style.display = 'none';
        }
        info.querySelector('.lb-links').innerHTML = renderLinks(p.links);
        var acts = document.getElementById('lbActions');
        if (acts) {
          acts.querySelector('[data-act="share"]').onclick = function () { openShare(p); };
          acts.querySelector('[data-act="download"]').onclick = function () { downloadMedia(p); };
        }
        if (counter) counter.textContent = (lbIndex + 1) + ' / ' + lbItems.length;
      }, 180);
    }

    function openList(items, i) {
      lbItems = items;
      lb.classList.add('open');
      document.body.classList.add('lb-open');
      document.body.style.overflow = 'hidden';
      show(i);
    }

    function openOne(obj) {
      // featured 等区块用 img 字段，灯箱统一用 src 字段，做一次兼容映射
      if (obj && !obj.src && obj.img) obj.src = obj.img;
      lbItems = [obj];
      lb.classList.add('open');
      document.body.classList.add('lb-open');
      document.body.style.overflow = 'hidden';
      lbIndex = 0;
      var hasVideoSrc = isVideo(obj.src);
      var isVid = hasVideoSrc || obj.type === 'video';
      media.innerHTML = hasVideoSrc
        ? '<video src="' + obj.src + '" controls autoplay></video>'
        : '<img src="' + obj.src + '" alt="' + esc(obj.title) + '">';
      var lbMediaEl2 = media.querySelector('img, video');
      if (lbMediaEl2) {
        lbMediaEl2.addEventListener('error', function () {
          media.innerHTML = '<img src="' + placeholderDataURI(obj.title, obj.cat, isVid) + '" alt="' + esc(obj.title || '媒体加载失败') + '" style="max-width:90vw;max-height:80vh;object-fit:contain;">';
        });
      }
      // 始终显示标题和标签
      info.classList.add('visible');
      info.querySelector('.lb-title').textContent = obj.title || '';
      info.querySelector('.lb-tag').textContent = obj.tag || obj.kicker || catLabel(obj.cat) || 'NOTE';
      var noteEl2 = info.querySelector('.lb-note');
      if (obj.note) {
        noteEl2.textContent = obj.note;
        noteEl2.style.display = '';
      } else {
        noteEl2.style.display = 'none';
      }
      info.querySelector('.lb-links').innerHTML = renderLinks(obj.links);
      var acts = document.getElementById('lbActions');
      if (acts) {
        acts.querySelector('[data-act="share"]').onclick = function () { openShare(obj); };
        acts.querySelector('[data-act="download"]').onclick = function () { downloadMedia(obj); };
      }
      if (counter) counter.textContent = '1 / 1';
    }

    function close() {
      lb.classList.remove('open');
      document.body.classList.remove('lb-open');
      document.body.style.overflow = '';
      media.innerHTML = '';
      if (location.hash.indexOf('#work-') === 0) {
        history.replaceState(null, '', location.href.split('#')[0]);
      }
    }

    // 根据 src 在主页灯箱中打开指定作品（供分享深链使用）
    function openBySrc(src) {
      var idx = -1;
      for (var i = 0; i < galleryItems.length; i++) {
        if (galleryItems[i].src === src) { idx = i; break; }
      }
      if (idx >= 0) {
        openList(galleryItems, idx);
      } else {
        var found = null;
        if (SITE.photos) {
          for (var j = 0; j < SITE.photos.length; j++) {
            if (SITE.photos[j].src === src) { found = SITE.photos[j]; break; }
          }
        }
        if (found) openOne(found);
      }
    }
    window.openWorkBySrc = openBySrc;

    // 画廊卡片
    document.getElementById('galleryGrid').addEventListener('click', function (e) {
      var card = e.target.closest('.card');
      if (card) openList(galleryItems, parseInt(card.dataset.index, 10));
    });
    // 精选区任意图（事件委托，兼容动态注入的行）
    var fl = document.getElementById('featuredList');
    if (fl) fl.addEventListener('click', function (e) {
      var row = e.target.closest('.featured-row');
      if (row && row._data) openOne(row._data);
    });

    lb.querySelector('.lb-close').addEventListener('click', close);
    lb.querySelector('.lb-prev').addEventListener('click', function () { show(lbIndex - 1); });
    lb.querySelector('.lb-next').addEventListener('click', function () { show(lbIndex + 1); });
    lb.querySelector('.lb-backdrop').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(lbIndex - 1);
      if (e.key === 'ArrowRight') show(lbIndex + 1);
    });
  }

  /* ---------- 滚动入场动画 ---------- */
  /* ---------- 滚动入场动画（统一由 ScrollTrigger 驱动，加 .show 类由 CSS 还原） ---------- */
  function setupReveal() {
    revealClass('.reveal, .gear-item, .stat', 'show', 0.12);
  }

  /* ---------- 视差（仅精选图；Hero 背景交由 ui.js 的 heroParallax） ----------
     已统一移交 animations.js 的中央 gsap.ticker 调度（写 CSS 变量 --fy，零重排）。
     此处保留函数签名以兼容 init() 调用，不再单独绑定 scroll 监听。 */
  function setupParallax() {
    /* 由中央 ticker 接管，避免重复读取 layout 与多重 scroll 监听。 */
  }

  /* ---------- 初始化 ---------- */
  function init() {
    applyContent();
    renderFilters();
    renderGallery();
    renderHorizontalScroll();
    renderContact();
    setupLightbox();
    setupReveal();
    setupParallax();
    typewriter();
    initSplitText();
    handleShareHash();
    window.addEventListener('hashchange', handleShareHash);
  }

  // 分享深链：#work-<encoded src> 打开主页并自动呈现该作品灯箱
  function handleShareHash() {
    var h = location.hash || '';
    if (h.indexOf('#work-') !== 0) return;
    var src = decodeURIComponent(h.slice('#work-'.length));
    if (window.openWorkBySrc) window.openWorkBySrc(src);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
