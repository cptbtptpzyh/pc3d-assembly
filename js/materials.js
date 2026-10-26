/* ============================================================
 * materials.js — 材质库（Lead 维护）
 * 所有材质集中共享，部件通过 PC3D.materials.get(name) / clone(name, over) 取用
 * ========================================================== */
(function () {
  'use strict';
  var PC3D = (window.PC3D = window.PC3D || {});
  var T = THREE, U = PC3D.util;

  var lib = Object.create(null);
  var textures = Object.create(null);

  /* ---------- 程序化纹理 ---------- */
  // 拉丝金属：细密横向条纹 + 噪声
  textures.brushed = U.tex(512, 512, function (ctx, w, h) {
    ctx.fillStyle = '#8d939b'; ctx.fillRect(0, 0, w, h);
    var rnd = U.rng(7);
    for (var i = 0; i < 2600; i++) {
      var y = Math.floor(rnd() * h);
      var a = 0.02 + rnd() * 0.09;
      ctx.strokeStyle = (rnd() > 0.5 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + a + ')';
      ctx.beginPath(); ctx.moveTo(rnd() * w, y); ctx.lineTo(rnd() * w, y + (rnd() - 0.5) * 2); ctx.stroke();
    }
  });

  // PCB：深绿/深蓝底 + 走线 + 焊盘
  function pcbTexture(base, trace, seed) {
    return U.tex(512, 512, function (ctx, w, h) {
      ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
      var rnd = U.rng(seed || 3);
      ctx.strokeStyle = trace; ctx.lineWidth = 1.2;
      for (var i = 0; i < 90; i++) {
        var x = Math.floor(rnd() * w), y = Math.floor(rnd() * h);
        ctx.globalAlpha = 0.25 + rnd() * 0.45;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (var k = 0; k < 4; k++) {
          if (rnd() > 0.5) x += (rnd() - 0.5) * 90; else y += (rnd() - 0.5) * 90;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (var j = 0; j < 260; j++) {
        ctx.fillStyle = rnd() > 0.5 ? 'rgba(200,170,90,0.55)' : 'rgba(150,160,170,0.45)';
        var s = 1 + rnd() * 3;
        ctx.fillRect(rnd() * w, rnd() * h, s, s);
      }
    });
  }
  textures.pcb = pcbTexture('#12351f', 'rgba(70,150,95,0.55)', 11);
  textures.pcbDark = pcbTexture('#14181f', 'rgba(90,110,140,0.5)', 23);

  // 网孔/冲孔（用作 alphaMap）
  textures.mesh = U.tex(256, 256, function (ctx, w, h) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    var step = 16;
    for (var y = 0; y < h; y += step) {
      for (var x = 0; x < w; x += step) {
        ctx.beginPath(); ctx.arc(x + step / 2, y + step / 2, step * 0.34, 0, Math.PI * 2); ctx.fill();
      }
    }
  }, { srgb: false });

  // 蜂窝散热孔
  textures.honeycomb = U.tex(256, 256, function (ctx, w, h) {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    var r = 9, stepX = r * 1.75, stepY = r * 1.5;
    for (var row = 0; row * stepY < h + r; row++) {
      for (var col = 0; col * stepX < w + r; col++) {
        var cx = col * stepX + (row % 2 ? stepX / 2 : 0), cy = row * stepY;
        ctx.beginPath();
        for (var i = 0; i < 6; i++) {
          var a = Math.PI / 6 + i * Math.PI / 3;
          var px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
      }
    }
  }, { srgb: false });

  // 碳纤维斜纹
  textures.carbon = U.tex(512, 512, function (ctx, w, h) {
    ctx.fillStyle = '#181a1e'; ctx.fillRect(0, 0, w, h);
    var s = 16;
    for (var y = 0; y < h; y += s) {
      for (var x = 0; x < w; x += s) {
        var odd = ((x / s) + (y / s)) % 2 === 0;
        ctx.fillStyle = odd ? '#22252b' : '#101216';
        ctx.fillRect(x, y, s, s);
        ctx.fillStyle = odd ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.25)';
        ctx.fillRect(x, y, s, s / 2);
      }
    }
  }, { repeat: [3, 3] });

  // 细噪点（用于粗糙度/凹凸）
  textures.noise = U.tex(256, 256, function (ctx, w, h) {
    var img = ctx.createImageData(w, h);
    var rnd = U.rng(99);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = 110 + rnd() * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { srgb: false });

  PC3D.materials = {
    tex: textures,
    lib: lib,
    get: function (name) {
      var m = lib[name];
      if (!m) { console.warn('[materials] unknown:', name); m = lib.matteBlack; }
      return m;
    },
    /** 独立副本，可覆盖任意属性：clone('aluminum',{color:0x777777}) */
    clone: function (name, over) {
      var src = PC3D.materials.get(name);
      var m = src.clone();
      m.name = name + ':clone';
      m.__owned = true;
      if (over) for (var k in over) {
        if (k === 'map' || k === 'normalMap' || k === 'roughnessMap' || k === 'metalnessMap' || k === 'emissiveMap' || k === 'alphaMap' || k === 'aoMap') m[k] = over[k];
        else if (k === 'color' || k === 'emissive' || k === 'specular') m[k] = new T.Color(over[k]);
        else m[k] = over[k];
      }
      m.needsUpdate = true;
      return m;
    }
  };

  function std(name, params) {
    var m = new T.MeshStandardMaterial(params);
    m.name = name; m.__shared = true;
    lib[name] = m;
    return m;
  }
  function phys(name, params) {
    var m = new T.MeshPhysicalMaterial(params);
    m.name = name; m.__shared = true;
    lib[name] = m;
    return m;
  }

  /* ---------- 金属 ---------- */
  std('aluminum', { color: 0xb8bec6, metalness: 0.92, roughness: 0.34, map: textures.brushed, envMapIntensity: 1.15 });
  std('aluminumDark', { color: 0x4a5058, metalness: 0.9, roughness: 0.42, map: textures.brushed, envMapIntensity: 1.0 });
  std('steel', { color: 0x8e959d, metalness: 0.95, roughness: 0.28, envMapIntensity: 1.2 });
  std('chrome', { color: 0xe8eef5, metalness: 1.0, roughness: 0.08, envMapIntensity: 1.5 });
  std('copper', { color: 0xc8763c, metalness: 1.0, roughness: 0.24, envMapIntensity: 1.2 });
  std('nickel', { color: 0xcfd6dd, metalness: 1.0, roughness: 0.16, envMapIntensity: 1.3 });
  std('gold', { color: 0xd6a94a, metalness: 1.0, roughness: 0.22, envMapIntensity: 1.2 });
  std('titanium', { color: 0x9aa3ad, metalness: 0.95, roughness: 0.3 });

  /* ---------- 塑料 / 涂装 ---------- */
  std('blackPlastic', { color: 0x1b1e23, metalness: 0.12, roughness: 0.62 });
  std('matteBlack', { color: 0x101216, metalness: 0.2, roughness: 0.78 });
  std('glossBlack', { color: 0x0a0c10, metalness: 0.35, roughness: 0.12, envMapIntensity: 1.0 });
  std('greyPlastic', { color: 0x2a2f36, metalness: 0.15, roughness: 0.55 });
  std('psuShell', { color: 0x1a1d22, metalness: 0.55, roughness: 0.4, map: textures.brushed });
  std('rubber', { color: 0x0b0c0e, metalness: 0.0, roughness: 0.95 });
  std('sleeved', { color: 0x14171c, metalness: 0.05, roughness: 0.72 });
  std('carbon', { color: 0x2b2f36, metalness: 0.55, roughness: 0.38, map: textures.carbon });

  /* ---------- 电路板 / 芯片 ---------- */
  std('pcb', { color: 0x2b6a45, metalness: 0.25, roughness: 0.62, map: textures.pcb, roughnessMap: textures.noise });
  std('pcbDark', { color: 0x3a4250, metalness: 0.3, roughness: 0.6, map: textures.pcbDark });
  std('pcbBlack', { color: 0x1a1d22, metalness: 0.35, roughness: 0.5, map: textures.pcbDark });
  std('silicon', { color: 0x20242a, metalness: 0.5, roughness: 0.35 });
  std('ceramic', { color: 0x8a7452, metalness: 0.1, roughness: 0.85 });

  /* ---------- 风扇 / 网孔 ---------- */
  var blade = std('fanBlade', { color: 0x22262c, metalness: 0.1, roughness: 0.7, transparent: true, opacity: 0.94, side: T.DoubleSide });
  std('mesh', { color: 0x2a2f36, metalness: 0.7, roughness: 0.5, alphaMap: textures.mesh, transparent: true, alphaTest: 0.35, side: T.DoubleSide });
  std('meshDark', { color: 0x181b20, metalness: 0.6, roughness: 0.45, map: textures.mesh, side: T.DoubleSide });

  /* ---------- 玻璃 ---------- */
  phys('glass', {
    color: 0xa8d8ff, metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.14,
    side: T.DoubleSide, depthWrite: false, envMapIntensity: 2.0,
    clearcoat: 1.0, clearcoatRoughness: 0.05
  });

  /* ---------- 发光 ---------- */
  std('ledCyan', { color: 0x0b2a33, emissive: 0x38e8ff, emissiveIntensity: 2.4, roughness: 0.4, metalness: 0.1, toneMapped: false });
  std('ledPurple', { color: 0x1a1030, emissive: 0xa45bff, emissiveIntensity: 2.4, roughness: 0.4, metalness: 0.1, toneMapped: false });
  std('ledPink', { color: 0x33101f, emissive: 0xff4d8d, emissiveIntensity: 2.2, roughness: 0.4, metalness: 0.1, toneMapped: false });
  std('ledWhite', { color: 0x22262c, emissive: 0xdfe9f5, emissiveIntensity: 2.0, roughness: 0.4, metalness: 0.1, toneMapped: false });
  std('rgbWhite', { color: 0x2b3038, emissive: 0x9fd8ff, emissiveIntensity: 1.2, roughness: 0.35, metalness: 0.2 });

  // 便利方法：统一改写发光色（切换主题/变体时用）
  PC3D.materials.setLED = function (color, intensity) {
    ['ledCyan', 'ledPurple', 'ledPink', 'ledWhite', 'rgbWhite'].forEach(function (n) {
      var m = lib[n]; if (!m) return;
      m.emissive.set(color);
      m.emissiveIntensity = intensity || 2.2;
      m.needsUpdate = true;
    });
  };

  // 清理：让共享材质带标记
  Object.keys(lib).forEach(function (k) { lib[k].__shared = true; });
})();
