/* Focus World — the island renderer (Canvas 2D).
   Draws sky, sea, island, unlocked items, ambient life, lights and weather.
   The same scene function is used for the live screen and for the share picture. */
(function (root) {
  'use strict';
  var L = root.FWLogic, I = root.FWItems, D = I.draw;
  var TAU = Math.PI * 2;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smooth(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  var rgbCache = {};
  function rgb(hex) {
    var c = rgbCache[hex];
    if (c) return c;
    var h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var n = parseInt(h, 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache[hex] = c;
    return c;
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function css(c, a) {
    var s = Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]);
    return a == null ? 'rgb(' + s + ')' : 'rgba(' + s + ',' + clamp(a, 0, 1).toFixed(3) + ')';
  }
  function hashStr(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 9973;
  }
  // Deterministic 0..1 number for (world seed, group k, index i).
  function rand(seed, k, i) {
    var x = Math.sin((seed % 100003) * 0.0137 + k * 12.9898 + i * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }
  function easeOutBack(p) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }

  // ---------- time of day ----------
  var SKY = [
    { h: 0, top: '#0a0f2b', mid: '#151c45', bot: '#2a3262' },
    { h: 4.6, top: '#0d1433', mid: '#1d2555', bot: '#333b6c' },
    { h: 6.0, top: '#42538e', mid: '#c98aa3', bot: '#ffc99c' },
    { h: 7.4, top: '#5d9fdc', mid: '#9ccbe9', bot: '#e9f5f4' },
    { h: 12, top: '#4a9de2', mid: '#8fcff1', bot: '#e2f5fb' },
    { h: 16.4, top: '#5899d6', mid: '#a5cde4', bot: '#f4eed6' },
    { h: 18.0, top: '#40508f', mid: '#dc8b95', bot: '#ffbc80' },
    { h: 19.3, top: '#1e2253', mid: '#5c4b86', bot: '#c47b8a' },
    { h: 20.6, top: '#0e1435', mid: '#1b2250', bot: '#333b6d' },
    { h: 24, top: '#0a0f2b', mid: '#151c45', bot: '#2a3262' }
  ];
  function skyAt(h) {
    for (var i = 0; i < SKY.length - 1; i++) {
      var a = SKY[i], b = SKY[i + 1];
      if (h >= a.h && h <= b.h) {
        var t = smooth((h - a.h) / (b.h - a.h));
        return { top: mix(rgb(a.top), rgb(b.top), t), mid: mix(rgb(a.mid), rgb(b.mid), t), bot: mix(rgb(a.bot), rgb(b.bot), t) };
      }
    }
    return { top: rgb(SKY[0].top), mid: rgb(SKY[0].mid), bot: rgb(SKY[0].bot) };
  }
  function nightAt(h) {
    if (h < 4.6) return 1;
    if (h < 7.0) return 1 - smooth((h - 4.6) / 2.4);
    if (h < 17.6) return 0;
    if (h < 20.6) return smooth((h - 17.6) / 3.0);
    return 1;
  }
  function warmAt(h) {
    function bump(c, w) { return Math.max(0, 1 - Math.abs(h - c) / w); }
    return Math.max(bump(6.3, 1.3), bump(18.4, 1.5));
  }
  var SKY_HOURS = { morning: 6.7, day: 12.5, sunset: 18.3, night: 22.5 };
  function hourFor(mode, date) {
    if (SKY_HOURS[mode] != null) return SKY_HOURS[mode];
    var d = date || new Date();
    return d.getHours() + d.getMinutes() / 60;
  }

  // ---------- scenes: colour swaps + weather ----------
  function remap(list) { var m = {}; for (var i = 0; i < list.length; i += 2) m[list[i]] = list[i + 1]; return m; }
  var GRASS = ['#cbd88b', '#a5dc7d', '#79bd5a', '#6fb453', '#9ad57a', '#5f9f45', '#8fcf6c'];
  function grassTo(cols) { var out = []; GRASS.forEach(function (g, i) { out.push(g, cols[i]); }); return out; }
  var AUTUMN = remap(grassTo(['#e0cf8c', '#cfd07a', '#a7a24c', '#9d9846', '#d8c873', '#8c8a3d', '#c9c46d']).concat([
    '#3f8f45', '#c4542f', '#55a84f', '#e27d37', '#86cf6b', '#f6b54a',
    '#2f7a4c', '#a8432c', '#3f9157', '#d0662f', '#69b96a', '#f0a23f',
    '#2f6e44', '#9a3d2a', '#3f8a52', '#c8562d', '#6db66a', '#eea545',
    '#3f8b46', '#b8582f', '#56a64f', '#da7539', '#82cc6c', '#f1ae4c',
    '#43966a', '#3d7d5a', '#2e6f4d', '#2c5a42']));
  var WINTER = remap(grassTo(['#e3ebf1', '#f6fafc', '#d4e2ec', '#c6d6e2', '#ffffff', '#b3c6d4', '#eef4f8']).concat([
    '#3f8f45', '#4e7d6b', '#55a84f', '#8fb3a5', '#86cf6b', '#f4f8fb',
    '#2f7a4c', '#3f6e5e', '#3f9157', '#86ab9d', '#69b96a', '#f2f7fa',
    '#2f6e44', '#3a6656', '#3f8a52', '#7fa496', '#6db66a', '#f6fafc',
    '#3f8b46', '#4b7a68', '#56a64f', '#93b5a8', '#82cc6c', '#f4f8fb',
    '#43966a', '#6f9a8a', '#2e6f4d', '#2f5c4b',
    '#3f97bd', '#5a8fae', '#246c97', '#2f5f82', '#f8e7b8', '#f1ece0', '#ecd29a', '#e2d9c6', '#e7cb93', '#d9d0bf']));
  var SPRING = remap(['#a5dc7d', '#b6e88a', '#79bd5a', '#86cc62', '#9ad57a', '#c9f0a0',
    '#3f8f45', '#e58bb0', '#55a84f', '#f4a8c6', '#86cf6b', '#ffd6e6',
    '#2f6e44', '#d97aa5', '#3f8a52', '#f0a0c2', '#6db66a', '#ffd3e4',
    '#2f7a4c', '#4f9a5a', '#3f9157', '#74c06e', '#69b96a', '#b8e8a0',
    '#3f8b46', '#4f9d4f', '#56a64f', '#69b85d', '#82cc6c', '#a6e08a']);
  var TROPIC = remap(['#3f97bd', '#1fb2c2', '#246c97', '#167fa3', '#a5dc7d', '#8fe07a', '#79bd5a', '#5cbd57',
    '#f8e7b8', '#fff1c9', '#ecd29a', '#f6dfa6']);
  var LOOKS = {
    meadow: {},
    spring: { remap: SPRING, sky: [255, 210, 230, 0.22], fx: 'petals' },
    rain: { rain: 0.75 },
    fog: { fog: 0.26, sky: [216, 223, 230, 0.55], fx: 'fog' },
    windy: { wind: 2.4, clouds: 3, fx: 'kite' },
    autumn: { remap: AUTUMN, sky: [255, 212, 165, 0.12], fx: 'leaves' },
    rainbow: { sky: [236, 248, 255, 0.12], fx: 'rainbow' },
    tropical: { remap: TROPIC, sky: [125, 212, 255, 0.1], fx: 'sparkle' },
    fireflies: { fx: 'fireflies' },
    winter: { remap: WINTER, sky: [222, 234, 246, 0.24], fx: 'snow' },
    clouds: { sky: [255, 226, 240, 0.12], cloudsea: true },
    stars: { forceHour: 20.4, fx: 'stars' },
    // whole different places (drawn by places.js)
    valley: { place: 'valley' },
    desert: { place: 'desert', sky: [255, 214, 160, 0.16] },
    rooftop: { place: 'rooftop' },
    forest: { place: 'forest', sky: [190, 230, 200, 0.18], fx: 'fireflies' },
    zen: { place: 'zen', sky: [255, 225, 235, 0.12], fx: 'petals' },
    underwater: { place: 'underwater', tint: [40, 150, 200, 0.16], noRain: true, noAir: true },
    peaks: { place: 'peaks', remap: WINTER, sky: [222, 234, 246, 0.24], fx: 'snow' },
    space: { place: 'space', forceN: 0.35, noRain: true, noAir: true }
  };

  // ---------- layout ----------
  // area: the free screen region (css px) where the island should sit, avoiding the UI panel.
  function layout(W, H, area) {
    var l = area ? area.l : 0, r = area ? area.r : W, t = area ? area.t : 0, b = area ? area.b : H;
    var aw = Math.max(80, r - l), ah = Math.max(80, b - t);
    var rx = Math.min(aw * 0.44, 440);
    if (rx * 1.62 > ah) rx = ah / 1.62;
    rx = Math.max(rx, 50);
    var ry = rx * 0.4;
    var cx = (l + r) / 2;
    var cy = t + (ah - rx * 1.62) / 2 + rx * 1.05;
    var hy = Math.max(H * 0.12, cy - ry - rx * 0.5);
    return { W: W, H: H, cx: cx, cy: cy, rx: rx, ry: ry, u: rx / 100, side: rx * 0.1, hy: hy, k: clamp(Math.min(W, H) / 800, 0.5, 1.6) };
  }

  // Where each item stands on the island (u: left/right, v: back/front, both about -1..1).
  var SLOTS = {
    sprout: { u: -0.06, v: -0.02 }, flowers1: { u: 0.2, v: 0.14 }, tree1: { u: -0.26, v: -0.16 },
    bush: { u: 0.32, v: -0.1 }, rocks: { u: 0.72, v: 0.42 }, pine1: { u: -0.5, v: 0.08 },
    tent: { u: 0.37, v: -0.44 }, flowers2: { u: -0.2, v: 0.34 }, campfire: { u: 0.15, v: -0.28 },
    tree2: { u: -0.6, v: -0.36 }, pond: { u: -0.44, v: 0.5, flat: true }, garden: { u: 0.5, v: 0.14, flat: true },
    cottage: { u: -0.06, v: -0.6 }, pines: { u: -0.8, v: 0.04 }, lamp: { u: -0.18, v: -0.4 },
    windmill: { u: 0.7, v: -0.12 }, dock: { u: 0.66, v: 0.74, flat: true }, blossom: { u: 0.36, v: 0.44 },
    well: { u: -0.3, v: 0.16 }, cottage2: { u: -0.42, v: -0.68 }, lighthouse: { u: 0.84, v: -0.5 },
    tower: { u: 0.25, v: -0.74 }, greattree: { u: -0.18, v: -0.88 }, islet: { u: -0.8, v: -1.72, sea: true }
  };
  var SEEDLING_SLOT = { u: 0, v: 0.52 };
  var ITEM_BY_ID = {};
  L.ITEMS.forEach(function (it) { ITEM_BY_ID[it.id] = it; });

  function itemScreen(Lo, id) {
    var sl = id === 'seedling' ? SEEDLING_SLOT : SLOTS[id];
    if (!sl) return { x: Lo.cx, y: Lo.cy - Lo.ry };
    return { x: Lo.cx + sl.u * Lo.rx, y: Lo.cy + sl.v * Lo.ry };
  }

  // ---------- island shape ----------
  function islandR(seed) {
    var a = rand(seed, 11, 0) * TAU, b = rand(seed, 11, 1) * TAU, c = rand(seed, 11, 2) * TAU;
    return function (th) { return 1 + 0.035 * Math.sin(3 * th + a) + 0.025 * Math.sin(5 * th + b) + 0.012 * Math.sin(7 * th + c); };
  }
  function grassR(seed) {
    var a = rand(seed, 12, 0) * TAU, b = rand(seed, 12, 1) * TAU;
    return function (th) { return 1 + 0.06 * Math.sin(4 * th + a) + 0.04 * Math.sin(6 * th + b); };
  }
  function shape(c, Lo, R, scale, dy, th0, th1, move, oy) {
    var N = 72;
    for (var i = 0; i <= N; i++) {
      var th = th0 + (th1 - th0) * i / N;
      var r = R(th) * scale;
      var x = Lo.cx + Lo.rx * r * Math.cos(th), y = Lo.cy + (oy || 0) + dy + Lo.ry * r * Math.sin(th);
      if (i === 0 && move) c.moveTo(x, y); else c.lineTo(x, y);
    }
  }

  // ---------- the scene ----------
  // st: { min, seed, sky, rain (0..1), calm, seedling: {f, wilted} | null, date }
  // fx: optional live effects { pops, particles }
  function drawScene(c, Lo, st, t, fx) {
    var LOOK = LOOKS[st.scene] || LOOKS.meadow;
    var hour = hourFor(st.sky, st.date);
    if (LOOK.forceHour && hour > 6.5 && hour < 19.6) hour = LOOK.forceHour;
    var env = { hour: hour, n: nightAt(hour), w: warmAt(hour), rain: clamp(Math.max(st.rain || 0, LOOK.rain || 0), 0, 1) };
    if (LOOK.forceN != null) { env.n = LOOK.forceN; env.w = 0; }
    if (LOOK.noRain) env.rain = 0;
    var PLACE = LOOK.place && root.FWPlaces ? root.FWPlaces[LOOK.place] || null : null;
    var RM = LOOK.remap || {}, fk = LOOK.fog || 0, FOGC = [222, 228, 234], TINT = LOOK.tint || null;
    var NIGHT = [30, 38, 88], WARM = [255, 150, 105], GREY = [128, 138, 150];
    var cache = {};
    var nk = env.n * 0.62, wk = env.w * 0.15, rk = env.rain * 0.22;
    function T(hex) {
      var v = cache[hex];
      if (v) return v;
      var col = rgb(RM[hex] || hex);
      if (TINT) col = mix(col, TINT, TINT[3]);
      if (fk) col = mix(col, FOGC, fk);
      if (nk) col = mix(col, NIGHT, nk);
      if (wk) col = mix(col, WARM, wk);
      if (rk) col = mix(col, GREY, rk);
      v = css(col);
      cache[hex] = v;
      return v;
    }
    var glows = [], beams = [];
    function TA(hex, al) {
      var col = rgb(RM[hex] || hex);
      if (TINT) col = mix(col, TINT, TINT[3]);
      if (fk) col = mix(col, FOGC, fk);
      if (nk) col = mix(col, NIGHT, nk);
      if (wk) col = mix(col, WARM, wk);
      if (rk) col = mix(col, GREY, rk);
      return css(col, al);
    }
    function glow(x, y, r, col, a) { if (a > 0.01 && r > 0.5) glows.push([x, y, r, col, a]); }
    function beam(x0, y0, x1, y1, spread, a) { if (a > 0.01) beams.push([x0, y0, x1, y1, spread, a]); }
    var min = st.min, seed = st.seed, calm = !!st.calm;
    var has = {};
    L.unlocked(min).forEach(function (it) { has[it.id] = true; });
    var W = Lo.W, H = Lo.H, k = Lo.k;

    // --- sky ---
    var sk = skyAt(hour);
    if (env.rain) {
      var gr = [118, 128, 142];
      sk = { top: mix(sk.top, gr, env.rain * 0.45), mid: mix(sk.mid, gr, env.rain * 0.45), bot: mix(sk.bot, gr, env.rain * 0.4) };
    }
    if (LOOK.sky) {
      var sa = LOOK.sky[3] * (1 - env.n * 0.6);
      sk = { top: mix(sk.top, LOOK.sky, sa), mid: mix(sk.mid, LOOK.sky, sa), bot: mix(sk.bot, LOOK.sky, sa * 1.1) };
    }
    var IR = islandR(seed), GR = grassR(seed);
    var P = PLACE ? {
      c: c, Lo: Lo, W: W, H: H, t: t, env: env, sk: sk, T: T, TA: TA, seed: seed, calm: calm,
      rand: rand, mix: mix, css: css, rgb: rgb, I: I, R: IR, glow: glow,
      shape: function (scale, dy, th0, th1, move, oy) { shape(c, Lo, IR, scale, dy, th0, th1, move, oy); }
    } : null;
    var ownSky = !!(PLACE && PLACE.sky);
    var i, x, y;
    if (ownSky) PLACE.sky(P);
    else {
    var g0 = c.createLinearGradient(0, 0, 0, Lo.hy);
    g0.addColorStop(0, css(sk.top)); g0.addColorStop(0.58, css(sk.mid)); g0.addColorStop(1, css(sk.bot));
    c.fillStyle = g0; c.fillRect(0, 0, W, Lo.hy + 2);

    if (env.n > 0.04) {
      for (i = 0; i < (LOOK.fx === 'stars' ? 170 : 90); i++) {
        x = rand(seed, 1, i) * W; y = rand(seed, 2, i) * Lo.hy * 0.92;
        var tw = calm ? 0.8 : 0.55 + 0.45 * Math.sin(t * (0.8 + rand(seed, 3, i) * 2) + i);
        c.fillStyle = 'rgba(255,255,240,' + (env.n * tw * (1 - env.rain) * 0.9).toFixed(3) + ')';
        I.circ(c, x, y, (0.5 + rand(seed, 4, i) * 1.1) * Math.max(0.8, k));
      }
    }
    if (has.aurora && env.n > 0.3 && env.rain < 0.5) drawAurora(c, Lo, t, env, calm);

    // sun
    var sp = (hour - 5.8) / 13;
    if (sp > -0.06 && sp < 1.06) {
      var e = Math.sin(Math.PI * clamp(sp, 0, 1));
      var sx = W * (0.12 + 0.76 * sp), sy = Lo.hy - e * Lo.hy * 0.78 + 6;
      var R = clamp(Math.min(W, H) * 0.03, 12, 32);
      var sc = mix([255, 170, 100], [255, 247, 220], e);
      var sg = c.createRadialGradient(sx, sy, R * 0.5, sx, sy, R * 5);
      sg.addColorStop(0, css(sc, 0.45 * (1 - env.rain))); sg.addColorStop(1, css(sc, 0));
      c.fillStyle = sg; I.circ(c, sx, sy, R * 5);
      c.fillStyle = css(sc, 1 - env.rain * 0.6); I.circ(c, sx, sy, R);
      env.sun = { x: sx, y: sy, e: e };
    }
    // moon
    var mh = hour >= 12 ? hour - 19 : hour + 5;
    var mp = mh / 11.5;
    if (mp > -0.06 && mp < 1.06) {
      var me = Math.sin(Math.PI * clamp(mp, 0, 1));
      var mx = W * (0.86 - 0.72 * mp), my = Lo.hy - me * Lo.hy * 0.72 + 6;
      var MR = clamp(Math.min(W, H) * 0.024, 10, 24);
      var mg = c.createRadialGradient(mx, my, MR * 0.6, mx, my, MR * 4);
      mg.addColorStop(0, 'rgba(230,235,255,' + (0.28 * env.n * (1 - env.rain)).toFixed(3) + ')'); mg.addColorStop(1, 'rgba(230,235,255,0)');
      c.fillStyle = mg; I.circ(c, mx, my, MR * 4);
      c.fillStyle = 'rgba(246,242,226,' + (0.25 + 0.75 * env.n).toFixed(3) + ')'; I.circ(c, mx, my, MR);
      c.fillStyle = 'rgba(200,196,180,' + (0.35 * env.n).toFixed(3) + ')';
      I.circ(c, mx - MR * 0.3, my - MR * 0.2, MR * 0.22); I.circ(c, mx + MR * 0.25, my + MR * 0.3, MR * 0.15);
      env.moon = { x: mx, y: my, e: me };
    }

    // clouds
    for (i = 0; i < 6; i++) {
      var speed = (0.004 + rand(seed, 5, i) * 0.006) * (calm ? 0.35 : 1) * (LOOK.clouds || 1);
      var fx0 = ((rand(seed, 6, i) + t * speed) % 1.3) - 0.15;
      x = fx0 * W; y = Lo.hy * (0.12 + rand(seed, 7, i) * 0.55);
      var cs = (0.7 + rand(seed, 8, i) * 0.7) * clamp(W / 900, 0.6, 1.4);
      var base = mix([255, 255, 255], sk.bot, 0.18);
      base = mix(base, [70, 80, 122], env.n * 0.75);
      base = mix(base, [150, 158, 170], env.rain * 0.6);
      c.fillStyle = css(base, 0.88 - env.n * 0.45 + env.rain * 0.1);
      var puffs = [[-26, 2, 15], [-8, -7, 20], [14, -3, 17], [31, 3, 12], [2, 5, 18]];
      for (var p = 0; p < puffs.length; p++) I.circ(c, x + puffs[p][0] * cs, y + puffs[p][1] * cs, puffs[p][2] * cs);
    }

    if (LOOK.fx === 'rainbow') drawRainbow(c, Lo, env);
    if (LOOK.fx === 'stars' && env.n > 0.3 && !calm) drawShootingStars(c, Lo, t, seed, env);
    }

    // --- sea (or a sea of clouds, or a whole other place) ---
    var cloudsea = !!LOOK.cloudsea;
    if (PLACE) { if (PLACE.bg) PLACE.bg(P); }
    else if (cloudsea) drawCloudSea(c, Lo, t, sk, env, calm, seed, true);
    else {
    var seaTop = mix(sk.bot, [150, 214, 224], 0.35);
    seaTop = mix(seaTop, [40, 50, 95], env.n * 0.5);
    var g1 = c.createLinearGradient(0, Lo.hy, 0, H);
    g1.addColorStop(0, css(seaTop));
    g1.addColorStop(0.3, T('#3f97bd'));
    g1.addColorStop(1, T('#246c97'));
    c.fillStyle = g1; c.fillRect(0, Lo.hy, W, H - Lo.hy);
    c.fillStyle = css(sk.bot, 0.55); c.fillRect(0, Lo.hy - 1, W, 3 * k);
    // distant hills
    for (i = 0; i < 2; i++) {
      var hx = W * (i ? 0.86 : 0.13), hw = Math.min(W * 0.17, 170), hh = hw * 0.13;
      c.fillStyle = css(mix(mix(sk.bot, [80, 116, 136], 0.5), [30, 40, 80], env.n * 0.5), 0.75);
      c.beginPath(); c.ellipse(hx, Lo.hy + 1, hw / 2, hh, 0, Math.PI, TAU); c.fill();
    }
    // sun / moon glitter on water
    var src = env.sun && env.sun.e > 0.05 ? env.sun : (env.moon && env.n > 0.3 ? env.moon : null);
    if (src) {
      var warm = src === env.sun ? mix([255, 210, 150], [255, 250, 230], src.e) : [225, 232, 255];
      for (i = 0; i < 22; i++) {
        var fy = Math.pow(i / 22, 1.3);
        y = Lo.hy + 3 + fy * (Lo.cy - Lo.hy) * 1.1;
        var jitter = calm ? 0 : Math.sin(t * 2 + i * 1.7) * 3;
        x = src.x + (rand(seed, 9, i) - 0.5) * (8 + fy * 40) * k + jitter;
        c.fillStyle = css(warm, (0.5 - fy * 0.35) * (1 - env.rain) * (src === env.sun ? 0.8 : 0.6));
        c.fillRect(x - (4 + fy * 14) * k, y, (8 + fy * 28) * k, 1.4 * k);
      }
    }
    for (i = 0; i < 46; i++) {
      var fyy = rand(seed, 10, i);
      y = Lo.hy + Math.pow(fyy, 1.4) * (H - Lo.hy);
      x = ((rand(seed, 13, i) * (W + 60) + t * (calm ? 1.5 : 5) * (0.4 + fyy)) % (W + 60)) - 30;
      var al = (0.08 + 0.16 * fyy) * (calm ? 0.7 : 0.5 + 0.5 * Math.sin(t * 1.2 + i)) * (1 - 0.5 * env.n);
      c.fillStyle = 'rgba(255,255,255,' + al.toFixed(3) + ')';
      c.fillRect(x, y, (6 + fyy * 22) * k, Math.max(1, 1.3 * k));
    }
    }

    var g = { ctx: c, t: t, n: env.n, calm: calm, T: T, glow: glow, beam: beam, x: 0, y: 0, s: 1, rnd: null, f: 0, wilted: false, wind: LOOK.wind || 1 };
    function place(id, u, v, extra) {
      var sc = 0.8 + 0.2 * ((clamp(v, -1, 1) + 1) / 2);
      var item = ITEM_BY_ID[id];
      var grow = item ? L.itemGrowth(item, min) : 1;
      var pop = 1;
      if (fx && fx.pops && fx.pops[id] != null) {
        var pp = (t - fx.pops[id]) / 0.9;
        if (pp < 0) return;
        pop = pp < 1 ? Math.max(0.01, easeOutBack(pp)) : 1;
      }
      g.x = Lo.cx + u * Lo.rx; g.y = Lo.cy + v * Lo.ry;
      g.s = Lo.u * sc * grow * pop * (extra || 1);
      var hk = hashStr(id);
      g.rnd = function (j) { return rand(seed, hk, j); };
      D[id](g);
    }

    // ambient at sea (behind the island)
    if (!cloudsea && !PLACE) {
      if (has.sailboat) drawSailboat(c, Lo, t, g, T, calm);
      if (has.whale) drawWhale(c, Lo, t, T, calm);
      if (has.islet) place('islet', SLOTS.islet.u, SLOTS.islet.v, 0.72);
    }

    // --- the ground the garden stands on ---
    var gc = L.grassCover(min), goy = -Lo.ry * 0.03, grassy = true;
    if (PLACE) {
      PLACE.ground(P);
      grassy = !!PLACE.grass;
      if (grassy) {
        // a soft lawn that grows with focus minutes (no island rim here)
        c.save(); c.translate(Lo.cx, Lo.cy + goy); c.scale(1, Lo.ry / Lo.rx);
        var lr = Lo.rx * (gc + 0.08), lg = c.createRadialGradient(0, 0, 0, 0, 0, lr);
        lg.addColorStop(0, TA('#a5dc7d', 1)); lg.addColorStop(0.72, TA('#8fcf6c', 1)); lg.addColorStop(1, TA('#79bd5a', 0));
        c.fillStyle = lg; c.fillRect(-lr, -lr, lr * 2, lr * 2);
        c.restore();
      }
    } else {
    var shal = (1 - 0.5 * env.n) * (LOOK.fx === 'sparkle' ? 1.5 : 1);
    if (cloudsea) {
      drawUnderside(c, Lo, IR, T, t, calm);
      drawCloudSea(c, Lo, t, sk, env, calm, seed, false);
    } else {
      c.fillStyle = css(rgb('#86e0d2'), 0.32 * shal);
      c.beginPath(); shape(c, Lo, IR, 1.24, Lo.side * 0.6, 0, TAU, true); c.fill();
      c.fillStyle = css(rgb('#a6efe2'), 0.3 * shal);
      c.beginPath(); shape(c, Lo, IR, 1.1, Lo.side * 0.6, 0, TAU, true); c.fill();
      c.fillStyle = 'rgba(20,60,80,0.16)';
      c.beginPath(); shape(c, Lo, IR, 1.02, Lo.side * 1.25, 0, TAU, true); c.fill();
    }
    var g2 = c.createLinearGradient(0, Lo.cy, 0, Lo.cy + Lo.ry + Lo.side);
    g2.addColorStop(0, T('#e7cb93')); g2.addColorStop(1, T('#ad8652'));
    c.fillStyle = g2;
    c.beginPath(); shape(c, Lo, IR, 1, 0, 0, Math.PI, true); shape(c, Lo, IR, 1, Lo.side, Math.PI, 0, false); c.closePath(); c.fill();
    c.strokeStyle = T('#8b6a43'); c.lineWidth = Lo.u * 1.1;
    c.beginPath(); shape(c, Lo, IR, 1, Lo.side, 0.05, Math.PI - 0.05, true); c.stroke();
    if (!cloudsea) {
      var foam = calm ? 0 : Math.sin(t * 1.4) * 0.006;
      c.strokeStyle = 'rgba(255,255,255,' + (0.55 * (1 - 0.4 * env.n)).toFixed(3) + ')'; c.lineWidth = Lo.u * 1.5;
      c.beginPath(); shape(c, Lo, IR, 1.012 + foam, Lo.side + Lo.u * 0.8, 0.02, Math.PI - 0.02, true); c.stroke();
    }
    var g3 = c.createLinearGradient(Lo.cx - Lo.rx, Lo.cy - Lo.ry, Lo.cx + Lo.rx, Lo.cy + Lo.ry);
    g3.addColorStop(0, T('#f8e7b8')); g3.addColorStop(1, T('#ecd29a'));
    c.fillStyle = g3; c.beginPath(); shape(c, Lo, IR, 1, 0, 0, TAU, true); c.fill();

    c.fillStyle = T('#cbd88b');
    c.beginPath(); shape(c, Lo, GR, gc + 0.035, 0, 0, TAU, true, goy); c.fill();
    var g4 = c.createLinearGradient(Lo.cx - Lo.rx * gc, Lo.cy - Lo.ry * gc, Lo.cx + Lo.rx * gc, Lo.cy + Lo.ry * gc);
    g4.addColorStop(0, T('#a5dc7d')); g4.addColorStop(1, T('#79bd5a'));
    c.fillStyle = g4; c.beginPath(); shape(c, Lo, GR, gc, 0, 0, TAU, true, goy); c.fill();
    }
    for (i = 0; i < 26 && grassy; i++) {
      var ang = rand(seed, 14, i) * TAU, rr = Math.sqrt(rand(seed, 15, i)) * 0.86;
      if (rr > gc * 0.9) continue;
      c.fillStyle = TA(i % 3 ? '#6fb453' : '#9ad57a', 0.4);
      I.ell(c, Lo.cx + Math.cos(ang) * rr * Lo.rx, Lo.cy + goy + Math.sin(ang) * rr * Lo.ry, (5 + rand(seed, 16, i) * 8) * Lo.u, (1.6 + rand(seed, 17, i) * 2) * Lo.u);
    }
    c.strokeStyle = T('#5f9f45'); c.lineWidth = Math.max(1, Lo.u * 0.6);
    for (i = 0; i < 34 && grassy; i++) {
      var an = rand(seed, 18, i) * TAU, r2 = Math.sqrt(rand(seed, 19, i)) * 0.9;
      if (r2 > gc * 0.92) continue;
      x = Lo.cx + Math.cos(an) * r2 * Lo.rx; y = Lo.cy + goy + Math.sin(an) * r2 * Lo.ry;
      c.beginPath(); c.moveTo(x - Lo.u, y); c.lineTo(x - Lo.u * 1.4, y - Lo.u * 2.4);
      c.moveTo(x, y); c.lineTo(x + Lo.u * 0.3, y - Lo.u * 3); c.moveTo(x + Lo.u, y); c.lineTo(x + Lo.u * 1.6, y - Lo.u * 2.2); c.stroke();
    }
    if (has.cottage) {
      var d0 = itemScreen(Lo, 'cottage');
      c.strokeStyle = T('#e4cb95'); c.lineCap = 'round'; c.lineWidth = Lo.u * 5.5;
      c.beginPath(); c.moveTo(d0.x, d0.y + Lo.u * 1.5);
      c.bezierCurveTo(d0.x + Lo.rx * 0.18, Lo.cy - Lo.ry * 0.1, Lo.cx - Lo.rx * 0.16, Lo.cy + Lo.ry * 0.3, Lo.cx + Lo.rx * 0.02, Lo.cy + Lo.ry * 0.96);
      c.stroke();
      c.strokeStyle = T('#d6b97d'); c.lineWidth = Lo.u * 1;
      c.stroke();
    }

    // flat things first, then everything standing, back to front
    ['pond', 'garden', 'dock'].forEach(function (id) {
      if (!has[id]) return;
      if (id === 'dock' && (cloudsea || PLACE)) return;
      if (id === 'pond' && LOOK.place === 'underwater') return;
      place(id, SLOTS[id].u, SLOTS[id].v);
    });
    var up = [];
    Object.keys(SLOTS).forEach(function (id) {
      var sl = SLOTS[id];
      if (has[id] && !sl.flat && !sl.sea) up.push({ id: id, v: sl.v, u: sl.u });
    });
    if (st.seedling) up.push({ id: 'seedling', v: SEEDLING_SLOT.v, u: SEEDLING_SLOT.u });
    up.sort(function (p, q) { return p.v - q.v; });
    for (i = 0; i < up.length; i++) {
      if (up[i].id === 'seedling') {
        g.f = st.seedling.f; g.wilted = !!st.seedling.wilted;
        place('seedling', up[i].u, up[i].v, 1.7);
        g.f = 0; g.wilted = false;
      } else {
        place(up[i].id, up[i].u, up[i].v);
      }
    }

    if (PLACE && PLACE.fg) PLACE.fg(P);
    if (!LOOK.noAir) {
      if (has.butterflies && env.n < 0.75 && env.rain < 0.5) drawButterflies(c, Lo, t, env, calm);
      if (has.lanterns) drawLanterns(c, Lo, t, env, seed, glow, calm);
      if (has.balloon) drawBalloon(c, Lo, t, T, calm);
      if (has.birds && env.n < 0.6) drawBirds(c, Lo, t, seed, T, calm);
    }
    drawWeather(c, Lo, t, env, LOOK, seed, calm, glow, T);

    if (env.rain > 0.02) {
      var drops = Math.round(30 + 110 * env.rain) * (calm ? 0.5 : 1);
      c.strokeStyle = 'rgba(225,235,245,' + (0.28 + 0.2 * env.rain).toFixed(3) + ')'; c.lineWidth = Math.max(1, k);
      c.beginPath();
      for (i = 0; i < drops; i++) {
        var dx = (rand(seed, 20, i) * (W + 80) + t * 40) % (W + 80) - 40;
        var dyy = ((rand(seed, 21, i) + t * (0.9 + rand(seed, 22, i) * 0.5) * (calm ? 0.4 : 1)) % 1) * H;
        c.moveTo(dx, dyy); c.lineTo(dx - 3 * k, dyy + 13 * k);
      }
      c.stroke();
      c.fillStyle = 'rgba(205,215,228,' + (0.07 * env.rain).toFixed(3) + ')'; c.fillRect(0, 0, W, H);
    }

    // lights
    if (glows.length || beams.length || (fx && fx.particles && fx.particles.length)) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (i = 0; i < beams.length; i++) {
        var bm = beams[i];
        var bg = c.createLinearGradient(bm[0], bm[1], bm[2], bm[3]);
        bg.addColorStop(0, 'rgba(255,240,180,' + bm[5].toFixed(3) + ')'); bg.addColorStop(1, 'rgba(255,240,180,0)');
        c.fillStyle = bg;
        I.poly(c, [bm[0], bm[1] - 1, bm[2], bm[3] - bm[4], bm[2], bm[3] + bm[4], bm[0], bm[1] + 1]);
      }
      for (i = 0; i < glows.length; i++) {
        var gl = glows[i];
        var rg = c.createRadialGradient(gl[0], gl[1], 0, gl[0], gl[1], gl[2]);
        rg.addColorStop(0, css(gl[3], 0.55 * gl[4])); rg.addColorStop(1, css(gl[3], 0));
        c.fillStyle = rg; c.fillRect(gl[0] - gl[2], gl[1] - gl[2], gl[2] * 2, gl[2] * 2);
      }
      if (fx && fx.particles) {
        for (i = 0; i < fx.particles.length; i++) {
          var pt = fx.particles[i], life = clamp(pt.life / pt.max, 0, 1);
          c.fillStyle = css(pt.col, life);
          I.circ(c, pt.x, pt.y, pt.size * (0.4 + 0.6 * life));
        }
      }
      c.restore();
    }

    var vg = c.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(5,10,30,0)'); vg.addColorStop(1, 'rgba(5,10,30,' + (0.16 + 0.12 * env.n).toFixed(3) + ')');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    return env;
  }

  // ---------- ambient life ----------
  function drawButterflies(c, Lo, t, env, calm) {
    var cols = ['#ffb3c7', '#ffe17a', '#a7d8ff'];
    var cx = Lo.cx + 0.08 * Lo.rx, cy = Lo.cy + 0.12 * Lo.ry, u = Lo.u;
    for (var i = 0; i < 3; i++) {
      var sp = calm ? 0.35 : 1;
      var x = cx + Math.sin(t * 0.6 * sp + i * 2.1) * 22 * u;
      var y = cy - 12 * u + Math.cos(t * 0.85 * sp + i) * 6 * u - Math.abs(Math.sin(t * 1.6 * sp + i)) * 4 * u;
      var flap = calm ? 0.7 : Math.abs(Math.sin(t * 13 + i * 3));
      c.fillStyle = css(rgb(cols[i]), 1 - env.n);
      c.beginPath(); c.ellipse(x - 1.2 * u * flap, y, 1.5 * u * flap + 0.2, 1.1 * u, -0.3, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(x + 1.2 * u * flap, y, 1.5 * u * flap + 0.2, 1.1 * u, 0.3, 0, TAU); c.fill();
      c.fillStyle = 'rgba(60,50,40,' + (1 - env.n).toFixed(3) + ')'; c.fillRect(x - 0.25 * u, y - 0.9 * u, 0.5 * u, 1.8 * u);
    }
  }
  function drawBirds(c, Lo, t, seed, T, calm) {
    c.strokeStyle = T('#3b4250'); c.lineWidth = Math.max(1.2, Lo.u * 0.55); c.lineCap = 'round';
    for (var i = 0; i < 4; i++) {
      var sp = (0.018 + rand(seed, 30, i) * 0.012) * (calm ? 0.4 : 1);
      var x = (((t * sp + rand(seed, 31, i)) % 1.3) - 0.15) * Lo.W;
      var y = Lo.hy * (0.35 + rand(seed, 32, i) * 0.35) + Math.sin(t * 0.7 + i) * 6;
      var f = calm ? 0.5 : Math.sin(t * 7 + i * 2);
      var w = (4 + rand(seed, 33, i) * 2) * Lo.u * 0.9;
      c.beginPath(); c.moveTo(x - w, y - f * w * 0.4); c.quadraticCurveTo(x - w * 0.4, y - w * 0.5, x, y);
      c.quadraticCurveTo(x + w * 0.4, y - w * 0.5, x + w, y - f * w * 0.4); c.stroke();
    }
  }
  function drawSailboat(c, Lo, t, g, T, calm) {
    var u = Lo.u * 0.62;
    var x = Lo.cx + Math.sin(t * (calm ? 0.01 : 0.03)) * Lo.W * 0.32;
    var y = Lo.hy + (Lo.cy - Lo.ry - Lo.hy) * 0.38 + Math.sin(t * 1.3) * 0.4 * u;
    c.fillStyle = 'rgba(20,50,70,0.18)'; I.ell(c, x, y + 1.5 * u, 9 * u, 1.5 * u);
    c.fillStyle = T('#7b4b2e'); I.poly(c, [x - 8 * u, y - 1 * u, x + 8 * u, y - 1 * u, x + 6 * u, y + 2 * u, x - 6 * u, y + 2 * u]);
    c.fillStyle = T('#fbf7ee'); I.poly(c, [x + 0.5 * u, y - 2 * u, x + 0.5 * u, y - 16 * u, x + 8 * u, y - 2 * u]);
    c.fillStyle = T('#e9e2d2'); I.poly(c, [x - 0.5 * u, y - 2 * u, x - 0.5 * u, y - 13 * u, x - 6 * u, y - 2 * u]);
    c.fillStyle = T('#e1574a'); I.poly(c, [x + 0.5 * u, y - 16 * u, x + 3.5 * u, y - 15 * u, x + 0.5 * u, y - 14 * u]);
  }
  function drawWhale(c, Lo, t, T, calm) {
    var cycle = 46, ph = (t % cycle) / cycle;
    if (ph > 0.16) return;
    var p = ph / 0.16, rise = Math.sin(Math.PI * p);
    var x = Lo.cx + Lo.rx * 0.95, y = Lo.hy + (Lo.cy - Lo.ry - Lo.hy) * 0.72, u = Lo.u * 0.8;
    c.fillStyle = T('#4a6d8c');
    c.beginPath(); c.ellipse(x, y + (1 - rise) * 6 * u, 13 * u, 5 * u * rise + 0.1, 0, Math.PI, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x - 15 * u, y, 30 * u, 1.2 * u);
    if (!calm && p > 0.3 && p < 0.8) {
      var sp = (p - 0.3) / 0.5;
      c.fillStyle = 'rgba(235,245,255,' + (0.7 * (1 - sp)).toFixed(3) + ')';
      for (var i = 0; i < 6; i++) {
        var a = -Math.PI / 2 + (i - 2.5) * 0.22;
        I.circ(c, x - 4 * u + Math.cos(a) * sp * 10 * u, y - 5 * u + Math.sin(a) * sp * 14 * u, (1.6 - sp) * u + 0.3);
      }
    }
  }
  function drawLanterns(c, Lo, t, env, seed, glow, calm) {
    var vis = 0.55 + 0.45 * env.n;
    for (var i = 0; i < 7; i++) {
      var life = ((t * (calm ? 0.008 : 0.022)) + rand(seed, 40, i)) % 1;
      var x = Lo.cx + (rand(seed, 41, i) - 0.5) * Lo.rx * 1.6 + Math.sin(t * 0.3 + i) * 8 * Lo.u;
      var y = Lo.cy - Lo.ry * 0.4 - life * (Lo.cy - Lo.ry * 0.4) * 1.05;
      var a = vis * Math.min(1, life * 6) * Math.min(1, (1 - life) * 3);
      var s = Lo.u * (1.7 - life * 0.8);
      c.fillStyle = 'rgba(255,170,80,' + a.toFixed(3) + ')';
      I.poly(c, [x - 1.6 * s, y - 2.2 * s, x + 1.6 * s, y - 2.2 * s, x + 1.2 * s, y + 1.8 * s, x - 1.2 * s, y + 1.8 * s]);
      c.fillStyle = 'rgba(255,230,160,' + a.toFixed(3) + ')'; c.fillRect(x - 0.8 * s, y + 0.2 * s, 1.6 * s, 1.4 * s);
      glow(x, y, 9 * s, [255, 170, 80], a * env.n * 0.9);
    }
  }
  function drawBalloon(c, Lo, t, T, calm) {
    var u = Lo.u * 0.85;
    var x = Lo.cx + Lo.rx * 0.78, y = Math.max(Lo.hy * 0.45, Lo.cy - Lo.rx * 0.95) + Math.sin(t * (calm ? 0.2 : 0.5)) * 4 * u;
    var cols = ['#e1574a', '#fbf2df', '#3fa7a0', '#fbf2df'];
    function envelope() {
      c.beginPath();
      c.moveTo(x, y + 13 * u);
      c.bezierCurveTo(x - 6 * u, y + 9 * u, x - 11 * u, y + 3 * u, x - 11 * u, y - 3 * u);
      c.arc(x, y - 3 * u, 11 * u, Math.PI, 0);
      c.bezierCurveTo(x + 11 * u, y + 3 * u, x + 6 * u, y + 9 * u, x, y + 13 * u);
      c.closePath();
    }
    c.save();
    envelope(); c.clip();
    for (var i = -4; i <= 4; i++) {
      c.fillStyle = T(cols[(i + 8) % 4]);
      c.fillRect(x + i * 3.4 * u - 1.7 * u, y - 15 * u, 3.4 * u, 30 * u);
    }
    var sh = c.createLinearGradient(x - 11 * u, 0, x + 11 * u, 0);
    sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(20,20,40,0.22)');
    c.fillStyle = sh; c.fillRect(x - 11 * u, y - 15 * u, 22 * u, 30 * u);
    c.restore();
    c.strokeStyle = T('#6b4a33'); c.lineWidth = Math.max(0.8, 0.4 * u);
    c.beginPath(); c.moveTo(x - 3 * u, y + 11.5 * u); c.lineTo(x - 2 * u, y + 16 * u); c.moveTo(x + 3 * u, y + 11.5 * u); c.lineTo(x + 2 * u, y + 16 * u); c.stroke();
    c.fillStyle = T('#9a6a43'); c.fillRect(x - 2.4 * u, y + 16 * u, 4.8 * u, 3 * u);
  }
  function drawAurora(c, Lo, t, env, calm) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    var bands = [[120, 255, 180], [150, 120, 255], [90, 220, 255]];
    for (var b = 0; b < 3; b++) {
      var base = Lo.hy * (0.22 + b * 0.1);
      for (var x = 0; x < Lo.W; x += 6) {
        var y = base + Math.sin(x * 0.006 + t * (calm ? 0.05 : 0.18) + b * 2) * Lo.hy * 0.08 + Math.sin(x * 0.017 + b) * Lo.hy * 0.03;
        var h = Lo.hy * (0.18 + 0.08 * Math.sin(x * 0.01 + t * 0.3 + b));
        var a = env.n * 0.1 * (0.6 + 0.4 * Math.sin(x * 0.02 + t * 0.6 + b));
        var gr = c.createLinearGradient(0, y - h, 0, y);
        gr.addColorStop(0, css(bands[b], 0)); gr.addColorStop(1, css(bands[b], a));
        c.fillStyle = gr; c.fillRect(x, y - h, 6, h);
      }
    }
    c.restore();
  }

  function drawRainbow(c, Lo, env) {
    var cols = [[255, 92, 92], [255, 166, 82], [255, 228, 102], [122, 220, 122], [92, 172, 255], [162, 124, 255]];
    var R0 = Math.max(Lo.hy * 0.85, Math.min(Lo.W * 0.3, Lo.hy * 1.6)), lw = Math.max(1.5, R0 * 0.05), cx = Lo.W * 0.66, cy = Lo.hy + R0 * 0.12;
    var a = 0.32 * (1 - env.n * 0.85) * (1 - env.rain * 0.7);
    if (a < 0.01) return;
    c.save();
    c.beginPath(); c.rect(0, 0, Lo.W, Lo.hy); c.clip();
    c.lineWidth = lw;
    for (var i = 0; i < cols.length; i++) {
      c.strokeStyle = css(cols[i], a);
      var rr = R0 - i * lw;
      if (rr <= lw) break;
      c.beginPath(); c.arc(cx, cy, rr, Math.PI, TAU); c.stroke();
    }
    c.restore();
  }
  function drawShootingStars(c, Lo, t, seed, env) {
    for (var j = 0; j < 2; j++) {
      var period = 4.5 + j * 2.3, ph = ((t + j * 1.7) % period) / period;
      if (ph > 0.16) continue;
      var cycle = Math.floor((t + j * 1.7) / period);
      var p = ph / 0.16;
      var x0 = Lo.W * (0.2 + rand(seed, 50 + j, cycle) * 0.7), y0 = Lo.hy * (0.08 + rand(seed, 52 + j, cycle) * 0.35);
      var len = Lo.W * 0.18, x = x0 - p * len, y = y0 + p * len * 0.45;
      var gr = c.createLinearGradient(x, y, x + len * 0.35, y - len * 0.16);
      gr.addColorStop(0, 'rgba(255,255,240,' + (env.n * (1 - p)).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,255,240,0)');
      c.strokeStyle = gr; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + len * 0.35, y - len * 0.16); c.stroke();
    }
  }
  // A soft sea of clouds. back=true draws the far layer, false the near layer in front of the rock.
  function drawCloudSea(c, Lo, t, sk, env, calm, seed, back) {
    var W = Lo.W, H = Lo.H, i;
    if (back) {
      var g = c.createLinearGradient(0, Lo.hy, 0, H);
      g.addColorStop(0, css(mix(sk.bot, [255, 255, 255], 0.25)));
      g.addColorStop(1, css(mix(mix(sk.mid, [255, 240, 248], 0.35), [30, 36, 80], env.n * 0.5)));
      c.fillStyle = g; c.fillRect(0, Lo.hy, W, H - Lo.hy);
    }
    var base = mix([255, 255, 255], sk.bot, 0.12);
    base = mix(base, [92, 100, 150], env.n * 0.7);
    var rows = back ? [[Lo.hy + 6, 0.55, 0.5], [Lo.hy + (Lo.cy - Lo.hy) * 0.45, 0.8, 0.75]]
                    : [[Lo.cy + Lo.ry + Lo.rx * 0.45, 1.1, 1], [Lo.cy + Lo.ry + Lo.rx * 0.9, 1.35, 1]];
    for (var r = 0; r < rows.length; r++) {
      var y0 = rows[r][0], sc = rows[r][1] * Lo.k, alpha = rows[r][2];
      var shade = mix(base, [200, 205, 225], 0.25 * (1 - r));
      c.fillStyle = css(shade, alpha);
      var step = 70 * sc, drift = (t * (calm ? 2 : 6) * (r + 1) * (back ? 0.6 : 1)) % step;
      for (var x = -step * 2 + drift; x < W + step; x += step) {
        i = Math.floor((x - drift) / step) + r * 31;
        var h = (0.7 + rand(seed, 60 + r, i + 50) * 0.6) * 34 * sc;
        I.circ(c, x, y0 + Math.sin(i) * 6 * sc, h);
        I.circ(c, x + step * 0.45, y0 + 8 * sc, h * 0.8);
      }
      c.fillRect(0, y0 + 10 * sc, W, H);
    }
  }
  // The rocky bottom of the floating island, with hanging roots and little floating stones.
  function drawUnderside(c, Lo, R, T, t, calm) {
    var cx = Lo.cx, cy = Lo.cy + Lo.side, rx = Lo.rx, ry = Lo.ry, u = Lo.u;
    var gr = c.createLinearGradient(0, cy, 0, cy + ry * 2.6);
    gr.addColorStop(0, T('#9a8470')); gr.addColorStop(1, T('#4f443c'));
    c.fillStyle = gr;
    c.beginPath();
    shape(c, Lo, R, 1, Lo.side, 0, Math.PI, true);
    c.lineTo(cx - rx * 0.72, cy + ry * 1.15); c.lineTo(cx - rx * 0.4, cy + ry * 1.75);
    c.lineTo(cx - rx * 0.12, cy + ry * 2.5); c.lineTo(cx + rx * 0.05, cy + ry * 2.75);
    c.lineTo(cx + rx * 0.3, cy + ry * 1.95); c.lineTo(cx + rx * 0.62, cy + ry * 1.3); c.lineTo(cx + rx * 0.9, cy + ry * 0.6);
    c.closePath(); c.fill();
    c.strokeStyle = T('#5e4a3a'); c.lineWidth = Math.max(1, u * 0.7); c.lineCap = 'round';
    for (var i = 0; i < 7; i++) {
      var x = cx + (i / 6 - 0.5) * rx * 1.4, y = cy + ry * (0.9 + Math.abs(i - 3) * -0.08);
      var sw = calm ? 0 : Math.sin(t * 0.9 + i) * 2 * u;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + sw, y + 10 * u, x + sw * 1.5, y + (12 + i % 3 * 6) * u); c.stroke();
    }
    for (var k = 0; k < 3; k++) {
      var fx = cx + [-1.25, 1.2, 0.85][k] * rx, fy = cy + [0.5, 0.2, 1.6][k] * ry + (calm ? 0 : Math.sin(t * 0.7 + k) * 4 * u), s = u * [5, 4, 3][k];
      c.fillStyle = T('#8a7562'); I.poly(c, [fx - 3 * s, fy, fx + 3 * s, fy, fx + 1 * s, fy + 4 * s, fx - 1 * s, fy + 3 * s]);
      c.fillStyle = T('#8fd06c'); I.ell(c, fx, fy, 3 * s, 1.1 * s);
    }
  }
  function drawKite(c, Lo, t, k, T) {
    var i;
      var ax = Lo.cx + 0.37 * Lo.rx, ay = Lo.cy - 0.44 * Lo.ry;
      var kx = Lo.cx + Lo.rx * 0.6 + Math.sin(t * 0.8) * 14 * k, ky = Math.max(Lo.hy * 0.25, Lo.cy - Lo.rx * 1.25) + Math.cos(t * 1.1) * 10 * k;
      var s = Lo.u * 1.3;
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo((ax + kx) / 2 + 20 * k, (ay + ky) / 2 + 30 * k, kx, ky + 7 * s); c.stroke();
      c.fillStyle = T('#ff6b6b'); I.poly(c, [kx, ky - 7 * s, kx + 5 * s, ky, kx, ky + 7 * s]);
      c.fillStyle = T('#ffd166'); I.poly(c, [kx, ky - 7 * s, kx - 5 * s, ky, kx, ky + 7 * s]);
      c.strokeStyle = T('#ff6b6b'); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(kx, ky + 7 * s);
      for (i = 1; i <= 5; i++) c.lineTo(kx + Math.sin(t * 3 + i) * 3 * s, ky + 7 * s + i * 4 * s);
      c.stroke();
      c.fillStyle = T('#7ad3ff');
      for (i = 1; i <= 5; i += 2) I.circ(c, kx + Math.sin(t * 3 + i) * 3 * s, ky + 7 * s + i * 4 * s, 1.2 * s);
  }
  function drawWeather(c, Lo, t, env, LOOK, seed, calm, glow, T) {
    var W = Lo.W, H = Lo.H, k = Lo.k, i, x, y, n;
    var fx = LOOK.fx;
    if (fx === 'snow') {
      n = calm ? 50 : 140;
      c.fillStyle = 'rgba(255,255,255,0.88)';
      for (i = 0; i < n; i++) {
        x = ((rand(seed, 70, i) * W + Math.sin(t * 0.6 + i) * 18 * k + t * 6) % W + W) % W;
        y = ((rand(seed, 71, i) + t * (0.035 + rand(seed, 72, i) * 0.04)) % 1) * H;
        I.circ(c, x, y, (1 + rand(seed, 73, i) * 2) * k);
      }
    } else if (fx === 'petals' || fx === 'leaves' || fx === 'kite') {
      n = calm ? 14 : (fx === 'kite' ? 24 : 46);
      var cols = fx === 'petals' ? ['#ffc2d8', '#ffd9e6', '#ff9fc0'] : fx === 'kite' ? ['#7fcd64', '#a6e08a', '#5fae52'] : ['#e8742f', '#f2b142', '#c9502c', '#d9902f'];
      for (i = 0; i < n; i++) {
        var sp = 0.6 + rand(seed, 75, i);
        x = ((rand(seed, 76, i) * (W + 100) + t * 28 * sp * (LOOK.wind || 1)) % (W + 100)) - 50;
        y = ((rand(seed, 77, i) + t * 0.035 * sp) % 1) * H;
        var rot = t * (1 + sp) + i, flip = Math.abs(Math.sin(t * 2 * sp + i));
        c.fillStyle = cols[i % cols.length];
        c.beginPath(); c.ellipse(x, y, (fx === 'petals' ? 3.6 : 4.2) * k * (0.4 + flip * 0.6), (fx === 'petals' ? 2 : 2.4) * k, rot, 0, TAU); c.fill();
      }
      if (fx === 'kite') drawKite(c, Lo, t, k, T);
    } else if (fx === 'fog') {
      for (i = 0; i < 5; i++) {
        y = Lo.hy + (i / 4) * (H - Lo.hy) * 0.85 - Lo.ry * 0.6 + Math.sin(t * 0.15 + i) * 8 * k;
        var h = (70 + i * 18) * k;
        var gr = c.createLinearGradient(0, y - h, 0, y + h);
        gr.addColorStop(0, 'rgba(232,236,240,0)'); gr.addColorStop(0.5, 'rgba(232,236,240,' + (0.3 - env.n * 0.12).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(232,236,240,0)');
        c.fillStyle = gr; c.fillRect(0, y - h, W, h * 2);
      }
    } else if (fx === 'fireflies') {
      if (env.n > 0.15) {
        for (i = 0; i < 36; i++) {
          x = Lo.cx + Math.sin(t * 0.3 * (calm ? 0.3 : 1) + i * 2.1) * Lo.rx * (0.4 + rand(seed, 80, i) * 0.8);
          y = Lo.cy - Lo.ry * 0.3 + Math.cos(t * 0.4 * (calm ? 0.3 : 1) + i * 1.3) * Lo.ry * 1.5;
          glow(x, y, 4 * Lo.u, [215, 255, 140], env.n * (0.5 + 0.5 * Math.sin(t * 3 + i)));
        }
      } else {
        c.fillStyle = 'rgba(255,255,255,0.85)';
        for (i = 0; i < (calm ? 8 : 22); i++) {
          x = ((rand(seed, 81, i) * W + t * 12) % W);
          y = Lo.cy - ((rand(seed, 82, i) + t * 0.02) % 1) * (Lo.cy - Lo.hy * 0.3) + Math.sin(t + i) * 6;
          I.circ(c, x, y, 1.6 * k);
          c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 0.6;
          c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 4 * k); c.stroke();
        }
      }
    } else if (fx === 'sparkle') {
      for (i = 0; i < (calm ? 10 : 30); i++) {
        var a = Math.max(0, Math.sin(t * 2.2 + i * 1.9));
        if (a < 0.6) continue;
        x = Lo.cx + (rand(seed, 85, i) - 0.5) * Lo.rx * 3; y = Lo.cy + Lo.ry * (0.9 + rand(seed, 86, i) * 1.4);
        c.fillStyle = 'rgba(255,255,255,' + ((a - 0.6) * 2 * (1 - env.n * 0.7)).toFixed(3) + ')';
        I.poly(c, [x, y - 4 * k, x + 1 * k, y, x, y + 4 * k, x - 1 * k, y]);
        I.poly(c, [x - 4 * k, y, x, y + 1 * k, x + 4 * k, y, x, y - 1 * k]);
      }
    }
  }

  // ---------- live world ----------
  function World(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 1; this.H = 1; this.dpr = 1;
    this.area = null;
    this.Lo = layout(1, 1, null);
    this.st = { min: 0, seed: 1, sky: 'live', rain: 0, calm: false, seedling: null };
    this.fx = { pops: {}, particles: [] };
    this.lastT = 0;
    this.env = null;
  }
  World.prototype.resize = function (W, H, dpr, area) {
    this.W = W; this.H = H; this.dpr = dpr; this.area = area;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    this.Lo = layout(W, H, area);
  };
  World.prototype.set = function (patch) { for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) this.st[k] = patch[k]; };
  World.prototype.pop = function (id, t) {
    this.fx.pops[id] = t;
    var p = itemScreen(this.Lo, id);
    this.burst(p.x, p.y - this.Lo.u * 10, 22, [[255, 230, 140], [180, 255, 190], [255, 255, 255]]);
  };
  World.prototype.burst = function (x, y, n, cols) {
    if (this.st.calm) n = Math.ceil(n / 3);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, sp = 20 + Math.random() * 70;
      this.fx.particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.8 + Math.random() * 0.8, max: 1.6, size: 1.5 + Math.random() * 2.5, col: cols[i % cols.length] });
    }
    if (this.fx.particles.length > 400) this.fx.particles.splice(0, this.fx.particles.length - 400);
  };
  World.prototype.seedlingPoint = function () { return itemScreen(this.Lo, 'seedling'); };
  World.prototype.frame = function (tMs) {
    var t = tMs / 1000;
    var dt = this.lastT ? clamp(t - this.lastT, 0, 0.1) : 0;
    this.lastT = t;
    var ps = this.fx.particles;
    for (var i = ps.length - 1; i >= 0; i--) {
      var p = ps[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 25 * dt; p.vx *= 0.98;
      if (p.life <= 0) ps.splice(i, 1);
    }
    for (var id in this.fx.pops) if (t - this.fx.pops[id] > 1.2) delete this.fx.pops[id];
    var c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    try {
      this.env = drawScene(c, this.Lo, this.st, t, this.fx);
    } catch (e) {
      // Never leave a blank screen: fall back to the plain meadow scene, and report once.
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      if (!this.failed) { this.failed = true; if (window.console) console.error('Focus World drawing error:', e); }
      if (this.st.scene !== 'meadow') { var keep = this.st.scene; this.st.scene = 'meadow'; try { drawScene(c, this.Lo, this.st, t, this.fx); } catch (e2) { /* nothing else to try */ } this.st.scene = keep; }
    }
  };

  // Static picture for sharing and icons.
  function renderStatic(ctx, W, H, area, st, t) {
    var Lo = layout(W, H, area);
    return drawScene(ctx, Lo, st, t || 12, null);
  }

  root.FWWorld = { World: World, renderStatic: renderStatic, layout: layout, hourFor: hourFor, nightAt: nightAt, SLOTS: SLOTS, LOOKS: LOOKS };
})(this);
