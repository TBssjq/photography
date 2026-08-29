/* ============================================================
 * gallery-motion.js — 画廊动效
 *   1) 筛选 / 排序切换：用 Flip 做 FLIP 重排（First-Last-Invert-Play），
 *      卡片在新旧布局之间平滑迁移，而不是「整片瞬间重排」。
 *   2) 卡片入场：图片自下而上揭幕（scale + yPercent）+ 卡片淡入，
 *      由 ScrollTrigger.batch 分批触发，长列表也不会一次创建上百个 tween。
 *
 * 依赖 gsap / ScrollTrigger / Flip，三者均为可选：缺失或用户开启
 * prefers-reduced-motion 时静默降级为「无动画」，不影响内容渲染。
 *
 * 调用方：js/data.js 在 renderGallery() 前后调用本模块暴露的钩子。
 * ============================================================ */
(function () {
  'use strict';

  var gsap = window.gsap;
  if (!gsap) return;

  var hasST = typeof window.ScrollTrigger !== 'undefined';
  var hasFlip = typeof window.Flip !== 'undefined';
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  if (hasST) gsap.registerPlugin(window.ScrollTrigger);
  if (hasFlip) gsap.registerPlugin(window.Flip);

  function mediaOf(card) {
    return card.querySelector('.media-wrap img, .media-wrap video');
  }

  /* ---------- 入场揭幕 ---------- */

  function setupReveal(cards) {
    if (reduce || !cards.length) return;

    var batch = [], medias = [];
    cards.forEach(function (card) {
      if (card.dataset.gmRevealed === '1') return;
      card.dataset.gmRevealed = '1';
      var m = mediaOf(card);
      // 图片带 CSS `transition: transform 1.2s`，GSAP 逐帧写 inline transform
      // 会被这条过渡再平滑一次，动画明显拖尾 —— 揭幕期间先摘掉它。
      if (m) { m.dataset.gmPrevTransition = m.style.transition; m.style.transition = 'none'; }
      batch.push(card);
      if (m) medias.push(m);
    });
    if (!batch.length) return;

    // 先压到「未揭幕」状态，再等进入视口，避免闪一下再隐藏
    gsap.set(batch, { opacity: 0 });
    gsap.set(medias, { yPercent: 10, scale: 1.2 });

    if (typeof IntersectionObserver === 'undefined') { play(batch); return; }

    /* 一次性入场用 IntersectionObserver，而不是 ScrollTrigger.batch：
       batch 会给每张卡片留一个常驻实例，照片越多 ScrollTrigger 数量线性膨胀
       （实测 29 张卡片就吃掉了全站 99 个实例里的 29 个）；
       IO 触发后 unobserve 即彻底释放，语义上本来也是「只播一次」。 */
    var io = new IntersectionObserver(function (entries) {
      var hits = [];
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        hits.push(en.target);
      });
      if (hits.length) play(hits);
    }, { rootMargin: '0px 0px -8% 0px' }); // 约等于 ScrollTrigger 的 start: 'top 92%'

    batch.forEach(function (card) { io.observe(card); });
  }

  /* 播放一组卡片的揭幕：卡片淡入 + 图片从下方推上来 */
  function play(group) {
    gsap.to(group, {
      opacity: 1, duration: 0.55, ease: 'power2.out', stagger: 0.06, overwrite: 'auto'
    });
    var ms = group.map(mediaOf).filter(Boolean);
    if (!ms.length) return;
    gsap.to(ms, {
      yPercent: 0, scale: 1, duration: 1.1, ease: 'power3.out', stagger: 0.06,
      overwrite: 'auto',
      onComplete: function () {
        // 清掉 inline transform 并把 CSS 过渡还回去：
        // 否则 CSS 的 .card:hover img { transform: scale(1.04) } 会被 inline 样式永久压住。
        ms.forEach(function (m) {
          m.style.transition = m.dataset.gmPrevTransition || '';
          delete m.dataset.gmPrevTransition;
        });
        gsap.set(ms, { clearProps: 'transform' });
      }
    });
  }

  /* 新卡片纳入管理。flipping=true 表示这批来自筛选重排，
     出场交给 Flip 处理，这里只登记，不额外叠加揭幕动画。 */
  function ingest(cards, flipping) {
    if (!cards || !cards.length) return;
    if (flipping || reduce) {
      /* 筛选重排 / 降级场景：出场交给 Flip（或干脆不播），这里只登记，
         避免后续再叠加入场揭幕。注意不能先登记再交给 setupReveal ——
         setupReveal 正是靠这个标记去重，那样会把自己筛成空集。 */
      cards.forEach(function (card) { card.dataset.gmRevealed = '1'; });
      return;
    }
    setupReveal(cards);
  }

  /* ---------- Flip 重排 ---------- */

  function beforeRender(grid) {
    if (!grid || !hasFlip || reduce) return null;
    var cards = grid.querySelectorAll('.card');
    return cards.length ? window.Flip.getState(cards) : null;
  }

  function afterRender(state) {
    if (!state || !hasFlip || reduce) return;
    window.Flip.from(state, {
      duration: 0.55,
      ease: 'power2.inOut',
      stagger: 0.015,
      /* 不使用 absolute:true：.grid 是内容撑高的 CSS 网格，重排期间把子元素
         抽成绝对定位会让容器高度塌成 0，整页内容往上猛跳一下。
         默认的 transform 版 FLIP 让元素留在流内，只补偿位移，反而更稳。 */
      scale: false,     // masonry 卡片尺寸各异，缩放会变形，只迁移位置
      onEnter: function (els) {
        // 新增的卡片：从略小的透明状态长出来
        return gsap.fromTo(els,
          { opacity: 0, scale: 0.94 },
          { opacity: 1, scale: 1, duration: 0.45, ease: 'power2.out', stagger: 0.015 });
      },
      /* 网格高度变化后必须重算触发点，但要等重排动画结束再刷：
         动画进行中卡片还带着补偿位移，此时测量会把 ScrollTrigger 的起点算歪。 */
      onComplete: function () {
        if (hasST) window.ScrollTrigger.refresh();
      }
    });
  }

  window.GalleryMotion = {
    ingest: ingest,
    beforeRender: beforeRender,
    afterRender: afterRender
  };
})();
