/* ============================================================
 * ui.js — DOM 面板渲染 / 型号切换 / 引导 / 帮助 / 快捷键（teammate D 维护）
 * 依赖：PC3D.config（数据）、PC3D.util（bus）、可选 PC3D.stage.setAccent
 * 一切 DOM 动态生成；index.html 只提供容器 id。
 * 对外 API（全部挂在 PC3D.ui 下）：
 *   init()                 初始化（DOMContentLoaded 自动调用，幂等）
 *   hideLoading()          首帧后淡出并移除 loading 遮罩
 *   setLoading(p, text)    推进 loading 进度 (0..1)
 *   setSelected(id|null)   高亮清单项 + 渲染详情卡 + 型号 pills
 *   setHover(id|null)      清单 hover 态
 *   setExplode(t)          同步滑杆 / 百分比 / 拆解按钮文案
 *   setStats({fps,calls,tris})
 *   setVariant(id, index)  外部重建后同步 pills 激活态
 *   syncToggle(key, value) 同步开关外观（不触发 emit）
 *   setAccent(hexOrCss)    注入 CSS 变量 --accent / --accent-2
 *   toast(text, kind)      kind: 'info' | 'ok' | 'warn'
 *   startTour() / stopTour() / openHelp() / closeHelp()
 *   toggleDrawer('left'|'right'|null)
 * 事件：emit select / hover / focus / explode:set / explode:toggle / reset /
 *       variant:change / toggle / tour:start / tour:stop
 *       on select / hover / toggle:sync / stats / toast / explode:set /
 *          variant:change / reset / tour:start / tour:stop
 * ========================================================== */
(function () {
  'use strict';

  var PC3D = (window.PC3D = window.PC3D || {});
  var doc = document;
  var UI = {};
  PC3D.ui = UI;

  /* ------------------------------------------------------------ 内部状态 */
  var S = {
    inited: false,
    selected: null,
    hover: null,
    explode: 0,
    exploded: false,
    variant: {},                       /* id -> 当前变体索引 */
    toggle: { autoRotate: false, labels: true, bloom: true, glass: true, sound: false },
    tourOpen: false,
    tourStep: 0,
    helpOpen: false,
    drawer: null,
    stats: { fps: 0, calls: 0, tris: 0 },
    accent: null,
    accent2: null,
    cfg: null,
    refs: {}
  };
  UI.state = S;

  /* -------------------------------------------------------------- 小工具 */
  function q(id) { return doc.getElementById(id); }
  function bus() { return PC3D.bus; }
  function cfg() { return PC3D.config || null; }
  function emit(name, payload) {
    var b = bus();
    if (b && b.emit) b.emit(name, payload || {});
  }
  function h(tag, cls, html) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function fmtK(n) {
    n = Math.round(n || 0);
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return '' + n;
  }

  /* 颜色：int(0xRRGGBB) / '#rrggbb' / {r,g,b} -> {r,g,b} */
  function toRgb(c) {
    if (c && typeof c === 'object' && typeof c.r === 'number') {
      return { r: clamp(c.r, 0, 255), g: clamp(c.g, 0, 255), b: clamp(c.b, 0, 255) };
    }
    if (typeof c === 'string') {
      var s = c.replace('#', '');
      if (s.length === 3) s = s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) + s.charAt(2) + s.charAt(2);
      var v = parseInt(s, 16) || 0;
      return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
    }
    var n = (typeof c === 'number') ? c : 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function css(rgb) {
    return 'rgb(' + Math.round(rgb.r) + ', ' + Math.round(rgb.g) + ', ' + Math.round(rgb.b) + ')';
  }
  function hex(rgb) {
    var s = function (v) { v = clamp(Math.round(v), 0, 255); return (v < 16 ? '0' : '') + v.toString(16); };
    return '#' + s(rgb.r) + s(rgb.g) + s(rgb.b);
  }
  function mix(a, b, t) {
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t
    };
  }
  /* 把任意部件色提亮成「可用的强调色」：向主题色靠拢并抬高亮度 */
  function usableAccent(rgb, themeAccent) {
    var m = mix(rgb, themeAccent, 0.62);
    var mx = Math.max(m.r, m.g, m.b);
    if (mx < 205 && mx > 1) {
      var k = 205 / mx;
      m = { r: clamp(m.r * k, 0, 255), g: clamp(m.g * k, 0, 255), b: clamp(m.b * k, 0, 255) };
    }
    return m;
  }

  /* ================================================================ 主题 */
  UI.setAccent = function (color, color2) {
    var root = doc.documentElement;
    var t = (cfg() && cfg().theme) || {};
    var a = toRgb(color == null ? (t.accent == null ? 0x38e8ff : t.accent) : color);
    var b = toRgb(color2 == null ? (t.accent2 == null ? 0xa45bff : t.accent2) : color2);
    S.accent = a; S.accent2 = b;
    root.style.setProperty('--accent', css(a));
    root.style.setProperty('--accent-rgb', Math.round(a.r) + ', ' + Math.round(a.g) + ', ' + Math.round(a.b));
    root.style.setProperty('--accent-2', css(b));
    root.style.setProperty('--accent-2-rgb', Math.round(b.r) + ', ' + Math.round(b.g) + ', ' + Math.round(b.b));
    var st = PC3D.stage;
    if (st && typeof st.setAccent === 'function') {
      try { st.setAccent((Math.round(a.r) << 16) | (Math.round(a.g) << 8) | Math.round(a.b)); } catch (e) { /* stage 未就绪 */ }
    }
  };

  /* ============================================================== loading */
  UI.setLoading = function (p, text) {
    var box = q('loading');
    if (!box) return;
    if (typeof text === 'string') {
      var t = box.querySelector('#loading-text');
      if (t) t.textContent = text;
    }
    if (typeof p === 'number') {
      var bar = box.querySelector('#loading-bar');
      if (bar) {
        bar.style.animation = 'none';
        bar.style.width = clamp(p, 0, 1) * 100 + '%';
      }
    }
  };

  UI.hideLoading = function () {
    var box = q('loading');
    if (!box) return;
    if (box.getAttribute('data-hidden') === '1') return;
    box.setAttribute('data-hidden', '1');
    var bar = box.querySelector('#loading-bar');
    if (bar) { bar.style.animation = 'none'; bar.style.width = '100%'; }
    var txt = box.querySelector('#loading-text');
    if (txt) txt.textContent = '就绪 · READY';
    box.classList.add('is-hidden');
    var app = q('app');
    if (app) app.classList.add('is-ready');
    setTimeout(function () {
      if (box && box.parentNode) box.parentNode.removeChild(box);
      UI.setLoading = function () {};
    }, 620);
  };

  /* ============================================================== toast */
  var toastSeq = 0;
  UI.toast = function (text, kind) {
    var stack = S.refs.toast || q('toast');
    if (!stack) return;
    kind = kind || 'info';
    var n = h('div', 'ts ts--' + kind);
    n.setAttribute('data-id', 'ts' + (++toastSeq));
    var label = h('span', 'ts__text');
    label.textContent = text;
    n.appendChild(label);
    stack.appendChild(n);
    while (stack.children.length > 4) stack.removeChild(stack.firstChild);
    setTimeout(function () {
      n.classList.add('is-leaving');
      setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 260);
    }, kind === 'warn' ? 3200 : 2400);
  };

  /* ============================================================ 工具栏 */
  function makeSwitch(key, label, title) {
    var n = h('button', 'sw');
    n.setAttribute('type', 'button');
    n.setAttribute('data-toggle', key);
    if (title) n.title = title;
    n.setAttribute('aria-pressed', 'false');
    n.appendChild(h('span', 'sw__track', '<i class="sw__thumb"></i>'));
    var lb = h('span', 'sw__label');
    lb.textContent = label;
    n.appendChild(lb);
    n.addEventListener('click', function () {
      setToggle(key, !S.toggle[key], true);
    });
    return n;
  }

  function setToggle(key, value, fromUser) {
    if (!(key in S.toggle)) return;
    if (S.toggle[key] === value) {
      if (fromUser) emit('toggle', { key: key, value: value });
      return;
    }
    S.toggle[key] = value;
    paintToggle(key, value);
    if (fromUser) emit('toggle', { key: key, value: value });
  }

  function paintToggle(key, value) {
    var list = (S.refs.toolbar || doc).querySelectorAll('[data-toggle="' + key + '"]');
    for (var i = 0; i < list.length; i++) {
      list[i].classList.toggle('is-on', !!value);
      list[i].setAttribute('aria-pressed', value ? 'true' : 'false');
    }
  }

  UI.syncToggle = function (key, value) {
    if (!(key in S.toggle)) return;
    S.toggle[key] = !!value;
    paintToggle(key, !!value);
  };

  function iconBtn(cls, label, title) {
    var b = h('button', 'btn btn--icon ' + (cls || ''));
    b.setAttribute('type', 'button');
    b.innerHTML = label;
    if (title) b.title = title;
    b.setAttribute('aria-label', title || label);
    return b;
  }

  function buildToolbar() {
    var tb = q('toolbar');
    if (!tb) return;
    S.refs.toolbar = tb;
    tb.innerHTML = '';

    /* 移动端：打开左侧抽屉 */
    var dL = iconBtn('tb-drawer tb-drawer--left', '☰', '部件清单');
    dL.addEventListener('click', function () { UI.toggleDrawer('left'); });
    tb.appendChild(dL);

    var brand = h('div', 'tb-brand');
    brand.appendChild(h('div', 'tb-brand__mark', 'PC'));
    var btxt = h('div', 'tb-brand__txt');
    btxt.appendChild(h('b', null, 'PC3D'));
    btxt.appendChild(h('span', null, 'ASSEMBLY VIEWER'));
    brand.appendChild(btxt);
    tb.appendChild(brand);

    var g1 = h('div', 'tb-group tb-group--toggles');
    g1.appendChild(makeSwitch('autoRotate', '自动旋转', '自动旋转 (空格)'));
    g1.appendChild(makeSwitch('labels', '标注', '显示 3D 标注 (L)'));
    g1.appendChild(makeSwitch('bloom', '辉光', '后期辉光 (B)'));
    g1.appendChild(makeSwitch('glass', '侧透', '侧透玻璃显隐 (G)'));
    tb.appendChild(g1);

    var g2 = h('div', 'tb-group');
    var bTour = h('button', 'btn');
    bTour.setAttribute('type', 'button');
    bTour.innerHTML = '<span>◈</span><span>引导</span>';
    bTour.title = '新手引导 (T)';
    bTour.addEventListener('click', function () { UI.startTour(true); });
    g2.appendChild(bTour);

    var bHelp = h('button', 'btn');
    bHelp.setAttribute('type', 'button');
    bHelp.innerHTML = '<span>?</span><span>快捷键</span>';
    bHelp.title = '帮助 (H)';
    bHelp.addEventListener('click', function () { UI.openHelp(); });
    g2.appendChild(bHelp);

    var bReset = h('button', 'btn btn--primary');
    bReset.setAttribute('type', 'button');
    bReset.innerHTML = '<span>⟲</span><span>复原</span>';
    bReset.title = '复原视角与拆解 (R)';
    bReset.addEventListener('click', function () { emit('reset', {}); });
    g2.appendChild(bReset);
    tb.appendChild(g2);

    /* 移动端：打开右侧抽屉 */
    var dR = iconBtn('tb-drawer tb-drawer--right', '▤', '部件详情');
    dR.addEventListener('click', function () { UI.toggleDrawer('right'); });
    tb.appendChild(dR);
  }

  /* ========================================================== 左侧清单 */
  function buildLeftPanel() {
    var panel = q('panel-left');
    var list = q('part-list');
    if (!panel || !list) return;
    S.refs.panelLeft = panel;
    S.refs.list = list;

    /* 头部（含移动端关闭按钮） */
    if (!panel.querySelector('.panel__head')) {
      var head = h('div', 'panel__head');
      var title = h('div', 'panel__title');
      title.appendChild(h('h2', null, '部件清单'));
      title.appendChild(h('span', null, 'COMPONENTS'));
      head.appendChild(title);
      var cnt = h('span', 'panel__count');
      cnt.textContent = String((cfg() && cfg().order ? cfg().order.length : 0));
      head.appendChild(cnt);
      var col = h('button', 'panel__collapse');
      col.setAttribute('type', 'button');
      col.innerHTML = '✕';
      col.title = '收起';
      col.addEventListener('click', function () { UI.toggleDrawer(null); });
      head.appendChild(col);
      panel.insertBefore(head, list);
    }

    list.innerHTML = '';
    var c = cfg();
    if (!c || !c.components || !c.order) {
      list.appendChild(h('div', 'c-foot', '配置未加载'));
      return;
    }

    for (var i = 0; i < c.order.length; i++) {
      (function (id, idx) {
        var comp = c.components[id];
        if (!comp) return;
        var n = h('button', 'c-item');
        n.setAttribute('type', 'button');
        n.setAttribute('data-id', id);
        n.appendChild(h('span', 'c-idx', pad2(idx + 1)));
        n.appendChild(h('span', 'c-icon', comp.icon || '▪'));
        var main = h('span', 'c-main');
        main.appendChild(h('span', 'c-name', comp.name || id));
        main.appendChild(h('span', 'c-sub', (comp.en || id).toUpperCase()));
        n.appendChild(main);
        var vc = comp.variants ? comp.variants.length : 0;
        n.appendChild(h('span', 'c-tag', '×' + vc));

        n.addEventListener('click', function () {
          /* 先本地切换再广播：避免 main 回传 select 后被误判为「再次点击」 */
          if (S.selected === id) {
            UI.setSelected(null);
            emit('select', { id: null, source: 'ui' });
          } else {
            UI.setSelected(id);
            emit('select', { id: id, source: 'ui' });
          }
        });
        n.addEventListener('mouseenter', function () {
          if (S.hover !== id) { S.hover = id; paintHover(); emit('hover', { id: id }); }
        });
        n.addEventListener('mouseleave', function () {
          if (S.hover === id) { S.hover = null; paintHover(); emit('hover', { id: null }); }
        });
        n.addEventListener('focus', function () { n.classList.add('is-focus'); });
        n.addEventListener('blur', function () { n.classList.remove('is-focus'); });
        list.appendChild(n);
      })(c.order[i], i);
    }

    var foot = h('div', 'c-foot');
    foot.innerHTML = '点击部件查看详情 · 数字键 <b>1–9</b> 快速选择<br/>鼠标左键拖动旋转，滚轮缩放';
    list.appendChild(foot);
  }

  function paintSelection() {
    var list = S.refs.list;
    if (!list) return;
    var items = list.querySelectorAll('.c-item');
    for (var i = 0; i < items.length; i++) {
      var n = items[i];
      var on = n.getAttribute('data-id') === S.selected;
      n.classList.toggle('is-selected', on);
      n.setAttribute('aria-current', on ? 'true' : 'false');
      if (on && n.scrollIntoView && list.scrollHeight > list.clientHeight) {
        try { n.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* 忽略 */ }
      }
    }
  }

  function paintHover() {
    var list = S.refs.list;
    if (!list) return;
    var items = list.querySelectorAll('.c-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('is-hover', items[i].getAttribute('data-id') === S.hover);
    }
  }

  /* ========================================================== 右侧详情 */
  function variantOf(id, idx) {
    var c = cfg();
    if (!c || !c.components || !c.components[id]) return null;
    var comp = c.components[id];
    if (!comp.variants || !comp.variants.length) return null;
    var i = (idx == null) ? (S.variant[id] || 0) : idx;
    i = clamp(i, 0, comp.variants.length - 1);
    return comp.variants[i];
  }

  function renderDetail() {
    var box = S.refs.detail;
    if (!box) return;
    var c = cfg();
    var id = S.selected;
    var comp = (c && c.components && id) ? c.components[id] : null;

    box.innerHTML = '';
    box.scrollTop = 0;

    if (!comp) {
      var empty = h('div', 'd-empty');
      empty.appendChild(h('div', 'd-empty__icon', '◇'));
      empty.appendChild(h('h3', null, '选择一个部件'));
      var p = h('p', null, '点击机箱内任意硬件，或用左侧清单 / 数字键 1–9，查看规格参数与型号。');
      empty.appendChild(p);
      var tip = h('div', 'd-none-tip');
      tip.innerHTML = '<span class="kbd">H</span>&nbsp; 查看全部快捷键';
      empty.appendChild(tip);
      box.appendChild(empty);
      return;
    }

    var v = variantOf(id, S.variant[id]) || {};
    var idx = (S.variant[id] || 0);
    var total = comp.variants ? comp.variants.length : 1;

    /* --- 头部 --- */
    var head = h('div', 'd-head');
    var top = h('div', 'd-head__top');
    top.appendChild(h('span', 'd-cat', comp.category || 'HARDWARE'));
    top.appendChild(h('span', 'd-idx', 'NO.' + pad2((comp.index == null ? 0 : comp.index) + 1)));
    head.appendChild(top);
    head.appendChild(h('div', 'd-name', comp.name || id));
    head.appendChild(h('div', 'd-en', (comp.en || id).toUpperCase()));

    if (v.model) head.appendChild(h('div', 'd-model', v.model));
    var meta = h('div', 'd-meta');
    if (v.price) meta.appendChild(h('span', 'd-price', v.price));
    if (v.brand) meta.appendChild(h('span', 'd-brand', v.brand));
    if (total > 1) meta.appendChild(h('span', 'd-varinfo', '型号 ' + (idx + 1) + ' / ' + total));
    head.appendChild(meta);
    box.appendChild(head);

    /* --- 主体 --- */
    var body = h('div', 'd-body');

    if (v.specs && v.specs.length) {
      var sec = h('div', 'd-sec');
      sec.appendChild(h('div', 'd-sec__t', 'SPECIFICATIONS · 规格参数'));
      var tb = h('div', 'd-spec');
      for (var i = 0; i < v.specs.length; i++) {
        var sp = v.specs[i];
        if (!sp) continue;
        var row = h('div', 'd-spec__row');
        row.appendChild(h('span', 'd-spec__k', sp.k == null ? '' : String(sp.k)));
        row.appendChild(h('span', 'd-spec__v', sp.v == null ? '—' : String(sp.v)));
        tb.appendChild(row);
      }
      sec.appendChild(tb);
      body.appendChild(sec);
    }

    if (v.highlights && v.highlights.length) {
      var sec2 = h('div', 'd-sec');
      sec2.appendChild(h('div', 'd-sec__t', 'HIGHLIGHTS · 核心亮点'));
      var hl = h('div', 'd-hl');
      for (var j = 0; j < v.highlights.length; j++) {
        hl.appendChild(h('span', 'd-chip', String(v.highlights[j])));
      }
      sec2.appendChild(hl);
      body.appendChild(sec2);
    }

    if (v.desc) {
      var sec3 = h('div', 'd-sec');
      sec3.appendChild(h('div', 'd-sec__t', 'OVERVIEW · 简介'));
      var d = h('p', 'd-desc');
      d.textContent = v.desc;
      sec3.appendChild(d);
      body.appendChild(sec3);
    }

    if (comp.role) {
      var role = h('div', 'd-role');
      role.textContent = comp.role;
      body.appendChild(role);
    }

    var kf = (c.config || c).keyFacts;
    var facts = kf && kf[id];
    if (facts && facts.length) {
      var sec4 = h('div', 'd-sec');
      sec4.appendChild(h('div', 'd-sec__t', 'KEY NOTES · 关注点'));
      var wrap = h('div', 'd-hl');
      for (var k = 0; k < facts.length; k++) wrap.appendChild(h('span', 'd-chip d-chip--alt', String(facts[k])));
      sec4.appendChild(wrap);
      body.appendChild(sec4);
    }

    box.appendChild(body);

    /* --- 底部动作 --- */
    var acts = h('div', 'd-actions');
    var focusBtn = h('button', 'btn btn--primary');
    focusBtn.setAttribute('type', 'button');
    focusBtn.innerHTML = '<span>◎</span><span>聚焦部件</span>';
    focusBtn.addEventListener('click', function () { emit('focus', { id: id }); });
    acts.appendChild(focusBtn);

    var clearBtn = h('button', 'btn');
    clearBtn.setAttribute('type', 'button');
    clearBtn.innerHTML = '<span>✕</span><span>取消选中</span>';
    clearBtn.addEventListener('click', function () {
      UI.setSelected(null);
      emit('select', { id: null, source: 'ui' });
    });
    acts.appendChild(clearBtn);
    box.appendChild(acts);
  }

  /* ========================================================== 型号 pills */
  function buildVariantBar(id) {
    var bar = S.refs.variantBar;
    if (!bar) return;
    var c = cfg();
    var comp = (c && c.components && id) ? c.components[id] : null;
    bar.innerHTML = '';
    if (!comp || !comp.variants || comp.variants.length < 1) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    bar.appendChild(h('span', 'vb-label', 'VARIANT'));

    var active = S.variant[id] || 0;
    for (var i = 0; i < comp.variants.length; i++) {
      (function (vi, vv) {
        var pill = h('button', 'pill');
        pill.setAttribute('type', 'button');
        pill.setAttribute('data-index', String(vi));
        pill.innerHTML = '<span>' + (vv.short || vv.model || ('型号 ' + (vi + 1))) + '</span>';
        if (vi === active) pill.classList.add('is-active');
        pill.addEventListener('click', function () {
          if ((S.variant[id] || 0) === vi) return;
          S.variant[id] = vi;
          paintPills(id);
          if (S.selected === id) renderDetail();
          emit('variant:change', { id: id, index: vi });
        });
        bar.appendChild(pill);
      })(i, comp.variants[i]);
    }
  }

  function paintPills(id) {
    var bar = S.refs.variantBar;
    if (!bar || bar.hidden) return;
    var active = S.variant[id] || 0;
    var pills = bar.querySelectorAll('.pill');
    for (var i = 0; i < pills.length; i++) {
      pills[i].classList.toggle('is-active', Number(pills[i].getAttribute('data-index')) === active);
    }
  }

  /* ============================================================ 拆解条 */
  function buildExplodeBar() {
    var box = q('explode-slider');
    if (!box) return;
    S.refs.explode = box;
    box.innerHTML = '';

    var lab = h('div', 'ex-label');
    lab.appendChild(h('b', null, '拆解程度'));
    lab.appendChild(h('span', null, 'EXPLODE'));
    box.appendChild(lab);

    var range = h('div', 'range');
    var input = doc.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = String(Math.round(S.explode * 100));
    input.setAttribute('aria-label', '拆解程度');
    range.appendChild(input);
    var ticks = h('div', 'range__ticks');
    for (var i = 0; i < 11; i++) ticks.appendChild(doc.createElement('i'));
    range.appendChild(ticks);
    box.appendChild(range);

    var val = h('div', 'ex-val', '0%');
    box.appendChild(val);

    var btns = h('div', 'ex-btns');
    var bAll = h('button', 'btn btn--primary');
    bAll.setAttribute('type', 'button');
    bAll.innerHTML = '<span>⇱</span><span class="ex-btn-txt">全部拆解</span>';
    bAll.title = '一键拆解 (E)';
    bAll.addEventListener('click', function () { emit('explode:toggle', {}); });
    btns.appendChild(bAll);

    var bReset = h('button', 'btn');
    bReset.setAttribute('type', 'button');
    bReset.innerHTML = '<span>⟲</span><span class="ex-btn-txt">复原</span>';
    bReset.title = '复原 (R)';
    bReset.addEventListener('click', function () { emit('reset', {}); });
    btns.appendChild(bReset);
    box.appendChild(btns);

    S.refs.range = input;
    S.refs.rangeWrap = range;
    S.refs.exVal = val;
    S.refs.exBtn = bAll;

    input.addEventListener('input', function () {
      var t = Number(input.value) / 100;
      UI.setExplode(t);
      emit('explode:set', { t: t });
    });
    input.addEventListener('change', function () {
      var t = Number(input.value) / 100;
      emit('explode:set', { t: t });
    });

    UI.setExplode(S.explode);
  }

  /* main.js 在拆解状态跨过阈值时调用（第 265 行）：只做「已拆解」态标记，
     不改变滑杆数值本身 —— 数值由 setExplode(t) 负责。 */
  UI.setExploded = function (flag) {
    var on = !!flag;
    if (S.exploded === on) return;
    S.exploded = on;
    var app = q('app');
    if (app) app.classList.toggle('is-exploded', on);
    if (S.refs.exVal) S.refs.exVal.classList.toggle('is-live', on);
  };
  UI.setExploded(false);

  UI.setExplode = function (t) {
    t = clamp(Number(t) || 0, 0, 1);
    S.explode = t;
    var pct = Math.round(t * 100);
    var input = S.refs.range;
    if (input && doc.activeElement !== input) input.value = String(pct);
    if (S.refs.rangeWrap) S.refs.rangeWrap.style.setProperty('--fill', pct + '%');
    if (S.refs.exVal) S.refs.exVal.textContent = pct + '%';
    if (S.refs.exBtn) {
      var txt = S.refs.exBtn.querySelector('.ex-btn-txt');
      if (txt) txt.textContent = t > 0.9 ? '收起拆解' : '全部拆解';
      S.refs.exBtn.classList.toggle('is-on', t > 0.9);
    }
  };

  /* ================================================================ HUD */
  function buildHud() {
    var box = q('hud');
    if (!box) return;
    S.refs.hud = box;
    box.innerHTML = '';
    var st = h('div', 'hud__item');
    st.appendChild(h('i', 'hud__dot'));
    st.appendChild(h('span', 'hud__k', 'LIVE'));
    box.appendChild(st);

    function item(key, label) {
      var it = h('div', 'hud__item');
      it.appendChild(h('span', 'hud__k', label));
      var v = h('span', 'hud__v', '—');
      v.setAttribute('data-hud', key);
      it.appendChild(v);
      box.appendChild(it);
      return v;
    }
    item('fps', 'FPS');
    item('calls', 'DRAW');
    item('tris', 'TRI');
  }

  UI.setStats = function (st) {
    if (!st) return;
    if (typeof st.fps === 'number') S.stats.fps = st.fps;
    if (typeof st.calls === 'number') S.stats.calls = st.calls;
    if (typeof st.tris === 'number') S.stats.tris = st.tris;
    var box = S.refs.hud;
    if (!box) return;
    var f = box.querySelector('[data-hud="fps"]');
    var c = box.querySelector('[data-hud="calls"]');
    var t = box.querySelector('[data-hud="tris"]');
    if (f) {
      f.textContent = Math.round(S.stats.fps);
      f.classList.toggle('is-warn', S.stats.fps > 0 && S.stats.fps < 30);
      f.classList.toggle('is-ok', S.stats.fps >= 55);
    }
    if (c) c.textContent = String(Math.round(S.stats.calls));
    if (t) {
      t.textContent = fmtK(S.stats.tris);
      t.classList.toggle('is-warn', S.stats.tris > 120000);
    }
  };

  /* ============================================================ 引导 tour */
  var TOUR_ICONS = { rotate: '⟳', zoom: '⊕', select: '◎', explode: '⇱', variant: '◈' };

  function tourData() {
    var c = cfg();
    if (c && c.tour && c.tour.length) return c.tour;
    return [
      { title: '旋转视角', text: '按住鼠标左键拖动，即可 360° 环绕观察整机。', key: 'rotate' },
      { title: '缩放与平移', text: '滚轮缩放、右键拖动平移。', key: 'zoom' },
      { title: '点选部件', text: '点击任意硬件查看详细参数。', key: 'select' },
      { title: '一键拆解', text: '按 E 或点击「全部拆解」。', key: 'explode' },
      { title: '切换型号', text: '底部型号胶囊可切换不同配件。', key: 'variant' }
    ];
  }

  function buildGuide() {
    var box = q('guide');
    if (!box) return;
    S.refs.guide = box;
    box.innerHTML = '';
    var card = h('div', 'guide__card');
    card.appendChild(h('div', 'guide__step', '<span class="guide__no">STEP 1 / 5</span><span class="guide__dots"></span>'));
    card.appendChild(h('div', 'guide__icon', '⟳'));
    card.appendChild(h('h3', null, ''));
    card.appendChild(h('p', null, ''));
    var foot = h('div', 'guide__foot');
    var skip = h('button', 'guide__skip');
    skip.setAttribute('type', 'button');
    skip.textContent = '跳过引导 · ESC';
    skip.addEventListener('click', function () { UI.stopTour(); });
    foot.appendChild(skip);
    var nav = h('div', 'guide__nav');
    var prev = h('button', 'btn');
    prev.setAttribute('type', 'button');
    prev.textContent = '上一步';
    prev.addEventListener('click', function () { gotoTour(S.tourStep - 1); });
    var next = h('button', 'btn btn--primary');
    next.setAttribute('type', 'button');
    next.textContent = '下一步';
    next.addEventListener('click', function () {
      var data = tourData();
      if (S.tourStep >= data.length - 1) UI.stopTour(true);
      else gotoTour(S.tourStep + 1);
    });
    nav.appendChild(prev);
    nav.appendChild(next);
    foot.appendChild(nav);
    card.appendChild(foot);
    box.appendChild(card);
    box.addEventListener('click', function (e) { if (e.target === box) UI.stopTour(); });
    S.refs.guideCard = card;
    S.refs.guidePrev = prev;
    S.refs.guideNext = next;
  }

  function gotoTour(i) {
    var data = tourData();
    i = clamp(i, 0, data.length - 1);
    S.tourStep = i;
    var d = data[i];
    var card = S.refs.guideCard;
    if (!card) return;
    var no = card.querySelector('.guide__no');
    if (no) no.textContent = 'STEP ' + (i + 1) + ' / ' + data.length;
    var icon = card.querySelector('.guide__icon');
    if (icon) icon.textContent = d.icon || TOUR_ICONS[d.key] || '◈';
    var t = card.querySelector('h3');
    if (t) t.textContent = d.title || '';
    var p = card.querySelector('p');
    if (p) p.innerHTML = highlightKeys(d.text || '');
    var dots = card.querySelector('.guide__dots');
    if (dots) {
      dots.innerHTML = '';
      for (var k = 0; k < data.length; k++) {
        var dot = doc.createElement('i');
        if (k === i) dot.className = 'is-on';
        dots.appendChild(dot);
      }
    }
    if (S.refs.guidePrev) S.refs.guidePrev.style.visibility = i === 0 ? 'hidden' : 'visible';
    if (S.refs.guideNext) S.refs.guideNext.textContent = (i >= data.length - 1) ? '开始探索' : '下一步';
    var box = S.refs.guide;
    if (box) {
      var r = card.getBoundingClientRect();
      box.style.pointerEvents = 'auto';
      void r;
    }
  }

  /* 引导文字里的按键高亮：把「左键 / E / 1-9」等包成 kbd */
  function highlightKeys(text) {
    var out = String(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    return out;
  }

  UI.startTour = function (manual) {
    var box = S.refs.guide;
    if (!box) return;
    S.tourOpen = true;
    box.hidden = false;
    gotoTour(0);
    if (manual) emit('tour:start', {});
    else emit('tour:start', { auto: true });
  };

  UI.stopTour = function (done) {
    var box = S.refs.guide;
    if (box) box.hidden = true;
    if (!S.tourOpen) return;
    S.tourOpen = false;
    try {
      if (done) window.localStorage.setItem('pc3d.tour.done', '1');
      else window.localStorage.setItem('pc3d.tour.done', '1');
    } catch (e) { /* file:// 下可能被禁用 */ }
    emit('tour:stop', { done: !!done });
    if (done) UI.toast('引导结束，开始探索吧', 'ok');
  };

  UI.tourNext = function () {
    var data = tourData();
    if (S.tourStep >= data.length - 1) UI.stopTour(true);
    else gotoTour(S.tourStep + 1);
  };
  UI.tourPrev = function () { gotoTour(S.tourStep - 1); };

  /* ============================================================== 帮助 */
  var HELP_KEYS = [
    ['R', '复原视角与拆解'],
    ['E', '一键拆解 / 收起'],
    ['空格', '自动旋转开关'],
    ['L', '3D 标注显隐'],
    ['B', '后期辉光开关'],
    ['G', '侧透玻璃显隐'],
    ['1 – 9', '按序号选中部件'],
    ['F', '聚焦当前选中部件'],
    ['T', '新手引导'],
    ['H', '打开 / 关闭帮助'],
    ['ESC', '关闭弹窗 / 取消选中'],
    ['拖拽', '左键旋转 · 右键平移']
  ];

  function buildHelp() {
    var box = q('help');
    if (!box) return;
    S.refs.help = box;
    box.innerHTML = '';
    var card = h('div', 'help__card');

    var head = h('div', 'hp-head');
    var tw = h('div');
    tw.appendChild(h('h3', null, '操作说明 · SHORTCUTS'));
    tw.appendChild(h('span', null, 'PC3D ASSEMBLY VIEWER'));
    head.appendChild(tw);
    var close = h('button', 'hp-close');
    close.setAttribute('type', 'button');
    close.innerHTML = '✕';
    close.title = '关闭 (ESC)';
    close.addEventListener('click', function () { UI.closeHelp(); });
    head.appendChild(close);
    card.appendChild(head);

    var body = h('div', 'hp-body');
    var grid = h('div', 'hp-grid');
    for (var i = 0; i < HELP_KEYS.length; i++) {
      var row = h('div', 'hp-row');
      var keys = h('div', 'hp-row__keys');
      var parts = HELP_KEYS[i][0].split(' ');
      for (var k = 0; k < parts.length; k++) {
        if (parts[k] === '–' || parts[k] === '·') {
          keys.appendChild(h('span', null, parts[k]));
          continue;
        }
        keys.appendChild(h('span', 'kbd', parts[k]));
      }
      row.appendChild(keys);
      var desc = h('span');
      desc.textContent = HELP_KEYS[i][1];
      row.appendChild(desc);
      grid.appendChild(row);
    }
    body.appendChild(grid);

    body.appendChild(h('div', 'hp-sec', '鼠标操作'));
    var ul = h('ul', 'hp-list');
    var mouseTips = [
      '左键拖动：环绕整机旋转视角',
      '滚轮：推近 / 拉远，观察散热鳍片与走线细节',
      '右键拖动：平移观察中心',
      '点击部件：发光描边 + 右侧详情；再次点击空白处取消',
      '切换型号：底部胶囊，几何体会实时重建'
    ];
    for (var m = 0; m < mouseTips.length; m++) ul.appendChild(h('li', null, mouseTips[m]));
    body.appendChild(ul);

    body.appendChild(h('div', 'hp-sec', '性能与显示'));
    var ul2 = h('ul', 'hp-list');
    var perfTips = [
      '左下角 HUD 实时显示 FPS / DrawCalls / 三角面数（整机预算 &lt; 120k）',
      '辉光与标注可在顶部工具栏开关，低配设备可关闭辉光',
      '所有纹理均为 canvas 程序化生成，完全离线可用'
    ];
    for (var n = 0; n < perfTips.length; n++) ul2.appendChild(h('li', null, perfTips[n]));
    body.appendChild(ul2);
    card.appendChild(body);

    var foot = h('div', 'hp-foot');
    foot.appendChild(h('small', null, 'THREE.JS r147 · WEBGL2'));
    var ok = h('button', 'btn btn--primary');
    ok.setAttribute('type', 'button');
    ok.textContent = '知道了';
    ok.addEventListener('click', function () { UI.closeHelp(); });
    foot.appendChild(ok);
    card.appendChild(foot);
    box.appendChild(card);

    box.addEventListener('click', function (e) { if (e.target === box) UI.closeHelp(); });
  }

  UI.openHelp = function () {
    var box = S.refs.help;
    if (!box) return;
    S.helpOpen = true;
    box.hidden = false;
    if (S.tourOpen) UI.stopTour();
  };
  UI.closeHelp = function () {
    var box = S.refs.help;
    if (!box) return;
    S.helpOpen = false;
    box.hidden = true;
  };
  UI.toggleHelp = function () { if (S.helpOpen) UI.closeHelp(); else UI.openHelp(); };

  /* ============================================================== 抽屉 */
  UI.toggleDrawer = function (side) {
    var app = q('app');
    if (!app) return;
    if (side !== 'left' && side !== 'right') side = null;
    if (S.drawer === side) side = null;
    S.drawer = side;
    app.classList.toggle('is-drawer-left', side === 'left');
    app.classList.toggle('is-drawer-right', side === 'right');
    var scrim = S.refs.scrim;
    if (scrim) scrim.hidden = !side;
  };

  function buildScrim() {
    var app = q('app');
    if (!app) return;
    var scrim = h('div', 'scrim');
    scrim.hidden = true;
    scrim.addEventListener('click', function () { UI.toggleDrawer(null); });
    app.appendChild(scrim);
    S.refs.scrim = scrim;
  }

  /* ============================================================ 对外 API */
  UI.setSelected = function (id) {
    var c = cfg();
    if (id && (!c || !c.components || !c.components[id])) id = null;
    S.selected = id || null;
    paintSelection();
    renderDetail();
    buildVariantBar(S.selected);
    if (S.selected) {
      var comp = c.components[S.selected];
      var th = c.theme || {};
      var base = toRgb(th.accent == null ? 0x38e8ff : th.accent);
      var col = comp && comp.color != null ? usableAccent(toRgb(comp.color), base) : base;
      UI.setAccent(col, th.accent2 == null ? 0xa45bff : th.accent2);
    } else {
      UI.setAccent(c && c.theme ? c.theme.accent : 0x38e8ff, c && c.theme ? c.theme.accent2 : 0xa45bff);
    }
    return S.selected;
  };

  UI.setHover = function (id) {
    S.hover = id || null;
    paintHover();
  };

  UI.setVariant = function (id, index) {
    if (!id) return;
    S.variant[id] = Math.max(0, Number(index) || 0);
    if (S.selected === id) {
      paintPills(id);
      renderDetail();
      buildVariantBar(id);
    }
  };

  UI.getState = function () {
    return {
      selected: S.selected,
      explode: S.explode,
      toggle: S.toggle,
      variant: S.variant
    };
  };

  /* ============================================================ 键盘 */
  function onKey(e) {
    var t = e.target;
    var tag = (t && t.tagName ? t.tagName : '').toLowerCase();
    // 文本输入框/下拉框吞掉全部快捷键；range 滑杆只吞方向键，其余快捷键照常响应
    var isRange = tag === 'input' && (t.type || '').toLowerCase() === 'range';
    if ((tag === 'input' && !isRange) || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
    if (isRange && /^Arrow/.test(e.key)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    var k = e.key;

    if (k === 'Escape') {
      if (S.helpOpen) { UI.closeHelp(); e.preventDefault(); return; }
      if (S.tourOpen) { UI.stopTour(); e.preventDefault(); return; }
      if (S.drawer) { UI.toggleDrawer(null); e.preventDefault(); return; }
      if (S.selected) { UI.setSelected(null); emit('select', { id: null, source: 'ui' }); e.preventDefault(); }
      return;
    }

    if (S.helpOpen || S.tourOpen) {
      if (k === 'ArrowRight') { if (S.tourOpen) UI.tourNext(); e.preventDefault(); return; }
      if (k === 'ArrowLeft') { if (S.tourOpen) UI.tourPrev(); e.preventDefault(); return; }
      return;
    }

    var lower = (k || '').toLowerCase();

    /* main.js 自己也绑定了 R / E / 空格 / L / F / 1-9（见 main.js 第 ~415 行）。
       两边同时处理会互相抵消（例如 E 会被翻两次等于没翻），因此 main 就绪后
       UI 侧对这些键一律让行；main 会通过 setExplode / setSelected / toggle:sync
       回灌 UI 状态，视觉与状态都保持一致。 */
    var mainOwns = !!(PC3D.app && PC3D.app.renderer);
    if (mainOwns && (lower === 'r' || lower === 'e' || lower === 'l' || lower === 'f' ||
                     k === ' ' || k === 'Spacebar' || (k >= '1' && k <= '9'))) {
      return;
    }

    if (lower === 'r') { emit('reset', {}); UI.toast('已复原视角与拆解', 'ok'); e.preventDefault(); return; }
    if (lower === 'e') { emit('explode:toggle', {}); e.preventDefault(); return; }
    if (k === ' ' || k === 'Spacebar') {
      setToggle('autoRotate', !S.toggle.autoRotate, true);
      UI.toast(S.toggle.autoRotate ? '自动旋转：开' : '自动旋转：关');
      e.preventDefault();
      return;
    }
    if (lower === 'l') { setToggle('labels', !S.toggle.labels, true); e.preventDefault(); return; }
    if (lower === 'b') { setToggle('bloom', !S.toggle.bloom, true); e.preventDefault(); return; }
    if (lower === 'g') { setToggle('glass', !S.toggle.glass, true); e.preventDefault(); return; }
    if (lower === 'h' || lower === '?') { UI.toggleHelp(); e.preventDefault(); return; }
    if (lower === 't') { UI.startTour(true); e.preventDefault(); return; }
    if (lower === 'f') {
      if (S.selected) emit('focus', { id: S.selected });
      e.preventDefault();
      return;
    }
    if (k >= '1' && k <= '9') {
      var c = cfg();
      if (!c || !c.order) return;
      var idx = Number(k) - 1;
      if (idx < c.order.length) {
        var id = c.order[idx];
        UI.setSelected(id);
        emit('select', { id: id, source: 'ui' });
        e.preventDefault();
      }
    }
  }

  /* ============================================================ 事件绑定 */
  function bindBus() {
    var b = bus();
    if (!b || b.__uiBound) return;
    b.__uiBound = true;

    b.on('select', function (p) {
      if (!p) return;
      if (p.id === S.selected) {
        if (p.id) renderDetail();
        return;
      }
      UI.setSelected(p.id || null);
    });

    b.on('hover', function (p) {
      var id = p ? p.id : null;
      if (id === S.hover) return;
      S.hover = id || null;
      paintHover();
    });

    b.on('toggle:sync', function (p) {
      if (p && p.key) UI.syncToggle(p.key, p.value);
    });

    b.on('stats', function (p) { UI.setStats(p); });

    b.on('toast', function (p) {
      if (p && p.text) UI.toast(p.text, p.kind);
      else if (typeof p === 'string') UI.toast(p);
    });

    b.on('explode:set', function (p) {
      if (p && typeof p.t === 'number') UI.setExplode(p.t);
    });

    b.on('variant:change', function (p) {
      if (p && p.id != null) UI.setVariant(p.id, p.index);
    });

    b.on('reset', function () {
      UI.setExplode(0);
      UI.setSelected(null);
    });
  }

  /* ================================================================ init */
  UI.init = function () {
    if (S.inited) return;
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', UI.init);
      return;
    }
    S.inited = true;
    S.cfg = cfg();
    S.refs.variantBar = q('variant-bar');
    S.refs.toast = q('toast');

    buildToolbar();
    buildLeftPanel();
    buildRightPanel();
    buildVariantBar(null);
    buildExplodeBar();
    buildHud();
    buildScrim();
    buildGuide();
    buildHelp();

    bindBus();

    var c = cfg();
    var th = (c && c.theme) || {};
    UI.setAccent(th.accent == null ? 0x38e8ff : th.accent, th.accent2 == null ? 0xa45bff : th.accent2);
    UI.setExplode(0);
    /* 不在 init 里塞 0 值：main 每 0.5s 才 emit 一次 stats，
       首屏显示占位符「—」比显示 0 FPS 更可信。 */

    /* 初始开关外观：能以 main 的真实状态为准（main.js:22 默认
       autoRotate/labels/bloom/glass 全为 true），否则开关会与场景不同步，
       表现为「按空格没反应」。main 尚未就绪时才回落到 UI 自身默认值。 */
    var mainEnabled = (PC3D.app && PC3D.app.enabled) || null;
    var keys = ['autoRotate', 'labels', 'bloom', 'glass', 'sound'];
    for (var ki = 0; ki < keys.length; ki++) {
      var kk = keys[ki];
      var val = (mainEnabled && typeof mainEnabled[kk] === 'boolean') ? mainEnabled[kk] : S.toggle[kk];
      S.toggle[kk] = !!val;
      paintToggle(kk, !!val);
    }

    doc.addEventListener('keydown', onKey);

    /* 首次进入：自动播放引导（?notour=1 或 localStorage 已看则跳过） */
    var skipTour = false;
    try { skipTour = /[?&]notour=1/.test(location.search); } catch (e2) { skipTour = false; }
    try { if (!skipTour && window.localStorage.getItem('pc3d.tour.done') === '1') skipTour = true; } catch (e3) { /* ignore */ }
    if (!skipTour) {
      setTimeout(function () {
        if (!S.inited || S.tourOpen || S.helpOpen) return;
        UI.startTour(false);
      }, 2600);
    }

    emit('ui:ready', { ui: UI });
  };

  function buildRightPanel() {
    var panel = q('panel-right');
    var detail = q('detail');
    if (!panel || !detail) return;
    S.refs.panelRight = panel;
    S.refs.detail = detail;

    if (!panel.querySelector('.panel__head')) {
      var head = h('div', 'panel__head');
      var title = h('div', 'panel__title');
      title.appendChild(h('h2', null, '部件详情'));
      title.appendChild(h('span', null, 'INSPECTOR'));
      head.appendChild(title);
      var col = h('button', 'panel__collapse');
      col.setAttribute('type', 'button');
      col.innerHTML = '✕';
      col.title = '收起';
      col.addEventListener('click', function () { UI.toggleDrawer(null); });
      head.appendChild(col);
      panel.insertBefore(head, detail);
    }

    renderDetail();
  }

  /* 自动初始化：<body> 末尾的脚本执行时容器已存在，立即初始化，
     让随后加载的 main.js 可以直接调用 PC3D.ui.*；否则等 DOMContentLoaded。
     init() 幂等，main.js 再调一次也安全。 */
  if (q('app') && q('toolbar')) {
    UI.init();
  } else if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', function () { UI.init(); });
  } else {
    UI.init();
  }

  /* 注：不挂任何调试全局（CONTRACT §1「严格不得新增全局」）。
     需要调试时从 PC3D.ui 取，PC3D 是契约规定的唯一命名空间。 */
})();
