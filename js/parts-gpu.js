/* ============================================================
 * parts-gpu.js — 显卡 / 内存 / SSD / 电源 / 线材（teammate B）
 * 依赖：vendor/three (r147 UMD)、js/util.js、js/materials.js、js/config.js
 * 约定：部件局部坐标原点 = 该部件在机箱内的安装中心（见 CONTRACT §7）
 *       X = 板厚/卡高方向（-X 朝侧透玻璃），Y 向上，Z 为机箱前后
 * 暴露：PC3D.parts.register('gpu'|'ram'|'ssd'|'psu', builder)
 *       PC3D.parts.extras(ctx) -> THREE.Group   （24pin / PCIe / A-RGB 线材，世界坐标）
 * ========================================================== */
(function () {
  'use strict';
  var PC3D = (window.PC3D = window.PC3D || {});
  if (typeof THREE === 'undefined') { console.error('[parts-gpu] THREE 未加载'); return; }
  var T = THREE;
  var U = PC3D.util;
  if (!U || !PC3D.parts || !PC3D.parts.register) {
    console.error('[parts-gpu] util.js 未就绪（脚本顺序错误）');
    return;
  }
  var M = PC3D.materials;

  /* ============================================================
   * 局部工具（不挂全局）
   * ========================================================== */
  function cmat(name, over) { return M.clone(name, over); }

  /** InstancedMesh 快捷构造 */
  function inst(geo, material, matrices) {
    var im = new T.InstancedMesh(geo, material, matrices.length);
    for (var i = 0; i < matrices.length; i++) im.setMatrixAt(i, matrices[i]);
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    return im;
  }

  var _v3 = new T.Vector3(), _q = new T.Quaternion(), _e = new T.Euler(), _s3 = new T.Vector3(1, 1, 1);
  function mtx(x, y, z, rx, ry, rz) {
    _e.set(rx || 0, ry || 0, rz || 0);
    _q.setFromEuler(_e);
    _v3.set(x || 0, y || 0, z || 0);
    return new T.Matrix4().compose(_v3, _q, _s3);
  }

  /* ---------- 风扇叶片几何（程序化：后掠 + 扭转 + 弧面）---------- */
  var bladeCache = Object.create(null);
  function bladeGeo(rHub, rTip, chord, sweep, twist, maxAxial) {
    var cap = Math.max(0.012, maxAxial || 0.070);
    var key = [rHub.toFixed(4), rTip.toFixed(3), chord.toFixed(4), sweep.toFixed(3), twist.toFixed(4), cap.toFixed(4)].join(':');
    if (bladeCache[key]) return bladeCache[key];
    var sU = 4, sV = 3;
    var verts = [], idx = [];
    var i, j;
    for (i = 0; i <= sU; i++) {
      var u = i / sU;
      var r = rHub + (rTip - rHub) * u;
      var ang = sweep * u * u;
      var halfC = chord * (0.5 + 0.5 * Math.sin(Math.PI * (0.18 + 0.82 * u)));
      for (j = 0; j <= sV; j++) {
        var v = (j / sV) * 2 - 1;
        var off = v * halfC;
        var x = Math.cos(ang) * r - Math.sin(ang) * off;
        var y = Math.sin(ang) * r + Math.cos(ang) * off;
        // 沿弦向的扭转 + 叶面弧度（整体限制在 ±cap/2，保证不穿出导风罩）
        var z = v * twist * (0.25 + 0.75 * u) + 0.42 * twist * (1 - v * v) * u;
        if (z > cap * 0.5) z = cap * 0.5; else if (z < -cap * 0.5) z = -cap * 0.5;
        verts.push(x, y, z);
      }
    }
    for (i = 0; i < sU; i++) {
      for (j = 0; j < sV; j++) {
        var a = i * (sV + 1) + j, b = a + 1, c = a + sV + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.__shared = true;
    bladeCache[key] = geo;
    return geo;
  }

  /** 一组扇叶（InstancedMesh）+ 自转标记 */
  function fanBlades(radius, count, material, spin, seedOffset, maxAxial) {
    var spinner = U.group({ name: 'fan-blades' });
    var bg = bladeGeo(radius * 0.235, radius * 0.95, radius * 0.30, 0.58,
      Math.min(radius * 0.44, (maxAxial || 0.070) * 0.55), maxAxial);
    var mats = [];
    for (var i = 0; i < count; i++) {
      mats.push(mtx(0, 0, 0, 0, 0, (i * Math.PI * 2) / count + (seedOffset || 0)));
    }
    spinner.add(inst(bg, material || M.get('fanBlade'), mats));
    if (spin) {
      spinner.userData.spin = spin;
      spinner.userData.spinAxis = 'z';
    }
    return spinner;
  }

  /** 风扇：环形边框 + 轮毂 + 扇叶（朝局部 +Y 出风的视角，轴沿 Y） */
  function fanUnit(radius, opt) {
    opt = opt || {};
    var g = U.group({ name: opt.name || 'fan' });
    var frameMat = opt.frame || M.get('blackPlastic');
    // 外框圆环（XY 平面 → 旋转后水平）
    g.add(U.mesh(U.torus(radius, opt.tube || radius * 0.055, 8, 32), frameMat, { r: [Math.PI / 2, 0, 0] }));
    // 轮毂
    g.add(U.mesh(U.cyl(radius * 0.21, radius * 0.21, radius * 0.16, 18), frameMat, { r: [Math.PI / 2, 0, 0] }));
    // 扇叶
    var bl = fanBlades(radius, opt.blades || 9, opt.blade, opt.spin || 0, opt.seed || 0);
    g.add(bl);
    return g;
  }

  /** 文字贴片（朝 +Z），返回 Mesh */
  function sticker(lines, w, h, opt) {
    var m = U.label(lines, w, h, opt || {});
    m.userData.noPick = true;
    return m;
  }

  /* ============================================================
   * 显卡
   * ========================================================== */
  function buildGPU(ctx, comp, variant) {
    var p = variant.params || {};
    // config 的 length 按 1 单位=250mm 换算（1.22≈305mm），比机箱内腔还长：
    // 机箱前面板风扇在 z=0.500（厚 0.05 → 0.475..0.525），mount z=0.06，
    // 故卡长必须 ≤ 2*(0.475-0.06)=0.83 才不穿过风扇。统一乘 0.66 → 0.805/0.759/0.647，
    // 三款长度仍可辨，且与 305/287/240mm 的真实比例一致。
    var L = Math.min((p.length || 1.05) * 0.63, 0.775);   // 长轴 Z
    var H = p.height || 0.5;           // 卡高（PCB 宽度）沿 X
    var TH = p.thickness || 0.2;       // 厚度沿 Y
    var fanN = Math.round(U.clamp(p.fans || 2, 1, 3));
    var slots = p.slots || 2;
    var rgb = !!p.rgb;
    var bodyColor = (p.color === undefined) ? 0x24282e : p.color;
    var accent = (ctx && ctx.theme && ctx.theme.accent) || 0x38e8ff;
    var accent2 = (ctx && ctx.theme && ctx.theme.accent2) || 0xa45bff;

    var root = U.group({ name: 'gpu' });
    // PCIe 触点边贴近主板（局部 x = +0.10），卡体向 -X 展开；main 的 mount 为插槽位置
    var NEAR_X = 0.10;
    var cx = NEAR_X - H / 2;
    // 塔式机箱里 PCB 水平插进 PCIe 插槽（parts-core 中 x16 槽在板面 y=-0.22，
    // 主板 mount y=+0.10，故插槽世界高度 -0.12 = config 的 gpu mount y）。
    // 把 PCB 板中心对齐到局部 y=0，卡体自然向下悬垂：背板略高于插槽、散热器在下方。
    var BODY_DY = -(TH / 2 - 0.023);
    var body = U.group({ p: [cx, BODY_DY, 0], name: 'gpu-body' });
    root.add(body);

    var yT = TH / 2, yB = -TH / 2;
    var pcb0 = yT - 0.030, pcb1 = yT - 0.016;
    var shroudY = yB + 0.013;

    var matShroud = cmat('blackPlastic', { color: bodyColor, roughness: 0.58 });
    var matArmor = cmat('aluminumDark', { color: bodyColor });
    var matPcb = M.get('pcbBlack');
    var matFin = M.get('aluminum');
    var matDark = M.get('matteBlack');
    var matSteel = M.get('steel');

    /* ---- PCB ---- */
    body.add(U.mesh(U.rbox(H * 0.96, pcb1 - pcb0, L * 0.97, 0.004, 1), matPcb, {
      p: [0, (pcb0 + pcb1) / 2, 0], name: 'gpu-pcb'
    }));

    /* ---- 金属背板 + 开孔阵列 + 丝印 ---- */
    if (p.backplate !== false) {
      body.add(U.mesh(U.rbox(H * 0.99, 0.014, L * 0.985, 0.006, 2), matArmor, {
        p: [0, yT - 0.007, 0], name: 'gpu-backplate'
      }));
      var vm = [];
      var rows = 2;
      for (var vi = 0; vi < rows; vi++) {
        for (var vj = 0; vj < 7; vj++) {
          vm.push(mtx((vi ? 1 : -1) * H * 0.30, yT + 0.0005, -L * 0.32 + vj * (L * 0.10)));
        }
      }
      body.add(inst(U.box(0.030, 0.003, 0.010), matDark, vm));
      var logo = sticker([variant.short || ''], L * 0.42, 0.055, { color: '#cfd8e3', size: 44, align: 'left' });
      logo.position.set(H * 0.02, yT + 0.0015, -L * 0.02);
      logo.rotation.x = -Math.PI / 2;
      body.add(logo);
    }

    /* ---- 散热鳍片阵列（InstancedMesh）---- */
    var finY0 = yB + 0.098, finY1 = pcb0 - 0.008;
    var finH = Math.max(0.016, finY1 - finY0);
    var finCount = Math.max(16, Math.min(46, Math.round(L / 0.028)));
    var fm = [];
    for (var fi = 0; fi < finCount; fi++) {
      fm.push(mtx(0, (finY0 + finY1) / 2, -L * 0.455 + fi * (L * 0.91 / (finCount - 1))));
    }
    body.add(inst(U.box(H * 0.90, finH, 0.0042), matFin, fm));

    /* ---- 均热板 / 铜底 ---- */
    body.add(U.mesh(U.rbox(H * 0.82, 0.016, L * 0.84, 0.006, 1), M.get('nickel'), {
      p: [0, pcb0 - 0.010, 0], name: 'gpu-vapor'
    }));
    body.add(U.mesh(U.rbox(H * 0.52, 0.008, L * 0.62, 0.004, 1), M.get('copper'), {
      p: [0, pcb0 - 0.020, 0], name: 'gpu-copper'
    }));

    /* ---- 热管（3 根，沿 Z 走线并在两端上折）---- */
    var chunk = H * 0.27;
    for (var hi = 0; hi < 3; hi++) {
      var hx = (hi - 1) * chunk;
      var pts = [
        [hx, pcb0 - 0.018, L * 0.45],
        [hx, yB + 0.075, L * 0.30],
        [hx, yB + 0.075, -L * 0.16],
        [hx, pcb0 - 0.018, -L * 0.43]
      ];
      body.add(U.mesh(U.tube(pts, 0.0105, 26, 8), M.get('copper'), { name: 'gpu-heatpipe-' + hi }));
    }

    /* ---- 导风罩：横梁 + 侧轨（留出风扇开孔）---- */
    var pitch = L / fanN;
    for (var si = 0; si <= fanN; si++) {
      body.add(U.mesh(U.rbox(H * 0.995, 0.026, 0.034, 0.006, 1), matShroud, {
        p: [0, shroudY, -L / 2 + si * pitch], name: 'gpu-shroud-bar'
      }));
    }
    body.add(U.mesh(U.rbox(0.034, 0.026, L, 0.006, 1), matShroud, { p: [H / 2 - 0.017, shroudY, 0] }));
    body.add(U.mesh(U.rbox(0.034, 0.026, L, 0.006, 1), matShroud, { p: [-(H / 2 - 0.017), shroudY, 0] }));

    /* ---- 风扇（可独立拆解 + 自转）---- */
    var fanR = Math.min(H * 0.5 - 0.048, pitch * 0.5 - 0.022);
    var subs = [];
    for (var f = 0; f < fanN; f++) {
      var fz = -L / 2 + pitch * (f + 0.5);
      var holder = U.group({ p: [0, yB + 0.050, fz], name: 'gpu-fan-' + f });
      holder.rotation.x = -Math.PI / 2;             // 叶片平面水平，朝 -Y
      holder.add(U.mesh(U.torus(fanR, 0.011, 8, 34), matShroud, { name: 'fan-ring' }));
      holder.add(U.mesh(U.cyl(fanR * 0.20, fanR * 0.20, 0.026, 16), matShroud, { r: [Math.PI / 2, 0, 0] }));
      holder.add(U.mesh(U.cyl(fanR * 0.075, fanR * 0.075, 0.030, 12), cmat('chrome', { roughness: 0.2 }), { r: [Math.PI / 2, 0, 0] }));
      holder.add(fanBlades(fanR, 9, M.get('fanBlade'), 2.4 + f * 0.12, f * 0.25, 0.062));
      body.add(holder);
      subs.push({ obj: holder, dir: [0, -1, 0], dist: 0.15 + f * 0.02 });
    }

    /* ---- PCIe 金手指（朝 +X 插入主板插槽）---- */
    body.add(U.mesh(U.box(0.006, 0.012, L * 0.52), M.get('gold'), {
      p: [H * 0.478, (pcb0 + pcb1) / 2, -L * 0.08], name: 'gpu-pcie-fingers'
    }));

    /* ---- IO 挡板 + 输出接口 ---- */
    var brX = Math.min(H * 0.54, 0.24);
    body.add(U.mesh(U.rbox(brX, TH * 0.96, 0.013, 0.003, 1), matSteel, {
      p: [0, -0.002, -L / 2 - 0.007], name: 'gpu-bracket'
    }));
    var nDP = (variant.brand === 'AMD') ? 2 : 3;
    var portY = 0;
    for (var pi = 0; pi < nDP + 1; pi++) {
      var isHdmi = pi === nDP;
      var pw = isHdmi ? 0.046 : 0.040;
      var px2 = -brX * 0.36 + pi * (brX * 0.72 / Math.max(1, nDP));
      body.add(U.mesh(U.box(pw, 0.019, 0.012), matDark, {
        p: [px2, portY, -L / 2 - 0.013], name: isHdmi ? 'gpu-hdmi' : 'gpu-dp' + pi
      }));
    }
    // 挡板固定螺丝
    body.add(U.mesh(U.cyl(0.008, 0.008, 0.010, 10), M.get('chrome'), {
      p: [-brX * 0.42, TH * 0.30, -L / 2 - 0.014], r: [Math.PI / 2, 0, 0]
    }));

    /* ---- 供电接口（12VHPWR / 8pin×2 / 8pin）---- */
    var pType = p.power || '8pin';
    var is12v = /12VHPWR/i.test(pType);
    var twoPin = /x2|×2/i.test(pType);
    var powerZ = L * 0.27;
    var powerX = -H * 0.13;
    var sockW = is12v ? 0.105 : 0.062;
    var sockD = is12v ? 0.048 : 0.040;
    var sockets = is12v ? 1 : (twoPin ? 2 : 1);
    // 供电口从 PCB 顶边长出、穿过背板向上凸出（真实显卡插头是插在卡顶的）
    var sockH = 0.046;
    var sockY = pcb1 + sockH * 0.5 - 0.010;
    for (var pk = 0; pk < sockets; pk++) {
      var sz = powerZ - pk * (sockD + 0.030);
      body.add(U.mesh(U.rbox(sockW, sockH, sockD, 0.004, 1), M.get('blackPlastic'), {
        p: [powerX, sockY, sz], name: 'gpu-power-socket-' + pk
      }));
      // 触点阵列（贴在插座顶面）
      var pinM = [];
      var cols = is12v ? 6 : 4, rowsP = 2;
      for (var ci = 0; ci < cols; ci++) {
        for (var ri = 0; ri < rowsP; ri++) {
          pinM.push(mtx(powerX - sockW * 0.34 + ci * (sockW * 0.68 / (cols - 1)),
            sockY + sockH / 2 - 0.0015,
            sz - sockD * 0.26 + ri * (sockD * 0.52 / (rowsP - 1))));
        }
      }
      body.add(inst(U.box(0.006, 0.003, 0.006), M.get('gold'), pinM));
      // 插座与背板交接处的塑壳裙边
      body.add(U.mesh(U.rbox(sockW + 0.014, 0.007, sockD + 0.012, 0.003, 1), M.get('matteBlack'), {
        p: [powerX, yT + 0.002, sz]
      }));
    }

    /* ---- 侧边 RGB 灯条 ---- */
    if (rgb) {
      var bar = U.glowBar(L * 0.80, 0.020, 0xffffff);
      bar.material.color.setHex(accent2);
      bar.position.set(-H / 2 - 0.003, yB + 0.034, 0);
      bar.rotation.y = -Math.PI / 2;
      body.add(bar);
      var bar2 = U.glowBar(L * 0.34, 0.012, 0xffffff);
      bar2.material.color.setHex(accent);
      bar2.position.set(-H / 2 - 0.003, shroudY + 0.030, L * 0.06);
      bar2.rotation.y = -Math.PI / 2;
      body.add(bar2);
      // 背板 LOGO 呼吸灯点
      var dot = U.glowBar(0.075, 0.016, 0xffffff);
      dot.material.color.setHex(accent);
      dot.position.set(H * 0.30, yT + 0.001, L * 0.20);
      dot.rotation.x = -Math.PI / 2;
      body.add(dot);
    }

    /* ---- 抗下垂支撑柱：从卡体底面直落到电源仓上盖（世界 y=-0.622）---- */
    var supZ = L * 0.5 - 0.13;
    var supX = -H * 0.44;
    // 卡底（body 局部 y=yB）到电源仓上盖的距离随厚度变化，长度 = 0.525 - TH
    var postLen = Math.max(0.10, 0.525 - TH);
    body.add(U.mesh(U.cyl(0.011, 0.015, postLen, 12), cmat('aluminumDark', { color: bodyColor }), {
      p: [supX, -0.2625, supZ], name: 'gpu-support-post'
    }));
    body.add(U.mesh(U.rbox(0.070, 0.011, 0.070, 0.004, 1), M.get('rubber'), {
      p: [supX, TH / 2 - 0.519, supZ], name: 'gpu-support-foot'
    }));

    /* ---- 背板螺丝 ---- */
    var scr = [[-H * 0.42, L * 0.42], [H * 0.42, L * 0.42], [-H * 0.42, -L * 0.42], [H * 0.42, -L * 0.42]];
    for (var xi = 0; xi < scr.length; xi++) {
      var s = U.screw(0.0085, 0.005, M.get('chrome'));
      s.position.set(scr[xi][0], yT - 0.004, scr[xi][1]);
      body.add(s);
    }

    /* ---- 背板二级拆解 ---- */
    subs.push({ obj: body, dir: [0, 1, 0], dist: 0.0 });

    root.userData.anchor = new T.Vector3(cx + H * 0.10, BODY_DY + yT + 0.06, -L * 0.10);
    root.userData.subExplode = [
      { obj: subs[0].obj, dir: [0, -1, 0], dist: 0.16 },
      { obj: subs[1].obj, dir: [0, -0.2, 0], dist: 0.22 }
    ];
    for (var si2 = 2; si2 < subs.length; si2++) {
      if (subs[si2] && subs[si2].obj !== body) root.userData.subExplode.push(subs[si2]);
    }
    root.userData.partId = 'gpu';
    root.userData.slots = slots;
    return root;
  }

  /* ============================================================
   * 内存（4 条 DIMM，长轴 Y，间距 0.075 沿 Z；薄边朝 Z）
   * ========================================================== */
  function buildRAM(ctx, comp, variant) {
    var p = variant.params || {};
    var root = U.group({ name: 'ram' });
    // X 方向总高（含马甲）。系数 1.85 让 config 里 0.034/0.044/0.052 三档拉开成
    // 0.133/0.151/0.166，肉眼可辨"普条 / 中甲 / 高马甲"，否则只差 0.01 看不出来。
    var HEIGHT = 0.070 + (p.height || 0.04) * 1.85;
    // 与 parts-core 主板上的 DIMM 槽实测对齐：槽中心世界 y = 0.10(板 mount) + 0.155 = 0.255，
    // 槽 Z = 0.02(板 mount) + [-0.288,-0.216,-0.144,-0.072]，槽中心 X ≈ 0.271。
    // ram mount 为 (0.24, 0.30, -0.18)，故本地偏移如下（间距用主板真实 0.072 而非标称 0.075，
    // 否则 4 条累计漂移 0.009 会让末端金刚指戳出插槽）。
    var DIM_Y = -0.045;
    var DIM_Z0 = -0.088;
    var SPACING = 0.072;
    var COUNT = 4;
    var bodyColor = (p.color === undefined) ? 0x22262e : p.color;
    var ledColor = p.led;

    var XPIN = 0.062;                 // 连接器外缘
    var XFAR = XPIN - HEIGHT;         // 顶端（远离主板）
    var matPcb = M.get('pcbBlack');
    // 普条/低矮马甲更哑光，高马甲拉丝感更强
    var matArmor = cmat('aluminumDark', {
      color: bodyColor, roughness: p.armor === 'low' ? 0.62 : 0.40
    });
    var matLed = ledColor !== null && ledColor !== undefined
      ? cmat('ledCyan', { emissive: ledColor, emissiveIntensity: 2.6, color: 0x0a1014 })
      : null;

    for (var i = 0; i < COUNT; i++) {
      var z = DIM_Z0 + i * SPACING;
      var st = U.group({ p: [0, DIM_Y, z], name: 'dimm-' + i });

      // 连接器端 x=0.026：加上 mount x=0.24 后金手指止于世界 0.284，
      // 正好停在主板 DIMM 插槽（世界 x 0.259..0.283）内，不穿透板体
      var XCONN = 0.026;
      var pcbLen = XCONN - (XFAR + 0.014);
      st.add(U.mesh(U.box(pcbLen, 0.352, 0.009), matPcb, {
        p: [(XCONN + XFAR + 0.014) / 2, 0, 0]
      }));
      // 金手指连接器（插进主板插槽，+X 端）
      st.add(U.mesh(U.box(0.020, 0.300, 0.0085), M.get('gold'), { p: [XCONN + 0.008, 0, 0] }));
      st.add(U.mesh(U.box(0.010, 0.312, 0.0105), M.get('blackPlastic'), { p: [XCONN, 0, 0] }));

      // 双面马甲
      var armorLen = XCONN - XFAR - 0.006;
      var armorCx = (XCONN + XFAR) / 2 - 0.001;
      st.add(U.mesh(U.rbox(armorLen, 0.336, 0.009, 0.003, 1), matArmor, {
        p: [armorCx, 0, 0.0125], name: 'dimm-armor-a'
      }));
      st.add(U.mesh(U.rbox(armorLen, 0.336, 0.009, 0.003, 1), matArmor, {
        p: [armorCx, 0, -0.0125], name: 'dimm-armor-b'
      }));

      // 顶部导光条 / 低矮马甲顶盖
      if (matLed) {
        st.add(U.mesh(U.rbox(0.030, 0.330, 0.030, 0.008, 2), matLed, {
          p: [XFAR + 0.013, 0, 0], name: 'dimm-rgb'
        }));
      } else {
        st.add(U.mesh(U.rbox(0.026, 0.330, 0.028, 0.006, 1), matArmor, {
          p: [XFAR + 0.014, 0, 0], name: 'dimm-cap'
        }));
      }

      // 马甲上的斜切装饰槽
      st.add(U.mesh(U.box(armorLen * 0.55, 0.010, 0.0105), cmat('matteBlack', {}), {
        p: [armorCx + armorLen * 0.10, 0.120, 0.0125]
      }));
      root.add(st);
    }

    // 丝印贴纸（贴在第一条马甲上）
    var lab = sticker([(variant.brand || '')], 0.09, 0.016, { color: '#dbe6f2', size: 26, align: 'left' });
    lab.position.set((XCONN + XFAR) / 2 - 0.01, DIM_Y - 0.085, DIM_Z0 - 0.0178);
    lab.rotation.y = Math.PI;
    root.add(lab);

    root.userData.anchor = new T.Vector3(0, DIM_Y + 0.20, DIM_Z0 + SPACING * 1.5);
    root.userData.partId = 'ram';
    return root;
  }

  /* ============================================================
   * M.2 NVMe SSD
   * ========================================================== */
  function buildSSD(ctx, comp, variant) {
    var p = variant.params || {};
    var root = U.group({ name: 'ssd' });
    var L = 0.30;            // Z 长（2280）
    var W = 0.085;           // Y 宽
    var TT = Math.max(0.020, p.thickness || 0.03);  // X 总厚
    var hasHs = !!p.heatsink;
    var bodyColor = (p.color === undefined) ? 0x2a2f37 : p.color;

    // 主板 mount x=0.30、板面 0.285、M.2 金属散热片占据世界 x≈0.251..0.271。
    // ssd mount x=0.245，PCB 中心放本地 x=0 正好让 PCB 贴住 0.251，不与主板散热片穿模。
    var PCB_X = 0.0;
    // 主板 M.2 金属散热片覆盖世界 z≈-0.10..0.14（板 mount z=0.02，散热片 z 中心 0.0 长 0.24）。
    // ssd mount z=0.16 会让整条 SSD 悬在 M.2 区外，整体本地 z 偏移 -0.13 压回 M.2_1 上。
    var M2_DZ = -0.13;
    var pcbT = 0.012;
    var matPcb = M.get('pcbBlack');
    var matHs = cmat('aluminumDark', { color: bodyColor, roughness: 0.42 });
    var matChip = M.get('blackPlastic');

    // 整条 SSD 挂在 body 上，几何按 z=0 建模，由 body 统一偏移
    var body = U.group({ p: [0, 0, M2_DZ], name: 'ssd-body' });
    root.add(body);

    // PCB
    body.add(U.mesh(U.rbox(pcbT, W, L, 0.003, 1), matPcb, { p: [PCB_X, 0, 0], name: 'ssd-pcb' }));
    // 金手指（+Z 端）
    body.add(U.mesh(U.box(0.008, W * 0.72, 0.030), M.get('gold'), { p: [PCB_X, 0, L / 2 - 0.014] }));
    // 主控 + NAND（-X 面）
    body.add(U.mesh(U.box(0.012, 0.028, 0.028), matChip, { p: [PCB_X - 0.012, 0.012, L * 0.16], name: 'ssd-controller' }));
    var nandZ = [-0.055, -0.108];
    for (var ni = 0; ni < nandZ.length; ni++) {
      body.add(U.mesh(U.box(0.011, 0.030, 0.032), matChip, { p: [PCB_X - 0.012, 0.010, nandZ[ni]], name: 'ssd-nand-' + ni }));
    }
    // 固定螺丝（-Z 端）
    var sc = U.screw(0.006, 0.004, M.get('chrome'));
    sc.position.set(PCB_X, 0, -L / 2 + 0.012);
    sc.rotation.z = Math.PI / 2;
    body.add(sc);

    if (hasHs) {
      var hsThick = Math.max(0.024, TT - 0.020);
      var hsX = PCB_X - 0.012 - hsThick / 2;
      body.add(U.mesh(U.rbox(hsThick, W + 0.014, L * 0.93, 0.008, 2), matHs, {
        p: [hsX, 0, -0.004], name: 'ssd-heatsink'
      }));
      // 鳍槽（沿 Z 的细槽阵列）
      var gm = [];
      for (var gi = 0; gi < 7; gi++) {
        gm.push(mtx(hsX - hsThick * 0.5 - 0.0015, -W * 0.32 + gi * (W * 0.64 / 6), -0.004));
      }
      body.add(inst(U.box(0.0035, 0.006, L * 0.86), cmat('matteBlack', {}), gm));
      // 铭牌
      var lab = sticker([p.capacity || '2TB', variant.brand || ''], 0.13, 0.030,
        { color: '#e6eef8', size: 20, align: 'left' });
      lab.position.set(hsX - hsThick / 2 - 0.0025, 0, -0.004);
      lab.rotation.y = -Math.PI / 2;
      body.add(lab);
      // 马甲固定螺丝
      for (var hi = 0; hi < 2; hi++) {
        var s2 = U.screw(0.0055, 0.003, M.get('chrome'));
        s2.position.set(hsX - hsThick / 2 - 0.002, (hi ? -1 : 1) * W * 0.44, -0.004);
        s2.rotation.z = -Math.PI / 2;
        body.add(s2);
      }
    } else {
      // 无马甲：贴纸 + 标签
      var lab2 = sticker([p.capacity || '1TB', 'PCIe 4.0 x4'], 0.11, 0.028,
        { color: '#dbe6f2', size: 18, align: 'left' });
      lab2.position.set(PCB_X - 0.0065, 0, -0.055);
      lab2.rotation.y = -Math.PI / 2;
      body.add(lab2);
    }

    root.userData.anchor = new T.Vector3(PCB_X, 0.06, M2_DZ);
    root.userData.partId = 'ssd';
    return root;
  }

  /* ============================================================
   * 电源（0.34 × 0.20 × 0.36，风扇朝 -Y，模组口朝 +X）
   * ========================================================== */
  function buildPSU(ctx, comp, variant) {
    var p = variant.params || {};
    var W = 0.34, Hh = 0.20, D = 0.36;
    var bodyColor = (p.color === undefined) ? 0x1b1e23 : p.color;
    var fanR = (p.fan || 0.15) * 0.93;
    var connCount = Math.round(U.clamp(p.connectors || 6, 4, 8));
    var modular = p.modular !== false;

    var root = U.group({ name: 'psu' });
    var matShell = cmat('psuShell', { color: bodyColor });
    var matDark = M.get('matteBlack');

    // 壳体
    root.add(U.mesh(U.rbox(W, Hh, D, 0.014, 2), matShell, { name: 'psu-shell' }));
    // 顶面凹陷装饰线
    root.add(U.mesh(U.box(W * 0.86, 0.004, 0.010), cmat('blackPlastic', {}), { p: [0, Hh / 2 - 0.001, D * 0.30] }));

    // 底部风扇网罩 + 扇叶
    var yBot = -Hh / 2;
    root.add(U.mesh(U.torus(fanR, 0.010, 8, 36), matDark, { p: [0, yBot - 0.004, -D * 0.03], r: [Math.PI / 2, 0, 0] }));
    root.add(U.mesh(U.torus(fanR * 0.66, 0.006, 6, 32), matDark, { p: [0, yBot - 0.007, -D * 0.03], r: [Math.PI / 2, 0, 0] }));
    // 冲孔网片
    var grille = U.mesh(U.cyl(fanR * 1.02, fanR * 1.02, 0.003, 40), cmat('meshDark', {}), {
      p: [0, yBot - 0.009, -D * 0.03], cast: false
    });
    grille.material.side = T.DoubleSide;
    root.add(grille);
    // 扇叶（自转）
    var fh = U.group({ p: [0, yBot + 0.030, -D * 0.03], name: 'psu-fan' });
    fh.rotation.x = -Math.PI / 2;
    fh.add(U.mesh(U.cyl(fanR * 0.22, fanR * 0.22, 0.03, 16), matDark, { r: [Math.PI / 2, 0, 0] }));
    fh.add(fanBlades(fanR, 7, M.get('fanBlade'), 1.1, 0.1, 0.052));
    root.add(fh);

    // 侧板螺丝
    var scPos = [[-W * 0.42, D * 0.42], [W * 0.42, D * 0.42], [-W * 0.42, -D * 0.42], [W * 0.42, -D * 0.42]];
    for (var si = 0; si < scPos.length; si++) {
      var s = U.screw(0.009, 0.005, M.get('chrome'));
      s.position.set(scPos[si][0], yBot + 0.004, scPos[si][1]);
      s.rotation.x = Math.PI;
      root.add(s);
    }

    // 模组接口面板（+X）
    var panelX = W / 2 + 0.006;
    if (modular) {
      root.add(U.mesh(U.rbox(0.014, Hh * 0.88, D * 0.86, 0.006, 1), cmat('blackPlastic', {}), {
        p: [panelX, 0, 0], name: 'psu-modpanel'
      }));
      // 24pin 主供电口（左列竖排，y 居中不越界）
      var bigZ = -D * 0.255, bigY = 0;
      root.add(U.mesh(U.rbox(0.020, 0.112, 0.070, 0.005, 1), M.get('greyPlastic'), {
        p: [panelX + 0.011, bigY, bigZ], name: 'psu-24pin'
      }));
      root.add(U.mesh(U.box(0.008, 0.098, 0.058), matDark, { p: [panelX + 0.021, bigY, bigZ] }));
      // 其余模组口：3 列 × 3 行网格，全部限制在面板内（半高 0.088）
      var rest = connCount - 1;
      var colZ = [-0.04, 0.055, 0.135];
      var rowY = [0.058, 0, -0.058];
      for (var ci = 0; ci < rest; ci++) {
        var col = ci % 3, row = Math.floor(ci / 3) % 3;
        var cz = colZ[col], cy = rowY[row];
        root.add(U.mesh(U.rbox(0.018, 0.048, 0.042, 0.004, 1), M.get('greyPlastic'), {
          p: [panelX + 0.010, cy, cz], name: 'psu-conn-' + ci
        }));
        root.add(U.mesh(U.box(0.006, 0.036, 0.030), matDark, { p: [panelX + 0.019, cy, cz] }));
      }
    } else {
      // 非模组：出线孔 + 橡胶护套
      root.add(U.mesh(U.cyl(0.030, 0.030, 0.016, 18), M.get('rubber'), {
        p: [panelX, -Hh * 0.12, -D * 0.20], r: [0, 0, Math.PI / 2], name: 'psu-cable-grommet'
      }));
    }

    // 铭牌贴纸（-X 面，正对默认相机）
    var nameplate = sticker(
      [variant.brand || '', (p.power || 850) + 'W', '80 PLUS GOLD'],
      0.30, 0.135, { w: 640, h: 288, size: 40, color: '#e3ecf7', align: 'left' }
    );
    nameplate.position.set(-W / 2 - 0.0015, 0.006, -0.01);
    nameplate.rotation.y = -Math.PI / 2;
    root.add(nameplate);
    // 功率角标
    var badge = sticker([(p.power || 850) + 'W'], 0.10, 0.036, { color: '#ffd479', size: 40, align: 'center' });
    badge.position.set(-W / 2 - 0.0015, -Hh * 0.30, D * 0.24);
    badge.rotation.y = -Math.PI / 2;
    root.add(badge);

    // AC 入口 + 开关（-Z 面）
    root.add(U.mesh(U.rbox(0.075, 0.055, 0.012, 0.004, 1), matDark, {
      p: [-W * 0.20, -0.010, -D / 2 - 0.005], name: 'psu-iec'
    }));
    root.add(U.mesh(U.rbox(0.030, 0.028, 0.010, 0.003, 1), M.get('blackPlastic'), {
      p: [W * 0.20, -0.010, -D / 2 - 0.005], name: 'psu-switch'
    }));
    // 散热格栅（-Z 面小孔）
    var hm = [];
    for (var hi = 0; hi < 12; hi++) {
      hm.push(mtx(0, -Hh * 0.34 + Math.floor(hi / 6) * 0.020, -D / 2 - 0.002, 0, 0.35, 0));
    }
    root.add(inst(U.box(0.20, 0.009, 0.004), cmat('matteBlack', {}), hm));

    root.userData.anchor = new T.Vector3(-W * 0.2, Hh * 0.5 + 0.05, 0);
    root.userData.partId = 'psu';
    return root;
  }

  /* ============================================================
   * 线材 / 附属物：PC3D.parts.extras(ctx) -> THREE.Group
   * 世界坐标（挂到 app.root，main 只加一次；不参与拾取）
   * ========================================================== */
  function cable(points, radius, material, opt) {
    opt = opt || {};
    var geo = U.tube(points, radius, opt.seg || 40, opt.rad || 8);
    var m = U.mesh(geo, material, { cast: true, receive: true });
    m.userData.noPick = true;
    return m;
  }

  function comb(points, idx, w, h, material) {
    var p = points[idx];
    return U.mesh(U.box(w, h, 0.014), material || M.get('blackPlastic'), {
      p: [p[0], p[1], p[2]], userData: { noPick: true }
    });
  }

  function buildExtras(ctx) {
    var C = (ctx && ctx.config) || PC3D.config;
    var root = U.group({ name: 'extras-cables' });
    var matSleeve = M.get('sleeved');
    var matSleeve2 = cmat('sleeved', { color: 0x20252c });

    // 当前显卡变体决定供电线类型
    var gpuComp = C.components.gpu;
    var gi = (gpuComp && gpuComp._index) || (gpuComp && gpuComp.previewVariant) || 0;
    var gpuVariant = gpuComp && gpuComp.variants[gi] ? gpuComp.variants[gi] : null;
    var gp = (gpuVariant && gpuVariant.params) || {};

    /* ---- 24pin 主板供电：PSU(+X 面板) → 主板右侧 ---- */
    var mb24 = [
      [0.265, -0.655, 0.020],
      [0.345, -0.575, 0.115],
      [0.408, -0.250, 0.255],
      [0.376, 0.055, 0.330],
      [0.300, 0.225, 0.300],
      [0.268, 0.292, 0.285]
    ];
    for (var c = 0; c < 3; c++) {
      var off = (c - 1) * 0.021;
      var pts24 = mb24.map(function (q) { return [q[0] + off * 0.45, q[1], q[2] + off]; });
      root.add(cable(pts24, 0.015, c === 1 ? matSleeve2 : matSleeve, { seg: 44 }));
    }
    for (var c2 = 0; c2 < 2; c2++) {
      var idx2 = [1, 3][c2];
      var combM = comb(mb24, idx2, 0.075, 0.052, M.get('blackPlastic'));
      combM.userData.noPick = true;
      root.add(combM);
    }

    /* ---- 显卡供电：12VHPWR 或 8pin ---- */
    var is12 = /12VHPWR/i.test(gp.power || '');
    var pcie = [
      [0.255, -0.660, -0.135],
      [0.330, -0.480, -0.020],
      [0.395, -0.190, 0.250],
      [0.300, 0.090, 0.430],
      [0.120, 0.098, 0.455],
      [-0.052, 0.045, 0.418]
    ];
    if (is12) {
      root.add(cable(pcie, 0.024, matSleeve, { seg: 46 }));
      root.add(comb(pcie, 2, 0.055, 0.055, M.get('greyPlastic')));
    } else {
      for (var d = 0; d < 2; d++) {
        var dz = d * 0.042;
        var pts2 = pcie.map(function (q) { return [q[0], q[1], q[2] - dz]; });
        root.add(cable(pts2, 0.017, d ? matSleeve2 : matSleeve, { seg: 46 }));
      }
      root.add(comb(pcie, 2, 0.050, 0.090, M.get('blackPlastic')));
    }

    /* ---- 机箱风扇 A-RGB 线：前面板 → 主板 ---- */
    var argb = [
      [0.020, 0.330, 0.470],
      [0.120, 0.290, 0.445],
      [0.215, 0.190, 0.390],
      [0.262, 0.120, 0.330]
    ];
    root.add(cable(argb, 0.0065, matSleeve2, { seg: 26, rad: 6 }));
    var argb2 = [
      [0.020, -0.020, 0.470],
      [0.130, 0.040, 0.440],
      [0.225, 0.090, 0.375],
      [0.262, 0.108, 0.335]
    ];
    root.add(cable(argb2, 0.0065, matSleeve2, { seg: 26, rad: 6 }));

    /* ---- 电源仓过线护套 ---- */
    root.add(U.mesh(U.rbox(0.10, 0.080, 0.020, 0.008, 1), M.get('rubber'), {
      p: [0.300, 0.255, 0.300], userData: { noPick: true }, cast: false
    }));

    root.userData.decor = true;
    return root;
  }

  /* ============================================================
   * 注册
   * ========================================================== */
  PC3D.parts.register('gpu', buildGPU);
  PC3D.parts.register('ram', buildRAM);
  PC3D.parts.register('ssd', buildSSD);
  PC3D.parts.register('psu', buildPSU);
  PC3D.parts.extras = buildExtras;
})();
