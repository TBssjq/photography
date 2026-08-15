/* ================================================================
   液态玻璃（Liquid Glass）边缘折射效果
   - 复用 Liquid Glass 演示库的液化算法：用 canvas 生成位移贴图（displacement map），
     通过 SVG feDisplacementMap 让玻璃边缘产生真实折射/扭曲。
   - 同时给玻璃元素加上鼠标光晕（.lg-mouse）跟随。
   - 纯前端、无第三方依赖，自动套用到带 .lg 类的元素。
   - 后台 / 前台共用，单一来源。
   ================================================================ */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var XLINK_NS = 'http://www.w3.org/1999/xlink';

  var svgContainer = null;
  var filterCache = new Map();
  var elementFilterMap = new WeakMap();
  var filterIdCounter = 0;

  // 可调参数（与视觉强度相关）
  var currentRefractionStrength = 1.2;
  var currentDistortion = 0.6;

  function ensureSvgContainer() {
    if (svgContainer && document.body.contains(svgContainer)) return svgContainer;
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;overflow:hidden;';
    var defs = document.createElementNS(SVG_NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
    svgContainer = svg;
    return svg;
  }

  function smoothStep(a, b, t) {
    var v = Math.max(0, Math.min(1, (t - a) / (b - a)));
    return v * v * (3 - 2 * v);
  }

  function roundedRectSDF(x, y, halfW, halfH, r) {
    var qx = Math.abs(x) - halfW + r;
    var qy = Math.abs(y) - halfH + r;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  }

  // 生成位移贴图：玻璃边缘做径向折射 + 轻微液化噪声
  function buildDisplacementMap(width, height, radius, strength, distortion) {
    var longSide = Math.max(width, height);
    var halfW = width / longSide / 2;
    var halfH = height / longSide / 2;
    var r = Math.min(radius / longSide, Math.min(halfW, halfH) - 0.001);
    var refractionBand = 0.12;
    var effectiveBand = Math.min(refractionBand, Math.min(halfW, halfH) / 2);
    var refractionStrength = strength * 0.05;
    var distortionScale = distortion * 0.35;

    var canvas = document.createElement('canvas');
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    var ctx = canvas.getContext('2d');
    if (!ctx) return { url: '', scale: 0 };

    var image = ctx.createImageData(canvas.width, canvas.height);
    var data = image.data;

    var maxScale = 0;
    var buf = new Float32Array(canvas.width * canvas.height * 2);
    var bi = 0;

    for (var y = 0; y < canvas.height; y++) {
      var v = (y / canvas.height - 0.5) * (height / longSide);
      for (var x = 0; x < canvas.width; x++) {
        var u = (x / canvas.width - 0.5) * (width / longSide);
        var dist = roundedRectSDF(u, v, halfW, halfH, r);
        var t = smoothStep(-effectiveBand, 0, dist);
        var len = Math.hypot(u, v) || 1;
        var baseMag = t * refractionStrength * longSide;
        // 折射取样方向取径向反方向（玻璃边缘把背景“拉弯”）
        var dx = -(u / len) * baseMag;
        var dy = -(v / len) * baseMag;

        if (t > 0 && distortionScale > 0) {
          var angle = Math.atan2(v, u);
          var radius = Math.hypot(u, v);
          var swirl = Math.sin(radius * 10 - angle * 4) * distortionScale * t;
          var flowX = Math.sin(x * 0.05 + y * 0.03) + Math.cos(x * 0.02 - y * 0.04) * 0.7;
          var flowY = Math.sin(y * 0.04 + x * 0.025) + Math.cos(y * 0.055 - x * 0.018) * 0.7;
          var tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
          dx += (tangent.x * swirl + flowX * distortionScale * t);
          dy += (tangent.y * swirl + flowY * distortionScale * t);
        }

        maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
        buf[bi++] = dx;
        buf[bi++] = dy;
      }
    }

    if (maxScale === 0) maxScale = 1;

    var i = 0;
    for (var p = 0; p < data.length; p += 4) {
      var rr = buf[i++] / maxScale / 2 + 0.5;
      var gg = buf[i++] / maxScale / 2 + 0.5;
      data[p] = rr * 255;
      data[p + 1] = gg * 255;
      data[p + 2] = 0;
      data[p + 3] = 255;
    }

    ctx.putImageData(image, 0, 0);
    return { url: canvas.toDataURL(), scale: maxScale * 2 };
  }

  function getOrCreateFilter(width, height, radius, strength, distortion) {
    var key = width + '-' + height + '-' + radius + '-' + strength.toFixed(3) + '-' + distortion.toFixed(3);
    if (filterCache.has(key)) return filterCache.get(key);

    var svg = ensureSvgContainer();
    var defs = svg.querySelector('defs');
    var id = 'lg-edge-' + (++filterIdCounter);

    var filter = document.createElementNS(SVG_NS, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', String(width));
    filter.setAttribute('height', String(height));
    filter.setAttribute('colorInterpolationFilters', 'sRGB');

    var feImage = document.createElementNS(SVG_NS, 'feImage');
    feImage.setAttributeNS(XLINK_NS, 'href', '');
    feImage.setAttribute('href', '');
    feImage.setAttribute('x', '0');
    feImage.setAttribute('y', '0');
    feImage.setAttribute('width', String(width));
    feImage.setAttribute('height', String(height));
    feImage.setAttribute('preserveAspectRatio', 'none');
    feImage.setAttribute('result', 'dispMap');

    var feDisp = document.createElementNS(SVG_NS, 'feDisplacementMap');
    feDisp.setAttribute('in', 'SourceGraphic');
    feDisp.setAttribute('in2', 'dispMap');
    feDisp.setAttribute('xChannelSelector', 'R');
    feDisp.setAttribute('yChannelSelector', 'G');
    feDisp.setAttribute('scale', '0');

    filter.appendChild(feImage);
    filter.appendChild(feDisp);
    defs.appendChild(filter);

    var map = buildDisplacementMap(width, height, radius, strength, distortion);
    feImage.setAttributeNS(XLINK_NS, 'href', map.url);
    feImage.setAttribute('href', map.url);
    feDisp.setAttribute('scale', String(map.scale));

    filterCache.set(key, id);
    return id;
  }

  function applyLiquidGlassEffect(el) {
    var rect = el.getBoundingClientRect();
    var width = Math.round(rect.width);
    var height = Math.round(rect.height);
    if (width < 8 || height < 8) return;
    var style = getComputedStyle(el);
    var radius = parseFloat(style.borderTopLeftRadius) || 16;
    var filterId = getOrCreateFilter(width, height, radius, currentRefractionStrength, currentDistortion);
    el.style.setProperty('--lg-filter', 'url(#' + filterId + ')');
  }

  function updateElementFilter(el) {
    var rect = el.getBoundingClientRect();
    var width = Math.round(rect.width);
    var height = Math.round(rect.height);
    if (width < 8 || height < 8) return;
    var style = getComputedStyle(el);
    var radius = parseFloat(style.borderTopLeftRadius) || 16;
    var filterId = getOrCreateFilter(width, height, radius, currentRefractionStrength, currentDistortion);
    el.style.setProperty('--lg-filter', 'url(#' + filterId + ')');
    elementFilterMap.set(el, filterId);
  }

  function refreshAllFilters() {
    document.querySelectorAll('.lg').forEach(function (el) {
      updateElementFilter(el);
    });
  }

  // 给玻璃元素加鼠标光晕（仅在有 .lg-mouse 子节点时生效）
  function initMouseGlow() {
    document.querySelectorAll('.lg').forEach(function (el) {
      var light = el.querySelector('.lg-mouse');
      if (!light) {
        light = document.createElement('div');
        light.className = 'lg-mouse';
        el.appendChild(light);
      }
      el.addEventListener('mousemove', function (e) {
        var rect = el.getBoundingClientRect();
        light.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
        light.style.setProperty('--my', (e.clientY - rect.top) + 'px');
      });
    });
  }

  function init() {
    if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) return;

    // 标记需要液态玻璃的玻璃元素
    // 注意：.featured-overlay 内文字（kicker/h3/p）只是底部磨砂牌，套 SVG 位移贴图滤镜
    // 既无视觉价值，又会在精选区 hover/重绘时实时计算 feDisplacementMap，造成明显卡顿，故移除。
    var targets = document.querySelectorAll(
      '#header, ' +
      '.gear-item, .about-img-tag, .card .vid-badge, .card .note-badge, .contact-item'
    );
    targets.forEach(function (el) { el.classList.add('lg'); });

    initMouseGlow();
    refreshAllFilters();

    // 视口缩放时重新生成贴图（避免模糊区域偏移）
    var zoomPending = false;
    function refreshOnZoom() {
      if (zoomPending) return;
      zoomPending = true;
      requestAnimationFrame(function () { zoomPending = false; refreshAllFilters(); });
    }
    window.addEventListener('resize', refreshOnZoom);

    // 元素尺寸变化时同步更新贴图
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.target.matches('.lg')) {
            requestAnimationFrame(function () { updateElementFilter(entry.target); });
          }
        });
      });
      targets.forEach(function (el) { ro.observe(el); });
    }

    console.log('✓ 液态玻璃效果已加载（' + targets.length + ' 个元素）');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // 暴露给控制台调试
  window.LiquidGlass = { refresh: refreshAllFilters };
})();
