/* ============================================================
 * labels.js — 3D 标注（CSS/DOM 层，teammate C）
 * 依赖：THREE r147(UMD)、util.js、config.js(可选)
 * 暴露：PC3D.labels.{ init, register, unregister, clear, setEnabled,
 *                     setOpacity, setSelected, setHover, update, render, resize, info }
 * 说明：
 *  - 容器由 main 传入（#labels-layer，position:absolute / pointer-events:none），不自行创建；
 *    容器缺失时降级为 no-op 并 console.warn（不抛错）。
 *  - 所有样式内联生成，不写 css 文件、不引入外部字体/图片。
 *  - 自己算投影 / 遮挡 / 屏幕避让 / 平滑跟随；每帧只写 transform+opacity，
 *    重样式（边框、发光、背景）仅在选中/悬停状态变化时写一次。
 * ========================================================== */
(function () {
  'use strict';
  var PC3D = (window.PC3D = window.PC3D || {});
  var T = THREE;
  var L = (PC3D.labels = {});
  var U = PC3D.util || {};

  var DEFAULT_ACCENT = '#38e8ff';

  var st = {
    inited: false, ready: false,
    camera: null, container: null, scene: null,
    root: null, svg: null,
    items: Object.create(null),
    order: [],
    enabled: true,
    opacity: 0,
    selected: null,
    hover: null,
    t: 0,
    rayTick: 0,
    rayInterval: 0.16,
    rayCursor: 0,
    rayPerTick: 4,
    ray: null,
    targets: [],
    w: 0, h: 0
  };

  /* ---------------- 局部工具 ---------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mk(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function nsTag(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }

  function cssColor(c) {
    if (c === undefined || c === null || c === '') return DEFAULT_ACCENT;
    if (typeof c === 'number') return '#' + ('000000' + c.toString(16)).slice(-6);
    var s = String(c);
    return s.charAt(0) === '#' ? s : '#' + s;
  }
  function rgbOf(hex) {
    var v = parseInt(String(hex).replace('#', ''), 16);
    if (isNaN(v)) v = 0x38e8ff;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  function rgba(hex, a) { var c = rgbOf(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  /* ============================================================
   * 层构建
   * ========================================================== */
  function buildLayers() {
    var host = st.container;
    if (!host) {
      console.warn('[labels] 未找到 #labels-layer 容器，标注降级为空操作');
      return false;
    }
    host.style.overflow = 'hidden';

    var svg = nsTag('svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;';
    host.appendChild(svg);
    st.svg = svg;

    var root = mk('div');
    root.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';
    host.appendChild(root);
    st.root = root;
    return true;
  }

  function basePillStyle(el) {
    el.style.cssText =
      'position:absolute;left:0;top:0;will-change:transform,opacity;' +
      'transform-origin:0% 50%;padding:7px 11px 8px 11px;border-radius:9px;' +
      'border:1px solid rgba(120,170,210,0.30);color:#dfe9f5;white-space:nowrap;' +
      'pointer-events:none;opacity:0;box-sizing:border-box;' +
      'transition:border-color .22s ease,box-shadow .22s ease;' +
      'font-family:"Segoe UI","PingFang SC","Microsoft YaHei",system-ui,sans-serif;';
  }

  function paintPill(it, mode) {
    var el = it.el, ac = it.acHex;
    if (mode === 'sel') {
      el.style.background = 'linear-gradient(160deg, rgba(14,34,46,0.96), rgba(6,16,24,0.92))';
      el.style.borderColor = rgba(ac, 0.95);
      el.style.boxShadow = '0 8px 28px rgba(0,0,0,0.60), 0 0 22px ' + rgba(ac, 0.55) +
        ', inset 0 1px 0 rgba(255,255,255,0.12)';
      it.t1.style.color = '#ffffff';
      it.t2.style.color = rgba(ac, 0.95);
    } else if (mode === 'hover') {
      el.style.background = 'linear-gradient(160deg, rgba(13,24,36,0.94), rgba(6,12,20,0.90))';
      el.style.borderColor = rgba(ac, 0.62);
      el.style.boxShadow = '0 7px 24px rgba(0,0,0,0.55), 0 0 14px ' + rgba(ac, 0.30) +
        ', inset 0 1px 0 rgba(255,255,255,0.08)';
      it.t1.style.color = '#ffffff';
      it.t2.style.color = '#a9cbe0';
    } else {
      el.style.background = 'linear-gradient(160deg, rgba(12,20,30,0.90), rgba(6,10,16,0.86))';
      el.style.borderColor = 'rgba(120,170,210,0.30)';
      el.style.boxShadow = '0 6px 22px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)';
      it.t1.style.color = '#eaf4ff';
      it.t2.style.color = '#8fb0c8';
    }
    it._mode = mode;
  }

  function createItem(id, entry) {
    var acHex = cssColor(entry.color !== undefined ? entry.color : DEFAULT_ACCENT);

    var el = mk('div', 'pcl-pill');
    basePillStyle(el);

    var t1 = mk('div');
    t1.style.cssText = 'font-size:12.5px;font-weight:600;line-height:1.28;letter-spacing:0.02em;';
    t1.textContent = entry.title || id;

    var t2 = mk('div');
    t2.style.cssText = 'font-size:10.5px;font-weight:500;line-height:1.35;margin-top:2px;letter-spacing:0.03em;color:#8fb0c8;';
    t2.textContent = entry.sub || '';

    el.appendChild(t1);
    if (entry.sub) el.appendChild(t2);
    st.root.appendChild(el);

    var halo = nsTag('circle');
    halo.setAttribute('r', '7');
    halo.setAttribute('fill', 'none');
    halo.setAttribute('stroke', acHex);
    halo.setAttribute('stroke-width', '1');
    halo.setAttribute('opacity', '0');
    st.svg.appendChild(halo);

    var dot = nsTag('circle');
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', acHex);
    dot.setAttribute('opacity', '0');
    st.svg.appendChild(dot);

    var line = nsTag('polyline');
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'rgba(150,195,225,0.50)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('opacity', '0');
    st.svg.appendChild(line);

    var it = {
      id: id,
      anchor: entry.anchor || null,
      target: entry.target || null,
      color: entry.color,
      acHex: acHex,
      title: entry.title || id,
      sub: entry.sub || '',
      el: el, t1: t1, t2: t2, dot: dot, halo: halo, line: line,
      sx: null, sy: null, ax: 0, ay: 0, ex: 0, ey: 0,
      px: 0, py: 0, pw: 118, ph: 36,
      a: 0, targetAlpha: 0,
      occluded: false, dist: 99, side: 1,
      sizeTick: 0, _mode: null, _z: -1
    };
    paintPill(it, 'idle');
    return it;
  }

  /* ============================================================
   * 锚点解析
   *  main 传入：{ anchor: 部件局部 Vector3, target: 部件 Group }
   *  => 优先用 target.matrixWorld 变换 anchor（随拆解位移/变体重建自动跟随）
   *  也兼容：anchor(Object3D) / anchor(Vector3=世界坐标) / anchor(()=>Vector3)
   * ========================================================== */
  var _v = new T.Vector3();
  function resolveAnchor(it, out) {
    var tg = it.target, an = it.anchor;

    if (tg && tg.isObject3D) {
      if (an && an.isVector3) { out.copy(an).applyMatrix4(tg.matrixWorld); return true; }
      if (an && typeof an === 'function') {
        var v = an();
        if (!v) return false;
        out.set(v.x, v.y, v.z).applyMatrix4(tg.matrixWorld);
        return true;
      }
      out.setFromMatrixPosition(tg.matrixWorld);
      return true;
    }
    if (typeof an === 'function') {
      var v2 = an();
      if (!v2) return false;
      out.set(v2.x, v2.y, v2.z);
      return true;
    }
    if (an && an.isObject3D) {
      var la = an.userData && an.userData.anchor;
      if (la && la.isVector3) { out.copy(la).applyMatrix4(an.matrixWorld); return true; }
      out.setFromMatrixPosition(an.matrixWorld);
      return true;
    }
    if (an && an.isVector3) { out.copy(an); return true; }
    if (an && typeof an.x === 'number') { out.set(an.x, an.y, an.z); return true; }
    return false;
  }

  /* ============================================================
   * 遮挡体收集（跳过透明件如侧透玻璃、跳过 stage 装饰）
   * ========================================================== */
  function isTransparent(obj) {
    var m = obj.material;
    if (!m) return false;
    var arr = Array.isArray(m) ? m : [m];
    for (var i = 0; i < arr.length; i++) {
      var mm = arr[i];
      if (!mm) return false;
      if (mm.transparent && (mm.opacity !== undefined ? mm.opacity : 1) < 0.65) return true;
      if (mm.alphaTest > 0.2) return false;
    }
    return false;
  }

  /* 向上找 partId：部件实现可能只把 partId 打在 group 上（main.js:140），
     子网格未必带；两种写法都要能当遮挡体。 */
  function partIdOf(o) {
    var n = o, guard = 0;
    while (n && guard++ < 24) {
      var ud = n.userData;
      if (ud) {
        if (ud.noPick) return null;
        if (ud.partId) return ud.partId;
      }
      n = n.parent;
    }
    return null;
  }

  /* 容器外壳默认不参与遮挡判定：机箱框架细条/立柱会成片遮住内部部件的标签，
     而内部件本就是透过侧透玻璃可见的。需要严格模式时用 L.setOccluderIgnore([])。 */
  var IGNORE_PARTS = ['case'];

  function refreshOccluders() {
    st.targets.length = 0;
    if (!st.scene) return;
    var ignore = st.ignoreParts || IGNORE_PARTS;
    st.scene.traverse(function (o) {
      if (!o.isMesh || !o.visible) return;
      var pid = partIdOf(o);
      if (!pid) return;
      if (ignore.length && ignore.indexOf(pid) >= 0) return;
      if (isTransparent(o)) return;
      st.targets.push(o);
    });
  }

  var _rayDir = new T.Vector3();
  function testOccluded(worldPos, selfId) {
    var ray = st.ray, cam = st.camera;
    if (!ray || !cam) return false;
    _rayDir.copy(worldPos).sub(cam.position);
    var d = _rayDir.length();
    if (d < 1e-4) return false;
    _rayDir.multiplyScalar(1 / d);
    ray.set(cam.position, _rayDir);
    ray.near = 0.02;
    ray.far = Math.max(0.03, d - 0.045);
    var hits = ray.intersectObjects(st.targets, false);
    /* 只有"明显在前"的遮挡才算数：紧贴锚点的相邻件（散热器贴主板、风扇贴面板）
       擦边命中不作数，否则标签会因为几何相切而闪没。 */
    var gap = Math.max(0.05, d * 0.10);
    for (var i = 0; i < hits.length; i++) {
      var h = hits[i];
      var o = h.object;
      if (!o || !o.visible) continue;
      var pid = partIdOf(o);
      if (!pid) continue;
      if (pid === selfId) continue;
      if (h.distance > d - gap) continue;
      return true;
    }
    return false;
  }

  /* ============================================================
   * 公共 API
   * ========================================================== */
  L.init = function (opts) {
    opts = opts || {};
    st.camera = opts.camera || st.camera;
    st.scene = opts.scene || st.scene;
    if (opts.container && opts.container !== st.container) {
      st.container = opts.container;
      if (st.inited) { st.root = null; st.svg = null; }
    } else if (!st.container) {
      st.container = opts.container || null;
    }

    if (!st.inited) {
      st.ray = new T.Raycaster();
      var theme = (PC3D.config && PC3D.config.theme) || {};
      if (theme.accent !== undefined) DEFAULT_ACCENT = cssColor(theme.accent);
      st.inited = true;

      if (PC3D.bus) {
        PC3D.bus.on('select', function (p) { if (p) L.setSelected(p.id); });
        PC3D.bus.on('selected', function (p) { if (p) L.setSelected(p.id); });
        PC3D.bus.on('hover', function (p) { L.setHover(p ? p.id : null); });
        PC3D.bus.on('rebuilt', function () { refreshOccluders(); });
        PC3D.bus.on('toggle', function (p) {
          if (p && p.key === 'labels') L.setEnabled(!!p.value);
        });
      }
    }

    if (!st.ready) {
      st.ready = buildLayers();
      if (!st.ready) return L;
      st.w = st.container.clientWidth || window.innerWidth;
      st.h = st.container.clientHeight || window.innerHeight;
    }

    /* 处理 init 之前 register 的 pending 项 */
    var pend = [];
    for (var k in st.items) if (st.items[k] && st.items[k].pending) pend.push(st.items[k]);
    for (var i = 0; i < pend.length; i++) {
      delete st.items[pend[i].id];
      L.register(pend[i].id, pend[i]);
    }
    refreshOccluders();
    return L;
  };

  /** register(id, {anchor, target, title, sub, color}) —— 重复注册同一 id 视为更新 */
  L.register = function (id, entry) {
    if (!id) return null;
    entry = entry || {};

    if (!st.inited || !st.ready) {
      var p = st.items[id];
      if (p && p.pending) {
        p.anchor = entry.anchor !== undefined ? entry.anchor : p.anchor;
        p.target = entry.target !== undefined ? entry.target : p.target;
        p.title = entry.title !== undefined ? entry.title : p.title;
        p.sub = entry.sub !== undefined ? entry.sub : p.sub;
        p.color = entry.color !== undefined ? entry.color : p.color;
        return p;
      }
      st.items[id] = {
        id: id, pending: true,
        anchor: entry.anchor || null, target: entry.target || null,
        title: entry.title || id, sub: entry.sub || '', color: entry.color
      };
      return st.items[id];
    }

    var old = st.items[id];
    if (old && !old.pending) {
      /* ---- 更新（变体重建后复用 DOM，不泄漏） ---- */
      if (entry.anchor !== undefined) old.anchor = entry.anchor;
      if (entry.target !== undefined) old.target = entry.target;
      if (entry.title !== undefined && entry.title !== old.title) {
        old.title = entry.title; old.t1.textContent = entry.title;
      }
      if (entry.sub !== undefined && entry.sub !== old.sub) {
        old.sub = entry.sub;
        old.t2.textContent = entry.sub;
        if (entry.sub) { if (!old.t2.parentNode) old.el.appendChild(old.t2); }
        else if (old.t2.parentNode) old.el.removeChild(old.t2);
      }
      if (entry.color !== undefined) {
        old.color = entry.color;
        old.acHex = cssColor(entry.color);
        old.dot.setAttribute('fill', old.acHex);
        old.halo.setAttribute('stroke', old.acHex);
        old._mode = null;
        paintPill(old, st.selected === id ? 'sel' : (st.hover === id ? 'hover' : 'idle'));
      }
      old.sx = null; old.sy = null;
      old.occluded = false;
      old.pw = 0; old.ph = 0;
      refreshOccluders();
      return old;
    }

    var it = createItem(id, entry);
    st.items[id] = it;
    st.order.push(id);
    refreshOccluders();
    return it;
  };

  L.unregister = function (id) {
    var it = st.items[id];
    if (!it) return;
    if (!it.pending) {
      if (it.el && it.el.parentNode) it.el.parentNode.removeChild(it.el);
      var nodes = [it.dot, it.halo, it.line];
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i] && nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
      }
    }
    delete st.items[id];
    var i2 = st.order.indexOf(id);
    if (i2 >= 0) st.order.splice(i2, 1);
  };

  L.clear = function () {
    var ids = st.order.slice();
    for (var i = 0; i < ids.length; i++) L.unregister(ids[i]);
  };

  L.setEnabled = function (v) {
    st.enabled = !!v;
    if (st.root) st.root.style.display = st.enabled ? '' : 'none';
    if (st.svg) st.svg.style.display = st.enabled ? '' : 'none';
    if (!st.enabled) {
      for (var i = 0; i < st.order.length; i++) {
        var it = st.items[st.order[i]];
        if (!it || it.pending) continue;
        it.a = 0; it.targetAlpha = 0;
        it.el.style.opacity = '0';
        it.dot.setAttribute('opacity', '0');
        it.halo.setAttribute('opacity', '0');
        it.line.setAttribute('opacity', '0');
      }
    }
    return st.enabled;
  };

  /** 整体渐显（拆解度驱动）：0 = 全隐，1 = 全显 */
  L.setOpacity = function (v) {
    st.opacity = clamp(v === undefined ? 1 : Number(v) || 0, 0, 1);
    return st.opacity;
  };

  /** 设置不参与遮挡判定的部件 id 列表（默认 ['case']：容器外壳不遮挡内部标签） */
  L.setOccluderIgnore = function (ids) {
    st.ignoreParts = Array.isArray(ids) ? ids.slice() : null;
    refreshOccluders();
    return st.ignoreParts || IGNORE_PARTS.slice();
  };

  /** 当前整体不透明度（工具链/Lead 巡检用） */
  L.getOpacity = function () { return st.opacity; };

  L.setSelected = function (id) {
    st.selected = (id === undefined || id === null || id === '') ? null : id;
    return st.selected;
  };

  L.setHover = function (id) {
    st.hover = (id === undefined || id === null || id === '') ? null : id;
    return st.hover;
  };

  L.resize = function (w, h) {
    if (w) st.w = w;
    if (h) st.h = h;
    for (var i = 0; i < st.order.length; i++) {
      var it = st.items[st.order[i]];
      if (it && !it.pending) { it.pw = 0; it.ph = 0; it.sizeTick = 0; }
    }
  };

  /* ============================================================
   * 每帧更新
   * ========================================================== */
  var _world = new T.Vector3();
  var _ndc = new T.Vector3();

  L.update = function (dt) {
    if (!st.inited || !st.ready || !st.camera) return;
    dt = clamp(Number(dt) || 1 / 60, 0, 0.1);
    st.t += dt;

    var cam = st.camera;
    var w = st.w || (st.container && st.container.clientWidth) || window.innerWidth;
    var h = st.h || (st.container && st.container.clientHeight) || window.innerHeight;
    st.w = w; st.h = h;

    var kFollow = 1 - Math.exp(-dt * 13);
    var kFadeIn = 1 - Math.exp(-dt * 8);
    var kFadeOut = 1 - Math.exp(-dt * 12);

    cam.updateMatrixWorld();

    /* 遮挡检测：轮转节流（每 tick 只测若干条，避免 SwiftShader 下卡顿） */
    st.rayTick -= dt;
    var doRay = st.rayTick <= 0;
    if (doRay) {
      st.rayTick = st.rayInterval;
      if (st.rayCursor >= st.order.length) st.rayCursor = 0;
    }

    var active = [];
    var i, it;

    for (i = 0; i < st.order.length; i++) {
      it = st.items[st.order[i]];
      if (!it || it.pending) continue;

      if (!resolveAnchor(it, _world)) { it.targetAlpha = 0; continue; }

      it.dist = _world.distanceTo(cam.position);
      _ndc.copy(_world).project(cam);

      var inFront = _ndc.z > -1 && _ndc.z < 1;
      var onScreen = inFront && Math.abs(_ndc.x) < 1.32 && Math.abs(_ndc.y) < 1.32;
      var inRange = it.dist > 0.9 && it.dist < 17.0;

      if (!inRange || !onScreen) it.occluded = false;

      var sx = (_ndc.x * 0.5 + 0.5) * w;
      var sy = (-_ndc.y * 0.5 + 0.5) * h;
      if (it.sx === null || it.sx === undefined) { it.sx = sx; it.sy = sy; }
      it.sx = lerp(it.sx, sx, kFollow);
      it.sy = lerp(it.sy, sy, kFollow);
      it.ax = it.sx; it.ay = it.sy;

      /* 这里只表达"该不该出现"（0/1）；整体渐显由 st.opacity 在写 DOM 时乘一次。
         若这里也乘 st.opacity，最终透明度会变成 opacity²（拆解度 0.12 时只剩 0.0144）。 */
      var visible = st.enabled && onScreen && inRange && !it.occluded;
      it.targetAlpha = visible ? 1 : 0;

      /* 参与避让：正在显示或即将显示（alpha>0.02）的条目 */
      if (it.targetAlpha > 0.02 || it.a > 0.02) active.push(it);
    }

    /* 遮挡轮转测试 */
    if (doRay && st.targets.length) {
      var checked = 0;
      for (var n = 0; n < st.order.length && checked < st.rayPerTick; n++) {
        var idx = (st.rayCursor + n) % st.order.length;
        var cand = st.items[st.order[idx]];
        if (!cand || cand.pending) continue;
        if (cand.dist <= 0.9 || cand.dist >= 17.0) continue;
        if (!resolveAnchor(cand, _world)) continue;
        _ndc.copy(_world).project(cam);
        if (!(_ndc.z > -1 && _ndc.z < 1)) continue;
        if (Math.abs(_ndc.x) > 1.32 || Math.abs(_ndc.y) > 1.32) continue;
        cand.occluded = testOccluded(_world, cand.id);
        if (cand.occluded) cand.targetAlpha = 0;
        checked++;
      }
      st.rayCursor = (st.rayCursor + st.rayPerTick) % Math.max(1, st.order.length);
    }

    st.occludedCount = 0;
    for (i = 0; i < st.order.length; i++) {
      var oc = st.items[st.order[i]];
      if (oc && !oc.pending && oc.occluded) st.occludedCount++;
    }

    /* 选中优先、近者优先参与避让排序 */
    active.sort(function (a, b) {
      if ((st.selected === a.id) !== (st.selected === b.id)) return st.selected === a.id ? -1 : 1;
      return a.dist - b.dist;
    });

    var GAP = 5;
    /* 屏幕空间避让（确定性，保证收敛）：
       1) 先按锚点算首选位置与左右列；
       2) 按首选 Y 升序逐条"向下推"，只避让横向相交的已放置项（单向移动 ⇒ 必然终止）；
       3) 整组越界时整体回移，相对位置不变 ⇒ 不会重新产生重叠。
       旧实现会在边界夹紧后反复命中同一项 48 次后放弃，导致标签实际重叠。 */
    var cand = [];
    for (var k = 0; k < active.length; k++) {
      var cur = active[k];

      /* 尺寸缓存（0.5s 刷新一次，避免每帧强制 layout） */
      cur.sizeTick -= dt;
      if (!cur.pw || cur.sizeTick <= 0) {
        cur.pw = cur.el.offsetWidth || 118;
        cur.ph = cur.el.offsetHeight || 36;
        cur.sizeTick = 0.5;
      }
      var aw = cur.pw, ah = cur.ph;

      var side = (cur.ax < w * 0.5) ? -1 : 1;
      if (w > 760 && cur.ax > w * 0.5 && cur.ax < w * 0.58) side = 1;
      cur.side = side;

      var offX = side > 0 ? 46 : 40;
      var px = side > 0 ? (cur.ax + offX) : (cur.ax - offX - aw);
      px = clamp(px, 8, Math.max(8, w - aw - 8));

      cur.aw = aw; cur.ah = ah;
      cur.px = px;
      cur.py = cur.ay - ah * 0.5 - 4;
      cand.push(cur);
    }

    cand.sort(function (a, b) { return a.py - b.py; });

    /* 2) 单向下推：只与横向相交的已放置项比较，py 单调不减 ⇒ 有界终止 */
    for (var ci = 0; ci < cand.length; ci++) {
      var cc = cand[ci];
      for (var cj = 0; cj < ci; cj++) {
        var pp = cand[cj];
        var xHit = (cc.px < pp.px + pp.aw + GAP) && (pp.px < cc.px + cc.aw + GAP);
        if (!xHit) continue;
        if (cc.py < pp.py + pp.ah + GAP && pp.py < cc.py + cc.ah + GAP) {
          cc.py = pp.py + pp.ah + GAP;
        }
      }
    }

    /* 3) 整组回移/压缩，使其落在 [8, h-8] 内 */
    if (cand.length) {
      var minTop = Infinity, maxBottom = -Infinity;
      for (var q0 = 0; q0 < cand.length; q0++) {
        if (cand[q0].py < minTop) minTop = cand[q0].py;
        if (cand[q0].py + cand[q0].ah > maxBottom) maxBottom = cand[q0].py + cand[q0].ah;
      }
      var span = maxBottom - minTop;
      var avail = Math.max(16, h - 16);
      if (span > avail) {
        /* 极端情况（标签过大/过多）：等比压缩到可用高度，仍保持互不重叠的顺序 */
        var sc = avail / span;
        for (q0 = 0; q0 < cand.length; q0++) cand[q0].py = minTop + (cand[q0].py - minTop) * sc;
        for (q0 = 0; q0 < cand.length; q0++) cand[q0].ah = Math.max(8, cand[q0].ah * sc);
        minTop = Infinity; maxBottom = -Infinity;
        for (q0 = 0; q0 < cand.length; q0++) {
          if (cand[q0].py < minTop) minTop = cand[q0].py;
          if (cand[q0].py + cand[q0].ah > maxBottom) maxBottom = cand[q0].py + cand[q0].ah;
        }
      }
      var delta = 0;
      if (maxBottom > h - 8) delta = maxBottom - (h - 8);
      else if (minTop < 8) delta = minTop - 8;
      if (delta !== 0) {
        for (q0 = 0; q0 < cand.length; q0++) cand[q0].py -= delta;
      }
    }

    for (var z0 = 0; z0 < cand.length; z0++) {
      var zc = cand[z0];
      zc.ex = (zc.side > 0) ? zc.px : (zc.px + zc.aw);
      zc.ey = zc.py + zc.ah * 0.5;
    }


    /* 透明度平滑 + 写 DOM/SVG */
    for (i = 0; i < st.order.length; i++) {
      var item = st.items[st.order[i]];
      if (!item || item.pending) continue;

      var ta = item.targetAlpha || 0;
      item.a = lerp(item.a, ta, ta > item.a ? kFadeIn : kFadeOut);
      if (item.a < 0.004 && ta === 0) item.a = 0;

      var isSel = (st.selected === item.id);
      var isHov = (st.hover === item.id);
      var mode = isSel ? 'sel' : (isHov ? 'hover' : 'idle');
      if (mode !== item._mode) paintPill(item, mode);

      /* 整体透明度：把 opacity 乘进 DOM 透明度里，实现"随拆解度渐显" */
      var shown = item.a * st.opacity;
      if (!st.enabled) shown = 0;

      item.el.style.opacity = shown.toFixed(3);

      /* 位置必须每帧写入：正在渐显（opacity 极小）时若跳过，
         元素会滞留在旧坐标上而避让算法以为它已在新位置，造成实际重叠 */
      if (item.a > 0.0015) {
        item.el.style.transform =
          'translate3d(' + item.px.toFixed(1) + 'px,' + item.py.toFixed(1) + 'px,0) scale(' +
          (isSel ? '1.06' : (isHov ? '1.03' : '1')) + ')';
      }

      if (shown <= 0.002) {
        item.dot.setAttribute('opacity', '0');
        item.halo.setAttribute('opacity', '0');
        item.line.setAttribute('opacity', '0');
        item.el.style.visibility = 'hidden';
        continue;
      }
      item.el.style.visibility = '';

      var z = (isSel ? 5000 : 1000) - Math.round(item.dist * 10);
      if (z !== item._z) { item.el.style.zIndex = String(z); item._z = z; }

      item.dot.setAttribute('cx', item.ax.toFixed(1));
      item.dot.setAttribute('cy', item.ay.toFixed(1));
      item.dot.setAttribute('r', isSel ? '4.2' : '3');
      item.dot.setAttribute('opacity', (shown * (isSel ? 1 : 0.85)).toFixed(3));

      item.halo.setAttribute('cx', item.ax.toFixed(1));
      item.halo.setAttribute('cy', item.ay.toFixed(1));
      item.halo.setAttribute('r', isSel ? '10' : '6.5');
      item.halo.setAttribute('opacity', (shown * (isSel ? 0.85 : 0.28)).toFixed(3));

      var lx = item.ax, ly = item.ay, ex = item.ex, ey = item.ey;
      var mx = lx + (ex - lx) * 0.45;
      item.line.setAttribute('points',
        lx.toFixed(1) + ',' + ly.toFixed(1) + ' ' +
        mx.toFixed(1) + ',' + ly.toFixed(1) + ' ' +
        ex.toFixed(1) + ',' + ey.toFixed(1));
      item.line.setAttribute('stroke', isSel ? rgba(item.acHex, 0.95) : 'rgba(150,195,225,0.50)');
      item.line.setAttribute('stroke-width', isSel ? '1.4' : '1');
      item.line.setAttribute('opacity', (shown * (isSel ? 1 : 0.8)).toFixed(3));
    }
  };

  /** 兼容 main 的 labels.render()：只重写一次 DOM（update 已算好状态） */
  L.render = function () {
    if (!st.inited || !st.ready) return;
    for (var i = 0; i < st.order.length; i++) {
      var it = st.items[st.order[i]];
      if (!it || it.pending) continue;
      var shown = it.a * st.opacity * (st.enabled ? 1 : 0);
      it.el.style.opacity = shown.toFixed(3);
      it.el.style.transform = 'translate3d(' + it.px.toFixed(1) + 'px,' + it.py.toFixed(1) + 'px,0)';
    }
  };

  L.info = function () {
    return {
      inited: st.inited, ready: st.ready, enabled: st.enabled,
      opacity: st.opacity, selected: st.selected, hover: st.hover,
      count: st.order.length, occluders: st.targets.length,
      occluded: st.occludedCount || 0
    };
  };
})();
