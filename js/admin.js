/* ================================================================
   隋北 · 内容后台（完整编辑版）
   整份 content.json 读写，不丢字段。支持：
   - 作品 / 精选 / 分类 / 关于 / 联系 / 装备 / 首页 的可视化编辑
   - 图片上传（/api/upload）、灯箱预览、批量删除
   - 保存（POST /api/content，后端自动重建）、恢复默认、导出 ZIP、重新构建
   ================================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'lumen_site_data';
  var defaults = window.SITE_DATA || {};
  var data = null;

  var apiMode = false;
  var API_BASE = '';

  var statusEl = document.getElementById('status');
  var exportBox = document.getElementById('exportBox');

  /* ---------- 工具 ---------- */
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) {
      if (o == null) return undefined;
      return k.match(/^\d+$/) ? o[+k] : o[k];
    }, obj);
  }
  function setPath(obj, path, val) {
    var keys = path.split('.'), o = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      var k = keys[i], idx = k.match(/^\d+$/) ? +k : k;
      var next = keys[i + 1];
      if (o[idx] == null) o[idx] = (next.match(/^\d+$/) ? [] : {});
      o = o[idx];
    }
    var last = keys[keys.length - 1];
    o[last.match(/^\d+$/) ? +last : last] = val;
  }
  function ensure(arr) { return Array.isArray(arr) ? arr : []; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function markDirty() {
    if (statusEl) { statusEl.textContent = '● 有改动未保存'; statusEl.classList.add('dirty'); }
  }
  function markSaved(msg) {
    if (statusEl) { statusEl.textContent = msg || '已保存 · 刷新站点可见'; statusEl.classList.remove('dirty'); }
  }

  /* ---------- 图片字段（URL + 上传按钮） ---------- */
  function imgFieldHTML(path, label) {
    var val = getPath(data, path) || '';
    return '' +
      '<div class="field">' +
        '<span>' + esc(label) + '</span>' +
        '<div class="f-img-wrap">' +
          '<input class="f-img" type="text" data-path="' + path + '" value="' + esc(val) + '">' +
          '<button type="button" class="f-upload" data-upload-path="' + path + '" data-magnetic>上传</button>' +
        '</div>' +
      '</div>';
  }
  function thumbHTML(src) {
    if (src) return '<img class="thumb" src="' + esc(src) + '" alt="">';
    return '<div class="thumb empty">无图</div>';
  }
  function catSelectHTML(path, val) {
    var cats = ensure(data.categories);
    var opts = '<option value="">— 未分类 —</option>' + cats.map(function (c) {
      var sel = (c.key === val) ? ' selected' : '';
      return '<option value="' + esc(c.key) + '"' + sel + '>' + esc(c.label || c.key) + '</option>';
    }).join('');
    return '<div class="field"><span>分类</span><select data-path="' + path + '">' + opts + '</select></div>';
  }

  /* ============================================================
     渲染：各模块
     ============================================================ */
  function renderPhotos() {
    var list = document.getElementById('listPhotos');
    var photos = ensure(data.photos);
    list.innerHTML = photos.map(function (p, i) {
      return '' +
      '<div class="row-card" data-index="' + i + '">' +
        '<div class="rc-head">' +
          '<span class="rc-title">#' + (i + 1) + ' · ' + esc(p.title || '未命名') + '</span>' +
          '<div style="display:flex;gap:8px;align-items:center">' +
            '<label class="rc-check"><input type="checkbox" data-batch="photo" data-index="' + i + '"> 选</label>' +
            '<button class="rc-del" data-action="delPhoto" data-index="' + i + '" data-magnetic title="删除">×</button>' +
          '</div>' +
        '</div>' +
        '<div class="thumb-wrap" data-preview="photo" data-index="' + i + '">' +
          thumbHTML(p.src) +
          '<div class="rc-actions"><button class="rc-act" data-preview="photo" data-index="' + i + '" title="预览">⤢</button></div>' +
        '</div>' +
        imgFieldHTML('photos.' + i + '.src', '图片路径 / 上传') +
        '<div class="row-grid">' +
          '<div class="field"><span>标题</span><input type="text" data-path="photos.' + i + '.title" value="' + esc(p.title || '') + '"></div>' +
          catSelectHTML('photos.' + i + '.cat', p.cat) +
          '<div class="field"><span>标签 TAG</span><input type="text" data-path="photos.' + i + '.tag" value="' + esc(p.tag || '') + '"></div>' +
          '<div class="field"><span>日期</span><input type="text" data-path="photos.' + i + '.date" value="' + esc(p.date || '') + '"></div>' +
          '<div class="field" style="grid-column:1/-1"><span>标签（逗号分隔）</span><input type="text" data-path="photos.' + i + '.tags" data-join="," value="' + esc((p.tags || []).join(', ')) + '"></div>' +
          '<div class="field" style="grid-column:1/-1"><span>说明 note</span><textarea data-path="photos.' + i + '.note" rows="2">' + esc(p.note || '') + '</textarea></div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderFeatured() {
    var list = document.getElementById('listFeatured');
    var feats = ensure(data.featured);
    list.innerHTML = feats.map(function (f, i) {
      return '' +
      '<div class="row-card" data-index="' + i + '">' +
        '<div class="rc-head">' +
          '<span class="rc-title">#' + (i + 1) + ' · ' + esc(f.title || '未命名') + '</span>' +
          '<button class="rc-del" data-action="delFeatured" data-index="' + i + '" data-magnetic title="删除">×</button>' +
        '</div>' +
        '<div class="thumb-wrap" data-preview="featured" data-index="' + i + '">' +
          thumbHTML(f.img) +
          '<div class="rc-actions"><button class="rc-act" data-preview="featured" data-index="' + i + '" title="预览">⤢</button></div>' +
        '</div>' +
        imgFieldHTML('featured.' + i + '.img', '图片路径 / 上传') +
        '<div class="row-grid">' +
          '<div class="field"><span>标题</span><input type="text" data-path="featured.' + i + '.title" value="' + esc(f.title || '') + '"></div>' +
          '<div class="field"><span>小标题 kicker</span><input type="text" data-path="featured.' + i + '.kicker" value="' + esc(f.kicker || '') + '"></div>' +
          '<div class="field" style="grid-column:1/-1"><span>描述 desc</span><textarea data-path="featured.' + i + '.desc" rows="2">' + esc(f.desc || '') + '</textarea></div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderCategories() {
    var list = document.getElementById('listCategories');
    var cats = ensure(data.categories);
    list.innerHTML = cats.map(function (c, i) {
      return '' +
      '<div class="row-card" data-index="' + i + '">' +
        '<div class="rc-head">' +
          '<span class="rc-title">#' + (i + 1) + ' · ' + esc(c.label || c.key) + '</span>' +
          '<button class="rc-del" data-action="delCategory" data-index="' + i + '" data-magnetic title="删除">×</button>' +
        '</div>' +
        '<div class="row-grid">' +
          '<div class="field"><span>标识 key</span><input type="text" data-path="categories.' + i + '.key" value="' + esc(c.key || '') + '"></div>' +
          '<div class="field"><span>显示名 label</span><input type="text" data-path="categories.' + i + '.label" value="' + esc(c.label || '') + '"></div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderAbout() {
    var a = data.about || (data.about = {});
    var paras = ensure(a.paragraphs);
    var stats = ensure(a.stats);
    var html = '' +
      imgFieldHTML('about.img', '配图路径 / 上传') +
      '<div class="row-grid">' +
        '<div class="field"><span>小标题 kicker</span><input type="text" data-path="about.kicker" value="' + esc(a.kicker || '') + '"></div>' +
        '<div class="field"><span>区块编号 secNum</span><input type="text" data-path="about.secNum" value="' + esc(a.secNum || '') + '"></div>' +
        '<div class="field"><span>配图说明 imgTag</span><input type="text" data-path="about.imgTag" value="' + esc(a.imgTag || '') + '"></div>' +
        '<div class="field"><span>标题 title</span><input type="text" data-path="about.title" value="' + esc(a.title || '') + '"></div>' +
      '</div>' +
      '<p class="panel-hint">段落（每段一条，可增删）：</p>' +
      '<div class="tw-editor" id="aboutParas">' +
        paras.map(function (t, i) {
          return '<div class="tw-seg"><textarea data-path="about.paragraphs.' + i + '" rows="2" style="width:100%">' + esc(t) + '</textarea>' +
            '<button class="rc-del" data-action="delAboutPara" data-index="' + i + '" data-magnetic title="删除">×</button></div>';
        }).join('') +
      '</div>' +
      '<button class="mini-btn" data-action="addAboutPara" data-magnetic>+ 新增段落</button>' +
      '<p class="panel-hint" style="margin-top:18px">数据 stats（标签 / 数值）：</p>' +
      '<div class="tw-editor" id="aboutStats">' +
        stats.map(function (s, i) {
          return '<div class="tw-seg">' +
            '<input type="text" data-path="about.stats.' + i + '.label" placeholder="标签" value="' + esc(s.label || '') + '">' +
            '<input type="text" data-path="about.stats.' + i + '.value" placeholder="数值" value="' + esc(s.value || '') + '">' +
            '<button class="rc-del" data-action="delAboutStat" data-index="' + i + '" data-magnetic title="删除">×</button></div>';
        }).join('') +
      '</div>' +
      '<button class="mini-btn" data-action="addAboutStat" data-magnetic>+ 新增数据</button>';
    document.getElementById('panelAbout').innerHTML = html;
  }

  function renderContact() {
    var c = data.contact || (data.contact = {});
    var cons = ensure(c.contacts);
    var html = '' +
      '<div class="row-grid">' +
        '<div class="field"><span>标题 title</span><input type="text" data-path="contact.title" value="' + esc(c.title || '') + '"></div>' +
        '<div class="field"><span>副标题 subtitle</span><input type="text" data-path="contact.subtitle" value="' + esc(c.subtitle || '') + '"></div>' +
      '</div>' +
      '<div class="field"><span>致语 dedication</span><textarea data-path="contact.dedication" rows="2">' + esc(c.dedication || '') + '</textarea></div>' +
      '<p class="panel-hint" style="margin-top:18px">联系方式：</p>' +
      '<div class="kv-editor" id="contactList">' +
        cons.map(function (k, i) {
          return '<div class="tw-seg">' +
            '<input type="text" data-path="contact.contacts.' + i + '.label" placeholder="名称" value="' + esc(k.label || '') + '">' +
            '<input type="text" data-path="contact.contacts.' + i + '.value" placeholder="内容" value="' + esc(k.value || '') + '">' +
            '<input type="text" data-path="contact.contacts.' + i + '.url" placeholder="链接(可选)" value="' + esc(k.url || '') + '">' +
            '<button class="rc-del" data-action="delContact" data-index="' + i + '" data-magnetic title="删除">×</button></div>';
        }).join('') +
      '</div>' +
      '<button class="mini-btn" data-action="addContact" data-magnetic>+ 新增联系方式</button>';
    document.getElementById('panelContact').innerHTML = html;
  }

  function renderGear() {
    var g = data.gear || (data.gear = {});
    var items = ensure(g.items);
    var html = '' +
      '<div class="row-grid">' +
        '<div class="field"><span>小标题 kicker</span><input type="text" data-path="gear.kicker" value="' + esc(g.kicker || '') + '"></div>' +
        '<div class="field"><span>区块编号 secNum</span><input type="text" data-path="gear.secNum" value="' + esc(g.secNum || '') + '"></div>' +
        '<div class="field"><span>标题 title</span><input type="text" data-path="gear.title" value="' + esc(g.title || '') + '"></div>' +
      '</div>' +
      '<div class="field"><span>描述 desc</span><textarea data-path="gear.desc" rows="2">' + esc(g.desc || '') + '</textarea></div>' +
      '<p class="panel-hint" style="margin-top:18px">器材 items：</p>' +
      '<div class="kv-editor" id="gearList">' +
        items.map(function (it, i) {
          return '<div class="tw-seg">' +
            '<input type="text" data-path="gear.items.' + i + '.name" placeholder="名称" value="' + esc(it.name || '') + '">' +
            '<input type="text" data-path="gear.items.' + i + '.value" placeholder="数值" value="' + esc(it.value || '') + '">' +
            '<button class="rc-del" data-action="delGear" data-index="' + i + '" data-magnetic title="删除">×</button></div>';
        }).join('') +
      '</div>' +
      '<button class="mini-btn" data-action="addGear" data-magnetic>+ 新增器材</button>';
    document.getElementById('panelGear').innerHTML = html;
  }

  function renderHero() {
    var h = data.hero || (data.hero = {});
    var tw = ensure(h.typewriter);
    var html = '' +
      imgFieldHTML('hero.bg', '背景图路径 / 上传') +
      '<div class="row-grid">' +
        '<div class="field"><span>小标题 kicker</span><input type="text" data-path="hero.kicker" value="' + esc(h.kicker || '') + '"></div>' +
        '<div class="field"><span>副标题 subtitle</span><input type="text" data-path="hero.subtitle" value="' + esc(h.subtitle || '') + '"></div>' +
        '<div class="field"><span>主按钮 btnPrimary</span><input type="text" data-path="hero.btnPrimary" value="' + esc(h.btnPrimary || '') + '"></div>' +
        '<div class="field"><span>次按钮 btnSecondary</span><input type="text" data-path="hero.btnSecondary" value="' + esc(h.btnSecondary || '') + '"></div>' +
      '</div>' +
      '<p class="panel-hint" style="margin-top:18px">打字机文字（勾选 em 为强调样式）：</p>' +
      '<div class="tw-editor" id="heroTW">' +
        tw.map(function (t, i) {
          return '<div class="tw-seg">' +
            '<input type="text" data-path="hero.typewriter.' + i + '.text" placeholder="文字" value="' + esc(t.text || '') + '">' +
            '<label><input type="checkbox" data-em-path="hero.typewriter.' + i + '.em"' + (t.em ? ' checked' : '') + '> 强调</label>' +
            '<button class="rc-del" data-action="delHeroTW" data-index="' + i + '" data-magnetic title="删除">×</button></div>';
        }).join('') +
      '</div>' +
      '<button class="mini-btn" data-action="addHeroTW" data-magnetic>+ 新增打字机段</button>';
    document.getElementById('panelHero').innerHTML = html;
  }

  function renderAll() {
    renderPhotos(); renderFeatured(); renderCategories();
    renderAbout(); renderContact(); renderGear(); renderHero();
    updateBatchBar();
  }

  /* ============================================================
     事件委托
     ============================================================ */
  // 文本输入：实时写回 data（不重渲染，避免丢焦点）
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.path != null) {
      var v = t.value;
      if (t.dataset.join) {
        v = v.split(t.dataset.join).map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
      }
      setPath(data, t.dataset.path, v);
      markDirty();
      if (t.dataset.path.indexOf('.title') > -1) {
        var card = t.closest('.row-card');
        if (card) {
          var idx = card.dataset.index;
          var tt = card.querySelector('.rc-title');
          if (tt) tt.textContent = '#' + (+idx + 1) + ' · ' + (v || '未命名');
        }
      }
    }
  });

  // 下拉 / 复选框变化
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.emPath) {
      setPath(data, t.dataset.emPath, !!t.checked); markDirty(); return;
    }
    if (t.dataset && t.dataset.batch) { updateBatchBar(); return; }
    if (t.dataset && t.dataset.path != null && (t.tagName === 'SELECT')) {
      setPath(data, t.dataset.path, t.value); markDirty();
    }
  });

  // 点击：切换 tab / 增删 / 上传 / 预览 / 灯箱关闭 / 导出 等
  document.addEventListener('click', function (e) {
    var tab = e.target.closest('[data-tab]');
    if (tab) { switchTab(tab.dataset.tab); return; }

    var act = e.target.closest('[data-action]');
    if (act) { handleAction(act.dataset.action, act.dataset.index); return; }

    var up = e.target.closest('[data-upload-path]');
    if (up) { triggerUpload(up.dataset.uploadPath); return; }

    var pv = e.target.closest('[data-preview]');
    if (pv) { openLightbox(pv.dataset.preview, +pv.dataset.index); return; }

    if (e.target.closest('[data-lb-close]')) { closeLightbox(); return; }
  });

  function switchTab(name) {
    document.querySelectorAll('.an-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      p.classList.toggle('active', p.dataset.panel === name);
    });
  }

  function handleAction(action, index) {
    index = index == null ? null : +index;
    switch (action) {
      case 'delPhoto': data.photos.splice(index, 1); renderPhotos(); break;
      case 'delFeatured': data.featured.splice(index, 1); renderFeatured(); break;
      case 'delCategory': data.categories.splice(index, 1); renderCategories(); break;
      case 'delAboutPara': data.about.paragraphs.splice(index, 1); renderAbout(); break;
      case 'delAboutStat': data.about.stats.splice(index, 1); renderAbout(); break;
      case 'delContact': data.contact.contacts.splice(index, 1); renderContact(); break;
      case 'delGear': data.gear.items.splice(index, 1); renderGear(); break;
      case 'delHeroTW': data.hero.typewriter.splice(index, 1); renderHero(); break;
      case 'addPhoto': data.photos.push({ cat: '', date: '', note: '', src: '', tag: '', tags: [], title: '' }); renderPhotos(); scrollToEnd('listPhotos'); break;
      case 'addFeatured': data.featured.push({ desc: '', img: '', kicker: '', title: '' }); renderFeatured(); scrollToEnd('listFeatured'); break;
      case 'addCategory': data.categories.push({ key: 'new', label: '新分类' }); renderCategories(); scrollToEnd('listCategories'); break;
      case 'addAboutPara': data.about.paragraphs.push(''); renderAbout(); break;
      case 'addAboutStat': data.about.stats.push({ label: '', value: '' }); renderAbout(); break;
      case 'addContact': data.contact.contacts.push({ label: '', url: '', value: '' }); renderContact(); break;
      case 'addGear': data.gear.items.push({ name: '', value: '' }); renderGear(); break;
      case 'addHeroTW': data.hero.typewriter.push({ text: '', em: false }); renderHero(); break;
      default: return;
    }
    markDirty();
  }

  // 新增条目后滚动到列表末尾（即刚新增的项），方便直接填写
  function scrollToEnd(listId) {
    var box = document.getElementById(listId);
    if (!box) return;
    var last = box.lastElementChild;
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------- 批量删除（作品） ---------- */
  function updateBatchBar() {
    var checks = document.querySelectorAll('input[data-batch="photo"]:checked');
    var bar = document.getElementById('batchBarPhotos');
    var cnt = document.getElementById('batchCountPhotos');
    if (!bar || !cnt) return;
    if (checks.length) {
      bar.style.display = 'flex';
      cnt.textContent = '已选 ' + checks.length + ' 项';
    } else {
      bar.style.display = 'none';
    }
  }
  document.getElementById('batchDelPhotos').addEventListener('click', function () {
    var checks = Array.prototype.slice.call(document.querySelectorAll('input[data-batch="photo"]:checked'));
    if (!checks.length) return;
    if (!confirm('确定删除选中的 ' + checks.length + ' 张作品？')) return;
    var idxs = checks.map(function (c) { return +c.dataset.index; }).sort(function (a, b) { return b - a; });
    idxs.forEach(function (i) { data.photos.splice(i, 1); });
    renderPhotos(); markDirty();
  });
  document.getElementById('batchClearPhotos').addEventListener('click', function () {
    document.querySelectorAll('input[data-batch="photo"]:checked').forEach(function (c) { c.checked = false; });
    updateBatchBar();
  });

  /* ---------- 上传 ---------- */
  function triggerUpload(path) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = function () {
      if (!input.files || !input.files.length) return;
      var btn = document.querySelector('[data-upload-path="' + path + '"]');
      if (btn) { btn.disabled = true; btn.textContent = '上传中…'; }
      var fd = new FormData();
      fd.append('file', input.files[0]);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API_BASE + '/api/upload', true);
      xhr.onload = function () {
        if (btn) { btn.disabled = false; btn.textContent = '上传'; }
        if (xhr.status === 200) {
          try {
            var r = JSON.parse(xhr.responseText);
            if (r.ok && r.files && r.files.length) {
              setPath(data, path, r.files[0].path);
              // 刷新该面板对应字段与缩略图
              var field = document.querySelector('[data-path="' + path + '"]');
              if (field) field.value = r.files[0].path;
              renderAll(); markDirty();
            } else { alert('上传失败：后端未返回文件'); }
          } catch (e) { alert('上传失败：' + xhr.responseText); }
        } else { alert('上传失败：' + xhr.responseText); }
      };
      xhr.onerror = function () { if (btn) { btn.disabled = false; btn.textContent = '上传'; } alert('上传网络错误'); };
      xhr.send(fd);
    };
    input.click();
  }

  /* ---------- 灯箱 ---------- */
  function openLightbox(kind, idx) {
    var item, src;
    if (kind === 'photo') { item = data.photos[idx]; src = item && item.src; }
    else { item = data.featured[idx]; src = item && item.img; }
    if (!src) { alert('该条目暂无图片'); return; }
    var lb = document.getElementById('admLightbox');
    document.getElementById('lbMedia').innerHTML = (/\.(mp4|webm|ogg|mov|m4v)$/i.test(src))
      ? '<video src="' + esc(src) + '" controls autoplay></video>'
      : '<img src="' + esc(src) + '" alt="">';
    document.getElementById('lbTitle').textContent = item.title || (kind === 'photo' ? '作品' : '精选');
    document.getElementById('lbNote').textContent = item.note || item.desc || '';
    var dl = document.getElementById('lbDownload');
    dl.href = src;
    dl.setAttribute('download', '');
    lb.classList.add('open');
  }
  function closeLightbox() { document.getElementById('admLightbox').classList.remove('open'); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLightbox(); });

  // 灯箱操作按钮：复制图片链接 / 下载原图
  document.addEventListener('click', function (e) {
    var act = e.target.closest('[data-act]');
    if (!act) return;
    var src = document.getElementById('lbDownload').href;
    if (act.dataset.act === 'share') {
      if (src) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(src).then(function () { alert('图片链接已复制：' + src); },
            function () { prompt('复制失败，请手动复制：', src); });
        } else {
          prompt('请手动复制图片链接：', src);
        }
      }
    } else if (act.dataset.act === 'download') {
      if (src) {
        var a = document.createElement('a');
        a.href = src; a.download = '';
        document.body.appendChild(a); a.click(); a.remove();
      }
    }
  });

  /* ---------- 保存 / 恢复 / 导出 / 构建 ---------- */
  function save(cb) {
    if (apiMode) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API_BASE + '/api/content', true);
      xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
      xhr.onload = function () {
        if (xhr.status === 200) { markSaved('已保存 · 刷新站点可见'); if (cb) cb(true); }
        else { markDirty(); alert('保存失败：' + xhr.responseText); if (cb) cb(false); }
      };
      xhr.onerror = function () { markDirty(); alert('保存网络错误'); if (cb) cb(false); };
      xhr.send(JSON.stringify(data));
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        markSaved('已保存到本地 · 刷新站点可见'); if (cb) cb(true);
      } catch (e) { alert('保存失败：' + e.message); if (cb) cb(false); }
    }
  }

  document.getElementById('btnSave').addEventListener('click', function () {
    if (!data) { alert('正在连接服务器，请稍候再试…'); return; }
    save();
  });

  document.getElementById('btnReset').addEventListener('click', function () {
    if (!confirm('确定恢复为默认内容？当前内容（含已保存的）都会被覆盖，且不可撤销。')) return;
    data = clone(defaults);
    renderAll();
    save(function (ok) { if (ok) location.reload(); else alert('恢复默认失败：请重试'); });
  });

  document.getElementById('btnExport').addEventListener('click', function () {
    var a = document.createElement('a');
    a.href = API_BASE + '/api/export-zip';
    a.download = 'suibei-photography.zip';
    document.body.appendChild(a); a.click(); a.remove();
  });

  document.getElementById('btnRebuild').addEventListener('click', function () {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + '/api/rebuild', true);
    xhr.onload = function () { if (exportBox) exportBox.textContent = (xhr.status === 200 ? '重建成功。' : '重建失败：' + xhr.responseText); };
    xhr.onerror = function () { if (exportBox) exportBox.textContent = '重建网络错误'; };
    xhr.send();
  });
  document.getElementById('btnExportZip').addEventListener('click', function () {
    var a = document.createElement('a');
    a.href = API_BASE + '/api/export-zip';
    a.download = 'suibei-photography.zip';
    document.body.appendChild(a); a.click(); a.remove();
  });

  /* ---------- 引导条关闭 ---------- */
  var gb = document.getElementById('guideBar');
  var gbc = document.getElementById('gbClose');
  if (gbc) gbc.addEventListener('click', function () { gb.classList.add('hide'); });

  /* ---------- 磁吸按钮（与首页一致） ---------- */
  function magnetic() {
    if (window.matchMedia('(max-width: 768px)').matches) return;
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
      var related = e.relatedTarget;
      if (related && el.contains(related)) return;
      el.style.translate = '';
    });
  }

  /* ============================================================
     初始化
     ============================================================ */
  function detectApi() {
    return new Promise(function (resolve) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', API_BASE + '/api/content', true);
        xhr.timeout = 1200;
        xhr.onload = function () {
          if (xhr.status === 200) {
            try { data = JSON.parse(xhr.responseText); apiMode = true; resolve(true); }
            catch (e) { resolve(false); }
          } else { resolve(false); }
        };
        xhr.onerror = function () { resolve(false); };
        xhr.ontimeout = function () { resolve(false); };
        xhr.send();
      } catch (e) { resolve(false); }
    });
  }

  function loadData() {
    if (apiMode) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      return; // data 已由 detectApi 写入
    }
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      data = saved ? JSON.parse(saved) : clone(defaults);
    } catch (e) { data = clone(defaults); }
  }

  function init() {
    loadData();
    renderAll();
    magnetic();
    if (statusEl) {
      statusEl.textContent = apiMode ? '已连接服务器' : '本地模式';
      statusEl.classList.remove('dirty');
    }
    if (exportBox) exportBox.textContent = apiMode
      ? '已连接服务器。保存即自动重新生成站点。'
      : '本地模式：保存写入浏览器缓存（刷新站点需后端）。';
  }

  detectApi().then(function () { init(); });
})();
