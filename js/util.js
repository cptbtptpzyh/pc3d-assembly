/* ============================================================
 * util.js — 几何 / 工具函数（Lead 维护）
 * 全部挂在 PC3D.util 下，不污染其它全局。
 * ========================================================== */
(function () {
  'use strict';
  var PC3D = (window.PC3D = window.PC3D || {});
  var T = THREE;
  var U = {};
  PC3D.util = U;

  /* ---------------- 事件总线 ---------------- */
  var handlers = Object.create(null);
  PC3D.bus = {
    on: function (name, fn) {
      (handlers[name] || (handlers[name] = [])).push(fn);
      return function () { PC3D.bus.off(name, fn); };
    },
    off: function (name, fn) {
      var l = handlers[name];
      if (!l) return;
      var i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    },
    emit: function (name, payload) {
      var l = handlers[name];
      if (l) for (var i = 0; i < l.length; i++) { try { l[i](payload); } catch (e) { console.error('[bus:' + name + ']', e); } }
    }
  };

  /* ---------------- 几何缓存 ---------------- */
  var geoCache = Object.create(null);
  function cached(key, build) {
    var g = geoCache[key];
    if (!g) { g = build(); geoCache[key] = g; }
    return g;
  }
  U.cacheStats = function () { return Object.keys(geoCache).length; };

  U.box = function (w, h, d) {
    return cached('box:' + w + ',' + h + ',' + d, function () { return new T.BoxGeometry(w, h, d); });
  };

  /** 圆角盒：把 BoxGeometry 的顶点向"内芯 + 半径球面"投影，得到真正 3D 倒角 */
  U.rbox = function (w, h, d, r, seg) {
    r = (r === undefined) ? 0.02 : r;
    seg = seg || 2;
    var maxR = Math.min(w, h, d) / 2 - 1e-4;
    r = Math.max(0, Math.min(r, maxR));
    var key = 'rbox:' + w + ',' + h + ',' + d + ',' + r + ',' + seg;
    return cached(key, function () {
      var geo = new T.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
      var pos = geo.attributes.position, nor = geo.attributes.normal;
      var hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
      for (var i = 0; i < pos.count; i++) {
        var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        var ix = Math.max(-hw, Math.min(hw, x));
        var iy = Math.max(-hh, Math.min(hh, y));
        var iz = Math.max(-hd, Math.min(hd, z));
        var dx = x - ix, dy = y - iy, dz = z - iz;
        var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len > 1e-6) { dx /= len; dy /= len; dz /= len; } else { dx = 0; dy = 1; dz = 0; }
        pos.setXYZ(i, ix + dx * r, iy + dy * r, iz + dz * r);
        if (nor) nor.setXYZ(i, dx, dy, dz);
      }
      pos.needsUpdate = true;
      if (nor) nor.needsUpdate = true;
      geo.computeBoundingSphere();
      return geo;
    });
  };

  U.cyl = function (rt, rb, h, rad, open) {
    rad = rad || 32;
    return cached('cyl:' + rt + ',' + rb + ',' + h + ',' + rad + ',' + !!open, function () {
      return new T.CylinderGeometry(rt, rb, h, rad, 1, !!open);
    });
  };

  U.plane = function (w, h, sx, sy) {
    sx = sx || 1; sy = sy || 1;
    return cached('pl:' + w + ',' + h + ',' + sx + ',' + sy, function () { return new T.PlaneGeometry(w, h, sx, sy); });
  };

  U.torus = function (r, tube, rad, tub, arc) {
    rad = rad || 16; tub = tub || 48; arc = (arc === undefined) ? Math.PI * 2 : arc;
    return cached('tor:' + r + ',' + tube + ',' + rad + ',' + tub + ',' + arc, function () {
      return new T.TorusGeometry(r, tube, rad, tub, arc);
    });
  };

  /** 管子：points = [[x,y,z],...] */
  U.tube = function (points, radius, seg, rad, closed) {
    seg = seg || 48; rad = rad || 10;
    var key = 'tube:' + radius + ',' + seg + ',' + rad + ',' + !!closed + ':' +
      points.map(function (p) { return p.map(function (n) { return n.toFixed(3); }).join('/'); }).join(';');
    return cached(key, function () {
      var v = points.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); });
      var curve = new T.CatmullRomCurve3(v, !!closed, 'catmullrom', 0.4);
      return new T.TubeGeometry(curve, seg, radius, rad, !!closed);
    });
  };

  U.sphere = function (r, ws, hs) {
    ws = ws || 16; hs = hs || 12;
    return cached('sph:' + r + ',' + ws + ',' + hs, function () { return new T.SphereGeometry(r, ws, hs); });
  };
  U.cone = function (r, h, rad) {
    rad = rad || 20;
    return cached('cone:' + r + ',' + h + ',' + rad, function () { return new T.ConeGeometry(r, h, rad); });
  };
  U.capsule = function (r, len, cs, rs) {
    cs = cs || 8; rs = rs || 16;
    return cached('cap:' + r + ',' + len + ',' + cs + ',' + rs, function () { return new T.CapsuleGeometry(r, len, cs, rs); });
  };
  /** 圆环薄片（风扇网罩/发光环）——用 RingGeometry */
  U.ring = function (inner, outer, seg) {
    seg = seg || 48;
    return cached('ring:' + inner + ',' + outer + ',' + seg, function () { return new T.RingGeometry(inner, outer, seg); });
  };

  /* ---------------- 网格与组 ---------------- */
  function applyOpt(o, opt) {
    if (!opt) return o;
    if (opt.p) o.position.set(opt.p[0], opt.p[1], opt.p[2]);
    if (opt.r) { if (typeof opt.r === 'number') o.rotation.set(opt.r, 0, 0); else o.rotation.set(opt.r[0], opt.r[1], opt.r[2]); }
    if (opt.s !== undefined) { if (typeof opt.s === 'number') o.scale.setScalar(opt.s); else o.scale.set(opt.s[0], opt.s[1], opt.s[2]); }
    if (opt.name) o.name = opt.name;
    if (opt.userData) { for (var k in opt.userData) o.userData[k] = opt.userData[k]; }
    return o;
  }

  /** U.mesh(geo, mat, {p,r,s,name,cast,receive,noShadow,userData}) */
  U.mesh = function (geo, mat, opt) {
    var m = new T.Mesh(geo, mat);
    applyOpt(m, opt);
    var cast = opt && opt.cast !== undefined ? opt.cast : true;
    var recv = opt && opt.receive !== undefined ? opt.receive : true;
    if (opt && opt.noShadow) { cast = false; recv = false; }
    m.castShadow = cast; m.receiveShadow = recv;
    return m;
  };

  U.group = function () {
    var g = new T.Group(), opt = null;
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      if (!a) continue;
      if (a instanceof T.Object3D) g.add(a);
      else if (typeof a === 'object') opt = a;
    }
    applyOpt(g, opt);
    return g;
  };

  U.add = function (parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.add(arguments[i]);
    return parent;
  };

  U.setShadow = function (obj, cast, receive) {
    cast = cast !== false; receive = receive !== false;
    obj.traverse(function (o) {
      if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; }
    });
    return obj;
  };

  U.tag = function (obj, id) { obj.userData.partId = id; obj.traverse(function (o) { o.userData.partId = id; }); return obj; };

  U.mat = function (name, over) { return PC3D.materials.clone(name, over); };

  /* ---------------- 程序化纹理 ---------------- */
  U.canvas = function (w, h) {
    var c = document.createElement('canvas'); c.width = w || 256; c.height = h || 256;
    return c;
  };
  /** U.tex(w,h,draw) -> CanvasTexture（自动 sRGB + repeat 可后续设置） */
  U.tex = function (w, h, draw, opt) {
    var c = U.canvas(w, h);
    var ctx = c.getContext('2d');
    draw(ctx, w, h);
    var t = new T.CanvasTexture(c);
    t.anisotropy = 8;
    if (!opt || opt.srgb !== false) t.encoding = T.sRGBEncoding;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    if (opt && opt.repeat) { t.repeat.set(opt.repeat[0], opt.repeat[1]); }
    t.needsUpdate = true;
    return t;
  };

  /**
   * 丝印/铭牌文字纹理
   * U.labelTex(['RTX 4090','24GB GDDR6X'], {w,h,size,color,bg,align,font,pad})
   */
  U.labelTex = function (lines, opt) {
    opt = opt || {};
    var w = opt.w || 512, h = opt.h || 128;
    var size = opt.size || Math.floor(h * 0.34);
    var color = opt.color || '#dfe9f5';
    var bg = opt.bg === undefined ? null : opt.bg;
    var font = opt.font || '600 ' + size + 'px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    var align = opt.align || 'left';
    var t = U.tex(w, h, function (ctx) {
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
      ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle';
      ctx.textAlign = align;
      var x = align === 'center' ? w / 2 : (align === 'right' ? w - 8 : 10);
      var arr = [].concat(lines);
      var lh = h / (arr.length + 0.2);
      for (var i = 0; i < arr.length; i++) {
        ctx.fillText(arr[i], x, lh * (i + 0.6));
      }
    });
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    return t;
  };

  /* ---------------- 数学 / 缓动 ---------------- */
  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.deg = function (d) { return d * Math.PI / 180; };
  U.smoothstep = function (a, b, x) { var t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  U.ease = {
    linear: function (t) { return t; },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    outQuart: function (t) { return 1 - Math.pow(1 - t, 4); },
    outBack: function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    inOutQuint: function (t) { return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2; }
  };

  /** 确定性随机 */
  U.rng = function (seed) {
    var s = (seed === undefined ? 1 : seed) >>> 0;
    return function () {
      s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  /* ---------------- 释放 ---------------- */
  U.dispose = function (obj) {
    obj.traverse(function (o) {
      if (o.isMesh) {
        if (o.geometry && !o.geometry.__shared) { o.geometry.dispose(); }
        if (o.material) {
          var mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(function (m) { if (m && m.__owned) m.dispose(); });
        }
      }
    });
  };

  /* ---------------- 常用小构件 ---------------- */
  /** 螺丝：U.screw(size, mat) —— 朝 +Y 的十字螺钉 */
  U.screw = function (r, h, mat) {
    var g = U.group();
    g.add(U.mesh(U.cyl(r, r, h, 14), mat || PC3D.materials.get('chrome'), { p: [0, h / 2, 0] }));
    var a = U.mesh(U.box(r * 1.5, h * 0.35, r * 0.32), PC3D.materials.get('matteBlack'), { p: [0, h + 0.001, 0] });
    var b = U.mesh(U.box(r * 0.32, h * 0.35, r * 1.5), PC3D.materials.get('matteBlack'), { p: [0, h + 0.001, 0] });
    g.add(a, b);
    return g;
  };

  /** 文字贴片（铭牌/丝印）：返回 Mesh，默认尺寸 w x h，朝 +Z */
  U.label = function (lines, w, h, opt) {
    opt = opt || {};
    var tex = U.labelTex(lines, { w: Math.max(64, Math.round(w * 1600)), h: Math.max(32, Math.round(h * 1600)), size: opt.size, color: opt.color, bg: opt.bg, align: opt.align });
    var m = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    m.__owned = true;
    var mesh = new T.Mesh(U.plane(w, h), m);
    mesh.userData.noPick = true;
    return mesh;
  };

  /** 发光条：加法混合的薄片 */
  U.glowBar = function (w, h, color, intensity) {
    var m = new T.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
    m.__owned = true;
    var mesh = new T.Mesh(U.plane(w, h), m);
    mesh.userData.glow = true;
    mesh.userData.noPick = true;
    mesh.userData.baseOpacity = 0.9;
    return mesh;
  };

  /** 让一组网格使用共享几何的实例化辅助（可选） */
  U.instances = function (geo, mat, count) {
    var m = new T.InstancedMesh(geo, mat, count);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  };

  /* ---------------- 部件注册表 ---------------- */
  PC3D.parts = PC3D.parts || {};
  PC3D.parts.builders = PC3D.parts.builders || {};
  PC3D.parts.register = function (id, builder) {
    PC3D.parts.builders[id] = builder;
  };

  window.__U = U;
})();