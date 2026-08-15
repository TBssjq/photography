/* =========================================================
   分享 / 下载 工具
   - 复制直链、QQ 分享、微信分享（二维码）
   - 纯前端实现，无第三方依赖
   ========================================================= */
(function () {
  'use strict';

  // ---------- 完整、零依赖的 QR 编码器（字节模式，含 Reed-Solomon 纠错） ----------
  function QRCode(text) {
    // --- GF(256) ---
    var EXP = [], LOG = [];
    (function () {
      var x = 1;
      for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
      EXP[255] = EXP[0];
    })();
    function gfMul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[(LOG[a] + LOG[b]) % 255]; }
    function rsPoly(deg) {
      var poly = [1];
      for (var i = 0; i < deg; i++) {
        var next = [0];
        for (var j = 0; j < poly.length; j++) next[j + 1] = (poly[j] !== undefined ? poly[j] : 0);
        for (var k = 0; k < next.length; k++) {
          var term = gfMul(next[k] !== undefined ? next[k] : 0, EXP[i]);
          if (k < poly.length) next[k] = (poly[k] !== undefined ? poly[k] : 0) ^ term;
          else next[k] = term;
        }
        poly = next;
      }
      return poly;
    }
    function rsEncode(data, deg) {
      var poly = rsPoly(deg);
      var res = data.slice();
      for (var i = 0; i < deg; i++) res.push(0);
      for (var i = 0; i < data.length; i++) {
        var coef = res[i];
        if (coef !== 0) {
          for (var j = 0; j < deg; j++) res[i + j] ^= gfMul(poly[deg - 1 - j], coef);
        }
      }
      return res.slice(data.length);
    }

    // --- 容量表：字节模式，纠错级 L。 [version] = {totalCodewords, ecCount} ---
    // version 1-10
    var CAP = {
      1:  [26, 7],  2:  [44, 10], 3:  [70, 15], 4:  [100, 20], 5:  [134, 26],
      6:  [172, 18], 7:  [196, 20], 8:  [242, 24], 9:  [292, 30], 10: [346, 18]
    };
    var bestV = 10;
    for (var v = 1; v <= 10; v++) { if (text.length <= CAP[v][0]) { bestV = v; break; } }
    var version = bestV;
    var totalCW = CAP[version][0];
    var ecCount = CAP[version][1];
    var dataCW = totalCW - ecCount;

    // --- 比特流：模式(0100) + 字符计数(8bit for v1-9, 16bit for v10) + 数据 ---
    var bits = '';
    function appendBin(str) { bits += str; }
    function appendNum(num, len) { appendBin(num.toString(2).padStart(len, '0')); }
    appendBin('0100'); // byte mode
    if (version < 10) appendNum(text.length, 8); else appendNum(text.length, 16);
    for (var i = 0; i < text.length; i++) appendNum(text.charCodeAt(i), 8);
    // terminator
    var capBits = totalCW * 8;
    if (bits.length + 4 <= capBits) appendBin('0000');
    while (bits.length % 8 !== 0) bits += '0';
    // pad bytes
    var padBytes = [0xEC, 0x11];
    var byteArr = [];
    for (var i = 0; i < bits.length; i += 8) byteArr.push(parseInt(bits.substr(i, 8), 2));
    var pi = 0;
    while (byteArr.length < totalCW) { byteArr.push(padBytes[pi % 2]); pi++; }

    // --- RS 纠错 ---
    var ec = rsEncode(byteArr, ecCount);
    var all = byteArr.concat(ec);

    // --- 构建矩阵 ---
    var size = version * 4 + 17;
    var m = [];
    for (var r = 0; r < size; r++) { m.push(new Array(size).fill(null)); }
    function set(r, c, v) { if (r >= 0 && c >= 0 && r < size && c < size) m[r][c] = v; }
    function get(r, c) { return m[r][c]; }

    // 定位符
    function finder(r, c) {
      for (var i = -1; i <= 7; i++) for (var j = -1; j <= 7; j++) {
        var rr = r + i, cc = c + j;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        var v = (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
                (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
                (i >= 2 && i <= 4 && j >= 2 && j <= 4);
        set(rr, cc, v ? 1 : 0);
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    // 定位分隔符
    for (var i = 0; i < 8; i++) {
      if (get(7, i) === null) set(7, i, 0);
      if (get(i, 7) === null) set(i, 7, 0);
      if (get(7, size - 1 - i) === null) set(7, size - 1 - i, 0);
      if (get(size - 1 - i, 7) === null) set(size - 1 - i, 7, 0);
    }
    // 时序线
    for (var i = 8; i < size - 8; i++) {
      if (get(6, i) === null) set(6, i, (i % 2 === 0) ? 1 : 0);
      if (get(i, 6) === null) set(i, 6, (i % 2 === 0) ? 1 : 0);
    }
    // 对齐图案（version >= 2）
    if (version >= 2) {
      var centers = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
                      7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] }[version];
      for (var a = 0; a < centers.length; a++) for (var b = 0; b < centers.length; b++) {
        var cr = centers[a], cc = centers[b];
        var onFinder = (cr <= 7 && cc <= 7) || (cr <= 7 && cc >= size - 8) || (cr >= size - 8 && cc <= 7);
        if (onFinder) continue;
        for (var i = -2; i <= 2; i++) for (var j = -2; j <= 2; j++) {
          var v = (Math.max(Math.abs(i), Math.abs(j)) !== 1) ? 1 : 0;
          set(cr + i, cc + j, v);
        }
      }
    }
    // 暗模块
    set(size - 8, 8, 1);
    // 格式信息（纠错级 L = 01，掩码 0）
    var fmtBits = (function () {
      var data = (1 << 2) | 0; // L=01, mask=000 -> 0b00100 = 4
      var g = 0x537;
      var rem = data << 10;
      for (var i = 14; i >= 10; i--) { if ((rem >> i) & 1) rem ^= g << (i - 10); }
      var code = (data << 10) | rem;
      code ^= 0x5412;
      return code; // 15 bits
    })();
    function placeFmt() {
      for (var i = 0; i < 15; i++) {
        var bit = (fmtBits >> (14 - i)) & 1;
        if (i < 6) set(8, i, bit);
        else if (i < 8) set(8, i + 1, bit);
        else set(8, size - 15 + i, bit);
        if (i < 8) set(size - 1 - i, 8, bit);
        else if (i < 9) set(15 - i, 8, bit);
        else set(15 - i - 1, 8, bit);
      }
      set(size - 8, 8, 1);
    }
    placeFmt();

    // --- 数据放置（之字形） ---
    var bitIdx = 0;
    function nextBit() {
      if (bitIdx < all.length * 8) { var b = (all[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1; bitIdx++; return b; }
      return 0;
    }
    var col = size - 1;
    var upward = true;
    while (col > 0) {
      if (col === 6) col--; // 跳过时序列
      for (var i = 0; i < size; i++) {
        var r = upward ? size - 1 - i : i;
        for (var c = 0; c < 2; c++) {
          var cc = col - c;
          if (get(r, cc) === null) set(r, cc, nextBit());
        }
      }
      upward = !upward;
      col -= 2;
    }

    // --- 掩码 0 应用（仅数据区，跳过功能图形） ---
    function isFunction(r, c) {
      if (r <= 8 && c <= 8) return true;
      if (r <= 8 && c >= size - 8) return true;
      if (r >= size - 8 && c <= 8) return true;
      // 格式信息行/列
      if (r === 8 || c === 8) return true;
      // 时序
      if (r === 6 || c === 6) return true;
      if (typeof centers !== 'undefined') {
        for (var a = 0; a < centers.length; a++) for (var b = 0; b < centers.length; b++) {
          if (Math.abs(r - centers[a]) <= 2 && Math.abs(c - centers[b]) <= 2) return true;
        }
      }
      return false;
    }
    for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) {
      if (m[r][c] === null) m[r][c] = 0;
      if (!isFunction(r, c) && ((r + c) % 2 === 0)) m[r][c] ^= 1;
    }

    this.size = size;
    this.modules = m;
  }

  window.ShareKit = {
    // 复制文本
    copy: function (text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise(function (resolve, reject) {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); resolve(); }
        catch (e) { reject(e); }
        document.body.removeChild(ta);
      });
    },

    // QQ 分享链接
    qqUrl: function (url, title) {
      return 'https://connect.qq.com/widget/shareqq/index.html?url=' +
        encodeURIComponent(url) + '&title=' + encodeURIComponent(title || '') +
        '&desc=' + encodeURIComponent(title || '');
    },

    // 弹出分享面板：复制链接 / QQ / 微信
    sharePanel: function (opt) {
      opt = opt || {};
      var direct = opt.url || location.href;
      var page = opt.pageUrl || location.href;
      var title = opt.title || document.title;
      this._ensurePanel();
      var box = document.getElementById('sharePanel');
      box.querySelector('.sp-title').textContent = title;
      var qr = box.querySelector('.sp-qr');
      // 微信扫码使用页面链接（方便带回站点），复制/QQ 用直链
      qr.innerHTML = this._qrSVG(page);
      box._direct = direct; box._page = page; box._title = title;
      box.classList.add('open');
      document.body.classList.add('sp-sharing'); // 防止点击穿透到底层灯箱
      // ESC 键关闭
      if (!box._escBound) {
        box._escBound = true;
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && box.classList.contains('open')) box.classList.remove('open');
        });
      }
    },

    _qrSVG: function (text) {
      try {
        var q = new QRCode(text);
        var s = q.size, cell = 6, pad = 2;
        var total = (s + pad * 2) * cell;
        var rects = '';
        for (var r = 0; r < s; r++) for (var c = 0; c < s; c++) {
          if (q.modules[r][c]) {
            rects += '<rect x="' + ((c + pad) * cell) + '" y="' + ((r + pad) * cell) +
              '" width="' + cell + '" height="' + cell + '"/>';
          }
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + total + '" height="' + total +
          '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges">' +
          '<rect width="100%" height="100%" fill="#fff"/>' + rects + '</svg>';
      } catch (e) {
        return '<p style="font-size:12px;color:#888">二维码生成失败，请直接复制链接</p>';
      }
    },

    _ensurePanel: function () {
      if (document.getElementById('sharePanel')) return;
      var m = document.createElement('div');
      m.id = 'sharePanel';
      m.className = 'sp-modal';
      m.innerHTML = '<div class="sp-box">' +
        '<button class="sp-close" aria-label="close"><span>×</span></button>' +
        '<h4 class="sp-title"></h4>' +
        '<div class="sp-opts">' +
          '<button class="sp-opt" data-s="copy">' +
            '<span class="sp-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></span><span>复制链接</span></button>' +
          '<button class="sp-opt" data-s="qq">' +
            '<span class="sp-ico"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 2c-3.3 0-6 2.7-6 6v1c-1.7.4-3 2-3 4 0 1.7 1 3.1 2.4 3.7-.3.8-.4 1.6-.4 2.3 0 2.5 3.4 4 7 4s7-1.5 7-4c0-.7-.1-1.5-.4-2.3C20 16.1 21 14.7 21 13c0-2-1.3-3.6-3-4V8c0-3.3-2.7-6-6-6z"/></svg></span><span>发给 QQ 好友</span></button>' +
          '<button class="sp-opt" data-s="wx">' +
            '<span class="sp-ico"><svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M8.5 4C4.9 4 2 6.5 2 9.5c0 1.7.9 3.3 2.4 4.3L4 15l2-1c.5.1 1 .2 1.5.2-.1-.4-.1-.8-.1-1.2 0-3.3 3.1-6 7-6 .2 0 .5 0 .7.1C14.5 5.6 11.8 4 8.5 4zM6 8c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zm5 0c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zm3.5 1c-3 0-5.5 2-5.5 4.5s2.5 4.5 5.5 4.5c.5 0 1-.1 1.4-.2l1.6.8-.4-1.4c1.2-.8 1.9-2 1.9-3.7 0-2.5-2.5-4.5-5.5-4.5zm-2 3c.4 0 .8.3.8.7s-.4.7-.8.7-.8-.3-.8-.7.4-.7.8-.7zm4 0c.4 0 .8.3.8.7s-.4.7-.8.7-.8-.3-.8-.7.4-.7.8-.7z"/></svg></span><span>微信扫码</span></button>' +
        '</div>' +
        '<div class="sp-qr"></div>' +
        '<p class="sp-tip">微信扫码后在聊天里发送给好友，或分享到朋友圈</p>' +
        '</div>';
      document.body.appendChild(m);
      var self = this;
      // 关闭：点击 × 关闭按钮（含内部符号）或 点击遮罩空白处，都关闭整个弹窗（含 .sp-box）
      function closePanel() {
        m.classList.remove('open');
        document.body.classList.remove('sp-sharing');
      }
      var closeBtn = m.querySelector('.sp-close');
      if (closeBtn) closeBtn.addEventListener('click', function (e) { e.stopPropagation(); closePanel(); });
      m.addEventListener('click', function (e) {
        if (e.target === m || (e.target.closest && e.target.closest('.sp-close'))) closePanel();
        var opt = e.target.closest('.sp-opt');
        if (!opt) return;
        var kind = opt.dataset.s;
        if (kind === 'copy') {
          self.copy(m._direct).then(function () {
            opt.querySelector('span:last-child').textContent = '已复制';
            setTimeout(function () { opt.querySelector('span:last-child').textContent = '复制链接'; }, 1500);
          });
        } else if (kind === 'qq') {
          window.open(self.qqUrl(m._direct, m._title), '_blank', 'width=700,height=600');
        } else if (kind === 'wx') {
          m.querySelector('.sp-qr').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    },

    // 下载文件（图片/视频）：优先 fetch→blob 以触发真正下载；
    // 跨域 / CORS 受限时回退为打开新标签（用户可右键另存）
    download: function (url, name) {
      name = name || '';
      var fallback = function () {
        var a = document.createElement('a');
        a.href = url; a.download = name;
        a.target = '_blank'; a.rel = 'noopener';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
      };
      if (typeof fetch !== 'function') { fallback(); return; }
      fetch(url, { mode: 'cors' }).then(function (r) {
        if (!r.ok) throw new Error('bad status');
        return r.blob();
      }).then(function (blob) {
        var obj = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = obj; a.download = name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(obj); }, 4000);
      }).catch(function () { fallback(); });
    }
  };
})();
