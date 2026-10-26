/* ============================================================
 * stage.js — 环境 / 灯光 / 后期辉光 / 相机入场（teammate C）
 * 依赖：THREE r147(UMD)、util.js、materials.js、config.js(可选)
 * 暴露：PC3D.stage.{ init, update, render, setBloom, setEnvIntensity,
 *                      setAccent, setFloorY, enter, resize, anchor }
 * ========================================================== */
(function () {
  'use strict';
  var PC3D = (window.PC3D = window.PC3D || {});
  var T = THREE;
  var S = (PC3D.stage = {});
  var U = PC3D.util || {};

  var FLOOR_Y = -1.0;          // 地面高度（机箱外框底 y=-0.98）
  var SKY_R = 8.0;             // 天空球半径（跟随相机）

  var st = {
    renderer: null, scene: null, camera: null,
    composer: null, renderPass: null, bloomPass: null, gammaPass: null,
    bloom: true, envIntensity: 1,
    /* 后期参数（Lead 可运行时扫参，见 S.setBloomParams / S.setExposure）
     * 2026-10-25 亮度基准组（Lead 决策采纳，headless 实测标定）：
     *   （1280×800 readPixels 稳态标定）mean 0.160 / p50 0.105 / p99 1.00 / 过曝 1.23%
     *   / 中心均值 0.344 / 中心>0.65 占 15.2% / 四角最大通道 11-4-1-1
     * 调参结构：exposure 单独抬只抬 mean 抬不动 p99；gradeGain 是中间调总闸、gradeGamma 是
     * 对比（>1 压暗中间调并拉开高光）；两者组合才能在 mean 钉在 0.16 的同时把 p99 顶到 1.0。
     * 注：composer 末端的 GammaCorrection 会对 toneMapped:false 的元素再做一次 sRGB 编码
     * （屏幕值≈sqrt），所以 bloom strength 对 mean 几乎没有影响。 */
    bloomParams: { strength: 1.70, radius: 0.45, threshold: 0.70 },
    exposure: 1.38,
    skyGain: 1.42,     // SKY_FRAG 整体增益（运行时可用 S.setSkyGain 扫参）
    glowGain: 1.05,    // 网格/光环/扫描带整体增益
    vignette: 0.96,    // 镜头暗角强度（0=关闭；0.96 才能把四角压到 ≤25/255）
    gradeGain: 0.900,  // 线性域整体增益（中间调总闸）
    gradeGamma: 1.35,  // 线性域 gamma 对比（>1 压中间调、保留白点）
    pmrem: null, envRT: null,
    accent: new T.Color(0x38e8ff), accent2: new T.Color(0xa45bff),
    time: 0, inited: false, dpr: 1,
    entering: false, enterT: 0, enterDur: 1.6,
    enterStartWall: 0, enterProgress: 0,
    enterFromPos: new T.Vector3(), enterFromTarget: new T.Vector3(),
    enterLastTarget: new T.Vector3(),
    enterResolve: null, controls: null,
    objs: {},
    size: new T.Vector2(1280, 800)
  };

  S.floorY = FLOOR_Y;
  S.anchor = {
    position: new T.Vector3(-3.35, 1.10, 2.55),
    target: new T.Vector3(0, 0.02, 0)
  };

  /* ------------------------------------------------------------
   * 小工具（局部，不挂全局）
   * ---------------------------------------------------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeIO(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  /** 墙钟时间（毫秒）：入场动画用它推进，避免低帧率下被 dt 累加拖长 */
  function nowWall() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  /** 当前 OrbitControls（优先注入的，其次 PC3D.controls / PC3D.app.controls） */
  function getControls() {
    return st.controls || PC3D.controls || (PC3D.app && PC3D.app.controls) || null;
  }
  /**
   * 结束入场并交还控制权。
   * @param {boolean} keepCam  true=用户已手动操作：把相机按「相对旧 target 的偏移」平移到新 target
   *                           （保持用户的缩放/方位，不做回拉）；
   *                           false=动画正常走完：相机与 target 精确落在 anchor 上。
   */
  function finishEnter(keepCam) {
    if (!st.entering && !st.enterResolve) return;
    st.entering = false;
    st.enterProgress = 1;
    var ctl = getControls();
    var cam = st.camera;
    if (ctl && ctl.target) {
      if (keepCam && cam) {
        /* 保住用户的滚轮缩放与拖动方向：整体平移视线中心，不改相对偏移 */
        var shift = S.anchor.target.clone().sub(ctl.target);
        cam.position.add(shift);
        ctl.target.copy(S.anchor.target);
      } else {
        ctl.target.copy(S.anchor.target);
        if (cam) cam.position.copy(S.anchor.position);
      }
    } else if (!keepCam && cam) {
      cam.position.copy(S.anchor.position);
    }
    if (cam) cam.lookAt(S.anchor.target);
    if (ctl && ctl.update) ctl.update();
    var res = st.enterResolve;
    st.enterResolve = null;
    if (res) res(S);
  }
  function cv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function toTex(c, srgb) {
    var t = new T.CanvasTexture(c);
    t.encoding = (srgb === false) ? T.LinearEncoding : T.sRGBEncoding;
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }
  function hexClass(c) { return '#' + c.getHexString(); }
  function rgbaStr(c, a) {
    return 'rgba(' + Math.round(clamp(c.r, 0, 1) * 255) + ',' +
      Math.round(clamp(c.g, 0, 1) * 255) + ',' +
      Math.round(clamp(c.b, 0, 1) * 255) + ',' + a + ')';
  }
  /** 径向渐变纹理 */
  function radialTex(size, stops, srgb) {
    var c = cv(size, size), ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    return toTex(c, srgb);
  }

  /* ============================================================
   * 1. 程序化环境贴图（equirect canvas -> PMREM）
   * ========================================================== */
  function buildEnvMap(renderer, scene) {
    if (!renderer || !scene) return;
    var w = 1024, h = 512;
    var c = cv(w, h), ctx = c.getContext('2d');

    // 基础垂直渐变（上亮下暗，中部为地平线）
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0.00, '#0d1a2b');
    g.addColorStop(0.30, '#0a1420');
    g.addColorStop(0.47, '#0b1622');
    g.addColorStop(0.50, '#1b2a3a');
    g.addColorStop(0.53, '#080d14');
    g.addColorStop(0.78, '#04070b');
    g.addColorStop(1.00, '#020305');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // 顶部大面积柔光（给铝件/玻璃拉出长条高光）
    var g2 = ctx.createRadialGradient(w * 0.28, h * 0.10, 8, w * 0.28, h * 0.10, w * 0.52);
    g2.addColorStop(0, 'rgba(255,255,255,0.98)');
    g2.addColorStop(0.28, 'rgba(200,228,255,0.55)');
    g2.addColorStop(1, 'rgba(120,170,220,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);

    // 第二块柔光（对侧，制造双高光层次）
    var g3 = ctx.createRadialGradient(w * 0.72, h * 0.16, 6, w * 0.72, h * 0.16, w * 0.34);
    g3.addColorStop(0, 'rgba(210,235,255,0.75)');
    g3.addColorStop(1, 'rgba(160,200,240,0)');
    ctx.fillStyle = g3; ctx.fillRect(0, 0, w, h);

    // 地平线两侧的强调色反射团（金属上出现主题色反光）
    var ac = st.accent, ac2 = st.accent2;
    var ga = ctx.createRadialGradient(w * 0.12, h * 0.50, 4, w * 0.12, h * 0.50, w * 0.30);
    ga.addColorStop(0, rgbaStr(ac, 0.85));
    ga.addColorStop(1, rgbaStr(ac, 0));
    ctx.fillStyle = ga; ctx.fillRect(0, 0, w, h);

    var gb = ctx.createRadialGradient(w * 0.86, h * 0.52, 4, w * 0.86, h * 0.52, w * 0.26);
    gb.addColorStop(0, rgbaStr(ac2, 0.7));
    gb.addColorStop(1, rgbaStr(ac2, 0));
    ctx.fillStyle = gb; ctx.fillRect(0, 0, w, h);

    // 顶部细亮条纹（工业棚灯管感）
    for (var i = 0; i < 3; i++) {
      var lg = ctx.createLinearGradient(0, h * (0.06 + i * 0.05), 0, h * (0.10 + i * 0.05));
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(235,245,255,0.5)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, h * (0.06 + i * 0.05), w, h * 0.045);
    }

    // 地面暗反射
    var gd = ctx.createLinearGradient(0, h * 0.52, 0, h);
    gd.addColorStop(0, 'rgba(0,0,0,0.0)');
    gd.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = gd; ctx.fillRect(0, h * 0.52, w, h * 0.48);

    var tex = toTex(c, true);
    tex.mapping = T.EquirectangularReflectionMapping;
    if (!st.pmrem && T.PMREMGenerator) st.pmrem = new T.PMREMGenerator(renderer);
    if (!st.pmrem) return;
    st.pmrem.compileEquirectangularShader();
    var rt = st.pmrem.fromEquirectangular(tex);
    tex.dispose();
    if (st.envRT) st.envRT.dispose();
    st.envRT = rt;
    scene.environment = rt.texture;
  }

  /* ============================================================
   * 2. 天空球（跟随相机，深度测试关闭 -> 永远垫底）
   * ========================================================== */
  var SKY_VERT = [
    'varying vec3 vDir;',
    'void main() {',
    '  vDir = position;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var SKY_FRAG = [
    'uniform vec3 uAccent;',
    'uniform vec3 uAccent2;',
    'uniform float uTime;',
    'uniform float uGain;',
    'varying vec3 vDir;',
    'float hash21(vec2 p) {',
    '  p = fract(p * vec2(123.34, 456.21));',
    '  p += dot(p, p + 45.32);',
    '  return fract(p.x * p.y);',
    '}',
    'void main() {',
    '  vec3 d = normalize(vDir);',
    '  float h = d.y;',
    '  float ang = atan(d.z, d.x);',
    '',
    // 背景压暗：与机箱主体（ACES 后 core 均值约 0.5）拉出对比，突出主体轮廓
    '  vec3 col = mix(vec3(0.0007, 0.0010, 0.0022), vec3(0.0032, 0.0074, 0.0140), smoothstep(-0.45, 0.95, h));',
    '',
    '  // 地平线雾带 + 强调色',
    '  float hor = exp(-pow((h + 0.015) * 6.0, 2.0));',
    '  col += vec3(0.0090, 0.0190, 0.0310) * hor;',
    '  col += uAccent * hor * 0.040;',
    '',
    '  // 地平线下方冷紫余晖',
    '  col += uAccent2 * exp(-pow((h + 0.42) * 2.4, 2.0)) * 0.014;',
    '',
    '  // 竖向柔光条（缓慢摆动）',
    '  float streak = pow(max(0.0, sin(ang * 5.0 + uTime * 0.05)), 10.0);',
    '  col += vec3(0.012, 0.029, 0.043) * streak * smoothstep(-0.02, 0.55, h) * 0.42;',
    '  float streak2 = pow(max(0.0, sin(ang * 13.0 - uTime * 0.03 + 1.7)), 16.0);',
    '  col += uAccent * streak2 * smoothstep(0.0, 0.45, h) * 0.022;',
    '',
    '  // 星点',
    '  vec2 gp = vec2(ang * 34.0, asin(clamp(h, -1.0, 1.0)) * 26.0);',
    '  float n = hash21(floor(gp));',
    '  float tw = 0.6 + 0.4 * sin(uTime * 1.8 + n * 40.0);',
    '  col += vec3(0.35, 0.46, 0.60) * step(0.9955, n) * tw * smoothstep(0.02, 0.35, h) * 0.62;',
    '',
    '  // 地平线以下压暗',
    '  col *= mix(0.28, 1.0, smoothstep(-0.42, 0.02, h));',
    '  col *= uGain;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function buildSky(scene) {
    var geo = new T.SphereGeometry(SKY_R, 40, 26);
    var mat = new T.ShaderMaterial({
      side: T.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        uAccent: { value: st.accent.clone() },
        uAccent2: { value: st.accent2.clone() },
        uTime: { value: 0 },
        uGain: { value: st.skyGain }
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG
    });
    var sky = new T.Mesh(geo, mat);
    sky.name = 'stage:sky';
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    sky.userData.noPick = true;
    scene.add(sky);
    st.objs.sky = sky;
  }

  /* ============================================================
   * 3. 地面 / 网格 / 辉光环
   * ========================================================== */
  function gridTex(size, lineW, alpha) {
    var c = cv(size, size), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
    ctx.fillRect(0, 0, size, lineW);
    ctx.fillRect(0, 0, lineW, size);
    var t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.encoding = T.LinearEncoding;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }

  function buildGround(scene) {
    var g = new T.Group();
    g.name = 'stage:ground';
    g.userData.noPick = true;
    scene.add(g);
    st.objs.ground = g;

    /* 3.1 反光深色底板 */
    var plateMat = new T.MeshStandardMaterial({
      color: 0x0a0f16,
      metalness: 0.88,
      roughness: 0.30,
      envMapIntensity: 0.45
    });
    /* 颜色按 sRGB 书写，转线性后再交给 ACES，避免"看起来比设计值亮一档" */
    plateMat.color.convertSRGBToLinear();
    var plate = new T.Mesh(new T.PlaneGeometry(44, 44), plateMat);
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = 0;
    plate.receiveShadow = true;
    plate.renderOrder = 0;
    plate.userData.noPick = true;
    g.add(plate);
    st.objs.plate = plate;

    /* 3.2 接地阴影斑（伪接触阴影） */
    var blobTex = radialTex(256, [
      [0, 'rgba(0,0,0,0.92)'],
      [0.45, 'rgba(0,0,0,0.55)'],
      [1, 'rgba(0,0,0,0)']
    ]);
    var blob = new T.Mesh(new T.PlaneGeometry(3.9, 3.0), new T.MeshBasicMaterial({
      map: blobTex, transparent: true, depthWrite: false, opacity: 0.95, toneMapped: false
    }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.set(0, 0.002, 0.05);
    blob.renderOrder = 1;
    blob.userData.noPick = true;
    g.add(blob);
    st.objs.blob = blob;

    /* 3.3 双层网格（加法混合，颜色跟强调色） */
    var fineTex = gridTex(64, 1, 0.5);
    fineTex.repeat.set(48, 48);
    var fineMat = new T.MeshBasicMaterial({
      map: fineTex, color: st.accent.clone().multiplyScalar(0.17),
      transparent: true, opacity: 0.55, blending: T.AdditiveBlending,
      depthWrite: false, fog: false, toneMapped: false
    });
    var fine = new T.Mesh(new T.PlaneGeometry(44, 44), fineMat);
    fine.rotation.x = -Math.PI / 2;
    fine.position.y = 0.004;
    fine.renderOrder = 2;
    fine.userData.noPick = true;
    g.add(fine);
    fine.userData.baseOpacity = 0.55;
    st.objs.gridFine = fine;

    var majorTex = gridTex(128, 2, 0.62);
    majorTex.repeat.set(11, 11);
    var majorMat = new T.MeshBasicMaterial({
      map: majorTex, color: st.accent.clone().multiplyScalar(0.33),
      transparent: true, opacity: 0.49, blending: T.AdditiveBlending,
      depthWrite: false, fog: false, toneMapped: false
    });
    var major = new T.Mesh(new T.PlaneGeometry(44, 44), majorMat);
    major.rotation.x = -Math.PI / 2;
    major.position.y = 0.005;
    major.renderOrder = 3;
    major.userData.noPick = true;
    g.add(major);
    major.userData.baseOpacity = 0.49;
    st.objs.gridMajor = major;

    /* 3.4 径向暗角（压掉远处网格，落地融合） */
    var fadeTex = radialTex(256, [
      [0.00, 'rgba(0,0,0,0)'],
      [0.42, 'rgba(0,0,0,0.30)'],
      [0.72, 'rgba(0,0,0,0.86)'],
      [1.00, 'rgba(0,0,0,1)']
    ]);
    var fade = new T.Mesh(new T.PlaneGeometry(44, 44), new T.MeshBasicMaterial({
      map: fadeTex, transparent: true, depthWrite: false, opacity: 1, toneMapped: false
    }));
    fade.rotation.x = -Math.PI / 2;
    fade.position.y = 0.007;
    fade.renderOrder = 4;
    fade.userData.noPick = true;
    g.add(fade);
    fade.userData.baseOpacity = 1;
    st.objs.fade = fade;

    /* 3.5 中心环形辉光 */
    var haloTex = radialTex(256, [
      [0.00, 'rgba(255,255,255,0.85)'],
      [0.22, 'rgba(255,255,255,0.42)'],
      [0.48, 'rgba(255,255,255,0.10)'],
      [1.00, 'rgba(255,255,255,0)']
    ]);
    var halo = new T.Mesh(new T.PlaneGeometry(6.4, 6.4), new T.MeshBasicMaterial({
      map: haloTex, color: st.accent.clone(), transparent: true, opacity: 0.36,
      blending: T.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false
    }));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.009;
    halo.renderOrder = 5;
    halo.userData.noPick = true;
    halo.userData.glow = { base: 0.28, amp: 0.06, w: 0.92, ph: 0 };
    g.add(halo);
    st.objs.halo = halo;

    /* 3.6 发光环 / 弧 */
    function flatRing(radius, tube, color, op, arc) {
      var geo = new T.TorusGeometry(radius, tube, 5, 96, arc === undefined ? Math.PI * 2 : arc);
      var m = new T.Mesh(geo, new T.MeshBasicMaterial({
        color: color, transparent: true, opacity: op,
        blending: T.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.012;
      m.userData.noPick = true;
      m.userData.baseOpacity = op;
      return m;
    }
    var rA = flatRing(1.18, 0.0045, st.accent.clone(), 0.55);
    rA.renderOrder = 6;
    rA.userData.glow = { base: 0.40, amp: 0.14, w: 1.15, ph: 0 };
    g.add(rA); st.objs.ringA = rA;

    var rB = flatRing(1.62, 0.0032, st.accent2.clone(), 0.39);
    rB.renderOrder = 6;
    rB.userData.glow = { base: 0.27, amp: 0.12, w: 0.83, ph: 1.7 };
    g.add(rB); st.objs.ringB = rB;

    var rC = flatRing(1.42, 0.0075, st.accent.clone(), 0.58, Math.PI * 1.35);
    rC.renderOrder = 7;
    rC.userData.glow = { base: 0.47, amp: 0.16, w: 1.7, ph: 0.4 };
    g.add(rC); st.objs.ringC = rC;

    g.position.y = FLOOR_Y;
  }

  /* ============================================================
   * 4. 灯光（三点 + 2 彩色补光 + 顶部柔光）
   * ========================================================== */
  function buildLights(scene) {
    var o = st.objs;

    /* 灯光强度为 2026-10-25 亮度基准组的一部分：整体刻意压暗，
     * 让主体靠形态/材质对比与 bloom 高光出层次，而不是靠打亮。
     * 改这里请同步重跑亮度实测（mean/p50/p99/过曝/四角）。 */
    var hemi = new T.HemisphereLight(0x24506e, 0x05070b, 0.14);
    hemi.position.set(0, 3, 0);
    scene.add(hemi);
    o.hemi = hemi;

    /* key —— 主光，投影 */
    var key = new T.DirectionalLight(0xeaf4ff, 0.22);
    key.position.set(-4.6, 6.2, 4.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -2.6;
    key.shadow.camera.right = 2.6;
    key.shadow.camera.top = 2.8;
    key.shadow.camera.bottom = -2.8;
    key.shadow.camera.near = 1.0;
    key.shadow.camera.far = 22;
    key.shadow.bias = -0.00055;
    key.shadow.normalBias = 0.022;
    scene.add(key);
    scene.add(key.target);
    key.target.position.set(0, -0.05, 0);
    o.key = key;

    /* fill —— 右侧冷光，无投影 */
    var fill = new T.DirectionalLight(0x9fc4ff, 0.22);
    fill.position.set(5.2, 2.4, 2.0);
    scene.add(fill);
    o.fill = fill;

    /* rim —— 左后方轮廓光 */
    var rim = new T.DirectionalLight(0x86dcff, 0.18);
    rim.position.set(-2.6, 2.2, -6.0);
    scene.add(rim);
    o.rim = rim;

    /* 2 个彩色补光 */
    var pA = new T.PointLight(st.accent.clone(), 0.40, 9.0, 2.0);
    pA.position.set(-1.7, 0.15, 1.5);
    scene.add(pA);
    o.lightAccent = pA;

    var pB = new T.PointLight(st.accent2.clone(), 0.35, 9.5, 2.0);
    pB.position.set(1.5, -0.55, -1.35);
    scene.add(pB);
    o.lightAccent2 = pB;

    /* 顶部柔光（无 RectAreaLight，用宽角 Spot + 可见柔光板） */
    var top = new T.SpotLight(0xdfeeff, 0.12, 14, 0.95, 1.0, 1.4);
    top.position.set(0, 5.6, 0.8);
    top.target.position.set(0, -0.4, 0);
    scene.add(top);
    scene.add(top.target);
    o.top = top;

    /* 记录基础强度：update 里的"呼吸"必须以它为基准缩放，
     * 否则每帧会被写死的旧数值覆盖，造成「默认值改了但画面没变」的脱节。 */
    st.baseLight = {
      hemi: hemi.intensity, key: key.intensity, fill: fill.intensity,
      rim: rim.intensity, pA: pA.intensity, pB: pB.intensity, top: top.intensity
    };

    var softTex = radialTex(256, [
      [0.00, 'rgba(255,255,255,0.95)'],
      [0.35, 'rgba(220,238,255,0.45)'],
      [1.00, 'rgba(180,215,255,0)']
    ]);
    var soft = new T.Mesh(new T.PlaneGeometry(4.2, 4.2), new T.MeshBasicMaterial({
      map: softTex, color: 0xdfeeff, transparent: true, opacity: 0.20,
      blending: T.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false
    }));
    soft.rotation.x = Math.PI / 2;
    soft.position.set(0, 4.6, 0.6);
    soft.userData.noPick = true;
    scene.add(soft);
    o.softbox = soft;
  }

  /* ============================================================
   * 4.5 镜头暗角（挂在相机上，压四角 → 深色科技氛围；不改变中心画面）
   * ========================================================== */
  function buildVignette(camera) {
    if (!camera) return;
    var size = 256;
    var c = cv(size, size), ctx = c.getContext('2d');
    var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.707);
    g.addColorStop(0.00, 'rgba(0,0,0,0)');
    g.addColorStop(0.50, 'rgba(0,0,0,0)');
    g.addColorStop(0.70, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.88, 'rgba(0,0,0,0.90)');
    g.addColorStop(1.00, 'rgba(0,0,0,0.98)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    var tex = toTex(c, true);

    var mat = new T.MeshBasicMaterial({
      map: tex, transparent: true, opacity: st.vignette,
      depthTest: false, depthWrite: false, fog: false, toneMapped: false
    });
    var m = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
    m.position.set(0, 0, -1);
    m.renderOrder = 900;
    m.frustumCulled = false;
    m.userData.noPick = true;
    camera.add(m);
    if (!camera.parent && st.scene) st.scene.add(camera);
    st.objs.vignette = m;
    m.visible = false;   // 默认走 composer 末端 pass；仅在 setBloom(false) 直渲时启用
    fitVignette();
  }

  /** 按当前 fov/aspect 让暗角面片恰好铺满视口 */
  function fitVignette() {
    var m = st.objs && st.objs.vignette;
    var cam = st.camera;
    if (!m || !cam) return;
    var halfH = Math.tan((cam.fov * Math.PI / 180) / 2);
    var halfW = halfH * (cam.aspect || 1);
    m.scale.set(halfW * 2, halfH * 2, 1);
  }

  /* ============================================================
   * 5. 悬浮尘埃粒子
   * ========================================================== */
  var PART_VERT = [
    'uniform float uTime;',
    'uniform float uPixel;',
    'uniform float uFloor;',
    'attribute float aSeed;',
    'attribute float aSize;',
    'varying float vA;',
    'varying float vSeed;',
    'void main() {',
    '  vec3 p = position;',
    '  float span = 5.4;',
    '  float spd = 0.045 + aSeed * 0.10;',
    '  float y = mod(p.y - uFloor + uTime * spd, span) + uFloor;',
    '  p.y = y;',
    '  float ph = aSeed * 6.2831;',
    '  p.x += sin(uTime * 0.32 + ph + y * 1.4) * 0.24;',
    '  p.z += cos(uTime * 0.26 + ph * 1.7 + y * 1.1) * 0.24;',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  float dist = max(0.6, -mv.z);',
    '  gl_PointSize = clamp(aSize * uPixel * (26.0 / dist), 1.5, 10.0 * uPixel);',
    '  float rel = y - uFloor;',
    '  float fIn = smoothstep(0.0, 1.0, rel);',
    '  float fTop = 1.0 - smoothstep(span * 0.62, span, rel);',
    '  float flick = 0.55 + 0.45 * sin(uTime * 2.1 + ph * 5.0);',
    '  float distFade = 1.0 - smoothstep(9.0, 17.0, dist);',
    // 贴到镜头前的粒子会铺满整屏并炸出大片辉光，近距离淡出
    '  float nearFade = smoothstep(0.35, 2.4, dist);',
    '  vA = fIn * fTop * flick * distFade * nearFade;',
    '  vSeed = aSeed;',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var PART_FRAG = [
    'uniform vec3 uColorA;',
    'uniform vec3 uColorB;',
    'varying float vA;',
    'varying float vSeed;',
    'void main() {',
    '  vec2 d = gl_PointCoord - vec2(0.5);',
    '  float r = length(d) * 2.0;',
    '  float a = smoothstep(1.0, 0.0, r);',
    '  a = pow(a, 1.55);',
    '  vec3 c = mix(uColorA, uColorB, vSeed * 0.5);',
    '  gl_FragColor = vec4(c * 1.35, a * vA * 1.35);',
    '}'
  ].join('\n');

  function buildParticles(scene) {
    var COUNT = 760;
    var pos = new Float32Array(COUNT * 3);
    var seed = new Float32Array(COUNT);
    var size = new Float32Array(COUNT);
    var rnd = U.rng ? U.rng(1337) : Math.random;
    for (var i = 0; i < COUNT; i++) {
      var rad = 1.05 + Math.pow(rnd(), 0.85) * 5.6;
      var ang = rnd() * Math.PI * 2;
      pos[i * 3] = Math.cos(ang) * rad;
      pos[i * 3 + 1] = FLOOR_Y + rnd() * 5.4;
      pos[i * 3 + 2] = Math.sin(ang) * rad;
      seed[i] = rnd();
      size[i] = 0.75 + Math.pow(rnd(), 1.9) * 3.1;
    }
    var geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new T.BufferAttribute(seed, 1));
    geo.setAttribute('aSize', new T.BufferAttribute(size, 1));
    geo.boundingSphere = new T.Sphere(new T.Vector3(0, FLOOR_Y + 2.7, 0), 14);

    var mat = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uPixel: { value: st.dpr || 1 },
        uFloor: { value: FLOOR_Y },
        uColorA: { value: st.accent.clone() },
        uColorB: { value: new T.Color(0xdff2ff) }
      },
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG
    });
    var pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 20;
    pts.userData.noPick = true;
    scene.add(pts);
    st.objs.particles = pts;
  }

  /* ============================================================
   * 6. 扫描光带 / 背景光幕
   * ========================================================== */
  function bandTex(w, h, coreAlpha) {
    var c = cv(w, h), ctx = c.getContext('2d');
    var gx = ctx.createLinearGradient(0, 0, w, 0);
    gx.addColorStop(0.00, 'rgba(255,255,255,0)');
    gx.addColorStop(0.30, 'rgba(255,255,255,0.30)');
    gx.addColorStop(0.50, 'rgba(255,255,255,1)');
    gx.addColorStop(0.70, 'rgba(255,255,255,0.30)');
    gx.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = gx; ctx.fillRect(0, 0, w, h);

    var gy = ctx.createLinearGradient(0, 0, 0, h);
    gy.addColorStop(0.00, 'rgba(0,0,0,0)');
    gy.addColorStop(0.46, 'rgba(0,0,0,1)');
    gy.addColorStop(0.54, 'rgba(0,0,0,1)');
    gy.addColorStop(1.00, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = gy; ctx.fillRect(0, 0, w, h);

    // 核心亮线
    ctx.globalCompositeOperation = 'lighter';
    var gc = ctx.createLinearGradient(0, 0, 0, h);
    gc.addColorStop(0.00, 'rgba(255,255,255,0)');
    gc.addColorStop(0.50, 'rgba(255,255,255,' + (coreAlpha || 0.9) + ')');
    gc.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = gc;
    ctx.fillRect(w * 0.46, 0, w * 0.08, h);

    ctx.globalCompositeOperation = 'source-over';
    return toTex(c, false);
  }

  function buildScanBands(scene) {
    var o = st.objs;

    /* 地面扫描带 */
    var tA = bandTex(256, 64, 0.85);
    var mA = new T.MeshBasicMaterial({
      map: tA, color: st.accent.clone(), transparent: true, opacity: 0.0,
      blending: T.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false
    });
    var bandA = new T.Mesh(new T.PlaneGeometry(19, 1.5), mA);
    bandA.rotation.x = -Math.PI / 2;
    bandA.position.set(0, FLOOR_Y + 0.014, 0);
    bandA.renderOrder = 8;
    bandA.userData.noPick = true;
    scene.add(bandA);
    o.scanA = bandA;

    /* 背景光幕（竖直） */
    var tB = bandTex(256, 128, 0.7);
    var mB = new T.MeshBasicMaterial({
      map: tB, color: st.accent2.clone(), transparent: true, opacity: 0.10,
      blending: T.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false
    });
    var bandB = new T.Mesh(new T.PlaneGeometry(17, 6.5), mB);
    bandB.position.set(0, FLOOR_Y + 3.0, -8.2);
    bandB.renderOrder = 9;
    bandB.userData.noPick = true;
    scene.add(bandB);
    o.scanB = bandB;

    /* 侧向细光带（斜置，增加纵深） */
    var tC = bandTex(256, 32, 0.75);
    var mC = new T.MeshBasicMaterial({
      map: tC, color: st.accent.clone(), transparent: true, opacity: 0.16,
      blending: T.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false
    });
    var bandC = new T.Mesh(new T.PlaneGeometry(15, 0.55), mC);
    bandC.rotation.x = -Math.PI / 2;
    bandC.rotation.z = 0.5;
    bandC.position.set(-6.5, FLOOR_Y + 0.02, -3.2);
    bandC.renderOrder = 8;
    bandC.userData.noPick = true;
    scene.add(bandC);
    o.scanC = bandC;
  }

  /* ============================================================
   * 7. 后期：RenderPass -> UnrealBloom -> GammaCorrection
   * ========================================================== */
  /* 末端暗角 pass：在 bloom 之后压四角，才能压掉 bloom 弥散 */
  var VIG_FRAG = [
    'uniform sampler2D tDiffuse;',
    'uniform float uStrength;',
    'uniform vec2 uCenter;',
    'uniform float uGain;',
    'uniform float uGamma;',
    'varying vec2 vUv;',
    'void main() {',
    '  vec4 c = texture2D(tDiffuse, vUv);',
    /* 线性域整体增益 + gamma 对比：这一步作用于所有像素（含 toneMapped:false 的天空/网格/光晕），
       而 toneMappingExposure 只作用于标准材质，所以它才是压中间调的杠杆。
       gamma 在 1.0 处不改变白点，只把中间调和暗部往下压。 */
    '  c.rgb *= uGain;',
    '  if (abs(uGamma - 1.0) > 0.0001) c.rgb = pow(max(c.rgb, vec3(0.0)), vec3(uGamma));',
    '  vec2 p = vUv - uCenter;',
    '  float r = length(p) / 0.7071;',
    '  float v = smoothstep(0.44, 1.06, r);',
    '  v = v * v * (3.0 - 2.0 * v);',   // 再平滑一次，边界更硬但不出现环带
    '  c.rgb *= mix(1.0, mix(1.0, 0.004, v), uStrength);',
    '  gl_FragColor = c;',
    '}'
  ].join('\n');

  function buildVignettePass() {
    return new T.ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uStrength: { value: st.vignette },
        uCenter: { value: new T.Vector2(0.5, 0.5) },
        uGain: { value: st.gradeGain },
        uGamma: { value: st.gradeGamma }
      },
      vertexShader: [
        'varying vec2 vUv;',
        'void main() {',
        '  vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: VIG_FRAG
    });
  }

  function initComposer(renderer, scene, camera) {
    if (!T.EffectComposer || !T.RenderPass || !T.UnrealBloomPass) {
      console.warn('[stage] postprocessing 未加载，退回直接渲染');
      st.composer = null;
      return;
    }
    var size = renderer.getSize(new T.Vector2());
    st.dpr = renderer.getPixelRatio();
    st.size.copy(size);

    var composer = new T.EffectComposer(renderer);

    // 半浮点缓冲：辉光过渡更干净（失败则保留默认 8bit）
    if (T.HalfFloatType !== undefined) {
      try {
        var w = Math.max(2, Math.floor(size.width * st.dpr));
        var h = Math.max(2, Math.floor(size.height * st.dpr));
        var rt = new T.WebGLRenderTarget(w, h, {
          type: T.HalfFloatType,
          format: T.RGBAFormat,
          minFilter: T.LinearFilter,
          magFilter: T.LinearFilter,
          stencilBuffer: false,
          depthBuffer: true
        });
        rt.texture.name = 'stage:rt1';
        composer.renderTarget1.dispose();
        composer.renderTarget2.dispose();
        composer.renderTarget1 = rt;
        composer.renderTarget2 = rt.clone();
        composer.renderTarget2.texture.name = 'stage:rt2';
        composer.writeBuffer = composer.renderTarget1;
        composer.readBuffer = composer.renderTarget2;
      } catch (e) {
        console.warn('[stage] HalfFloat RT 创建失败，使用默认缓冲', e);
      }
    }

    st.renderPass = new T.RenderPass(scene, camera);
    st.bloomPass = new T.UnrealBloomPass(new T.Vector2(size.width, size.height), st.bloomParams.strength, st.bloomParams.radius, st.bloomParams.threshold);
    st.bloomPass.enabled = st.bloom;
    st.gammaPass = new T.ShaderPass(T.GammaCorrectionShader);

    st.vignettePass = buildVignettePass();
    composer.addPass(st.renderPass);
    composer.addPass(st.bloomPass);
    /* 暗角在 gamma 之前做乘法：在编码后相乘只会把亮度乘掉一点，四角永远压不到接近黑 */
    composer.addPass(st.vignettePass);
    composer.addPass(st.gammaPass);
    composer.setSize(size.width, size.height);

    st.composer = composer;
  }

  /* ============================================================
   * 8. 公共 API
   * ========================================================== */
  S.init = function (opts) {
    opts = opts || {};
    if (st.inited) { console.warn('[stage] init 已调用过，忽略'); return S; }
    var renderer = opts.renderer;
    var scene = opts.scene;
    var camera = opts.camera;
    if (!renderer || !scene || !camera) {
      console.error('[stage] init 缺少 renderer/scene/camera');
      return S;
    }
    st.renderer = renderer;
    st.scene = scene;
    st.camera = camera;
    if (opts.controls) st.controls = opts.controls;
    st.dpr = renderer.getPixelRatio();

    /* 8.1 渲染器设置 */
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = st.exposure;
    if ('outputEncoding' in renderer) renderer.outputEncoding = T.sRGBEncoding;
    if (renderer.shadowMap) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
    }

    /* 8.2 主题色 */
    var theme = (PC3D.config && PC3D.config.theme) || {};
    if (theme.accent !== undefined) st.accent.set(theme.accent);
    if (theme.accent2 !== undefined) st.accent2.set(theme.accent2);

    /* 8.3 背景 / 雾 */
    /* 注意：材质/清屏色按 sRGB 书写，而 composer 末端 GammaPass 会再编码一次，
       所以这里统一转线性，屏幕观感才等于设计值（否则深色背景会变成中灰）。 */
    scene.background = new T.Color(0x05080e).convertSRGBToLinear();
    if (!scene.fog) scene.fog = new T.Fog(0x05080e, 7.5, 27);
    if (scene.fog && scene.fog.color) scene.fog.color.convertSRGBToLinear();

    /* 8.4 环境 + 场景元素 */
    try { buildEnvMap(renderer, scene); } catch (e) { console.warn('[stage] PMREM 环境生成失败', e); }
    buildSky(scene);
    buildGround(scene);
    buildLights(scene);
    buildParticles(scene);
    buildScanBands(scene);
    buildVignette(camera);

    /* 8.5 后期 */
    initComposer(renderer, scene, camera);

    st.inited = true;
    S.setEnvIntensity(1);

    /* main.js 在 stage.init 之后还会写 renderer.toneMappingExposure；
       这里在下一帧重新落一次，保证 st.exposure 是最终生效值。 */
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        if (st.renderer && !st._exposurePinned) st.renderer.toneMappingExposure = st.exposure;
      });
    }

    /* 初始机位（若 main 尚未摆放，先给一个合理机位） */
    if (camera) {
      camera.position.copy(S.anchor.position);
      camera.lookAt(S.anchor.target);
    }
    return S;
  };

  S.update = function (dt) {
    if (!st.inited) return;
    dt = clamp(dt || 1 / 60, 0, 0.1);
    st.time += dt;
    var t = st.time;
    var o = st.objs;

    /* 天空跟随相机 */
    if (o.sky) {
      o.sky.position.copy(st.camera.position);
      o.sky.material.uniforms.uTime.value = t;
    }

    /* 粒子 */
    if (o.particles) {
      var pu = o.particles.material.uniforms;
      pu.uTime.value = t;
      if (pu.uPixel.value !== st.dpr) pu.uPixel.value = st.dpr;
    }

    /* 地面环 */
    if (o.ringA) {
      o.ringA.rotation.z += dt * 0.055;
      o.ringA.material.opacity = (0.40 + 0.14 * Math.sin(t * 1.15)) * st.glowGain;
    }
    if (o.ringB) {
      o.ringB.rotation.z -= dt * 0.035;
      o.ringB.material.opacity = (0.27 + 0.12 * Math.sin(t * 0.83 + 1.7)) * st.glowGain;
    }
    if (o.ringC) {
      o.ringC.rotation.z += dt * 0.16;
      o.ringC.material.opacity = (0.47 + 0.16 * Math.sin(t * 1.7 + 0.4)) * st.glowGain;
    }
    if (o.halo) {
      o.halo.material.opacity = (0.28 + 0.06 * Math.sin(t * 0.92)) * st.glowGain;
    }

    /* 扫描光带 */
    if (o.scanA) {
      var k = (t * 0.052) % 1;
      o.scanA.position.z = lerp(6.6, -7.6, k);
      o.scanA.material.opacity = 0.42 * Math.sin(Math.PI * k) * st.glowGain;
    }
    if (o.scanB) {
      o.scanB.position.x = Math.sin(t * 0.13) * 3.2;
      o.scanB.material.opacity = (0.075 + 0.045 * (0.5 + 0.5 * Math.sin(t * 0.47))) * st.glowGain;
    }
    if (o.scanC) {
      var kc = (t * 0.031 + 0.42) % 1;
      o.scanC.position.x = lerp(-9.5, 9.5, kc);
      o.scanC.material.opacity = 0.16 * Math.sin(Math.PI * kc) * st.glowGain;
    }

    /* 灯光呼吸（相对 st.baseLight 缩放，绝不写死绝对值） */
    var bl = st.baseLight;
    if (bl) {
      if (o.lightAccent) o.lightAccent.intensity = bl.pA * (1.0 + 0.18 * Math.sin(t * 1.35));
      if (o.lightAccent2) o.lightAccent2.intensity = bl.pB * (1.0 + 0.18 * Math.sin(t * 1.02 + 2.1));
      if (o.rim) o.rim.intensity = bl.rim * (1.0 + 0.14 * Math.sin(t * 0.7));
    }
    if (o.softbox) {
      o.softbox.material.opacity = (0.17 + 0.035 * Math.sin(t * 0.55)) * st.glowGain;
    }

    /* 相机入场（墙钟时间驱动：任何帧率下都在 enterDur 秒内结束） */
    if (st.entering) {
      var kk = clamp((nowWall() - st.enterStartWall) / (st.enterDur * 1000), 0, 1);
      st.enterProgress = kk;
      var e = easeIO(kk);
      var cam = st.camera;
      var pos = st._tmpPos || (st._tmpPos = new T.Vector3());
      var tgt = st._tmpTgt || (st._tmpTgt = new T.Vector3());
      pos.lerpVectors(st.enterFromPos, S.anchor.position, e);
      tgt.lerpVectors(st.enterFromTarget, S.anchor.target, e);
      cam.position.copy(pos);
      cam.lookAt(tgt);
      var ctl = st.controls || PC3D.controls || (PC3D.app && PC3D.app.controls) || null;
      if (ctl && ctl.target) ctl.target.copy(tgt);
      st.enterLastTarget.copy(tgt);
      if (kk >= 1) {
        finishEnter(false);
      }
    }
  };

  S.render = function (scene, camera, dt) {
    var sc = scene || st.scene;
    var cam = camera || st.camera;
    /* 关闭辉光时按要求回退到 renderer.render（不再走 composer） */
    if (!st.bloom || !st.composer) {
      /* 直渲没有末端 pass，用相机前的同款暗角面片代替（两者不同时启用，避免叠加） */
      if (st.objs.vignette) st.objs.vignette.visible = st.vignette > 0.001;
      if (st.renderer && sc && cam) st.renderer.render(sc, cam);
      return;
    }
    if (st.objs.vignette) st.objs.vignette.visible = false;
    if (st.renderPass) {
      if (sc) st.renderPass.scene = sc;
      if (cam) st.renderPass.camera = cam;
    }
    st.composer.render(dt !== undefined ? clamp(dt, 0, 0.1) : 1 / 60);
  };

  S.setBloom = function (v) {
    st.bloom = !!v;
    if (st.bloomPass) st.bloomPass.enabled = st.bloom;
    return st.bloom;
  };

  /** 运行时调辉光参数：o={strength,radius,threshold}，缺省字段保持不变 */
  S.setBloomParams = function (o) {
    o = o || {};
    var bp = st.bloomParams;
    if (o.strength !== undefined) bp.strength = clamp(+o.strength, 0, 3);
    if (o.radius !== undefined) bp.radius = clamp(+o.radius, 0, 2);
    if (o.threshold !== undefined) bp.threshold = clamp(+o.threshold, 0, 1.5);
    if (st.bloomPass) {
      st.bloomPass.strength = bp.strength;
      st.bloomPass.radius = bp.radius;
      st.bloomPass.threshold = bp.threshold;
    }
    return S.getBloomParams();
  };
  S.getBloomParams = function () {
    var bp = st.bloomParams;
    return { strength: bp.strength, radius: bp.radius, threshold: bp.threshold };
  };

  /** 运行时调曝光（ACES toneMappingExposure） */
  S.setExposure = function (v) {
    st.exposure = clamp(v === undefined ? 1 : v, 0, 4);
    st._exposurePinned = true;   // 用户/Lead 显式调过曝光后就别再被初始化回写覆盖
    if (st.renderer) st.renderer.toneMappingExposure = st.exposure;
    return st.exposure;
  };
  S.getExposure = function () { return st.exposure; };

  /**
   * 天空球整体增益（SKY_FRAG 的 uGain）。
   * 天空材质 toneMapped:false，composer 的 GammaPass 会把它当线性值再做一次 sRGB 编码，
   * 所以「源值 → 屏幕亮度」近似开根号：屏幕减半 ≈ 源值 ×0.25。
   */
  S.setSkyGain = function (v) {
    st.skyGain = clamp(v === undefined ? 1 : v, 0, 4);
    var sky = st.objs && st.objs.sky;
    if (sky && sky.material && sky.material.uniforms && sky.material.uniforms.uGain) {
      sky.material.uniforms.uGain.value = st.skyGain;
    }
    return st.skyGain;
  };
  S.getSkyGain = function () { return st.skyGain; };

  /**
   * 地面装饰（网格/暗角/光晕/发光环/扫描带/顶部柔光）的整体增益，作用在 opacity 上。
   * update 里的动态 opacity 每帧自己乘 st.glowGain，静态项在这里立即写一次。
   */
  S.setGlowGain = function (v) {
    st.glowGain = clamp(v === undefined ? 1 : v, 0, 4);
    var o = st.objs;
    if (o) {
      ['gridFine', 'gridMajor', 'fade'].forEach(function (k) {
        var m = o[k];
        if (!m || !m.material) return;
        var base = (m.userData && m.userData.baseOpacity !== undefined) ? m.userData.baseOpacity : 1;
        m.material.opacity = clamp(base * st.glowGain, 0, 1);
      });
      ['halo', 'scanA', 'scanB', 'scanC', 'softbox'].forEach(function (k) {
        var m = o[k];
        if (!m || !m.material) return;
        m.material.opacity = clamp(m.material.opacity, 0, 1);
      });
    }
    return st.glowGain;
  };
  S.getGlowGain = function () { return st.glowGain; };

  /** 镜头暗角强度 0~1（关闭四角压暗用 0） */
  S.setVignette = function (v) {
    st.vignette = clamp(v === undefined ? st.vignette : v, 0, 1);
    if (st.vignettePass && st.vignettePass.uniforms.uStrength) {
      st.vignettePass.uniforms.uStrength.value = st.vignette;
    }
    /* 直渲回退路径用的同款面片 */
    var m = st.objs && st.objs.vignette;
    if (m && m.material) m.material.opacity = st.vignette;
    return st.vignette;
  };
  S.getVignette = function () { return st.vignette; };

  /* 线性域分级：唯一同时作用于 toneMapped:false 元素（天空/网格/光晕/扫描带）的亮度杠杆。
     toneMappingExposure 只影响标准材质，所以调亮度要先用这个。 */
  S.setGrade = function (o) {
    o = o || {};
    if (o.gain !== undefined) st.gradeGain = clamp(+o.gain, 0.05, 4);
    if (o.gamma !== undefined) st.gradeGamma = clamp(+o.gamma, 0.2, 4);
    var p = st.vignettePass;
    if (p && p.uniforms) {
      if (p.uniforms.uGain) p.uniforms.uGain.value = st.gradeGain;
      if (p.uniforms.uGamma) p.uniforms.uGamma.value = st.gradeGamma;
    }
    return S.getGrade();
  };
  S.getGrade = function () { return { gain: st.gradeGain, gamma: st.gradeGamma }; };

  S.setEnvIntensity = function (v) {
    st.envIntensity = clamp(v === undefined ? 1 : v, 0, 3);
    var scene = st.scene;
    if (!scene) return;
    var seen = Object.create(null);
    scene.traverse(function (obj) {
      if (!obj.isMesh) return;
      var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (var i = 0; i < mats.length; i++) {
        var m = mats[i];
        if (!m || seen[m.uuid]) continue;
        seen[m.uuid] = 1;
        if (m.envMapIntensity === undefined) continue;
        if (!m.userData) m.userData = {};
        if (m.userData.__envBase === undefined) m.userData.__envBase = m.envMapIntensity;
        m.envMapIntensity = m.userData.__envBase * st.envIntensity;
      }
    });
  };

  /** 切换变体时调用：环形辉光/扫描带/补光/环境反射跟随强调色 */
  S.setAccent = function (color) {
    if (color === undefined || color === null) return st.accent.getHex();
    st.accent.set(color);
    var o = st.objs, c = st.accent;
    if (o.sky) o.sky.material.uniforms.uAccent.value.copy(c);
    /* 与 buildGround 里的构造系数保持一致（否则切换强调色会突然变亮） */
    if (o.gridFine) o.gridFine.material.color.copy(c).multiplyScalar(0.17);
    if (o.gridMajor) o.gridMajor.material.color.copy(c).multiplyScalar(0.33);
    if (o.halo) o.halo.material.color.copy(c);
    if (o.ringA) o.ringA.material.color.copy(c);
    if (o.ringC) o.ringC.material.color.copy(c);
    if (o.scanA) o.scanA.material.color.copy(c);
    if (o.scanC) o.scanC.material.color.copy(c);
    if (o.lightAccent) o.lightAccent.color.copy(c);
    if (o.particles) o.particles.material.uniforms.uColorA.value.copy(c);

    /* 重烘焙环境贴图，让金属上的主题色反光同步 */
    if (st.inited && st.renderer && st.scene) {
      try {
        buildEnvMap(st.renderer, st.scene);
        S.setEnvIntensity(st.envIntensity);
      } catch (e) { /* 忽略 */ }
    }
    if (PC3D.bus) PC3D.bus.emit('stage:accent', { color: c.getHex() });
    return c.getHex();
  };

  /** 地面高度（默认 -1.0，对齐机箱外框底 -0.98） */
  S.setFloorY = function (y) {
    if (typeof y !== 'number') return S.floorY;
    var d = y - S.floorY;
    S.floorY = y;
    if (st.objs.ground) st.objs.ground.position.y += d;
    if (st.objs.particles) st.objs.particles.material.uniforms.uFloor.value = y;
    return y;
  };

  /**
   * main 注入 OrbitControls（可选）。
   * 入场期间用户任何操作（拖动/滚轮/触摸/键盘）都立刻结束入场并交还控制权，
   * 且保持用户操作后的相机位置（不把相机拉回 anchor）。
   */
  S.attachControls = function (controls) {
    if (!controls) return null;
    st.controls = controls;
    if (controls.addEventListener && !st._ctlHooked) {
      st._ctlHooked = true;
      controls.addEventListener('start', function () {
        /* OrbitControls 的 start 事件覆盖 pointerdown / wheel / touchstart / keydown */
        if (st.entering) finishEnter(true);
      });
    }
    /* 额外直挂 domElement 的 wheel（捕获阶段）：某些路径不派发 start 时也能打断 */
    if (controls.domElement && !st._wheelHooked) {
      st._wheelHooked = true;
      controls.domElement.addEventListener('wheel', function () {
        if (st.entering) finishEnter(true);
      }, { capture: true, passive: true });
    }
    return controls;
  };

  /**
   * 相机入场：约 1.6s 从远处+高处 swoop 到 anchor（墙钟时间驱动，不受帧率影响）。
   * 起点 = 当前视线方向后退一段并抬升，且**到 target 的距离被钳制在 maxDistance*0.95 以内**。
   * opts = { duration, instant, startDistance, lift }
   *   instant=true  → 不做动画，直接落到 anchor（确定性截图用，如 ?nointro=1）
   * 期间任何用户输入（拖动/滚轮/触摸）立即结束动画并交还控制权。
   * @returns {Promise} 入场结束（或被用户打断）时 resolve
   */
  S.enter = function (opts) {
    var cam = st.camera;
    if (!cam) return Promise.resolve(S);
    opts = opts || {};
    st.controls = st.controls || PC3D.controls || (PC3D.app && PC3D.app.controls) || null;
    if (st.controls) S.attachControls(st.controls);

    var ctl = st.controls;
    var curTarget = (ctl && ctl.target) ? ctl.target.clone() : S.anchor.target.clone();

    /* instant：确定性落地，无动画 */
    if (opts.instant) {
      st.entering = false;
      st.enterProgress = 1;
      st.enterT = st.enterDur = 0;
      cam.position.copy(S.anchor.position);
      cam.lookAt(S.anchor.target);
      if (ctl && ctl.target) ctl.target.copy(S.anchor.target);
      if (ctl && ctl.update) ctl.update();
      var r0 = st.enterResolve; st.enterResolve = null;
      if (r0) r0(S);
      return Promise.resolve(S);
    }

    var dir = cam.position.clone().sub(curTarget);
    var dist = dir.length();
    if (!(dist > 0.001)) dir.set(-0.78, 0.5, 0.62);
    dir.normalize();

    /* 起幅：沿当前视线方向后退，并抬升，形成 swoop 弧线 */
    var startDist = opts.startDistance || Math.max(6.4, Math.min(9.0, dist * 1.9));
    st.enterFromPos.copy(S.anchor.position).addScaledVector(dir, startDist);
    st.enterFromPos.y += opts.lift === undefined ? 1.85 : opts.lift;

    /* 起点到 target 的距离不得超过 controls.maxDistance*0.95（否则 OrbitControls 每帧把相机拉回） */
    var maxD = (ctl && isFinite(ctl.maxDistance)) ? ctl.maxDistance : 8.5;
    var capD = maxD * 0.95;
    var off = st.enterFromPos.clone().sub(S.anchor.target);
    var offLen = off.length();
    if (offLen > capD && offLen > 0.0001) {
      st.enterFromPos.copy(S.anchor.target).addScaledVector(off.multiplyScalar(1 / offLen), capD);
    }

    st.enterFromTarget.copy(curTarget);
    /* target 从 "略微抬高看向机箱上方" 滑到 anchor.target */
    st.enterFromTarget.y += 0.9;

    st.enterT = 0;
    st.enterProgress = 0;
    st.enterDur = opts.duration || 1.6;
    st.enterStartWall = nowWall();
    st.entering = true;
    st.enterLastTarget.copy(st.enterFromTarget);

    cam.position.copy(st.enterFromPos);
    cam.lookAt(st.enterFromTarget);
    if (ctl && ctl.target) {
      ctl.target.copy(st.enterFromTarget);
      if (ctl.update) ctl.update();
      /* controls.update() 可能把相机拉回，重新落位 */
      cam.position.copy(st.enterFromPos);
    }

    return new Promise(function (resolve) { st.enterResolve = resolve; });
  };

  S.resize = function (w, h) {
    if (!w || !h) return;
    st.size.set(w, h);
    var renderer = st.renderer;
    if (renderer) st.dpr = renderer.getPixelRatio();
    if (st.composer) {
      if (renderer) st.composer.setPixelRatio(st.dpr);
      st.composer.setSize(w, h);
    }
    if (st.objs.particles) st.objs.particles.material.uniforms.uPixel.value = st.dpr;
    fitVignette();
  };

  /** 场景对象引用（诊断/调参用，勿修改结构） */
  /* 只读引用：后期 pass（Lead 扫参时可直接读写其 strength/radius/threshold） */
  Object.defineProperty(S, 'bloomPass', {
    get: function () { return st.bloomPass; },
    enumerable: true
  });
  Object.defineProperty(S, 'composer', {
    get: function () { return st.composer; },
    enumerable: true
  });

  Object.defineProperty(S, 'objs', {
    get: function () { return st.objs; },
    enumerable: true
  });

  /** 诊断信息（Lead 调试用） */
  S.info = function () {
    return {
      inited: st.inited,
      bloom: st.bloom,
      envIntensity: st.envIntensity,
      accent: st.accent.getHex(),
      entering: st.entering,
      enterProgress: st.enterProgress,
      camDistance: st.camera && st.controls && st.controls.target
        ? +st.camera.position.distanceTo(st.controls.target).toFixed(3) : null,
      time: st.time,
      objects: Object.keys(st.objs)
    };
  };
})();
