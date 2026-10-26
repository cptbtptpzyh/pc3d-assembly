/* ============================================================
 * parts-core.js — 部件建模 A（builder-core 维护）
 * case / motherboard / cpu / cooler / fans
 * 依赖：THREE(r147 UMD)、PC3D.util、PC3D.materials、PC3D.config
 * 仅通过 PC3D.parts.register 注册，不新增全局；ES2018 + IIFE。
 * ========================================================== */
(function () {
  'use strict';

  var PC3D = (window.PC3D = window.PC3D || {});
  var T = THREE;
  var U = PC3D.util;
  var M = PC3D.materials;

  /* ================= 局部工具（不挂全局） ================= */

  function mt(name, over) { return over ? M.clone(name, over) : M.get(name); }

  function geo(w, h, d, r, seg) {
    return U.rbox(w, h, d, r === undefined ? 0.004 : r, seg || 1);
  }

  /** 实例化：list 项为 [x,y,z] 或 [x,y,z,rx,ry,rz] 或 {p,r,s} */
  function inst(g, material, list, opt) {
    if (!list || !list.length) return null;
    var im = new T.InstancedMesh(g, material, list.length);
    var d = new T.Object3D();
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      var p = it.p || it;
      d.position.set(p[0], p[1], p[2]);
      if (it.r) d.rotation.set(it.r[0], it.r[1], it.r[2]);
      else if (p.length > 3) d.rotation.set(p[3] || 0, p[4] || 0, p[5] || 0);
      else d.rotation.set(0, 0, 0);
      if (it.s) { if (typeof it.s === 'number') d.scale.setScalar(it.s); else d.scale.set(it.s[0], it.s[1], it.s[2]); }
      else d.scale.set(1, 1, 1);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    var sh = !(opt && opt.noShadow);
    im.castShadow = sh; im.receiveShadow = sh;
    return im;
  }

  /** 文字贴片，默认朝 +Z；rot 传 [0,-PI/2,0] 朝 -X */
  function txt(lines, w, h, p, rot, opt) {
    var m = U.label(lines, w, h, opt || {});
    m.position.set(p[0], p[1], p[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    return m;
  }

  /** 圆柱/圆环轴向 -> 旋转（U.cyl 默认轴 Y） */
  function rotForAxis(axis) {
    return axis === 'z' ? [Math.PI / 2, 0, 0] : axis === 'y' ? [0, 0, 0] : [0, 0, Math.PI / 2];
  }

  /** 面板网孔材质（蜂窝 / 冲孔） */
  function ventMat(kind, color) {
    return M.clone('mesh', {
      color: color === undefined ? 0x0a0c10 : color,
      alphaMap: kind === 'mesh' ? M.tex.mesh : M.tex.honeycomb,
      transparent: false, alphaTest: 0.45, side: T.DoubleSide,
      metalness: 0.62, roughness: 0.46
    });
  }

  /* ============================================================
   * 机箱
   * ========================================================== */
  function buildCase(ctx, comp, variant) {
    var i, j, k, c;  /* 循环变量统一提升，避免严格模式下未声明 */
    var P = variant.params || {};
    var W = P.w || 1.0, H = P.h || 1.96, D = P.d || 1.16;
    var hx = W / 2, hy = H / 2, hz = D / 2;
    var theme = PC3D.config.theme;
    var bodyColor = P.color === undefined ? 0x15181d : P.color;
    var frontStyle = P.frontStyle || 'mesh';

    var steel = M.clone('steel', { color: bodyColor, metalness: 0.62, roughness: 0.5, map: M.tex.brushed, envMapIntensity: 1.0 });
    var steelInner = M.clone('steel', { color: 0x0b0d11, metalness: 0.5, roughness: 0.66 });
    var alu = M.clone('aluminum', { color: 0x9aa3ad, metalness: 0.92, roughness: 0.26, map: M.tex.brushed });
    var vent = ventMat(frontStyle === 'honeycomb' ? 'honey' : 'mesh', 0x0a0c10);
    var ventTop = ventMat('honey', 0x080a0d);
    var rubber = M.clone('rubber', { color: 0x0a0b0d });
    var dark = M.clone('matteBlack', { color: 0x07080a, roughness: 0.7 });

    var g = new T.Group();
    g.userData.partId = 'case';
    g.userData.subExplode = [];

    /* ---------- 底盘 / 顶盖 ---------- */
    g.add(U.mesh(geo(W - 0.008, 0.022, D - 0.008, 0.006, 1), steel, { p: [0, -hy + 0.011, 0] }));

    g.add(U.mesh(geo(W - 0.008, 0.018, D - 0.008, 0.005, 1), steel, { p: [0, hy - 0.009, 0] }));
    g.add(U.mesh(U.box(W - 0.20, 0.004, D - 0.16), dark, { p: [0, hy - 0.017, 0] }));
    g.add(U.mesh(U.plane(W - 0.20, D - 0.16), ventTop, { p: [0, hy - 0.0005, 0], r: [-Math.PI / 2, 0, 0], noShadow: true }));
    var trims = [], i, k;
    for (i = 0; i < 2; i++) trims.push([(i ? 1 : -1) * (W * 0.5 - 0.055), hy + 0.001, 0]);
    g.add(inst(geo(0.03, 0.012, D - 0.05, 0.004, 1), alu, trims));
    g.add(U.mesh(geo(W - 0.14, 0.012, 0.024, 0.004, 1), alu, { p: [0, hy + 0.001, hz - 0.09] }));
    g.add(U.mesh(geo(W - 0.14, 0.012, 0.024, 0.004, 1), alu, { p: [0, hy + 0.001, -hz + 0.07] }));
    g.add(inst(U.cyl(0.012, 0.012, 0.012, 12), mt('chrome'),
      [[-(hx - 0.09), hy + 0.004, -hz + 0.055], [hx - 0.09, hy + 0.004, -hz + 0.055]]));

    /* ---------- 右侧板（藏线侧） ---------- */
    g.add(U.mesh(geo(0.018, H - 0.026, D - 0.03, 0.006, 2), steel, { p: [hx - 0.009, 0, 0] }));
    var ribs = [];
    for (i = 0; i < 3; i++) ribs.push([hx - 0.018, (i - 1) * 0.52, 0]);
    g.add(inst(geo(0.006, 0.30, D - 0.16, 0.003, 1), steelInner, ribs));
    var sideScrews = [];
    for (i = 0; i < 2; i++) sideScrews.push([hx - 0.004, (i ? 1 : -1) * 0.86, -hz + 0.05, 0, 0, -Math.PI / 2]);
    g.add(inst(U.cyl(0.019, 0.019, 0.016, 12), mt('chrome'), sideScrews));
    g.add(inst(U.cyl(0.023, 0.023, 0.006, 14), mt('matteBlack'), sideScrews.map(function (p) {
      return [p[0] + 0.008, p[1], p[2], 0, 0, -Math.PI / 2];
    })));

    /* ---------- 背板 ---------- */
    var bz = -hz + 0.009;
    g.add(U.mesh(geo(W - 0.02, H - 0.026, 0.018, 0.006, 1), steel, { p: [0, 0, bz] }));
    g.add(U.mesh(U.cyl(0.145, 0.145, 0.004, 36), ventTop, { p: [0.20, 0.36, bz - 0.010], r: [Math.PI / 2, 0, 0], noShadow: true }));
    g.add(U.mesh(U.torus(0.147, 0.009, 6, 30), mt('chrome'), { p: [0.20, 0.36, bz - 0.012] }));
    var fanScr = [];
    for (i = 0; i < 4; i++) {
      var a = Math.PI / 4 + i * Math.PI / 2;
      fanScr.push([0.20 + Math.cos(a) * 0.163, 0.36 + Math.sin(a) * 0.163, bz - 0.014]);
    }
    g.add(inst(U.cyl(0.009, 0.009, 0.006, 10), mt('chrome'), fanScr, { noShadow: true }));
    g.add(U.mesh(geo(0.24, 0.20, 0.008, 0.004, 1), mt('aluminumDark'), { p: [0.30, 0.35, bz - 0.008] }));
    var ioPorts = [];
    for (i = 0; i < 8; i++) ioPorts.push([0.215 + (i % 4) * 0.055, 0.405 - Math.floor(i / 4) * 0.055, bz - 0.014]);
    g.add(inst(geo(0.036, 0.03, 0.014, 0.002, 1), dark, ioPorts, { noShadow: true }));
    var ioPorts2 = [];
    for (i = 0; i < 6; i++) ioPorts2.push([0.225 + i * 0.032, 0.288, bz - 0.015]);
    g.add(inst(geo(0.018, 0.022, 0.014, 0.002, 1), dark, ioPorts2, { noShadow: true }));
    var covers = [], coverSlots = [], coverScrews = [];
    for (i = 0; i < 7; i++) {
      var yy = -0.13 - i * 0.078;
      covers.push([0.10, yy, bz - 0.008]);
      for (k = 0; k < 4; k++) coverSlots.push([-0.01 + k * 0.055, yy, bz - 0.014]);
      coverScrews.push([0.30, yy, bz - 0.014]);
    }
    g.add(inst(geo(0.34, 0.052, 0.010, 0.003, 1), mt('aluminumDark'), covers));
    g.add(inst(U.box(0.03, 0.026, 0.006), dark, coverSlots, { noShadow: true }));
    g.add(inst(U.cyl(0.010, 0.010, 0.007, 10), mt('chrome'), coverScrews, { noShadow: true }));
    g.add(U.mesh(geo(0.40, 0.26, 0.008, 0.004, 1), mt('aluminumDark'), { p: [0.10, -0.79, bz - 0.008] }));
    g.add(U.mesh(U.plane(0.34, 0.20), ventTop, { p: [0.10, -0.79, bz - 0.013], noShadow: true }));
    var psuScr = [];
    for (i = 0; i < 4; i++) psuScr.push([0.10 + (i % 2 ? 0.185 : -0.185), -0.79 + (i > 1 ? 0.115 : -0.115), bz - 0.014]);
    g.add(inst(U.cyl(0.010, 0.010, 0.007, 10), mt('chrome'), psuScr, { noShadow: true }));
    g.add(txt([(variant.brand || 'PC') + '  ·  ' + (variant.short || '')], 0.20, 0.024,
      [0.10, -0.905, bz - 0.016], [0, Math.PI, 0], { color: '#aab6c4', align: 'center', size: 30 }));

    /* ---------- 左侧钢化玻璃 ---------- */
    var glassPanel = new T.Group();
    glassPanel.userData.glass = true;
    glassPanel.add(U.mesh(geo(0.012, H - 0.075, D - 0.075, 0.004, 2), mt('glass'), { p: [-hx + 0.011, 0.012, 0], noShadow: true }));
    var gx = -hx + 0.006;
    glassPanel.add(U.mesh(geo(0.026, 0.024, D - 0.05, 0.005, 1), alu, { p: [gx, hy - 0.055, 0] }));
    glassPanel.add(U.mesh(geo(0.026, 0.024, D - 0.05, 0.005, 1), alu, { p: [gx, -hy + 0.05, 0] }));
    glassPanel.add(U.mesh(geo(0.026, H - 0.06, 0.024, 0.005, 1), alu, { p: [gx, 0, hz - 0.045] }));
    glassPanel.add(U.mesh(geo(0.026, H - 0.06, 0.024, 0.005, 1), alu, { p: [gx, 0, -hz + 0.045] }));
    var gs = [];
    for (i = 0; i < 4; i++) gs.push([gx - 0.014, (i < 2 ? 1 : -1) * (hy - 0.055), (i % 2 ? 1 : -1) * (hz - 0.045), 0, 0, -Math.PI / 2]);
    glassPanel.add(inst(U.cyl(0.017, 0.019, 0.016, 12), mt('chrome'), gs));
    glassPanel.add(inst(U.box(0.028, 0.006, 0.017), mt('matteBlack'), gs.map(function (p) {
      return [p[0] - 0.004, p[1], p[2]];
    }), { noShadow: true }));
    g.add(glassPanel);
    g.userData.subExplode.push({ obj: glassPanel, dir: [-1, 0, 0], dist: 0.62 });

    /* ---------- 前面板 ---------- */
    var fp = new T.Group();
    fp.userData.frontPanel = true;
    var fz = hz - 0.016;
    var fH = H - 0.20;
    fp.add(U.mesh(geo(W - 0.016, 0.05, 0.03, 0.006, 1), steel, { p: [0, hy - 0.04, fz] }));
    fp.add(U.mesh(geo(W - 0.016, 0.10, 0.03, 0.006, 1), steel, { p: [0, -hy + 0.062, fz] }));
    fp.add(U.mesh(geo(0.044, H - 0.16, 0.03, 0.006, 1), steel, { p: [-hx + 0.024, 0.012, fz] }));
    fp.add(U.mesh(geo(0.044, H - 0.16, 0.03, 0.006, 1), steel, { p: [hx - 0.024, 0.012, fz] }));
    fp.add(U.mesh(geo(W - 0.10, fH, 0.006, 0.004, 1), dark, { p: [0, 0.012, hz - 0.062] }));
    fp.add(U.mesh(U.plane(W - 0.085, fH), vent, { p: [0, 0.012, hz - 0.030], noShadow: true }));
    var bars = [], barN = 7;
    for (i = 0; i < barN; i++) bars.push([(i / (barN - 1) - 0.5) * (W - 0.14), 0.012, hz - 0.038]);
    fp.add(inst(geo(0.008, fH - 0.02, 0.014, 0.003, 1), alu, bars));
    var ioY = hy - 0.04, ioZ = hz + 0.002;
    fp.add(U.mesh(U.cyl(0.03, 0.03, 0.016, 24), mt('glossBlack'), { p: [W * 0.28, ioY, ioZ], r: [Math.PI / 2, 0, 0] }));
    fp.add(U.mesh(U.torus(0.033, 0.0045, 6, 24), mt('ledCyan'), { p: [W * 0.28, ioY, ioZ + 0.008], noShadow: true, userData: { glow: true } }));
    fp.add(U.mesh(U.cyl(0.012, 0.012, 0.016, 14), mt('chrome'), { p: [W * 0.28, ioY, ioZ + 0.006], r: [Math.PI / 2, 0, 0], noShadow: true }));
    var usbA = [], usbC = [];
    for (i = 0; i < 2; i++) usbA.push([W * 0.05 + i * 0.052, ioY, ioZ]);
    usbC.push([W * 0.05 + 0.128, ioY, ioZ]);
    fp.add(inst(geo(0.034, 0.014, 0.012, 0.003, 1), dark, usbA, { noShadow: true }));
    fp.add(inst(geo(0.024, 0.009, 0.012, 0.003, 1), dark, usbC, { noShadow: true }));
    fp.add(U.mesh(U.cyl(0.009, 0.009, 0.012, 12), dark, { p: [W * 0.05 + 0.185, ioY, ioZ], r: [Math.PI / 2, 0, 0], noShadow: true }));
    fp.add(U.mesh(U.sphere(0.005, 8, 6), mt('ledCyan'), { p: [W * 0.05 + 0.235, ioY, ioZ + 0.004], noShadow: true, userData: { glow: true } }));
    fp.add(txt([variant.brand || 'PC', variant.short || ''], 0.20, 0.042,
      [-hx + 0.20, -hy + 0.062, hz + 0.003], null, { color: '#cfd9e6', align: 'left', size: 34 }));
    var strip = U.glowBar(0.010, fH * 0.86, theme.accent);
    strip.position.set(-hx + 0.052, 0.012, hz - 0.043);
    fp.add(strip);
    g.add(fp);
    g.userData.subExplode.push({ obj: fp, dir: [0, 0, 1], dist: 0.42 });

    /* ---------- 脚垫 ---------- */
    var feet = P.feet === 3
      ? [[-0.36, 0.40], [0.36, 0.40], [0, -0.42]]
      : [[-0.36, 0.42], [0.36, 0.42], [-0.36, -0.42], [0.36, -0.42]];
    for (i = 0; i < feet.length; i++) {
      g.add(U.mesh(U.cyl(0.045, 0.05, 0.028, 16), rubber, { p: [feet[i][0] * (W / 1.0), -hy - 0.014, feet[i][1] * (D / 1.16)] }));
      g.add(U.mesh(U.cyl(0.032, 0.032, 0.012, 14), mt('aluminumDark'), { p: [feet[i][0] * (W / 1.0), -hy - 0.001, feet[i][1] * (D / 1.16)] }));
    }

    /* ---------- 主板托架 + 走线孔 + 铜柱 ---------- */
    var trayX = hx - 0.05;
    g.add(U.mesh(geo(0.016, H - 0.30, D - 0.26, 0.006, 1), steelInner, { p: [trayX, 0.03, 0] }));
    var gromY = [0.42, 0.03, -0.36];
    for (i = 0; i < gromY.length; i++) {
      g.add(U.mesh(geo(0.020, 0.20, 0.115, 0.028, 2), rubber, { p: [trayX - 0.008, gromY[i], 0.30] }));
      g.add(U.mesh(geo(0.010, 0.165, 0.082, 0.022, 2), dark, { p: [trayX - 0.016, gromY[i], 0.30] }));
    }
    var standPos = [];
    for (i = 0; i < 3; i++) for (k = 0; k < 3; k++) standPos.push([trayX - 0.075, -0.16 + k * 0.26, -0.24 + i * 0.24]);
    g.add(inst(U.cyl(0.014, 0.014, 0.15, 8), mt('gold'), standPos, { noShadow: true }));

    /* ---------- 电源仓上盖 ---------- */
    g.add(U.mesh(geo(0.62, 0.016, D - 0.10, 0.005, 1), steel, { p: [0.13, -0.63, 0] }));
    g.add(U.mesh(U.plane(0.26, D - 0.32), ventTop, { p: [0.30, -0.621, 0], r: [-Math.PI / 2, 0, 0], noShadow: true }));
    g.add(txt(['POWER  SHROUD'], 0.22, 0.022, [-0.06, -0.6205, 0.22], [-Math.PI / 2, 0, -Math.PI / 2],
      { color: '#7d8794', align: 'left', size: 26 }));
    g.add(U.mesh(geo(0.016, 0.34, D - 0.10, 0.005, 1), steelInner, { p: [-0.185, -0.80, 0] }));

    /* ---------- 显卡支撑架 ---------- */
    g.add(U.mesh(geo(0.052, 0.30, 0.028, 0.006, 1), alu, { p: [-0.09, -0.47, 0.40] }));
    g.add(U.mesh(geo(0.075, 0.018, 0.11, 0.006, 1), rubber, { p: [-0.09, -0.315, 0.40] }));
    g.add(U.mesh(geo(0.075, 0.018, 0.06, 0.005, 1), alu, { p: [-0.09, -0.632, 0.40] }));

    /* ---------- 结构立柱（variant pillar） ---------- */
    if (P.pillar) {
      g.add(U.mesh(geo(0.030, H - 0.04, 0.030, 0.006, 1), alu, { p: [-hx + 0.035, 0, hz - 0.035] }));
      g.add(U.mesh(geo(0.030, H - 0.04, 0.030, 0.006, 1), alu, { p: [-hx + 0.035, 0, -hz + 0.035] }));
      g.add(U.mesh(geo(0.030, H - 0.04, 0.030, 0.006, 1), alu, { p: [hx - 0.035, 0, hz - 0.035] }));
    }

    /* ---------- 内部氛围灯条 ---------- */
    var gl = U.glowBar(0.012, H * 0.42, theme.accent);
    gl.position.set(-hx + 0.045, 0.42, -hz + 0.05);
    gl.rotation.y = Math.PI / 2;
    g.add(gl);

    g.userData.anchor = new T.Vector3(-0.05, hy - 0.10, hz * 0.55);
    return g;
  }

  if (PC3D.parts && PC3D.parts.register) PC3D.parts.register('case', buildCase);
  /* ============================================================
   * 主板
   * ========================================================== */
  var _boardArtCache = Object.create(null);

  /** 主板丝印/走线贴图：画布坐标 (0,0)=(-Z,+Y) 角 */
  function boardArt(brand, chipset, socket, color, BW, BH, key) {
    if (_boardArtCache[key]) return _boardArtCache[key];
    var W = 1024, H = 1024;
    var t = U.tex(W, H, function (ctx) {
      var c = new T.Color(color);
      var base = '#' + c.getHexString();
      ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
      function bp(z, y) { return [(z + BW / 2) / BW * W, (BH / 2 - y) / BH * H]; }
      var rnd = U.rng(37);
      // 走线：成组的平行细线
      ctx.lineCap = 'round';
      for (var i = 0; i < 120; i++) {
        var x0 = rnd() * W, y0 = rnd() * H;
        ctx.strokeStyle = rnd() > 0.45 ? 'rgba(196,168,86,0.16)' : 'rgba(120,160,190,0.12)';
        ctx.lineWidth = 1 + rnd() * 1.4;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        var x = x0, y = y0;
        for (var k = 0; k < 4; k++) {
          if (rnd() > 0.5) x += (rnd() - 0.5) * 210; else y += (rnd() - 0.5) * 210;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // 过孔 / 焊盘
      for (i = 0; i < 300; i++) {
        ctx.fillStyle = rnd() > 0.5 ? 'rgba(214,169,74,0.5)' : 'rgba(150,165,180,0.35)';
        var s = 1.2 + rnd() * 2.6;
        ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, s, 0, Math.PI * 2); ctx.fill();
      }
      // 主要丝印标签
      function label(z, y, text, size, color2, align, rot) {
        var p = bp(z, y);
        ctx.save(); ctx.translate(p[0], p[1]); if (rot) ctx.rotate(rot);
        ctx.font = '600 ' + size + 'px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = color2 || 'rgba(214,224,236,0.62)';
        ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, 0); ctx.restore();
      }
      label(-0.30, 0.285, 'DIMM A1', 22, 'rgba(220,230,240,0.55)');
      label(-0.30, 0.23, 'DIMM A2', 22, 'rgba(220,230,240,0.55)');
      label(-0.30, 0.175, 'DIMM B1', 22, 'rgba(220,230,240,0.55)');
      label(-0.30, 0.12, 'DIMM B2', 22, 'rgba(220,230,240,0.55)');
      label(0.13, 0.275, 'CPU_FAN', 20, 'rgba(235,240,245,0.7)');
      label(0.13, 0.245, 'AIO_PUMP', 18, 'rgba(235,240,245,0.5)');
      label(0.285, -0.20, 'SATA6G_1-4', 20, 'rgba(235,240,245,0.6)', 'right');
      label(0.30, 0.05, 'ATX_24PIN', 20, 'rgba(235,240,245,0.6)', 'right', Math.PI / 2);
      label(0.30, -0.24, 'F_PANEL', 18, 'rgba(235,240,245,0.55)', 'right');
      label(0.02, -0.235, 'PCIEX16_1  PCIe 5.0', 24, 'rgba(225,235,245,0.72)');
      label(0.02, -0.30, 'PCIEX16_2', 22, 'rgba(225,235,245,0.55)');
      label(-0.30, 0.30, 'R  OG  ' + chipset, 40, 'rgba(240,245,250,0.85)');
      label(-0.155, 0.30, brand.toUpperCase() + '  ' + socket, 34, 'rgba(240,245,250,0.65)');
      label(0.245, -0.02, 'M.2_1', 20, 'rgba(235,240,245,0.55)', 'left', Math.PI / 2);
      // 板边金色测试点
      for (i = 0; i < 26; i++) {
        ctx.fillStyle = 'rgba(214,169,74,0.55)';
        ctx.fillRect(12 + i * 38, H - 26, 16, 10);
      }
      // 螺丝孔哑光圈
      var holes = [[-0.24, 0.26], [0.06, 0.26], [0.24, 0.16], [0.24, -0.10], [0.24, -0.26], [-0.24, -0.26], [-0.24, 0.0], [0.04, -0.26], [-0.05, 0.26]];
      for (i = 0; i < holes.length; i++) {
        var hp = bp(holes[i][0], holes[i][1]);
        ctx.beginPath(); ctx.arc(hp[0], hp[1], 17, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
        ctx.beginPath(); ctx.arc(hp[0], hp[1], 11, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(200,210,220,0.35)'; ctx.fill();
      }
    });
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    _boardArtCache[key] = t;
    return t;
  }

  function buildMotherboard(ctx, comp, variant) {
    var i, j, k, c;  /* 循环变量统一提升，避免严格模式下未声明 */
    var P = variant.params || {};
    var form = P.form || 'ATX';
    var BH = 0.60;                        // Y（板高）
    var BW = form === 'MATX' ? 0.52 : 0.62; // Z（板宽）
    var TH = 0.03;                        // X（板厚）
    var fx = -TH / 2;                     // 元件朝 -X 的板面
    var brand = P.brand || 'pc';
    var socket = P.socket || 'AM5';
    var chipset = P.chipset || 'B650E';
    var pcbColor = P.color === undefined ? 0x1a1d22 : P.color;
    var theme = PC3D.config.theme;

    // 供电相数：从 specs 里解析 "16+2+2 相"，失败则回退 18
    var phases = 18;
    try {
      for (var si = 0; si < (variant.specs || []).length; si++) {
        var mm = /(\d+)\s*\+\s*(\d+)\s*\+\s*(\d+)/.exec(variant.specs[si].v || '');
        if (mm) { phases = +mm[1] + +mm[2] + +mm[3]; break; }
      }
    } catch (e) { phases = 18; }

    var pcb = M.clone('pcbBlack', { color: pcbColor, map: null, roughness: 0.52, metalness: 0.28 });
    var artTex = boardArt(brand, chipset, socket, pcbColor, BW, BH, brand + chipset + socket + BW + pcbColor);
    var art = new T.MeshStandardMaterial({ map: artTex, roughness: 0.5, metalness: 0.3, color: 0xffffff });
    art.__owned = true;
    var plastic = M.clone('blackPlastic', { color: 0x12151a, roughness: 0.5, metalness: 0.18 });
    var plastic2 = M.clone('greyPlastic', { color: 0x232830, roughness: 0.46, metalness: 0.4 });
    var shield = M.clone('steel', { color: 0x9fa8b4, metalness: 0.95, roughness: 0.32, envMapIntensity: 1.25 });
    var shieldDark = M.clone('aluminumDark', { color: 0x2a3038, metalness: 0.85, roughness: 0.42 });
    var metal = mt('nickel');
    var gold = mt('gold');
    var cer = mt('ceramic');
    var accentCol = brand === 'rog' ? 0xff3b5c : (brand === 'msi' ? 0xff4d4d : 0xff9a3c);
    var accent = M.clone('rubber', { color: accentCol, roughness: 0.55, metalness: 0.2 });

    var g = new T.Group();
    g.userData.partId = 'motherboard';

    /* ---------- PCB ---------- */
    g.add(U.mesh(geo(TH, BH, BW, 0.006, 1), pcb, {}));
    var artPlane = U.mesh(U.plane(BW, BH), art, { p: [fx - 0.0012, 0, 0], r: [0, -Math.PI / 2, 0], noShadow: true });
    g.add(artPlane);
    // 板层侧面（露出铜层）
    g.add(U.mesh(geo(0.002, BH - 0.004, BW - 0.004, 0.001, 1), M.clone('copper', { color: 0x8a6a3a, roughness: 0.6 }), { p: [0.008, 0, 0], noShadow: true }));

    /* ---------- 固定螺丝（9 孔） ---------- */
    var holePos = [[-0.24, 0.26], [0.06, 0.26], [0.24, 0.16], [0.24, -0.10], [0.24, -0.26],
      [-0.24, -0.26], [-0.24, 0.0], [0.04, -0.26], [-0.05, 0.26]];
    var screws = [], rings = [];
    for (var i = 0; i < holePos.length; i++) {
      screws.push([fx - 0.004, holePos[i][1], holePos[i][0], 0, 0, Math.PI / 2]);
      rings.push([fx - 0.002, holePos[i][1], holePos[i][0], 0, 0, Math.PI / 2]);
    }
    g.add(inst(U.cyl(0.014, 0.014, 0.008, 12), metal, screws, { noShadow: true }));
    g.add(inst(U.torus(0.013, 0.004, 6, 14), mt('chrome'), rings, { noShadow: true }));

    /* ---------- CPU 插槽 ---------- */
    var sy = 0.20, sz = 0.0;
    g.add(U.mesh(geo(0.014, 0.17, 0.17, 0.004, 1), plastic, { p: [fx - 0.006, sy, sz] }));
    if (socket === 'AM5' || socket === 'AM4') {
      // AM5：黑色塑料框 + 压杆（-Z 侧）+ 四角螺丝
      g.add(U.mesh(geo(0.016, 0.185, 0.012, 0.004, 1), plastic2, { p: [fx - 0.008, sy, sz - 0.092] }));
      g.add(U.mesh(geo(0.016, 0.185, 0.012, 0.004, 1), plastic2, { p: [fx - 0.008, sy, sz + 0.092] }));
      g.add(U.mesh(geo(0.016, 0.012, 0.185, 0.004, 1), plastic2, { p: [fx - 0.008, sy - 0.092, sz] }));
      g.add(U.mesh(geo(0.016, 0.012, 0.185, 0.004, 1), plastic2, { p: [fx - 0.008, sy + 0.092, sz] }));
      // 压杆
      g.add(U.mesh(U.cyl(0.007, 0.007, 0.20, 10), metal, { p: [fx - 0.020, sy + 0.088, sz + 0.02], r: [Math.PI / 2, 0, 0] }));
      g.add(U.mesh(geo(0.010, 0.020, 0.05, 0.003, 1), metal, { p: [fx - 0.020, sy + 0.088, sz - 0.10], userData: {} }));
      g.add(txt(['AM5'], 0.06, 0.016, [fx - 0.0165, sy - 0.108, sz], [0, -Math.PI / 2, 0],
        { color: '#cfd9e6', align: 'center', size: 42 }));
    } else {
      // LGA1700：金属压板 + 双压杆
      g.add(U.mesh(geo(0.012, 0.20, 0.20, 0.003, 1), mt('aluminumDark'), { p: [fx - 0.009, sy, sz] }));
      g.add(U.mesh(geo(0.016, 0.135, 0.135, 0.002, 1), plastic, { p: [fx - 0.013, sy, sz] }));
      g.add(U.mesh(U.cyl(0.0065, 0.0065, 0.23, 10), metal, { p: [fx - 0.020, sy + 0.098, sz], r: [0, 0, Math.PI / 2] }));
      g.add(U.mesh(U.cyl(0.0065, 0.0065, 0.23, 10), metal, { p: [fx - 0.020, sy - 0.098, sz], r: [0, 0, Math.PI / 2] }));
      var plateScr = [];
      for (var c = 0; c < 4; c++) {
        plateScr.push([fx - 0.020, sy + (c < 2 ? 0.098 : -0.098), sz + (c % 2 ? 0.098 : -0.098), 0, 0, Math.PI / 2]);
      }
      g.add(inst(U.cyl(0.008, 0.008, 0.006, 10), mt('chrome'), plateScr, { noShadow: true }));
      g.add(txt(['LGA1700'], 0.09, 0.016, [fx - 0.0165, sy - 0.118, sz], [0, -Math.PI / 2, 0],
        { color: '#cfd9e6', align: 'center', size: 34 }));
    }

    /* ---------- 内存插槽 ×4 ---------- */
    var dimmZ = [-0.288, -0.216, -0.144, -0.072];
    var dimmY = 0.155, dimmL = 0.285;
    var dBody = [], dLatch = [], dPin = [];
    for (i = 0; i < 4; i++) {
      var z0 = dimmZ[i];
      dBody.push([fx - 0.014, dimmY, z0]);
      dLatch.push([fx - 0.016, dimmY + dimmL / 2 + 0.008, z0]);
      dLatch.push([fx - 0.016, dimmY - dimmL / 2 - 0.008, z0]);
      for (var pj = 0; pj < 10; pj++) dPin.push([fx - 0.020, dimmY - 0.12 + pj * 0.027, z0]);
    }
    g.add(inst(geo(0.024, dimmL, 0.022, 0.004, 1), plastic, dBody));
    g.add(inst(geo(0.022, 0.020, 0.026, 0.004, 1), plastic2, dLatch));
    g.add(inst(U.box(0.004, 0.012, 0.012), gold, dPin, { noShadow: true }));

    /* ---------- VRM 供电散热片 ---------- */
    if (P.vrmHeatsink !== false) {
      var vrmT = U.mesh(geo(0.05, 0.075, 0.26, 0.008, 1), shieldDark, { p: [fx - 0.036, 0.259, 0.09] });
      g.add(vrmT);
      var finsT = [];
      for (i = 0; i < 11; i++) finsT.push([fx - 0.062, 0.259, -0.02 + i * 0.022]);
      g.add(inst(geo(0.014, 0.062, 0.006, 0.002, 1), shield, finsT));
      g.add(U.mesh(geo(0.006, 0.05, 0.24, 0.003, 1), accent, { p: [fx - 0.052, 0.29, 0.09], noShadow: true }));

      var vrmS = U.mesh(geo(0.05, 0.21, 0.072, 0.008, 1), shieldDark, { p: [fx - 0.036, 0.10, 0.163] });
      g.add(vrmS);
      var finsS = [];
      for (i = 0; i < 9; i++) finsS.push([fx - 0.062, 0.02 + i * 0.021, 0.163]);
      g.add(inst(geo(0.014, 0.006, 0.058, 0.002, 1), shield, finsS));
      g.add(txt([brand === 'rog' ? 'ROG' : brand.toUpperCase(), 'VRM ' + phases + ' PHASE'], 0.11, 0.028,
        [fx - 0.065, 0.10, 0.163], [0, -Math.PI / 2, 0], { color: '#e8eef5', align: 'center', size: 30 }));
    }

    /* ---------- 后置 I/O 装甲 ---------- */
    if (P.ioShield !== false) {
      g.add(U.mesh(geo(0.066, 0.245, 0.085, 0.010, 1), shieldDark, { p: [fx - 0.040, 0.175, -0.268] }));
      g.add(U.mesh(geo(0.010, 0.20, 0.062, 0.006, 1), M.clone('glossBlack', { color: 0x0a0c10 }), { p: [fx - 0.072, 0.175, -0.268] }));
      // 品牌灯带
      g.add(U.mesh(geo(0.004, 0.085, 0.012, 0.002, 1), accent, { p: [fx - 0.0765, 0.20, -0.268], noShadow: true }));
      var ledStrip = U.glowBar(0.055, 0.006, theme.accent);
      ledStrip.position.set(fx - 0.0768, 0.115, -0.268);
      ledStrip.rotation.y = -Math.PI / 2;
      ledStrip.rotation.z = Math.PI / 2;
      g.add(ledStrip);
      g.add(txt([brand.toUpperCase(), chipset], 0.10, 0.03, [fx - 0.0735, 0.245, -0.268], [0, -Math.PI / 2, 0],
        { color: '#eaf2fa', align: 'center', size: 36 }));
      // 后置 I/O 端口
      var ioP = [];
      for (i = 0; i < 10; i++) ioP.push([fx - 0.074, 0.24 - Math.floor(i / 5) * 0.038, -0.235 + (i % 5) * 0.016]);
      g.add(inst(geo(0.014, 0.026, 0.012, 0.002, 1), mt('steel'), ioP, { noShadow: true }));
    }

    /* ---------- 芯片组散热片 ---------- */
    g.add(U.mesh(geo(0.03, 0.135, 0.135, 0.008, 1), shieldDark, { p: [fx - 0.024, -0.10, -0.19] }));
    var csGrooves = [];
    for (i = 0; i < 7; i++) csGrooves.push([fx - 0.040, -0.16 + i * 0.018, -0.19]);
    g.add(inst(geo(0.008, 0.005, 0.12, 0.002, 1), shield, csGrooves));
    g.add(txt([chipset, 'CHIPSET'], 0.085, 0.024, [fx - 0.0405, -0.10, -0.19], [0, -Math.PI / 2, 0],
      { color: '#dfe9f5', align: 'center', size: 34 }));
    var csGlow = U.glowBar(0.10, 0.008, accentCol);
    csGlow.position.set(fx - 0.0408, -0.035, -0.19);
    csGlow.rotation.y = -Math.PI / 2;
    csGlow.rotation.z = Math.PI / 2;
    g.add(csGlow);

    /* ---------- M.2 散热片 ---------- */
    var m2Count = Math.min(P.m2 === undefined ? 3 : P.m2, 3);
    var m2Y = [0.05, -0.02, -0.09];
    for (i = 0; i < m2Count; i++) {
      var my = m2Y[i];
      g.add(U.mesh(geo(0.020, 0.056, 0.24, 0.006, 1), shieldDark, { p: [fx - 0.024, my, 0.0] }));
      var mf = [];
      for (var k = 0; k < 12; k++) mf.push([fx - 0.038, my, -0.10 + k * 0.018]);
      g.add(inst(geo(0.006, 0.044, 0.007, 0.002, 1), shield, mf));
      g.add(U.mesh(U.cyl(0.010, 0.010, 0.006, 10), metal, { p: [fx - 0.036, my, 0.115], r: [0, 0, Math.PI / 2], noShadow: true }));
      g.add(txt(['M.2_' + (i + 1) + '  PCIe ' + (i === 0 ? '5.0' : '4.0')], 0.075, 0.014,
        [fx - 0.0385, my, -0.055], [0, -Math.PI / 2, 0], { color: '#c9d4e0', align: 'center', size: 26 }));
    }

    /* ---------- PCIe 插槽 ---------- */
    var pcieCount = P.pcie === 2 ? 2 : 3;
    var pcieDef = [
      { y: -0.155, len: 0.075, x16: false },
      { y: -0.22, len: 0.225, x16: true },
      { y: -0.285, len: 0.225, x16: true }
    ];
    for (i = 0; i < pcieCount; i++) {
      var pd = pcieDef[i];
      // 塑料本体
      g.add(U.mesh(geo(0.020, 0.026, pd.len, 0.003, 1), pd.x16 ? plastic2 : plastic, { p: [fx - 0.014, pd.y, 0.02] }));
      // 金属屏蔽壳
      g.add(U.mesh(geo(0.006, 0.034, pd.len + 0.012, 0.003, 1), shield, { p: [fx - 0.026, pd.y, 0.02] }));
      // 金手指触片
      var pins = [];
      var pinN = Math.round(pd.len / 0.012);
      for (var pi = 0; pi < pinN; pi++) pins.push([fx - 0.024, pd.y + 0.002, 0.02 - pd.len / 2 + 0.006 + pi * 0.012]);
      g.add(inst(U.box(0.004, 0.012, 0.005), gold, pins, { noShadow: true }));
      // 卡扣
      g.add(U.mesh(geo(0.018, 0.016, 0.014, 0.003, 1), plastic2, { p: [fx - 0.016, pd.y, 0.02 + pd.len / 2 + 0.006] }));
    }
    // PCIe 插槽前的贴片电容阵列
    var pcieCaps = [];
    for (i = 0; i < 8; i++) pcieCaps.push([fx - 0.020, -0.115 - (i % 2) * 0.012, -0.05 + i * 0.018]);
    g.add(inst(geo(0.008, 0.008, 0.010, 0.002, 1), cer, pcieCaps, { noShadow: true }));

    /* ---------- 24pin / 8pin 供电接口 ---------- */
    function conn(y, z, len, alongZ) {
      var w = alongZ ? len : 0.038, h = alongZ ? 0.038 : len;
      var grp = new T.Group();
      grp.add(U.mesh(geo(0.028, h, w, 0.004, 1), plastic, { p: [fx - 0.014, y, z] }));
      var holes = [];
      var n = Math.round(len / 0.013);
      for (var q = 0; q < n; q++) {
        for (var q2 = 0; q2 < 2; q2++) {
          holes.push(alongZ
            ? [fx - 0.030, y - 0.008 + q2 * 0.016, z - len / 2 + 0.007 + q * 0.013]
            : [fx - 0.030, y - len / 2 + 0.007 + q * 0.013, z - 0.008 + q2 * 0.016]);
        }
      }
      grp.add(inst(U.box(0.006, 0.008, 0.008), gold, holes, { noShadow: true }));
      return grp;
    }
    g.add(conn(0.08, 0.243, 0.115, false));   // 24pin（竖向）
    g.add(conn(0.284, 0.19, 0.075, true));    // EPS 8pin ×1
    g.add(conn(0.284, 0.10, 0.075, true));    // EPS 8pin ×2
    g.add(txt(['24PIN'], 0.05, 0.012, [fx - 0.017, 0.075, 0.222], [0, -Math.PI / 2, 0], { color: '#b9c6d4', align: 'center', size: 26 }));
    g.add(txt(['CPU_PWR'], 0.055, 0.012, [fx - 0.017, 0.268, 0.145], [0, -Math.PI / 2, 0], { color: '#b9c6d4', align: 'center', size: 26 }));

    /* ---------- SATA 接口 ---------- */
    var sata = [];
    for (i = 0; i < 4; i++) sata.push([fx - 0.014, -0.20 + i * 0.05, 0.286]);
    g.add(inst(geo(0.026, 0.036, 0.030, 0.003, 1), plastic, sata));
    var sataPin = [];
    for (i = 0; i < 4; i++) sataPin.push([fx - 0.030, -0.20 + i * 0.05, 0.286]);
    g.add(inst(U.box(0.006, 0.020, 0.014), gold, sataPin, { noShadow: true }));

    /* ---------- 前置面板 / 风扇接口 ---------- */
    var headers = [
      [-0.285, 0.24], [-0.285, 0.15], [-0.285, 0.06],
      [0.14, -0.055], [0.14, -0.10], [-0.06, 0.285]
    ];
    g.add(inst(geo(0.024, 0.020, 0.032, 0.003, 1), plastic, headers));
    g.add(txt(['F_PANEL   USB   ARGB'], 0.10, 0.012, [fx - 0.017, -0.305, 0.16], [0, -Math.PI / 2, 0],
      { color: '#9fadbb', align: 'center', size: 24 }));

    /* ---------- CMOS 电池 ---------- */
    g.add(U.mesh(U.cyl(0.030, 0.030, 0.008, 20), mt('chrome'), { p: [fx - 0.018, -0.175, 0.16], r: [0, 0, Math.PI / 2] }));
    g.add(U.mesh(U.cyl(0.030, 0.030, 0.002, 20), M.clone('glossBlack', { color: 0x14202a }), { p: [fx - 0.024, -0.175, 0.16], r: [0, 0, Math.PI / 2], noShadow: true }));
    g.add(U.mesh(geo(0.012, 0.06, 0.05, 0.003, 1), plastic, { p: [fx - 0.012, -0.175, 0.212] }));

    /* ---------- 音频区（金色电容 + 屏蔽线） ---------- */
    var audioY = -0.255, audioZ = -0.16;
    g.add(U.mesh(geo(0.004, 0.10, 0.16, 0.002, 1), M.clone('gold', { color: 0x9a7b3a, roughness: 0.5 }), { p: [fx - 0.017, audioY, audioZ], noShadow: true }));
    var audioCaps = [];
    for (i = 0; i < 6; i++) audioCaps.push([fx - 0.020, audioY + 0.02, audioZ - 0.055 + i * 0.022]);
    g.add(inst(U.cyl(0.010, 0.010, 0.028, 12), gold, audioCaps.map(function (p) {
      return [p[0] - 0.012, p[1], p[2], 0, 0, Math.PI / 2];
    }), { noShadow: true }));
    g.add(txt(['AUDIO  SupremeFX'], 0.085, 0.014, [fx - 0.018, audioY - 0.03, audioZ], [0, -Math.PI / 2, 0],
      { color: '#d8c48a', align: 'center', size: 26 }));

    /* ---------- 供电元件：电感 / 电容 / SMD ---------- */
    var chokes = [];
    var chokesPerRow = Math.ceil(phases / 2);
    for (i = 0; i < phases; i++) {
      var row = i < chokesPerRow ? 0 : 1;
      var col = i < chokesPerRow ? i : i - chokesPerRow;
      var tz = -0.02 + col * (0.30 / Math.max(1, chokesPerRow - 1));
      chokes.push([fx - 0.026, row ? 0.238 : 0.285, tz]);
    }
    g.add(inst(geo(0.022, 0.032, 0.028, 0.006, 1), M.clone('greyPlastic', { color: 0x2c3138, metalness: 0.5, roughness: 0.45 }), chokes));

    var mosfets = [];
    for (i = 0; i < phases; i++) {
      var row2 = i < chokesPerRow ? 0 : 1;
      var col2 = i < chokesPerRow ? i : i - chokesPerRow;
      mosfets.push([fx - 0.024, row2 ? 0.212 : 0.252, -0.02 + col2 * (0.30 / Math.max(1, chokesPerRow - 1))]);
    }
    g.add(inst(geo(0.010, 0.014, 0.012, 0.002, 1), M.clone('blackPlastic', { color: 0x0d0f12 }), mosfets));

    var caps = [];
    for (i = 0; i < 14; i++) {
      caps.push([fx - 0.020, -0.02 + (i % 7) * 0.026, 0.20 + Math.floor(i / 7) * 0.03]);
    }
    g.add(inst(U.cyl(0.009, 0.009, 0.024, 10), M.clone('aluminum', { color: 0xb9c3cf, metalness: 0.9, roughness: 0.35 }), caps.map(function (p) {
      return [p[0] - 0.010, p[1], p[2], 0, 0, Math.PI / 2];
    })));

    var smd = [];
    var rnd = U.rng(2024);
    for (i = 0; i < 46; i++) {
      smd.push([fx - 0.018, -0.29 + rnd() * 0.56, -0.29 + rnd() * 0.40]);
    }
    g.add(inst(geo(0.006, 0.009, 0.006, 0.001, 1), M.clone('ceramic', { color: 0x6d5c40 }), smd, { noShadow: true }));

    /* ---------- 调试 LED 数码管 ---------- */
    g.add(U.mesh(geo(0.012, 0.030, 0.05, 0.003, 1), M.clone('glossBlack', { color: 0x08090c }), { p: [fx - 0.016, 0.09, -0.255] }));
    var segA = M.clone('ledPink', { emissive: 0xff3b5c, emissiveIntensity: 2.6 });
    var segs = [];
    for (i = 0; i < 2; i++) segs.push([fx - 0.023, 0.09, -0.245 - i * 0.014]);
    g.add(inst(U.box(0.003, 0.014, 0.007), segA, segs, { noShadow: true, userData: {} }));
    g.add(txt(['Q-CODE'], 0.036, 0.010, [fx - 0.017, 0.065, -0.255], [0, -Math.PI / 2, 0], { color: '#8fa0b0', align: 'center', size: 24 }));

    /* ---------- 板载 WiFi / 音频芯片 ---------- */
    g.add(U.mesh(geo(0.010, 0.032, 0.032, 0.002, 1), mt('silicon'), { p: [fx - 0.018, 0.10, 0.27] }));
    g.add(U.mesh(geo(0.010, 0.026, 0.026, 0.002, 1), mt('silicon'), { p: [fx - 0.018, -0.275, -0.09] }));

    g.userData.anchor = new T.Vector3(-0.03, 0.20, 0.02);
    return g;
  }

  if (PC3D.parts && PC3D.parts.register) PC3D.parts.register('motherboard', buildMotherboard);
  /* ============================================================
   * CPU 处理器
   * ========================================================== */
  var _cpuArtCache = Object.create(null);

  /** CPU 顶盖丝印：画布 (0,0) 对应 (z=-, y=+) */
  function ihsArt(lines, w, h, key) {
    if (_cpuArtCache[key]) return _cpuArtCache[key];
    var t = U.tex(512, Math.round(512 * h / w), function (ctx, cw, ch) {
      ctx.clearRect(0, 0, cw, ch);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var n = lines.length;
      for (var i = 0; i < n; i++) {
        var big = i === 0;
        ctx.font = (big ? '700 ' : '500 ') + (big ? Math.round(ch * 0.13) : Math.round(ch * 0.072)) + 'px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = big ? 'rgba(24,28,34,0.92)' : 'rgba(40,46,54,0.78)';
        ctx.fillText(lines[i], cw / 2, ch * (big ? 0.40 : 0.55 + (i - 1) * 0.085));
      }
      // 边角三角定位标记
      ctx.fillStyle = 'rgba(30,36,44,0.7)';
      ctx.beginPath(); ctx.moveTo(cw - 46, 26); ctx.lineTo(cw - 22, 26); ctx.lineTo(cw - 22, 50); ctx.closePath(); ctx.fill();
    });
    t.wrapS = t.wrapT = T.ClampToEdgeWrapping;
    _cpuArtCache[key] = t;
    return t;
  }

  function buildCpu(ctx, comp, variant) {
    var i, j, k, c;  /* 循环变量统一提升，避免严格模式下未声明 */
    var P = variant.params || {};
    var socket = P.socket || 'LGA1700';
    var isAM5 = socket === 'AM5' || socket === 'AM4';
    var cores = P.cores || 8;
    var ihsType = P.ihs || 'metal';
    var capColor = P.color === undefined ? 0x1f242b : P.color;
    var dieColor = P.dieColor === undefined ? 0x2a2f3a : P.dieColor;
    var theme = PC3D.config.theme;

    // 封装尺寸：AM5 略小（正方形 0.28），LGA1700 长方形 0.30 × 0.28
    var PW = isAM5 ? 0.28 : 0.30;   // Z 向
    var PH = isAM5 ? 0.28 : 0.285;  // Y 向
    var TH = 0.055;                 // X 向总厚

    var sub = M.clone('pcbDark', { color: 0x14181e, map: null, roughness: 0.62, metalness: 0.24 });
    var ihsMat = M.clone('nickel', { color: 0xc8d2dc, metalness: 1.0, roughness: 0.18, envMapIntensity: 1.4 });
    var ihsEdge = M.clone('aluminum', { color: 0x9aa4ae, metalness: 0.95, roughness: 0.32 });
    var gold = mt('gold');
    var cer = M.clone('ceramic', { color: 0x5d4f38, roughness: 0.9, metalness: 0.05 });

    var g = new T.Group();
    g.userData.partId = 'cpu';

    /* ---------- 封装基板 ---------- */
    g.add(U.mesh(geo(0.016, PH, PW, 0.005, 1), sub, { p: [0.014, 0, 0] }));
    // 基板正面（元件面，-X）沉金焊盘 + 微小元件
    g.add(U.mesh(U.plane(PW, PH), M.clone('gold', { color: 0x8c7433, metalness: 0.9, roughness: 0.45 }),
      { p: [-0.0065, 0, 0], r: [0, -Math.PI / 2, 0], noShadow: true }));
    var pads = [], rndC = U.rng(9);
    for (var i = 0; i < 22; i++) {
      pads.push([-0.0075, (rndC() - 0.5) * (PH - 0.05), (rndC() - 0.5) * (PW - 0.05)]);
    }
    g.add(inst(geo(0.004, 0.012, 0.010, 0.001, 1), cer, pads, { noShadow: true }));
    // 侧边金手指（AM5 为 LGA 无针脚，仍做基板触点阵列）
    var fingers = [];
    var fn = 16;
    for (i = 0; i < fn; i++) {
      fingers.push([0.006, (i / (fn - 1) - 0.5) * (PH - 0.02), PW / 2 + 0.0015]);
      fingers.push([0.006, (i / (fn - 1) - 0.5) * (PH - 0.02), -PW / 2 - 0.0015]);
    }
    g.add(inst(U.box(0.010, 0.006, 0.003), gold, fingers, { noShadow: true }));
    // 基板侧边电容阵列（贴片电容）
    var caps = [];
    for (i = 0; i < 10; i++) {
      caps.push([-0.0035, -PH / 2 + 0.02 + i * 0.026, PW / 2 - 0.018]);
      caps.push([-0.0035, -PH / 2 + 0.02 + i * 0.026, -PW / 2 + 0.018]);
    }
    g.add(inst(geo(0.008, 0.009, 0.005, 0.001, 1), cer, caps, { noShadow: true }));

    /* ---------- 顶盖 IHS ---------- */
    var ihsW = PW - 0.018, ihsH = PH - 0.018;
    var ihs = U.mesh(geo(0.026, ihsH, ihsW, 0.006, 2), ihsMat, { p: [-0.019, 0, 0] });
    g.add(ihs);
    // 顶盖侧壁（高光倒角）
    g.add(U.mesh(geo(0.030, ihsH - 0.012, ihsW - 0.012, 0.004, 1), ihsEdge, { p: [-0.024, 0, 0] }));
    // 拉丝纹理面
    var brushed = M.clone('aluminum', { color: 0xdbe3ec, metalness: 1.0, roughness: 0.24, map: M.tex.brushed, envMapIntensity: 1.5 });
    g.add(U.mesh(U.plane(ihsW - 0.006, ihsH - 0.006), brushed, { p: [-0.0325, 0, 0], r: [0, -Math.PI / 2, 0], noShadow: true }));
    // 丝印（朝 -X）
    var lines = isAM5
      ? ['AMD RYZEN', variant.short || '', 'AM5  ' + (variant.brand || '')]
      : ['INTEL CORE', variant.short || '', 'LGA1700  ' + (variant.brand || '')];
    if (P.ihs === 'copper') lines = ['COPPER IHS', variant.short || ''];
    var art = ihsArt(lines, ihsW, ihsH, 'cpu' + socket + (variant.short || ''));
    var silks = new T.Mesh(U.plane(ihsW - 0.012, ihsH - 0.012),
      new T.MeshBasicMaterial({ map: art, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.9 }));
    silks.material.__owned = true;
    silks.position.set(-0.0335, 0, 0);
    silks.rotation.y = -Math.PI / 2;
    silks.userData.noPick = true;
    g.add(silks);
    // 顶盖定位缺口（AM5 为八角形，用斜切块示意）
    if (!isAM5) {
      g.add(U.mesh(geo(0.020, 0.014, 0.020, 0.003, 1), M.clone('steel', { color: 0x6c757e }),
        { p: [-0.033, ihsH / 2 - 0.008, -ihsW / 2 + 0.008] }));
    } else {
      // 八角切角
      var ch = 0.028;
      for (i = 0; i < 4; i++) {
        var sx = (i % 2 ? 1 : -1), sy = (i < 2 ? 1 : -1);
        g.add(U.mesh(geo(0.030, ch, ch, 0.002, 1), ihsEdge,
          { p: [-0.019, sy * (ihsH / 2 - ch / 2), sx * (ihsW / 2 - ch / 2)], r: [Math.PI / 4, 0, 0] }));
      }
    }

    /* ---------- 背面（+X，Die 面朝 -X，此处做基板背面） ---------- */
    // 背面中心 Die 凹槽 + 触点阵列
    var backPads = [];
    var bpRand = U.rng(31);
    for (i = 0; i < 40; i++) {
      backPads.push([0.0225, (bpRand() - 0.5) * (PH - 0.06), (bpRand() - 0.5) * (PW - 0.06)]);
    }
    g.add(inst(geo(0.003, 0.006, 0.006, 0.001, 1), gold, backPads, { noShadow: true }));
    g.add(U.mesh(geo(0.004, PH - 0.09, PW - 0.09, 0.004, 1), M.clone('silicon', { color: dieColor, metalness: 0.62, roughness: 0.24 }),
      { p: [0.0245, 0, 0], noShadow: true }));

    /* ---------- 顶部核心标识灯（点缀） ---------- */
    var dot = U.mesh(U.torus(0.012, 0.0035, 6, 18), M.clone('ledCyan', { emissive: theme.accent }), { p: [0.0265, -PH / 2 + 0.03, PW / 2 - 0.03], r: [0, 0, Math.PI / 2], noShadow: true, userData: { glow: true } });
    g.add(dot);

    g.userData.anchor = new T.Vector3(-0.04, PH * 0.35, PW * 0.35);
    return g;
  }

  if (PC3D.parts && PC3D.parts.register) PC3D.parts.register('cpu', buildCpu);
  /* ============================================================
   * 风扇通用构件（cooler 与 fans 共用）
   * ========================================================== */
  var _bladeCache = Object.create(null);

  /** 单枚扇叶曲面（被 makeBlades 合并） */
  function bladeGeo(r0, r1, blades, pitchDeg, chordK) {
    var key = r0 + ',' + r1 + ',' + blades + ',' + pitchDeg + ',' + chordK;
    if (_bladeCache[key]) return _bladeCache[key];
    var pos = [], idx = [], segs = 5, cp = 3;
    var pitch = pitchDeg * Math.PI / 180;
    for (var b = 0; b < blades; b++) {
      var base = b * Math.PI * 2 / blades;
      var vstart = pos.length / 3;
      for (var i = 0; i <= segs; i++) {
        var u = i / segs;
        var r = r0 + (r1 - r0) * u;
        var chord = (r - r0 * 0.88) * chordK;
        for (var j = 0; j < cp; j++) {
          var t = (j / (cp - 1)) - 0.5;
          var ang = base + (t * chord) / r + u * 0.12;
          var z = t * chord * Math.tan(pitch) * 0.5 + Math.pow(u, 1.7) * 0.010;
          pos.push(Math.cos(ang) * r, Math.sin(ang) * r, z);
        }
      }
      for (i = 0; i < segs; i++) {
        for (j = 0; j < cp - 1; j++) {
          var a0 = vstart + i * cp + j;
          var a1 = a0 + cp;
          idx.push(a0, a1, a0 + 1, a1, a1 + 1, a0 + 1);
        }
      }
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    _bladeCache[key] = geo;
    return geo;
  }

  /**
   * 造一把风扇（轴 = 局部 +Z，扇叶绕 Z 自转）
   * o: {r, t, blades, rgb, frameColor, bladeOpacity, spin, art}
   */
  function makeFan(o) {
    var r = o.r, t = o.t || 0.05, n = o.blades || 7;
    var frameMat = M.clone('blackPlastic', { color: o.frameColor === undefined ? 0x14171c : o.frameColor, roughness: 0.55, metalness: 0.22 });
    var shroudMat = M.clone('blackPlastic', { color: 0x0b0d10, roughness: 0.62, metalness: 0.15, side: T.DoubleSide });
    var bladeMat = M.clone('fanBlade', {
      color: o.bladeColor === undefined ? 0x23272e : o.bladeColor,
      opacity: o.bladeOpacity === undefined ? 0.95 : o.bladeOpacity,
      metalness: 0.12, roughness: 0.68, side: T.DoubleSide
    });
    var rubber = M.clone('rubber', { color: 0x0a0b0d });

    var g = new T.Group();

    // 外框：4 条边框（实例化）
    var railH = 2 * r, railT = Math.min(0.024, t * 0.55);
    var rails = [
      [0, r - railT / 2, 0, 0, 0, 0],
      [0, -r + railT / 2, 0, 0, 0, 0],
      [r - railT / 2, 0, 0, 0, 0, Math.PI / 2],
      [-r + railT / 2, 0, 0, 0, 0, Math.PI / 2]
    ];
    g.add(inst(geo(railH, railT, t, 0.006, 1), frameMat, rails.map(function (q) {
      return [q[0], q[1], q[2], q[3], q[4], q[5]];
    })));
    // 圆筒内壁
    g.add(U.mesh(U.cyl(r * 0.94, r * 0.94, t, 28, true), shroudMat, { r: rotForAxis('z'), noShadow: true }));
    // 四角减震垫
    var gr = [];
    for (var i = 0; i < 4; i++) {
      gr.push([(i % 2 ? 1 : -1) * (r - 0.026), (i < 2 ? 1 : -1) * (r - 0.026), 0]);
    }
    g.add(inst(U.cyl(0.014, 0.014, t * 0.9, 10), rubber, gr.map(function (p) {
      return [p[0], p[1], p[2], Math.PI / 2, 0, 0];
    }), { noShadow: true }));

    // 旋转组：hub + 扇叶 + 贴纸
    var spin = new T.Group();
    spin.userData.spin = o.spin === undefined ? 2.4 : o.spin;
    spin.userData.spinAxis = 'z';
    var hubR = r * 0.30;
    spin.add(U.mesh(U.cyl(hubR, hubR * 1.06, t * 0.78, 22), frameMat, { r: [Math.PI / 2, 0, 0], p: [0, 0, 0] }));
    spin.add(U.mesh(U.cyl(hubR * 0.72, hubR * 0.72, t * 0.86, 18), M.clone('glossBlack', { color: 0x0a0c0f }), { r: [Math.PI / 2, 0, 0], p: [0, 0, t * 0.02] }));
    var sticker = U.label([o.art || (n + ' BLADE')], hubR * 1.3, hubR * 0.62,
      { align: 'center', color: '#d7e2ee', size: 46 });
    sticker.position.set(0, hubR * 0.30, t * 0.46);
    spin.add(sticker);
    spin.add(U.mesh(bladeGeo(hubR * 0.92, r * 0.90, n, o.pitch || 34, o.chordK || 0.92), bladeMat, { noShadow: true }));
    g.add(spin);

    // RGB 环（双环）
    if (o.rgb) {
      var led = mt('ledCyan');
      var ringA = U.mesh(U.torus(r * 0.885, 0.006, 6, 44), led, { noShadow: true, userData: { glow: true } });
      g.add(ringA);
      var ringB = U.mesh(U.torus(r * 0.885, 0.0035, 5, 40), mt('ledPurple'), { p: [0, 0, t * 0.22], noShadow: true, userData: { glow: true } });
      g.add(ringB);
    }
    g.userData.spinner = spin;
    g.userData.radius = r;
    return g;
  }

  /* ============================================================
   * 散热器（水冷 / 风冷）
   * ========================================================== */
  function buildCooler(ctx, comp, variant) {
    var i, j, k, c;  /* 循环变量统一提升，避免严格模式下未声明 */
    var P = variant.params || {};
    var type = P.type === 'air' ? 'air' : 'aio';
    var theme = PC3D.config.theme;
    var rgb = P.rgb !== false;

    var copper = M.clone('copper', { color: 0xc07a42, metalness: 1.0, roughness: 0.2, envMapIntensity: 1.3 });
    var nickel = M.clone('nickel', { color: 0xd2d9e1, metalness: 1.0, roughness: 0.16, envMapIntensity: 1.35 });
    var alu = M.clone('aluminum', { color: 0xb4bcc4, metalness: 0.95, roughness: 0.3, map: M.tex.brushed, envMapIntensity: 1.2 });
    var dark = M.clone('matteBlack', { color: 0x101318, roughness: 0.62, metalness: 0.3 });
    var plastic = M.clone('blackPlastic', { color: 0x191d22, roughness: 0.5, metalness: 0.25 });
    var rubber = M.clone('rubber', { color: 0x0b0c0e });

    var g = new T.Group();
    g.userData.partId = 'cooler';
    g.userData.subExplode = [];

    if (type === 'aio') {
      /* ---------------- 水冷 ---------------- */
      // 冷头/扣具整体沿 +Z 偏移 ZS：内存条最近的马甲边在 world z=-0.048，
      // 冷头若居中于 z=0 会埋掉内存；同时 x 方向不再回拨（保持铜底贴住 CPU 顶面）。
      // 必须在任何使用点（含 U.tube 水管）之前声明。
      var HX = 0.0;
      var ZS = 0.060;
      var block = P.block || 0.19;         // 冷头 YZ 边长
      var fanR = P.fanSize || 0.155;
      var fanN = P.fans || 3;
      var fans = [];
      var i, k;

      // 冷排：安装于机箱顶部（world y≈0.86 → 局部 y≈0.56）
      var radLen = fanN * (fanR * 2 + 0.012);
      var radX = -0.26, radY = 0.56, radZ = -0.02;
      var radT = 0.052;                    // 冷排芯厚（不含风扇）

      var radGrp = new T.Group();
      radGrp.position.set(radX, radY, radZ);
      // 冷排边框
      radGrp.add(U.mesh(geo(0.255, radT + 0.014, radLen, 0.006, 1), dark, {}));
      // 两端水室
      radGrp.add(U.mesh(geo(0.26, radT + 0.020, 0.030, 0.008, 1), alu, { p: [0, 0, radLen / 2 - 0.015] }));
      radGrp.add(U.mesh(geo(0.26, radT + 0.020, 0.030, 0.008, 1), alu, { p: [0, 0, -radLen / 2 + 0.015] }));
      // 鳍片阵列（沿 Z 堆叠）
      var finN = Math.round(radLen / 0.017);
      var finList = [];
      for (i = 0; i < finN; i++) finList.push([0, 0, -radLen / 2 + 0.03 + i * ((radLen - 0.06) / (finN - 1))]);
      radGrp.add(inst(U.box(0.235, radT, 0.0022), alu, finList));
      // 水管接头（G1/4）
      radGrp.add(U.mesh(U.cyl(0.016, 0.016, 0.030, 14), nickel, { p: [0.02, -0.03, radLen / 2 - 0.02], r: [0, 0, 0] }));
      radGrp.add(U.mesh(U.cyl(0.016, 0.016, 0.030, 14), nickel, { p: [0.075, -0.03, radLen / 2 - 0.02], r: [0, 0, 0] }));
      radGrp.add(U.mesh(U.cyl(0.020, 0.020, 0.012, 14), rubber, { p: [0.02, -0.045, radLen / 2 - 0.02] }));
      radGrp.add(U.mesh(U.cyl(0.020, 0.020, 0.012, 14), rubber, { p: [0.075, -0.045, radLen / 2 - 0.02] }));

      // 冷排风扇（3 把，轴向 Y，向下吹）
      for (i = 0; i < fanN; i++) {
        var fz = (i - (fanN - 1) / 2) * (fanR * 2 + 0.012);
        var fan = makeFan({ r: fanR, t: 0.048, blades: 7, rgb: rgb, frameColor: 0x14171c, spin: 2.8, art: 'AIO ' + (i + 1) });
        fan.position.set(0, -radT / 2 - 0.030, fz);
        fan.rotation.x = Math.PI / 2;      // 轴 Z → 轴 Y
        radGrp.add(fan);
        fans.push(fan);
      }
      g.add(radGrp);
      g.userData.subExplode.push({ obj: radGrp, dir: [0, 0.35, 0.1], dist: 0.30 });

      // 水管（两根，CatmullRom）
      var tubeR = 0.015;
      var tubeA = U.tube([[-0.085 + HX, 0.055, 0.045 + ZS], [-0.13, 0.24, 0.10], [-0.19, 0.44, 0.24], [-0.20, 0.525, 0.40], [-0.235, 0.545, radLen / 2 - 0.03 + radZ]], tubeR, 40, 12);
      var tubeB = U.tube([[-0.085 + HX, 0.055, -0.005 + ZS], [-0.14, 0.24, 0.00], [-0.205, 0.44, 0.16], [-0.215, 0.525, 0.34], [-0.22, 0.545, radLen / 2 - 0.03 + radZ]], tubeR, 40, 12);
      var sleeveA = M.clone('sleeved', { color: 0x16191e, roughness: 0.85, metalness: 0.05, side: T.DoubleSide });
      g.add(U.mesh(tubeA, sleeveA, {}));
      g.add(U.mesh(tubeB, sleeveA, {}));

      // 冷头：铜底 + 泵体 + LCD + RGB 环
      g.add(U.mesh(geo(0.014, block * 0.94, block * 0.94, 0.004, 1), copper, { p: [-0.040 + HX, 0, ZS] }));
      g.add(U.mesh(geo(0.075, block, block, 0.016, 2), plastic, { p: [-0.086 + HX, 0, ZS] }));
      g.add(U.mesh(geo(0.020, block * 1.01, block * 1.01, 0.008, 2), M.clone('glossBlack', { color: 0x0b0d10, roughness: 0.16, metalness: 0.5 }), { p: [-0.120 + HX, 0, ZS] }));
      // LCD 屏（朝 -X）
      var scr = U.label(['', ''], block * 0.58, block * 0.58, { bg: '#080d14', w: 256, h: 256, size: 40 });
      scr.position.set(-0.1312 + HX, 0, ZS);
      scr.rotation.y = -Math.PI / 2;
      g.add(scr);
      var scrFace = U.mesh(U.plane(block * 0.58, block * 0.58),
        new T.MeshBasicMaterial({ color: 0x0b1a2a, toneMapped: false, transparent: true, opacity: 0.55 }),
        { p: [-0.1310 + HX, 0, ZS], r: [0, -Math.PI / 2, 0], noShadow: true });
      scrFace.userData.noPick = true;
      g.add(scrFace);
      // 屏幕内容（温度数字）
      var tempArt = U.labelTex(['62°C', 'KRAKEN'], { w: 256, h: 256, size: 74, color: '#7ff0ff', align: 'center' });
      var tempMat = new T.MeshBasicMaterial({ map: tempArt, transparent: true, toneMapped: false, depthWrite: false });
      tempMat.__owned = true;
      var tempMesh = new T.Mesh(U.plane(block * 0.56, block * 0.56), tempMat);
      tempMesh.position.set(-0.1316 + HX, 0, ZS);
      tempMesh.rotation.y = -Math.PI / 2;
      tempMesh.userData.noPick = true;
      tempMesh.userData.glow = true;
      g.add(tempMesh);
      // 冷头 RGB 环
      g.add(U.mesh(U.torus(block * 0.50, 0.006, 6, 48), mt('ledCyan'), { p: [-0.1205 + HX, 0, ZS], r: [0, Math.PI / 2, 0], noShadow: true, userData: { glow: true } }));
      g.add(U.mesh(U.torus(block * 0.50, 0.0035, 5, 44), mt('ledPurple'), { p: [-0.1245 + HX, 0, ZS], r: [0, Math.PI / 2, 0], noShadow: true, userData: { glow: true } }));
      // 冷头外圈散热齿
      var teeth = [];
      for (i = 0; i < 26; i++) {
        var ang = i / 26 * Math.PI * 2;
        teeth.push([-0.108 + HX, Math.sin(ang) * block * 0.46, ZS + Math.cos(ang) * block * 0.46, ang, 0, 0]);
      }
      g.add(inst(geo(0.012, 0.012, 0.020, 0.003, 1), alu, teeth, { noShadow: true }));
      // 固定扣具：臂长 ±0.040（内存马甲内缘 world z=-0.048，必须让开）
      var ylock = 0.040;
      g.add(U.mesh(geo(0.016, 0.055, ylock * 2, 0.006, 1), mt('aluminumDark'), { p: [-0.046 + HX, 0, ZS] }));
      g.add(U.mesh(geo(0.016, ylock * 2, 0.055, 0.006, 1), mt('aluminumDark'), { p: [-0.046 + HX, 0, ZS] }));
      var knurled = [];
      for (i = 0; i < 4; i++) {
        knurled.push([-0.046 + HX, (i < 2 ? 1 : -1) * ylock, ZS + (i % 2 ? 1 : -1) * ylock, 0, 0, Math.PI / 2]);
      }
      g.add(inst(U.cyl(0.014, 0.014, 0.020, 12), mt('chrome'), knurled));

      g.userData.anchor = new T.Vector3(-0.10 + HX, 0.02, 0.02 + ZS);
    } else {
      /* ---------------- 风冷（塔式） ----------------
       * 真实结构：鳍片水平叠放（法线 Y）、双塔沿气流方向 Z 前后串联、
       * 风扇轴向 Z 从前面板(+)吹向背板(-)。
       * X 上整体让开主板板面（板面在局部 +X ≈ 0.005），塔体占 -0.36..-0.02。
       * -------------------------------------------------------- */
      var height = P.height || 0.63;
      var towers = P.towers || 2;
      var pipes = P.heatpipes || 6;
      var finCount = P.finCount || 46;
      var fanR2 = P.fanSize || 0.15;
      var isNoctua = /noctua|猫头鹰/i.test(variant.brand || '');
      var i2, j2;
      var towerX = -0.262, towerW = 0.30;

      // 底座：镜面铜底 + 镀镍压块
      g.add(U.mesh(geo(0.012, 0.105, 0.105, 0.003, 1), copper, { p: [-0.036, 0, 0] }));
      g.add(U.mesh(geo(0.026, 0.125, 0.125, 0.006, 1), nickel, { p: [-0.055, 0, 0] }));
      // 扣具横梁（X 形）+ 4 颗压紧螺丝
      g.add(U.mesh(geo(0.012, 0.036, 0.30, 0.004, 1), mt('aluminumDark'), { p: [-0.050, 0, 0] }));
      g.add(U.mesh(geo(0.012, 0.30, 0.036, 0.004, 1), mt('aluminumDark'), { p: [-0.050, 0, 0] }));
      g.add(inst(U.cyl(0.013, 0.013, 0.018, 12), mt('chrome'),
        [[-0.050, 0.145, 0.145, 0, 0, Math.PI / 2], [-0.050, -0.145, 0.145, 0, 0, Math.PI / 2],
        [-0.050, 0.145, -0.145, 0, 0, Math.PI / 2], [-0.050, -0.145, -0.145, 0, 0, Math.PI / 2]]));

      // 鳍片从底座上方升起（塔式：向上堆叠），塔顶 ≈ 底座 + 散热器高度
      var finBot = 0.135;   // 抬到内存顶面(world 0.431→local 0.131)之上，避免与 DIMM 穿插
      var finSpan = Math.min(0.520, height - 0.14);
      var finTop = finBot + finSpan;
      var finStep = finSpan / Math.max(1, finCount - 1);

      // 6 根 U 型热管：从底座弯起后沿 Z 贯穿两座塔
      var pipeR = 0.0115;
      var pipeX = [towerX + 0.050, towerX - 0.050];
      var pipeMidY = finBot + finSpan * 0.46;
      var pipeY = [pipeMidY - 0.075, pipeMidY, pipeMidY + 0.075];
      for (i2 = 0; i2 < pipeX.length; i2++) {
        for (j2 = 0; j2 < pipeY.length; j2++) {
          var px = pipeX[i2], py = pipeY[j2];
          var pts = [
            [-0.042, py * 0.35, 0.020],
            [-0.070, py * 0.75, 0.062],
            [px, py, 0.105],
            [px, py, 0.000],
            [px, py, -0.235]
          ];
          g.add(U.mesh(U.tube(pts, pipeR, 30, 10), nickel, {}));
          g.add(U.mesh(U.cyl(pipeR, pipeR * 0.85, 0.010, 10), nickel,
            { p: [px, py, -0.239], r: [Math.PI / 2, 0, 0], noShadow: true }));
        }
      }

      // 两座鳍片塔：沿 Y 堆叠，沿 Z 前后串联
      var towerZ = towers > 1 ? [0.110, -0.110] : [0.0];
      var finList2 = [];
      for (var t2 = 0; t2 < towerZ.length; t2++) {
        for (i2 = 0; i2 < finCount; i2++) {
          finList2.push([towerX, finBot + i2 * finStep, towerZ[t2]]);
        }
      }
      g.add(inst(geo(towerW, Math.max(0.0016, finStep * 0.34), 0.200, 0.003, 1), alu, finList2));

      // 塔顶盖板 + 前后封边
      for (i2 = 0; i2 < towerZ.length; i2++) {
        var tz = towerZ[i2];
        g.add(U.mesh(geo(towerW + 0.012, 0.014, 0.212, 0.006, 1),
          M.clone('aluminumDark', { color: 0x2b3037, metalness: 0.9, roughness: 0.36 }),
          { p: [towerX, finTop + 0.009, tz] }));
        g.add(U.mesh(geo(towerW, 0.010, 0.008, 0.003, 1), alu, { p: [towerX, finTop + 0.009, tz + 0.102] }));
        g.add(U.mesh(geo(towerW, 0.010, 0.008, 0.003, 1), alu, { p: [towerX, finTop + 0.009, tz - 0.102] }));
      }

      // 风扇：前置 + 塔间（轴向 Z），带钢丝扣具
      var airFanZ = towers > 1 ? [0.250, 0.0] : [0.250];
      var coolerFans = [];
      for (i2 = 0; i2 < airFanZ.length; i2++) {
        var cf = makeFan({
          r: fanR2, t: 0.050, blades: isNoctua ? 9 : 7,
          rgb: rgb, frameColor: isNoctua ? 0x3a3128 : 0x1b1e23,
          bladeColor: isNoctua ? 0x4a3a2a : 0x23272e,
          chordK: isNoctua ? 1.02 : 0.92,
          spin: i2 ? -2.2 : 2.6,
          art: isNoctua ? 'NF-A15' : 'TL-C12'
        });
        cf.position.set(towerX, finBot + finSpan * 0.5, airFanZ[i2]);
        g.add(cf);
        coolerFans.push(cf);
        var fanYc = finBot + finSpan * 0.5;
        var clipY = [fanYc + fanR2 - 0.016, fanYc - fanR2 + 0.016];
        for (j2 = 0; j2 < 2; j2++) {
          g.add(U.mesh(U.torus(0.020, 0.0022, 4, 12), mt('chrome'),
            { p: [towerX, clipY[j2], airFanZ[i2] - 0.032], r: [0, Math.PI / 2, 0], noShadow: true }));
        }
      }
      if (coolerFans.length > 1) {
        g.userData.subExplode.push({ obj: coolerFans[0], dir: [0, 0, 1], dist: 0.26 });
        g.userData.subExplode.push({ obj: coolerFans[1], dir: [0, 0, -1], dist: 0.10 });
      }

      // 顶盖品牌牌（朝 -X，正对默认相机）
      var brandPlate = U.label([variant.short || 'AIR COOLER'], 0.20, 0.030,
        { color: '#d3dce6', align: 'center', size: 40 });
      brandPlate.position.set(towerX - towerW / 2 - 0.002, finBot + finSpan * 0.52, towerZ[0]);
      brandPlate.rotation.set(0, -Math.PI / 2, 0);
      g.add(brandPlate);

      g.userData.anchor = new T.Vector3(-0.20, 0.44, 0.10);
    }

    return g;
  }

  if (PC3D.parts && PC3D.parts.register) PC3D.parts.register('cooler', buildCooler);  /* ============================================================
   * 机箱风扇组（前面板 3 把 + 后置 1 把）
   * 每把风扇为独立子组，支持各自 subExplode
   * ========================================================== */
  function buildFans(ctx, comp, variant) {
    var i, j, k, c;
    var g = new T.Group();
    g.userData.partId = 'fans';
    g.userData.anchor = new T.Vector3(0.02, 0, 0.50);
    g.userData.subExplode = [];

    var P = (variant && variant.params) || {};
    var theme = ctx.theme || {};
    var size = P.size || 0.155;
    var thick = P.thickness || 0.05;
    var blades = P.blades || 7;
    var rgb = P.rgb !== false;
    var frameColor = P.frame === undefined ? 0x1a1d22 : P.frame;
    var count = Math.max(1, Math.min(3, P.count === undefined ? 3 : P.count));
    var rearCount = P.rearCount === undefined ? 1 : P.rearCount;
    var reverse = !!P.reverse;

    var screwsAll = [];
    var ledMat = mt('ledCyan');
    var ledMat2 = mt('ledPurple');

    /* ---------------- 前面板进风 ×N ---------------- */
    var frontY = [0.34, 0.0, -0.34];
    var railH = 2 * size;
    for (i = 0; i < count; i++) {
      var slot = new T.Group();
      slot.name = 'fanFront' + i;
      slot.position.set(0.02, frontY[i], 0.500);

      var fan = makeFan({
        r: size, t: thick, blades: blades, rgb: rgb,
        frameColor: frameColor,
        bladeColor: frameColor < 0x202020 ? 0x24282f : 0x2b2f36,
        spin: reverse ? -2.3 : 2.3,
        pitch: reverse ? -32 : 32,
        chordK: 0.94,
        art: 'FRONT ' + (i + 1)
      });
      slot.add(fan);

      // 四角长螺丝（穿过前面板）
      var sr = size - 0.020;
      for (j = 0; j < 4; j++) {
        screwsAll.push([0.02 + (j % 2 ? sr : -sr), frontY[i] + (j < 2 ? sr : -sr), 0.520, 0, 0, Math.PI / 2]);
      }
      // 风扇外侧装饰圈（薄环，金属拉丝）
      slot.add(U.mesh(U.torus(size * 0.965, 0.0045, 6, 40), mt('aluminumDark'),
        { noShadow: true, userData: { noPick: false } }));

      // 内嵌 ARGB 导光条（沿框架内侧四段）
      if (rgb) {
        var segMat = i === 1 ? ledMat2 : ledMat;
        for (j = 0; j < 2; j++) {
          var bar = U.mesh(U.box(0.004, size * 1.30, 0.006), segMat,
            { p: [(j ? 1 : -1) * (size - 0.008), 0, 0.012], noShadow: true,
              userData: { glow: true } });
          slot.add(bar);
        }
      }
      g.add(slot);
      g.userData.subExplode.push({ obj: slot, dir: [0, 0, 1], dist: 0.26 + i * 0.06 });
    }

    /* ---------------- 后置排风 ×N ---------------- */
    var rearY = 0.36, rearZ = -0.520, rearX = 0.20;
    for (i = 0; i < rearCount; i++) {
      var rslot = new T.Group();
      rslot.name = 'fanRear' + i;
      rslot.position.set(rearX, rearY - i * 0.30, rearZ);
      rslot.rotation.y = Math.PI;

      var rfan = makeFan({
        r: 0.140, t: 0.045, blades: 7, rgb: rgb, frameColor: 0x16191e,
        bladeColor: 0x24282f, spin: -2.6, art: 'REAR'
      });
      rslot.add(rfan);
      // 后置护网（细密格栅）
      var grillPts = [];
      for (j = 0; j < 9; j++) grillPts.push([0, -0.115 + j * 0.029, size * 0.0 + 0.030]);
      rslot.add(inst(geo(0.255, 0.0022, 0.0022, 0.001, 1), mt('steel'), grillPts.map(function (p) {
        return [p[0], p[1], p[2]];
      }), { noShadow: true }));

      var sr2 = 0.140 - 0.020;
      for (j = 0; j < 4; j++) {
        screwsAll.push([rearX + (j % 2 ? sr2 : -sr2), rearY - i * 0.30 + (j < 2 ? sr2 : -sr2), rearZ - 0.028, 0, 0, Math.PI / 2]);
      }
      g.add(rslot);
      if (i === 0) g.userData.subExplode.push({ obj: rslot, dir: [0, 0, -1], dist: 0.30 });
    }

    g.add(inst(U.cyl(0.0065, 0.0065, 0.030, 8), mt('chrome'), screwsAll, { noShadow: true }));

    /* ---------------- 走线：风扇线束 + PWM 集线器 ---------------- */
    var hubZ = 0.462;
    g.add(U.mesh(geo(0.055, 0.030, 0.012, 0.003, 1), mt('matteBlack'), { p: [0.30, -0.42, hubZ] }));
    g.add(U.mesh(geo(0.030, 0.004, 0.004, 0.001, 1), ledMat, { p: [0.30, -0.408, hubZ + 0.006], noShadow: true, userData: { glow: true } }));
    for (i = 0; i < count; i++) {
      var y0 = frontY[i] - 0.075;
      var pts2 = [
        [0.02 + 0.10, y0, 0.478],
        [0.16, y0 - 0.03, 0.470],
        [0.26, -0.30, 0.466],
        [0.30, -0.412, hubZ]
      ];
      g.add(U.mesh(U.tube(pts2, 0.0045, 26, 6), M.clone('sleeved', { color: 0x121418 }), { noShadow: true }));
    }

    /* ---------------- 前面板防尘网（可随面板拆出） ---------------- */
    var dust = new T.Group();
    dust.name = 'fanFilter';
    dust.add(U.mesh(U.plane(0.40, 1.06), M.clone('meshDark', {
      alphaMap: M.tex.honeycomb, transparent: false, alphaTest: 0.4,
      color: 0x0c0e12, side: T.DoubleSide
    }), { p: [0.02, 0, 0.545], noShadow: true }));
    dust.add(U.mesh(geo(0.42, 0.010, 0.010, 0.002, 1), mt('blackPlastic'), { p: [0.02, 0.532, 0.548] }));
    dust.add(U.mesh(geo(0.42, 0.010, 0.010, 0.002, 1), mt('blackPlastic'), { p: [0.02, -0.532, 0.548] }));
    g.add(dust);

    return g;
  }

  if (PC3D.parts && PC3D.parts.register) PC3D.parts.register('fans', buildFans);
})();
