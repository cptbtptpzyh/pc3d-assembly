/* ============================================================
 * main.js — 总控：渲染器 / 相机 / 装配 / 拾取 / 拆解动画 / 变体重建
 * Lead 维护
 * ========================================================== */
(function () {
  'use strict';
  var PC3D = (window.PC3D = window.PC3D || {});
  var T = THREE;
  var U = PC3D.util;
  var C = PC3D.config;
  var bus = PC3D.bus;

  var app = {
    renderer: null, scene: null, camera: null, controls: null, clock: null,
    parts: {},          // id -> { group, comp, variantIndex, mount, dir, dist, base:Vector3 }
    root: null,         // 部件根节点
    explode: 0, explodeTarget: 0, explodeT: 0,
    selected: null, hovered: null,
    tween: null,        // 相机 tween
    raycaster: new T.Raycaster(),
    pointer: new T.Vector2(),
    enabled: { autoRotate: true, labels: true, bloom: true, glass: true, sound: false },
    frame: 0, statsTimer: 0, hoverTimer: 0,
    ready: false
  };
  PC3D.app = app;

  /* ============================================================
   * 高亮系统：为每个部件按"亮度档"缓存克隆材质，切换时整部件换材质
   * ========================================================== */
  /* bright 档原为 1.15：实测选中后部件本体 25% 像素过曝（>=0.985）发白、丢材质细节，
   * 降为 0.82 后过曝降到 0.2%，选中相对未选中的亮度提升仍有 +0.33（肉眼照样一眼可辨）。 */
  var levels = { off: 0, dim: 0.14, mid: 0.34, bright: 0.82 };
  var matCache = { dim: new Map(), mid: new Map(), bright: new Map() };
  var accent = new T.Color(C.theme.accent);

  function cloneForLevel(mat, levelKey) {
    var cache = matCache[levelKey];
    var c = cache.get(mat);
    if (c) return c;
    c = mat.clone();
    c.__owned = true;
    if (c.emissive) {
      c.emissive = new T.Color(accent);
      c.emissiveIntensity = levels[levelKey];
    }
    if (c.color) c.color = mat.color.clone ? mat.color.clone() : c.color;
    cache.set(mat, c);
    return c;
  }

  function isHighlightable(mesh) {
    var m = mesh.material;
    if (!m || Array.isArray(m)) return false;
    if (!m.isMeshStandardMaterial) return false;
    if (m.transparent && m.opacity < 0.5) return false;   // 玻璃/发光片跳过
    if (mesh.userData.noPick || mesh.userData.glow) return false;
    return true;
  }

  /** 设置某部件的高亮档（记录原始材质，重复调用安全） */
  function setPartLevel(id, levelKey) {
    var rec = app.parts[id];
    if (!rec) return;
    var g = rec.group;
    g.traverse(function (o) {
      if (!o.isMesh || !isHighlightable(o)) return;
      if (!o.userData.__origMat) o.userData.__origMat = o.material;
      if (levelKey === 'off') {
        o.material = o.userData.__origMat;
      } else {
        o.material = cloneForLevel(o.userData.__origMat, levelKey);
      }
    });
  }

  function refreshHighlights() {
    var exploded = app.explodeT > 0.12;
    for (var i = 0; i < C.order.length; i++) {
      var id = C.order[i];
      if (id === app.selected) continue;
      if (app.hovered === id && !app.selected) setPartLevel(id, 'mid');
      else setPartLevel(id, exploded ? 'dim' : 'off');
    }
    if (app.selected) setPartLevel(app.selected, 'bright');
  }

  /* ============================================================
   * 选中框（科技感角括号）
   * ========================================================== */
  var bracket = null;
  function buildBracket() {
    var positions = [];
    var s = 0.16, L = 1; // 单位盒上画 8 个角的括号
    var corners = [[-1,-1,-1],[1,-1,-1],[-1,1,-1],[1,1,-1],[-1,-1,1],[1,-1,1],[-1,1,1],[1,1,1]];
    for (var i = 0; i < corners.length; i++) {
      var c = corners[i];
      // 每个角三条短线段（沿三个轴伸出）
      positions.push(c[0]*L, c[1]*L, c[2]*L, c[0]*(L-s), c[1]*L, c[2]*L);
      positions.push(c[0]*L, c[1]*L, c[2]*L, c[0]*L, c[1]*(L-s), c[2]*L);
      positions.push(c[0]*L, c[1]*L, c[2]*L, c[0]*L, c[1]*L, c[2]*(L-s));
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    var mat = new T.LineBasicMaterial({ color: C.theme.accent, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
    mat.__owned = true;
    bracket = new T.LineSegments(geo, mat);
    bracket.visible = false;
    bracket.renderOrder = 5;
    return bracket;
  }

  /* ============================================================
   * 部件构建 / 装配
   * ========================================================== */
  function placeholder(id) {
    var comp = C.components[id];
    var g = new T.Group();
    var m = U.mesh(U.rbox(0.3, 0.3, 0.3, 0.03), PC3D.materials.clone('greyPlastic', { color: comp.color }), {});
    var w = new T.LineSegments(new T.EdgesGeometry(U.box(0.32, 0.32, 0.32)), new T.LineBasicMaterial({ color: comp.color, toneMapped: false }));
    g.add(m, w);
    g.userData.anchor = new T.Vector3(0, 0, 0);
    console.warn('[main] 缺少部件构建器:', id, '— 使用占位几何');
    return g;
  }

  function buildPart(id, variantIndex) {
    var comp = C.components[id];
    var idx = variantIndex == null ? (comp.previewVariant || 0) : variantIndex;
    idx = U.clamp(idx, 0, comp.variants.length - 1);
    var variant = comp.variants[idx];
    var builder = PC3D.parts.builders[id];
    var group;
    var ctx = { THREE: T, U: U, M: PC3D.materials, config: C, theme: C.theme, app: app };
    try {
      group = builder ? builder(ctx, comp, variant) : placeholder(id);
    } catch (e) {
      console.error('[main] 构建失败', id, e);
      group = placeholder(id);
    }
    if (!group) group = placeholder(id);
    group.userData.partId = id;
    group.userData.variantIndex = idx;
    U.setShadow(group);
    // 确保内部 LED / 发光片不被阴影影响
    group.traverse(function (o) {
      if (o.userData.glow) { o.castShadow = false; o.receiveShadow = false; }
    });
    return group;
  }

  function mountPart(id) {
    var comp = C.components[id];
    var group = app.parts[id] ? app.parts[id].group : null;
    if (group) {
      app.root.remove(group);
      U.dispose(group);
    }
    group = buildPart(id, comp._index);
    var mount = C.mounts[id] || comp.mount || { p: [0, 0, 0], r: [0, 0, 0] };
    var base = new T.Vector3(mount.p[0], mount.p[1], mount.p[2]);
    group.position.copy(base);
    if (mount.r) group.rotation.set(mount.r[0] || 0, mount.r[1] || 0, mount.r[2] || 0);
    app.root.add(group);

    var ex = comp.explode || { dir: [0, 0, 1], dist: 1 };
    var dir = new T.Vector3(ex.dir[0], ex.dir[1], ex.dir[2]).normalize();

    app.parts[id] = {
      id: id, group: group, comp: comp, base: base, dir: dir, dist: ex.dist || 1,
      index: comp.index, selEase: 0, subEase: 0
    };
    // 二级拆解记录
    var subs = group.userData.subExplode || [];
    app.parts[id].subs = subs.map(function (s) {
      return { obj: s.obj, dir: new T.Vector3(s.dir[0], s.dir[1], s.dir[2]).normalize(), dist: s.dist || 0.3, base: s.obj.position.clone() };
    });
    registerLabel(id, group);
    cachePartBox(app.parts[id]);
    recomputeExplodeBounds();
    refreshHighlights();
    return group;
  }

  /** 记录部件在"未拆解"姿态下的世界包围盒，用于计算整机爆炸后的整体取景范围 */
  function cachePartBox(rec) {
    if (!rec || !rec.group) return;
    var b = new T.Box3().setFromObject(rec.group);
    rec.boxBase = b.clone();
  }

  /** 汇总全部部件爆炸后的联合包围盒（中心 / 半径），每次装配或变体切换后重算 */
  function recomputeExplodeBounds() {
    var u = new T.Box3(), any = false;
    for (var i = 0; i < C.order.length; i++) {
      var rec = app.parts[C.order[i]];
      if (!rec || !rec.boxBase) continue;
      var b = rec.boxBase.clone().translate(rec.dir.clone().multiplyScalar(rec.dist));
      u.union(b); any = true;
    }
    if (!any) { app.explodeBounds = null; return; }
    var sphere = u.getBoundingSphere(new T.Sphere());
    app.explodeBounds = { box: u, center: u.getCenter(new T.Vector3()), radius: sphere.radius };
  }

  function registerLabel(id, group) {
    if (!PC3D.labels || !PC3D.labels.register) return;
    var comp = C.components[id];
    var variant = comp.variants[comp._index == null ? (comp.previewVariant || 0) : comp._index];
    var anchor = group.userData.anchor;
    PC3D.labels.register(id, {
      anchor: anchor || new T.Vector3(0, 0, 0),
      target: group,
      title: comp.name,
      sub: variant ? variant.short : '',
      color: '#' + new T.Color(comp.color).getHexString()
    });
  }

  function buildAll() {
    for (var i = 0; i < C.order.length; i++) {
      var id = C.order[i];
      var comp = C.components[id];
      if (comp._index == null) comp._index = comp.previewVariant || 0;
      mountPart(id);
    }
    // 线材等附属物
    if (PC3D.parts.extras) {
      try {
        var extra = PC3D.parts.extras({ THREE: T, U: U, M: PC3D.materials, config: C, app: app });
        if (extra) { extra.userData.decor = true; app.root.add(extra); }
      } catch (e) { console.warn('[main] extras 失败', e); }
    }
    recomputeExplodeBounds();
  }

  /* ============================================================
   * 拆解动画
   * ========================================================== */
  function updateExplode(dt) {
    var target = app.explodeTarget;
    var speed = 2.6;
    if (Math.abs(app.explode - target) > 1e-4) {
      var d = target - app.explode;
      var step = Math.sign(d) * Math.min(Math.abs(d), dt * speed);
      app.explode += step;
      if ((target - app.explode) * d < 0) app.explode = target;
      app.explodeT = U.ease.inOutCubic(U.clamp(app.explode, 0, 1));
      PC3D.bus.emit('explode:changed', { t: app.explodeT, raw: app.explode });
    } else if (app.explodeT !== U.ease.inOutCubic(target)) {
      app.explodeT = U.ease.inOutCubic(target);
    }
    var t = app.explodeT;
    for (var i = 0; i < C.order.length; i++) {
      var id = C.order[i];
      var rec = app.parts[id];
      if (!rec) continue;
      // 交错：不同部件有轻微相位差，动画更有层次
      var lag = (rec.index % 4) * 0.05;
      var tt = U.clamp((t - lag) / (1 - 0.15), 0, 1);
      // 选中时的额外出位
      var selTarget = (id === app.selected) ? 1 : 0;
      rec.selEase += (selTarget - rec.selEase) * Math.min(1, dt * 6);
      var pop = rec.selEase * 0.52;
      var p = rec.base.clone().addScaledVector(rec.dir, rec.dist * tt + pop);
      // 选中部件轻微抬起旋转，突出"拿起"的感觉
      rec.group.position.lerp(p, Math.min(1, dt * 12));
      var rx = rec.group.rotation.x, ry = rec.group.rotation.y, rz = rec.group.rotation.z;
      var wob = Math.sin(performance.now() * 0.0018 + rec.index) * 0.012 * rec.selEase;
      rec.group.rotation.set(rx * 0.86 + (rec.dir.z * 0.05 * tt) + wob, ry * 0.86 + wob, rz * 0.86);
      // 二级拆解
      if (rec.subs && rec.subs.length) {
        for (var k = 0; k < rec.subs.length; k++) {
          var s = rec.subs[k];
          if (!s.obj) continue;
          var kt = U.clamp((t - 0.35 - k * 0.04) / 0.55, 0, 1);
          s.obj.position.copy(s.base).addScaledVector(s.dir, U.ease.outCubic(kt) * s.dist + rec.selEase * 0.05);
        }
      }
    }
    // 标签：未拆解时常显（0.62），拆解后拉到 1；hover / 选中由 labels 内部再提亮
    if (PC3D.labels && PC3D.labels.setOpacity) PC3D.labels.setOpacity(U.clamp(0.62 + t * 0.38, 0, 1) * (app.enabled.labels ? 1 : 0));
  }

  function setExplode(t) {
    app.explodeTarget = U.clamp(t, 0, 1);
    if (Math.abs(app.explodeTarget - app.explode) < 0.001) return;
    refreshHighlights();
    var lbl = app.explodeTarget > 0.1;
    if (PC3D.ui && PC3D.ui.setExplode) PC3D.ui.setExplode(app.explodeTarget);
    if (PC3D.ui && PC3D.ui.setExploded) PC3D.ui.setExploded(lbl);
  }

  /* ============================================================
   * 选择 / 悬停 / 聚焦
   * ========================================================== */
  function findPart(obj) {
    while (obj) {
      if (obj.userData && obj.userData.partId && app.parts[obj.userData.partId]) return obj.userData.partId;
      obj = obj.parent;
    }
    return null;
  }

  function select(id, source) {
    if (id && !C.components[id]) id = null;
    app.selected = id || null;
    refreshHighlights();
    updateBracket();
    if (PC3D.labels && PC3D.labels.setSelected) PC3D.labels.setSelected(app.selected);
    if (PC3D.ui && PC3D.ui.setSelected) PC3D.ui.setSelected(app.selected);
    if (PC3D.stage && PC3D.stage.setAccent) PC3D.stage.setAccent(app.selected ? C.components[app.selected].color : C.theme.accent);
    bus.emit('selected', { id: app.selected, source: source || 'main' });
    if (source !== 'ui' && app.selected) focusPart(app.selected);
  }

  function updateBracket() {
    if (!bracket) return;
    if (!app.selected) { bracket.visible = false; return; }
    var rec = app.parts[app.selected];
    if (!rec) { bracket.visible = false; return; }
    var box = new T.Box3().setFromObject(rec.group);
    if (box.isEmpty()) { bracket.visible = false; return; }
    var size = box.getSize(new T.Vector3());
    var center = box.getCenter(new T.Vector3());
    var pad = 0.035;
    bracket.visible = true;
    bracket.position.copy(center);
    bracket.scale.set((size.x / 2) + pad, (size.y / 2) + pad, (size.z / 2) + pad);
  }

  function focusPart(id) {
    var rec = app.parts[id];
    if (!rec) return;
    var box = new T.Box3().setFromObject(rec.group);
    var center = box.getCenter(new T.Vector3());
    var radius = box.getBoundingSphere(new T.Sphere()).radius;
    var dir = app.camera.position.clone().sub(app.controls.target).normalize();
    var dist = U.clamp(radius * 3.0, 1.05, 4.2);
    var pos = center.clone().addScaledVector(dir, dist);
    // 保持现有高度感
    pos.y += 0.16;
    tweenCamera(pos, center, 0.9);
  }

  function tweenCamera(pos, target, duration) {
    app.tween = {
      t: 0, dur: duration || 0.8,
      p0: app.camera.position.clone(), p1: pos.clone(),
      t0: app.controls.target.clone(), t1: target.clone()
    };
  }

  function resetView(instant) {
    var a = (PC3D.stage && PC3D.stage.anchor) || {
      position: new T.Vector3().fromArray(C.camera.position),
      target: new T.Vector3().fromArray(C.camera.target)
    };
    app.framePrev = null;
    if (instant) {
      app.camera.position.copy(a.position); app.controls.target.copy(a.target); app.controls.update();
      app.tween = null;
    } else tweenCamera(a.position, a.target, 1.1);
  }

  function updateTween(dt) {
    var tw = app.tween;
    if (!tw) return;
    tw.t += dt;
    var k = U.clamp(tw.t / tw.dur, 0, 1);
    var e = U.ease.inOutCubic(k);
    app.camera.position.lerpVectors(tw.p0, tw.p1, e);
    app.controls.target.lerpVectors(tw.t0, tw.t1, e);
    if (k >= 1) app.tween = null;
  }

  /* ============================================================
   * 拾取 & 交互
   * ========================================================== */
  var down = { x: 0, y: 0, time: 0, id: null, button: 0 };

  function setPointer(e) {
    var rect = app.renderer.domElement.getBoundingClientRect();
    app.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    app.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function pick() {
    app.raycaster.setFromCamera(app.pointer, app.camera);
    var objs = [];
    for (var i = 0; i < C.order.length; i++) {
      var rec = app.parts[C.order[i]];
      if (rec) objs.push(rec.group);
    }
    var hits = app.raycaster.intersectObjects(objs, true);
    for (var k = 0; k < hits.length; k++) {
      var o = hits[k].object;
      if (o.userData && (o.userData.noPick || o.userData.glow)) continue;
      // 侧透玻璃 / 透明遮挡物不该抢点击：射线穿过玻璃命中后面的真实部件
      if (isSeeThrough(o)) continue;
      var id = findPart(o);
      if (id) return id;
    }
    return null;
  }

  /** 透明件判定：自身或任一祖先是 userData.glass，或材质为高透明度玻璃 */
  function isSeeThrough(obj) {
    var p = obj;
    while (p) {
      if (p.userData && p.userData.glass) return true;
      p = p.parent;
    }
    var m = obj.material;
    if (m && !Array.isArray(m) && m.transparent && (m.opacity === undefined ? 1 : m.opacity) < 0.5) return true;
    return false;
  }

  function bindEvents() {
    var el = app.renderer.domElement;

    el.addEventListener('pointerdown', function (e) {
      down.x = e.clientX; down.y = e.clientY; down.time = performance.now(); down.button = e.button;
      setPointer(e);
      down.id = (e.button === 0) ? pick() : null;
    });

    el.addEventListener('pointerup', function (e) {
      if (e.button !== 0) return;
      var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      if (moved > 6 || performance.now() - down.time > 600) return;
      setPointer(e);
      var id = pick();
      if (id) {
        if (id === app.selected) { focusPart(id); }
        select(id, 'scene');
        playBlip(660, 0.05);
      } else {
        select(null, 'scene');
      }
    });

    var hoverPending = false;
    el.addEventListener('pointermove', function (e) {
      if (hoverPending) return;
      hoverPending = true;
      requestAnimationFrame(function () {
        hoverPending = false;
        setPointer(e);
        var id = pick();
        setHover(id);
      });
    });

    el.addEventListener('pointerleave', function () { setHover(null); });

    window.addEventListener('keydown', function (e) {
      // 文本输入/下拉框吞掉全部快捷键；range 滑杆只吞方向键（见下），
      // 其余快捷键照常响应 —— 否则点过「拆解程度」滑杆之后 E/R/L 全部失灵。
      var tg = e.target && e.target.tagName ? e.target.tagName.toUpperCase() : '';
      var isRange = tg === 'INPUT' && (e.target.type || '').toLowerCase() === 'range';
      if ((tg === 'INPUT' && !isRange) || tg === 'TEXTAREA' || tg === 'SELECT' || (e.target && e.target.isContentEditable)) return;
      if (isRange && /^Arrow/.test(e.key)) return;
      var k = e.key.toLowerCase();
      if (k === 'escape') { select(null); resetView(); }
      else if (k === 'r') { doReset(); }
      else if (k === 'e') { setExplode(app.explodeTarget > 0.5 ? 0 : 1); PC3D.bus.emit('explode:ui-sync', { t: app.explodeTarget }); }
      else if (k === ' ') { e.preventDefault(); toggle('autoRotate', !app.enabled.autoRotate); }
      else if (k === 'l') { toggle('labels', !app.enabled.labels); }
      else if (k === 'f') { if (app.selected) focusPart(app.selected); }
      else if (/^[1-9]$/.test(k)) {
        var idx = parseInt(k, 10) - 1;
        if (C.order[idx]) { select(C.order[idx], 'key'); }
      }
    });

    // 事件总线
    bus.on('select', function (p) {
      if (!p) return;
      if (p.source === 'ui') { select(p.id || null, 'ui'); if (p.id) focusPart(p.id); }
    });
    bus.on('hover', function (p) { setHover(p ? p.id : null); });
    bus.on('focus', function (p) { if (p && p.id) { select(p.id, 'focus'); focusPart(p.id); } });
    bus.on('explode:set', function (p) { setExplode(p.t); });
    bus.on('explode:toggle', function () { setExplode(app.explodeTarget > 0.5 ? 0 : 1); bus.emit('explode:ui-sync', { t: app.explodeTarget }); });
    bus.on('reset', function () { doReset(); });
    bus.on('variant:change', function (p) { changeVariant(p.id, p.index); });
    bus.on('toggle', function (p) { toggle(p.key, p.value, true); });
    bus.on('tour:start', function () { bus.emit('toast', { text: '开始操作引导：跟随提示逐步体验', kind: 'info' }); });
  }

  function setHover(id) {
    if (app.hovered === id) return;
    app.hovered = id;
    refreshHighlights();
    app.renderer.domElement.style.cursor = id ? 'pointer' : 'grab';
    if (PC3D.labels && PC3D.labels.setHover) PC3D.labels.setHover(id);
    if (PC3D.ui && PC3D.ui.setHover) PC3D.ui.setHover(id);
    bus.emit('hovered', { id: id });
  }

  function toggle(key, value, fromUI) {
    app.enabled[key] = value;
    if (key === 'autoRotate') app.controls.autoRotate = !!value;
    else if (key === 'labels') {
      if (PC3D.labels && PC3D.labels.setEnabled) PC3D.labels.setEnabled(!!value);
    } else if (key === 'bloom') {
      if (PC3D.stage && PC3D.stage.setBloom) PC3D.stage.setBloom(!!value);
    } else if (key === 'glass') {
      setGlass(!!value);
    } else if (key === 'sound') {
      if (value) ensureAudio();
    }
    if (!fromUI) bus.emit('toggle:sync', { key: key, value: value });
  }

  function setGlass(v) {
    app.root.traverse(function (o) {
      if (o.userData && o.userData.glass) o.visible = v;
    });
  }

  /* ============================================================
   * 爆炸自适应取景：拆解时把相机按需拉远、并把取景中心移向散开后的整体中心，
   * 保证 9 个部件始终留在画面内（否则 gpu/psu/fans 会被甩出视锥，看不到也点不到）。
   * 采用「增量施加」而非「绝对定位」：每帧只把取景曲线相对上一帧的变化量加到
   * 相机/目标上，因此用户手动旋转、缩放、聚焦的偏移不会被覆盖。
   * ========================================================== */
  var FRAME_SHIFT = 0.55;   // 取景中心向爆炸中心偏移的比例
  var FRAME_MARGIN = 1.10;  // 包围盒贴边后再留 10% 余量

  /** 让 box 完整落入当前视锥所需的相机距离（沿 dir 方向、以 target 为原点） */
  function fitDistanceForBox(box, target, dir, camera) {
    var right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), dir);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0); else right.normalize();
    var up = new T.Vector3().crossVectors(dir, right).normalize();
    var tanV = Math.tan((camera.fov * Math.PI / 180) / 2);
    var tanH = tanV * Math.max(0.2, camera.aspect || 1.6);
    var min = box.min, max = box.max, w = new T.Vector3(), best = 0;
    for (var i = 0; i < 8; i++) {
      w.set((i & 1) ? max.x : min.x, (i & 2) ? max.y : min.y, (i & 4) ? max.z : min.z).sub(target);
      var along = w.dot(dir);
      var need = along + Math.abs(w.dot(right)) / tanH;
      var needV = along + Math.abs(w.dot(up)) / tanV;
      if (need > best) best = need;
      if (needV > best) best = needV;
    }
    return best;
  }

  function updateFraming() {
    if (!app.camera || !app.controls) return;
    // 相机 tween（聚焦/复原）期间由 tween 独占写入相机位置；此时若继续施加取景增量，
    // 增量会被 tween 覆盖掉而 framePrev 已前移 → 取景永久丢失。冻结基线，等 tween 结束后补算。
    if (app.tween) return;
    var anchor = (PC3D.stage && PC3D.stage.anchor) || null;
    var aTgt = anchor ? anchor.target.clone() : new T.Vector3().fromArray(C.camera.target);
    var aPos = anchor ? anchor.position.clone() : new T.Vector3().fromArray(C.camera.position);
    var baseDist = aPos.distanceTo(aTgt);
    var t = app.explodeT;
    var b = app.explodeBounds;
    var tgt = aTgt.clone();
    var dist = baseDist;
    if (b && t > 0.001) {
      tgt.lerp(b.center, t * FRAME_SHIFT);
      var dir = app.camera.position.clone().sub(app.controls.target);
      if (dir.lengthSq() < 1e-8) dir.copy(aPos).sub(aTgt);
      dir.normalize();
      var fit = fitDistanceForBox(b.box, tgt, dir, app.camera) * FRAME_MARGIN;
      fit = Math.max(baseDist, Math.min(fit, (app.controls.maxDistance || 8.5) * 0.98));
      dist = baseDist + (fit - baseDist) * t;
    }
    if (!app.framePrev) {
      // 首帧建立基线。基线记「目标取景值」而非相机当前值，是为了保住用户手动的旋转/缩放偏移。
      // 但若相机此刻仍停在基准位（典型：explodeT 被直接写满后紧跟 resetView(true)，framePrev 被清空），
      // 记录目标值会让 delta 恒为 0 → 取景永远不生效（实测 dist 卡在 4.35）。此时改用相机真实位姿作基线，
      // 下一帧即把整段取景增量补上。
      var camDist = app.camera.position.distanceTo(app.controls.target);
      var atBase = Math.abs(camDist - baseDist) < 0.35 &&
                   app.controls.target.distanceTo(aTgt) < 0.35;
      if (t > 0.001 && atBase) {
        app.framePrev = { tgt: app.controls.target.clone(), dist: camDist };
      } else {
        app.framePrev = { tgt: tgt.clone(), dist: dist };
        return;
      }
    }
    var dTgt = tgt.clone().sub(app.framePrev.tgt);
    var dDist = dist - app.framePrev.dist;
    if (dTgt.lengthSq() > 1e-10) app.controls.target.add(dTgt);
    if (Math.abs(dDist) > 1e-6) {
      var d2 = app.camera.position.clone().sub(app.controls.target);
      if (d2.lengthSq() > 1e-8) app.camera.position.addScaledVector(d2.normalize(), dDist);
    }
    app.framePrev.tgt.copy(tgt);
    app.framePrev.dist = dist;
  }

  function doReset() {
    setExplode(0);
    select(null);
    app.explode = 0; app.explodeT = 0;
    for (var i = 0; i < C.order.length; i++) {
      var rec = app.parts[C.order[i]];
      if (!rec) continue;
      rec.selEase = 0;
      rec.group.position.copy(rec.base);
      rec.group.rotation.set(0, 0, 0);
      if (rec.subs) for (var k = 0; k < rec.subs.length; k++) rec.subs[k].obj.position.copy(rec.subs[k].base);
    }
    resetView();
    bus.emit('explode:ui-sync', { t: 0 });
    bus.emit('toast', { text: '已复原到初始状态', kind: 'ok' });
  }

  /* ============================================================
   * 变体切换
   * ========================================================== */
  function changeVariant(id, index) {
    var comp = C.components[id];
    if (!comp) return;
    comp._index = U.clamp(index, 0, comp.variants.length - 1);
    var wasSelected = app.selected === id;
    mountPart(id);
    if (wasSelected) {
      setPartLevel(id, 'bright');
      updateBracket();
      focusPart(id);
    }
    if (PC3D.ui && PC3D.ui.setVariant) PC3D.ui.setVariant(id, comp._index);
    bus.emit('rebuilt', { id: id });
    bus.emit('toast', { text: '已切换：' + comp.name + ' → ' + comp.variants[comp._index].short, kind: 'info' });
    playBlip(520, 0.04);
  }

  /* ============================================================
   * 音效（可选，纯合成，无外部文件）
   * ========================================================== */
  var actx = null;
  function ensureAudio() {
    if (actx) return actx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    } catch (e) { actx = null; }
    return actx;
  }
  function playBlip(freq, dur) {
    if (!app.enabled.sound) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (dur || 0.06));
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + (dur || 0.06) + 0.02);
  }

  /* ============================================================
   * 渲染循环
   * ========================================================== */
  var lastTime = 0, fpsAcc = 0, fpsCount = 0, fps = 60;

  function spinFans(dt) {
    if (!app.root) return;
    app.root.traverse(function (o) {
      if (o.userData && o.userData.spin) {
        var axis = o.userData.spinAxis || 'z';
        var boost = app.explodeT > 0.1 ? 1.35 : 1;
        o.rotation[axis] += o.userData.spin * dt * boost;
      }
    });
  }

  function animate(now) {
    requestAnimationFrame(animate);
    var dt = Math.min(0.05, (now - (lastTime || now)) / 1000);
    lastTime = now;
    var elapsed = now / 1000;
    app.frame++;

    updateExplode(dt);
    spinFans(dt);
    updateTween(dt);
    updateFraming();

    // ?nointro=1：stage 入场动画若仍在跑，每帧压回成品机位（不依赖 stage 实现 instant）
    if (app.noIntro && PC3D.stage && PC3D.stage.info) {
      var si = PC3D.stage.info();
      if (si && si.entering) resetView(true);
    }

    app.controls.update();

    if (app.selected && app.frame % 6 === 0) updateBracket();
    if (bracket) {
      var pulse = 0.72 + Math.sin(elapsed * 3.2) * 0.22;
      bracket.material.opacity = pulse;
      bracket.scale.multiplyScalar(1 + Math.sin(elapsed * 3.2) * 0.0008);
    }

    if (PC3D.stage && PC3D.stage.update) PC3D.stage.update(dt, elapsed);
    if (PC3D.labels && PC3D.labels.update) PC3D.labels.update(dt);
    if (PC3D.stage && PC3D.stage.render) PC3D.stage.render(app.scene, app.camera, dt);
    else app.renderer.render(app.scene, app.camera);

    // 统计
    fpsAcc += dt; fpsCount++;
    app.statsTimer += dt;
    if (app.statsTimer > 0.5) {
      fps = fpsCount / Math.max(0.0001, fpsAcc);
      fpsAcc = 0; fpsCount = 0; app.statsTimer = 0;
      var info = app.renderer.info;
      bus.emit('stats', {
        fps: Math.round(fps),
        calls: info.render.calls,
        tris: info.render.triangles,
        meshes: info.memory.geometries
      });
    }
  }

  /* ============================================================
   * 初始化
   * ========================================================== */
  /** URL 开关：?nointro=1 跳过入场动画；?notour=1 跳过引导（ui 侧读取） */
  function flag(name) {
    return new RegExp('[?&]' + name + '=(1|true|yes)').test(window.location.search);
  }

  function init() {
    var wrap = document.getElementById('canvas-wrap');
    if (!wrap) { console.error('[main] 缺少 #canvas-wrap'); return; }

    // ---- 渲染器 ----
    var existingCanvas = document.getElementById('gl');
    var renderer = new T.WebGLRenderer({ canvas: existingCanvas || undefined, antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(wrap.clientWidth || window.innerWidth, wrap.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.cursor = 'grab';
    if (!existingCanvas) wrap.appendChild(renderer.domElement);
    app.renderer = renderer;

    // ---- 场景 / 相机 ----
    var scene = new T.Scene();
    scene.background = new T.Color(C.theme.bg);
    scene.fog = new T.FogExp2(C.theme.bg, 0.028);
    app.scene = scene;

    var camera = new T.PerspectiveCamera(C.camera.fov || 38, (wrap.clientWidth || window.innerWidth) / (wrap.clientHeight || window.innerHeight), 0.05, 120);
    camera.position.fromArray(C.camera.intro || C.camera.position);
    app.camera = camera;

    var controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.rotateSpeed = 0.85;
    controls.zoomSpeed = 0.85;
    controls.panSpeed = 0.7;
    controls.minDistance = 0.9;
    controls.maxDistance = 9.2;
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.minPolarAngle = Math.PI * 0.06;
    controls.target.fromArray(C.camera.target);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controls.update();
    app.controls = controls;

    app.root = new T.Group();
    app.root.name = 'parts-root';
    scene.add(app.root);
    scene.add(buildBracket());

    // ---- 环境 / 灯光 / 后期（队友实现；缺失时降级） ----
    if (PC3D.stage && PC3D.stage.init) {
      try {
        PC3D.stage.init({ renderer: renderer, scene: scene, camera: camera, bloom: true, controls: controls });
      } catch (e) { console.error('[main] stage.init 失败，使用降级光照', e); fallbackLights(); }
    } else fallbackLights();

    // ---- 标注 ----
    if (PC3D.labels && PC3D.labels.init) {
      var layer = document.getElementById('labels-layer');
      try { PC3D.labels.init({ camera: camera, container: layer, scene: scene }); }
      catch (e) { console.error('[main] labels.init 失败', e); }
    }

    // ---- 装配 ----
    buildAll();
    bindEvents();

    // ---- UI ----
    if (PC3D.ui && PC3D.ui.init) {
      try { PC3D.ui.init(); } catch (e) { console.error('[main] ui.init 失败', e); }
    }
    if (PC3D.labels && PC3D.labels.setEnabled) PC3D.labels.setEnabled(app.enabled.labels);

    // ---- 尺寸 ----
    function onResize() {
      var w = wrap.clientWidth || window.innerWidth, h = wrap.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      if (PC3D.stage && PC3D.stage.resize) PC3D.stage.resize(w, h);
      if (PC3D.labels && PC3D.labels.resize) PC3D.labels.resize(w, h);
    }
    window.addEventListener('resize', onResize);

    // ---- 入场 ----
    app.ready = true;
    var noIntro = flag('nointro');
    app.noIntro = noIntro;
    if (noIntro) {
      // 直接落到成品机位，不做 swoop（低性能设备/自动截图都走这条）
      if (PC3D.stage && PC3D.stage.anchor) resetView(true);
      else resetView(true);
      if (PC3D.stage && PC3D.stage.enter) {
        try { PC3D.stage.enter({ instant: true }); } catch (e) { /* stage 未实现 instant 时忽略 */ }
        // stage.enter 若仍以非 instant 方式启动，立刻收尾
        setTimeout(function () { resetView(true); }, 60);
      }
    } else {
      requestAnimationFrame(function () {
        if (PC3D.stage && PC3D.stage.enter) { try { PC3D.stage.enter(); } catch (e) { console.warn(e); } }
        else tweenCamera(new T.Vector3().fromArray(C.camera.position), new T.Vector3().fromArray(C.camera.target), 1.5);
      });
    }

    requestAnimationFrame(animate);

    // 首帧后隐藏 loading
    var hide = function () {
      if (PC3D.ui && PC3D.ui.hideLoading) { try { PC3D.ui.hideLoading(); } catch (e) {} }
      else {
        var l = document.getElementById('loading');
        if (l) { l.style.opacity = '0'; setTimeout(function () { if (l.parentNode) l.parentNode.removeChild(l); }, 600); }
      }
      bus.emit('ready', {});
      bus.emit('toast', { text: '点击任意部件查看详情 · 按 E 一键拆解 · 按 R 复原', kind: 'info', sticky: true });
    };
    setTimeout(hide, 420);

    // 预置：默认选中显卡，开局即有详情可看（不聚焦，保持全景）
    setTimeout(function () {
      if (!app.selected) select('gpu', 'boot');
      app.tween = null;
      resetView(true);
    }, 30);

    console.log('%c PC3D READY ', 'background:#38e8ff;color:#05070d;font-weight:700', '部件:', Object.keys(app.parts).join(','));
  }

  function fallbackLights() {
    var scene = app.scene;
    scene.add(new T.HemisphereLight(0x93b4d6, 0x080a0f, 0.7));
    var key = new T.DirectionalLight(0xffffff, 2.2);
    key.position.set(-4, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 22;
    key.shadow.camera.left = -3; key.shadow.camera.right = 3;
    key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
    key.shadow.bias = -0.0006;
    scene.add(key);
    var rim = new T.DirectionalLight(0x38e8ff, 1.4); rim.position.set(3, 2, -5); scene.add(rim);
    var fill = new T.DirectionalLight(0xa45bff, 0.8); fill.position.set(5, -3, 2); scene.add(fill);
    scene.add(new T.AmbientLight(0x2a3346, 0.5));
  }

  // 暴露少量调试接口
  app.select = select;
  app.setExplode = setExplode;
  app.reset = doReset;
  app.changeVariant = changeVariant;
  app.toggle = toggle;
  app.focusPart = focusPart;
  app.setPartLevel = setPartLevel;
  app.resetView = resetView;
  app.recomputeExplodeBounds = recomputeExplodeBounds;
  app.explodeBounds = null;
  app.framePrev = null;

  PC3D.boot = function () {
    if (app.ready) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  };
  PC3D.boot();
})();