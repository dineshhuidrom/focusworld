/* Focus World — drawings for every island item.
   Each function draws at ground point (g.x, g.y) with size unit g.s (pixels per unit).
   g.T(hex) gives the colour adjusted for night / sunset / rain. Lights use g.glow(). */
(function (root) {
  'use strict';
  var TAU = Math.PI * 2;

  function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); c.fill(); }
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); c.fill(); }
  function poly(c, pts) {
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath(); c.fill();
  }
  function rect(c, x, y, w, h) { c.fillRect(x, y, w, h); }
  function shadow(g, w, dx) {
    var c = g.ctx;
    c.fillStyle = 'rgba(25,45,35,' + (0.2 * (1 - 0.45 * g.n)).toFixed(3) + ')';
    ell(c, g.x + (dx || 0) * g.s, g.y + 0.6 * g.s, w * g.s, w * 0.3 * g.s);
  }
  function sway(g, amt, speed) {
    var k = (g.calm ? 0.35 : 1) * (g.wind || 1);
    return Math.sin(g.t * (speed || 1.3) * (g.wind > 1 ? 1.4 : 1) + g.rnd(0) * 6) * (amt || 0.8) * g.s * k;
  }

  // Leafy canopy made of soft blobs: dark base, light top-left highlights.
  function canopy(g, cx, cy, blobs, dark, mid, light) {
    var c = g.ctx, s = g.s, i, b;
    c.fillStyle = g.T(dark);
    for (i = 0; i < blobs.length; i++) { b = blobs[i]; circ(c, cx + b[0] * s, cy + b[1] * s, b[2] * s); }
    c.fillStyle = g.T(mid);
    for (i = 0; i < blobs.length; i++) { b = blobs[i]; circ(c, cx + (b[0] - b[2] * 0.18) * s, cy + (b[1] - b[2] * 0.22) * s, b[2] * 0.78 * s); }
    c.fillStyle = g.T(light);
    for (i = 0; i < blobs.length; i++) {
      b = blobs[i];
      if (b[1] < 2) circ(c, cx + (b[0] - b[2] * 0.38) * s, cy + (b[1] - b[2] * 0.42) * s, b[2] * 0.36 * s);
    }
  }

  function trunk(g, w, h, col, dark) {
    var c = g.ctx, s = g.s;
    c.fillStyle = g.T(col);
    poly(c, [g.x - w * 0.6 * s, g.y, g.x + w * 0.6 * s, g.y, g.x + w * 0.42 * s, g.y - h * s, g.x - w * 0.42 * s, g.y - h * s]);
    c.fillStyle = g.T(dark);
    poly(c, [g.x + w * 0.05 * s, g.y, g.x + w * 0.6 * s, g.y, g.x + w * 0.42 * s, g.y - h * s, g.x + w * 0.05 * s, g.y - h * s]);
  }

  var D = {};

  D.sprout = function (g) {
    var c = g.ctx, s = g.s, sw = sway(g, 0.5, 2);
    shadow(g, 3);
    c.strokeStyle = g.T('#5aa64a'); c.lineWidth = 0.9 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(g.x, g.y); c.quadraticCurveTo(g.x + sw * 0.4, g.y - 4 * s, g.x + sw, g.y - 7 * s); c.stroke();
    c.fillStyle = g.T('#7fd06a');
    c.beginPath(); c.ellipse(g.x + sw - 2.4 * s, g.y - 7.4 * s, 2.6 * s, 1.3 * s, -0.5, 0, TAU); c.fill();
    c.fillStyle = g.T('#62bb57');
    c.beginPath(); c.ellipse(g.x + sw + 2.4 * s, g.y - 7.8 * s, 2.6 * s, 1.3 * s, 0.5, 0, TAU); c.fill();
  };

  function flowerPatch(g, n, spread, colors) {
    var c = g.ctx, s = g.s;
    for (var i = 0; i < n; i++) {
      var dx = (g.rnd(i + 1) - 0.5) * spread * 2, dy = (g.rnd(i + 20) - 0.5) * spread * 0.7;
      var h = 3 + g.rnd(i + 40) * 3;
      var bob = g.calm ? 0 : Math.sin(g.t * 2 + i) * 0.4;
      var x = g.x + dx * s, y = g.y + dy * s;
      c.strokeStyle = g.T('#5c9a45'); c.lineWidth = 0.55 * s;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + bob * s, y - h * s); c.stroke();
      c.fillStyle = g.T(colors[i % colors.length]);
      var fx = x + bob * s, fy = y - h * s;
      for (var p = 0; p < 5; p++) {
        var a = p / 5 * TAU + g.rnd(i) * 3;
        circ(c, fx + Math.cos(a) * 1.05 * s, fy + Math.sin(a) * 1.05 * s, 0.85 * s);
      }
      c.fillStyle = g.T('#ffd23f'); circ(c, fx, fy, 0.6 * s);
    }
  }
  D.flowers1 = function (g) { flowerPatch(g, 9, 8, ['#ff8fb1', '#fff6e8', '#b48cff', '#ffd85c']); };

  D.flowers2 = function (g) { // tulips in two rows
    var c = g.ctx, s = g.s, cols = ['#ff5d6c', '#ff9f43', '#ff7eb6', '#ffd23f'];
    for (var r = 0; r < 2; r++) {
      for (var i = 0; i < 5; i++) {
        var x = g.x + (i - 2) * 3.4 * s + (r ? 1.7 * s : 0), y = g.y + (r - 0.5) * 3.2 * s;
        var bob = g.calm ? 0 : Math.sin(g.t * 1.7 + i + r) * 0.35 * s;
        c.strokeStyle = g.T('#4f9a45'); c.lineWidth = 0.6 * s;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + bob, y - 5.5 * s); c.stroke();
        c.fillStyle = g.T('#5fae52');
        c.beginPath(); c.ellipse(x - 0.9 * s, y - 2 * s, 0.6 * s, 1.8 * s, -0.4, 0, TAU); c.fill();
        c.fillStyle = g.T(cols[(i + r * 2) % cols.length]);
        var tx = x + bob, ty = y - 5.5 * s;
        c.beginPath();
        c.moveTo(tx - 1.5 * s, ty - 2.6 * s);
        c.lineTo(tx - 0.7 * s, ty - 1.5 * s); c.lineTo(tx, ty - 2.8 * s); c.lineTo(tx + 0.7 * s, ty - 1.5 * s);
        c.lineTo(tx + 1.5 * s, ty - 2.6 * s);
        c.quadraticCurveTo(tx + 1.7 * s, ty + 0.4 * s, tx, ty + 0.3 * s);
        c.quadraticCurveTo(tx - 1.7 * s, ty + 0.4 * s, tx - 1.5 * s, ty - 2.6 * s);
        c.fill();
      }
    }
  };

  D.tree1 = function (g) { // apple tree
    var s = g.s, sw = sway(g, 0.7);
    shadow(g, 13);
    trunk(g, 4.2, 15, '#8a5a3b', '#6e452c');
    var cx = g.x + sw, cy = g.y - 22 * s;
    canopy(g, cx, cy, [[-7, 2, 8.5], [7, 2, 8.5], [0, -5, 10], [-2, 5, 7.5], [5, -3, 7]], '#3f8f45', '#55a84f', '#86cf6b');
    var c = g.ctx;
    c.fillStyle = g.T('#e5534b');
    for (var i = 0; i < 7; i++) {
      var a = g.rnd(i + 3) * TAU, r = 3 + g.rnd(i + 9) * 8;
      circ(c, cx + Math.cos(a) * r * s, cy + Math.sin(a) * r * 0.7 * s + 1 * s, 1.35 * s);
    }
  };

  D.tree2 = function (g) { // big shade tree
    var s = g.s, sw = sway(g, 0.6, 1.0);
    shadow(g, 17);
    trunk(g, 5.5, 19, '#7b5136', '#5f3d28');
    canopy(g, g.x + sw, g.y - 28 * s,
      [[-11, 3, 10], [10, 3, 10], [0, -6, 12.5], [-5, -10, 8], [7, -9, 8], [0, 6, 9]],
      '#2f7a4c', '#3f9157', '#69b96a');
  };

  D.blossom = function (g) {
    var c = g.ctx, s = g.s, sw = sway(g, 0.6, 1.1);
    shadow(g, 14);
    trunk(g, 4.4, 16, '#6b4636', '#523427');
    var cx = g.x + sw, cy = g.y - 24 * s;
    canopy(g, cx, cy, [[-8, 2, 8.5], [8, 2, 8.5], [0, -6, 10], [-3, 5, 7], [4, -1, 8]], '#e98bb2', '#f6a9c8', '#ffd3e4');
    if (g.calm) return;
    c.fillStyle = g.T('#ffc2d8');
    for (var i = 0; i < 9; i++) {
      var life = (g.t * 0.22 + g.rnd(i + 2)) % 1;
      var px = cx + (g.rnd(i + 5) - 0.5) * 26 * s + Math.sin(g.t * 1.5 + i) * 3 * s + life * 6 * s;
      var py = cy + 4 * s + life * 26 * s;
      c.globalAlpha = Math.min(1, (1 - life) * 2);
      c.beginPath(); c.ellipse(px, py, 1.1 * s, 0.6 * s, g.t + i, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  };

  function pineAt(g, x, y, size, ph) {
    var c = g.ctx, s = g.s * size;
    var k = (g.calm ? 0.3 : 1) * (g.wind || 1);
    c.fillStyle = 'rgba(25,45,35,' + (0.2 * (1 - 0.45 * g.n)).toFixed(3) + ')';
    ell(c, x, y + 0.6 * s, 9 * s, 2.8 * s);
    c.fillStyle = g.T('#7a4e31'); rect(c, x - 1.5 * s, y - 7 * s, 3 * s, 7 * s);
    for (var i = 0; i < 3; i++) {
      var w = (11.5 - i * 3) * s, yb = y - 5 * s - i * 8 * s, ya = yb - 14 * s;
      var tip = Math.sin(g.t * 1.2 + ph + i) * 0.6 * s * k * (i + 1) / 3;
      c.fillStyle = g.T('#43966a'); poly(c, [x - w, yb, x + tip, ya, x + tip, yb + 1.5 * s]);
      c.fillStyle = g.T('#2e6f4d'); poly(c, [x + tip, ya, x + w, yb, x + tip, yb + 1.5 * s]);
    }
  }
  D.pine1 = function (g) { pineAt(g, g.x, g.y, 1, g.rnd(0) * 6); };
  D.pines = function (g) {
    var s = g.s;
    pineAt(g, g.x - 9 * s, g.y - 4 * s, 1.15, 1);
    pineAt(g, g.x + 8 * s, g.y - 2 * s, 0.95, 2);
    pineAt(g, g.x - 1 * s, g.y + 3 * s, 1.05, 3);
  };

  D.bush = function (g) {
    var c = g.ctx, s = g.s;
    shadow(g, 9);
    canopy(g, g.x, g.y - 4 * s, [[-4, 0, 4.5], [4, 0, 4.5], [0, -2.5, 5]], '#3f8b46', '#56a64f', '#82cc6c');
    c.fillStyle = g.T('#6b4fd0');
    for (var i = 0; i < 8; i++) circ(c, g.x + (g.rnd(i + 2) - 0.5) * 14 * s, g.y - 4 * s + (g.rnd(i + 7) - 0.5) * 6 * s, 0.9 * s);
  };

  D.rocks = function (g) {
    var c = g.ctx, s = g.s;
    shadow(g, 11);
    var rocks = [[-5, 0, 6, 4.2], [3.5, 1, 4.5, 3.2], [7.5, -1, 3, 2.2]];
    for (var i = 0; i < rocks.length; i++) {
      var r = rocks[i], x = g.x + r[0] * s, y = g.y + r[1] * s, w = r[2] * s, h = r[3] * s;
      c.fillStyle = g.T('#7f838c');
      c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w, y - h * 1.2, x - w * 0.1, y - h * 1.3);
      c.quadraticCurveTo(x + w * 1.05, y - h, x + w, y); c.closePath(); c.fill();
      c.fillStyle = g.T('#a9adb5');
      c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w, y - h * 1.2, x - w * 0.1, y - h * 1.3);
      c.quadraticCurveTo(x - w * 0.2, y - h * 0.4, x - w * 0.3, y); c.closePath(); c.fill();
      c.fillStyle = g.T('#78b45a');
      c.beginPath(); c.ellipse(x - w * 0.2, y - h * 1.15, w * 0.55, h * 0.28, -0.1, 0, TAU); c.fill();
    }
  };

  D.tent = function (g) {
    var c = g.ctx, s = g.s, x = g.x, y = g.y;
    shadow(g, 13, -3);
    c.fillStyle = g.T('#d9823e'); // roof side going back-left
    poly(c, [x - 9 * s, y, x + 1 * s, y - 15 * s, x - 6 * s, y - 19 * s, x - 17 * s, y - 5 * s]);
    c.fillStyle = g.T('#f2a65a'); // front face
    poly(c, [x - 9 * s, y, x + 9 * s, y, x + 1 * s, y - 15 * s]);
    c.fillStyle = g.T('#8f4b22'); // door
    poly(c, [x - 2.6 * s, y, x + 3.6 * s, y, x + 1 * s, y - 8.5 * s]);
    c.strokeStyle = g.T('#6b4a33'); c.lineWidth = 0.7 * s;
    c.beginPath(); c.moveTo(x + 1 * s, y - 15 * s); c.lineTo(x + 1 * s, y - 20 * s); c.stroke();
    var wave = g.calm ? 0 : Math.sin(g.t * 4) * 0.8 * s;
    c.fillStyle = g.T('#ff6b6b');
    poly(c, [x + 1 * s, y - 20 * s, x + 5 * s, y - 19 * s + wave, x + 1 * s, y - 17.6 * s]);
    if (g.n > 0.05) g.glow(x + 1 * s, y - 4 * s, 12 * s, [255, 190, 110], g.n * 0.55);
  };

  D.campfire = function (g) {
    var c = g.ctx, s = g.s, x = g.x, y = g.y, t = g.t;
    shadow(g, 8);
    c.fillStyle = g.T('#8b8f97');
    for (var i = 0; i < 7; i++) {
      var a = i / 7 * TAU;
      ell(c, x + Math.cos(a) * 5.5 * s, y + Math.sin(a) * 2 * s, 1.6 * s, 1.1 * s);
    }
    c.strokeStyle = g.T('#6d4429'); c.lineWidth = 1.6 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 4 * s, y + 0.5 * s); c.lineTo(x + 3 * s, y - 2 * s); c.stroke();
    c.beginPath(); c.moveTo(x + 4 * s, y + 0.5 * s); c.lineTo(x - 3 * s, y - 2 * s); c.stroke();
    var k = g.calm ? 0.3 : 1;
    var h = (8 + Math.sin(t * 11) * 1.5 * k + Math.sin(t * 6.7) * 1.2 * k) * s;
    var layers = [['#ff6a2b', 1, 1], ['#ffad3b', 0.68, 0.72], ['#fff0a0', 0.4, 0.45]];
    for (var j = 0; j < layers.length; j++) {
      var w = 3.4 * s * layers[j][1], hh = h * layers[j][2], fx = x + Math.sin(t * 9 + j) * 0.4 * s * k;
      c.fillStyle = layers[j][0];
      c.beginPath(); c.moveTo(fx - w, y - 1 * s);
      c.quadraticCurveTo(fx - w, y - hh * 0.6, fx, y - 1 * s - hh);
      c.quadraticCurveTo(fx + w, y - hh * 0.6, fx + w, y - 1 * s); c.closePath(); c.fill();
    }
    g.glow(x, y - 4 * s, 34 * s, [255, 150, 70], 0.25 + 0.75 * g.n);
    if (!g.calm) {
      for (var p = 0; p < 4; p++) {
        var life = (t * 0.35 + p / 4) % 1;
        c.fillStyle = 'rgba(200,200,205,' + (0.35 * (1 - life)).toFixed(3) + ')';
        circ(c, x + Math.sin(t + p) * 2 * s + life * 4 * s, y - h - 2 * s - life * 18 * s, (1.4 + life * 2.5) * s);
      }
    }
  };

  D.pond = function (g) { // flat
    var c = g.ctx, s = g.s, x = g.x, y = g.y, t = g.t;
    c.fillStyle = g.T('#c8b07a'); ell(c, x, y, 17.5 * s, 6.6 * s);
    var gr = c.createLinearGradient(x, y - 6 * s, x, y + 6 * s);
    gr.addColorStop(0, g.T('#3f97bf')); gr.addColorStop(1, g.T('#62c1d8'));
    c.fillStyle = gr; ell(c, x, y + 0.3 * s, 16 * s, 5.8 * s);
    c.fillStyle = 'rgba(255,255,255,' + (0.28 * (1 - g.n * 0.6)).toFixed(3) + ')';
    ell(c, x - 5 * s, y - 2 * s, 5 * s, 1 * s);
    if (!g.calm) {
      var r = (t * 0.25) % 1;
      c.strokeStyle = 'rgba(255,255,255,' + (0.45 * (1 - r)).toFixed(3) + ')'; c.lineWidth = 0.5 * s;
      c.beginPath(); c.ellipse(x + 4 * s, y + 1 * s, (1 + r * 6) * s, (0.4 + r * 2.2) * s, 0, 0, TAU); c.stroke();
    }
    var pads = [[-7, 1.5], [5, -1.5], [9, 2]];
    for (var i = 0; i < pads.length; i++) {
      c.fillStyle = g.T('#5cae54');
      c.beginPath();
      c.ellipse(x + pads[i][0] * s, y + pads[i][1] * s, 2.2 * s, 0.9 * s, 0, 0.35, TAU - 0.35);
      c.lineTo(x + pads[i][0] * s, y + pads[i][1] * s); c.fill();
    }
    c.fillStyle = g.T('#ff9ccd'); circ(c, x + 5 * s, y - 2 * s, 0.9 * s);
    c.strokeStyle = g.T('#5b8a3e'); c.lineWidth = 0.6 * s;
    for (var j = 0; j < 4; j++) {
      var rx = x + (13 + j * 1.2) * s, ry = y - 1 * s + j * 0.6 * s;
      c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx + 0.4 * s, ry - (5 + j) * s); c.stroke();
      c.fillStyle = g.T('#7a5634'); ell(c, rx + 0.4 * s, ry - (5 + j) * s, 0.5 * s, 1.3 * s);
    }
  };

  D.garden = function (g) { // flat
    var c = g.ctx, s = g.s, x = g.x, y = g.y;
    c.fillStyle = g.T('#8b5e3c');
    poly(c, [x - 12 * s, y - 5 * s, x + 12 * s, y - 5 * s, x + 14 * s, y + 5 * s, x - 14 * s, y + 5 * s]);
    c.fillStyle = g.T('#76492c');
    for (var r = 0; r < 3; r++) {
      var ry = y - 3 * s + r * 3.5 * s;
      rect(c, x - 12.5 * s - r * 0.6 * s, ry + 0.6 * s, (25 + r * 1.2) * s, 0.8 * s);
      for (var i = 0; i < 6; i++) {
        var px = x + (-10.5 + i * 4.2 + r * 0.3) * s;
        if ((i + r) % 2) {
          c.fillStyle = g.T('#ff8a3d');
          poly(c, [px - 0.8 * s, ry, px + 0.8 * s, ry, px, ry + 2 * s]);
          c.fillStyle = g.T('#62b84a'); ell(c, px, ry - 1 * s, 1 * s, 1.4 * s);
        } else {
          c.fillStyle = g.T('#57ad46'); circ(c, px, ry - 0.6 * s, 1.5 * s);
          c.fillStyle = g.T('#7fcd64'); circ(c, px - 0.4 * s, ry - 1 * s, 0.8 * s);
        }
        c.fillStyle = g.T('#76492c');
      }
    }
    c.fillStyle = g.T('#c79a63');
    for (var f = 0; f < 8; f++) { var fx = x + (-14 + f * 4) * s; rect(c, fx - 0.5 * s, y + 2 * s, 1 * s, 4.2 * s); }
    rect(c, x - 14.5 * s, y + 3 * s, 29 * s, 0.8 * s);
  };

  function house(g, wall, side, roof, roofDark, door) {
    var c = g.ctx, s = g.s, x = g.x, y = g.y;
    shadow(g, 20, 3);
    c.fillStyle = g.T(side);
    poly(c, [x + 12 * s, y, x + 20 * s, y - 5 * s, x + 20 * s, y - 21 * s, x + 12 * s, y - 16 * s]);
    c.fillStyle = g.T(wall);
    poly(c, [x - 12 * s, y, x + 12 * s, y, x + 12 * s, y - 16 * s, x, y - 27 * s, x - 12 * s, y - 16 * s]);
    c.fillStyle = g.T(roof);
    poly(c, [x, y - 28.5 * s, x + 8 * s, y - 33.5 * s, x + 21.5 * s, y - 21.2 * s, x + 13.5 * s, y - 16.2 * s]);
    c.strokeStyle = g.T(roofDark); c.lineWidth = 2.4 * s; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(x - 13.5 * s, y - 15 * s); c.lineTo(x, y - 28.5 * s); c.lineTo(x + 13.5 * s, y - 15.6 * s); c.stroke();
    c.fillStyle = g.T('#9a4f3e'); rect(c, x + 13 * s, y - 33 * s, 3.4 * s, 8 * s);
    c.fillStyle = g.T(door); rect(c, x - 3 * s, y - 9.5 * s, 6 * s, 9.5 * s);
    c.fillStyle = g.T('#ffd479'); circ(c, x + 1.6 * s, y - 4.6 * s, 0.5 * s);
    var night = g.n;
    var winDay = g.T('#a7d8ef');
    var lit = 'rgb(255,' + Math.round(205 + 20 * (1 - night)) + ',' + Math.round(120 + 40 * (1 - night)) + ')';
    var wins = [[-10, -13.5], [5, -13.5]];
    for (var i = 0; i < wins.length; i++) {
      c.fillStyle = night > 0.35 ? lit : winDay;
      rect(c, x + wins[i][0] * s, y + wins[i][1] * s, 5 * s, 5 * s);
      c.fillStyle = g.T(wall); rect(c, x + (wins[i][0] + 2.3) * s, y + wins[i][1] * s, 0.5 * s, 5 * s);
      rect(c, x + wins[i][0] * s, y + (wins[i][1] + 2.3) * s, 5 * s, 0.5 * s);
      if (night > 0.35) g.glow(x + (wins[i][0] + 2.5) * s, y + (wins[i][1] + 2.5) * s, 9 * s, [255, 200, 110], night * 0.8);
    }
    c.fillStyle = night > 0.35 ? lit : winDay;
    poly(c, [x + 14.5 * s, y - 7 * s, x + 17.5 * s, y - 8.8 * s, x + 17.5 * s, y - 13.8 * s, x + 14.5 * s, y - 12 * s]);
    if (!g.calm) {
      for (var p = 0; p < 4; p++) {
        var life = (g.t * 0.18 + p / 4 + g.rnd(1)) % 1;
        c.fillStyle = 'rgba(235,235,240,' + (0.42 * (1 - life)).toFixed(3) + ')';
        circ(c, x + 14.7 * s + Math.sin(g.t * 0.8 + p) * 1.5 * s + life * 5 * s, y - 35 * s - life * 16 * s, (1.3 + life * 2.6) * s);
      }
    }
  }
  D.cottage = function (g) { house(g, '#f6e7cf', '#dcc6a4', '#d4614d', '#b0483a', '#8a5a3b'); };
  D.cottage2 = function (g) { house(g, '#eef1f2', '#c9d1d6', '#4f86c6', '#3a68a3', '#5a6b8a'); };

  D.lamp = function (g) {
    var c = g.ctx, s = g.s, x = g.x, y = g.y;
    shadow(g, 3.5);
    c.fillStyle = g.T('#3c4652'); rect(c, x - 0.7 * s, y - 20 * s, 1.4 * s, 20 * s);
    rect(c, x - 2 * s, y - 1 * s, 4 * s, 1 * s);
    c.fillStyle = g.T('#2d343d'); poly(c, [x - 2.6 * s, y - 20 * s, x + 2.6 * s, y - 20 * s, x + 1.6 * s, y - 25 * s, x - 1.6 * s, y - 25 * s]);
    c.fillStyle = g.n > 0.3 ? '#ffe9a8' : g.T('#e6edf1');
    poly(c, [x - 1.8 * s, y - 20.6 * s, x + 1.8 * s, y - 20.6 * s, x + 1.2 * s, y - 24.3 * s, x - 1.2 * s, y - 24.3 * s]);
    c.fillStyle = g.T('#2d343d'); poly(c, [x - 3 * s, y - 25 * s, x + 3 * s, y - 25 * s, x, y - 27.5 * s]);
    if (g.n > 0.2) g.glow(x, y - 22.5 * s, 22 * s, [255, 215, 140], g.n);
  };

  D.windmill = function (g) {
    var c = g.ctx, s = g.s, x = g.x, y = g.y;
    shadow(g, 11);
    c.fillStyle = g.T('#f1e6d2'); poly(c, [x - 7 * s, y, x, y, x, y - 34 * s, x - 4 * s, y - 34 * s]);
    c.fillStyle = g.T('#d4c3a6'); poly(c, [x, y, x + 7 * s, y, x + 4 * s, y - 34 * s, x, y - 34 * s]);
    c.fillStyle = g.T('#8a5a3b'); rect(c, x - 2 * s, y - 6 * s, 4 * s, 6 * s);
    c.fillStyle = g.n > 0.4 ? '#ffd88a' : g.T('#9fd3ee'); rect(c, x - 1.4 * s, y - 20 * s, 2.8 * s, 3.2 * s);
    if (g.n > 0.4) g.glow(x, y - 18.5 * s, 7 * s, [255, 200, 110], g.n * 0.7);
    c.fillStyle = g.T('#b0563f');
    c.beginPath(); c.moveTo(x - 5.5 * s, y - 33.5 * s); c.quadraticCurveTo(x, y - 42 * s, x + 5.5 * s, y - 33.5 * s); c.closePath(); c.fill();
    var hx = x, hy = y - 36 * s, a0 = g.t * (g.calm ? 0.25 : 0.7) * (g.wind || 1) + g.rnd(0) * 6;
    for (var i = 0; i < 4; i++) {
      var a = a0 + i * TAU / 4;
      c.save(); c.translate(hx, hy); c.rotate(a);
      c.fillStyle = g.T('#7c5b3e'); rect(c, -0.5 * s, 0, 1 * s, 22 * s);
      c.fillStyle = g.T('#fbf6ec'); rect(c, 0.6 * s, 6 * s, 4.6 * s, 15 * s);
      c.strokeStyle = g.T('#b9a588'); c.lineWidth = 0.35 * s;
      for (var k = 0; k < 4; k++) { c.beginPath(); c.moveTo(0.6 * s, (8 + k * 3.5) * s); c.lineTo(5.2 * s, (8 + k * 3.5) * s); c.stroke(); }
      c.restore();
    }
    c.fillStyle = g.T('#5a3e2a'); circ(c, hx, hy, 1.3 * s);
  };

  D.dock = function (g) { // planks from shore into the water + rowboat (flat pass)
    var c = g.ctx, s = g.s, x = g.x, y = g.y, t = g.t;
    var dx = 1, dy = 0.42, len = 30;
    c.strokeStyle = g.T('#5e4430'); c.lineWidth = 1.2 * s;
    for (var p = 1; p <= 3; p++) {
      var px = x + dx * p * 9 * s, py = y + dy * p * 9 * s;
      c.beginPath(); c.moveTo(px - 3 * s, py + 2 * s); c.lineTo(px - 3 * s, py + 7 * s); c.stroke();
      c.beginPath(); c.moveTo(px + 3 * s, py - 0.5 * s); c.lineTo(px + 3 * s, py + 4.5 * s); c.stroke();
    }
    for (var i = 0; i < 10; i++) {
      var k = i / 10 * len;
      var cx = x + dx * k * s, cy = y + dy * k * s;
      c.fillStyle = g.T(i % 2 ? '#b7875a' : '#a87a4f');
      poly(c, [cx - 3.6 * s, cy + 1.6 * s, cx + 3.6 * s, cy - 1.4 * s, cx + 5.2 * s, cy - 0.7 * s, cx - 2 * s, cy + 2.3 * s]);
    }
    var bob = g.calm ? 0 : Math.sin(t * 1.4) * 0.7 * s;
    var bx = x + 34 * s, by = y + 20 * s + bob;
    c.fillStyle = 'rgba(20,50,70,0.22)'; ell(c, bx, by + 2.4 * s, 10 * s, 2.2 * s);
    c.fillStyle = g.T('#8f5532');
    c.beginPath(); c.moveTo(bx - 10 * s, by - 1 * s); c.quadraticCurveTo(bx, by + 5 * s, bx + 10 * s, by - 1.6 * s); c.closePath(); c.fill();
    c.fillStyle = g.T('#c9874f'); ell(c, bx, by - 1.2 * s, 9.2 * s, 1.9 * s);
    c.fillStyle = g.T('#8f5532'); rect(c, bx - 0.8 * s, by - 2.6 * s, 1.6 * s, 2.8 * s);
    c.strokeStyle = g.T('#6b4a33'); c.lineWidth = 0.6 * s;
    c.beginPath(); c.moveTo(bx - 5 * s, by - 2 * s); c.lineTo(bx + 4 * s, by + 3.5 * s); c.stroke();
  };

  D.well = function (g) {
    var c = g.ctx, s = g.s, x = g.x, y = g.y;
    shadow(g, 8);
    c.fillStyle = g.T('#8f8b84'); rect(c, x - 6 * s, y - 7 * s, 12 * s, 7 * s);
    c.fillStyle = g.T('#a9a6a0'); rect(c, x - 6 * s, y - 7 * s, 6 * s, 7 * s);
    c.strokeStyle = g.T('#76726b'); c.lineWidth = 0.4 * s;
    for (var r = 1; r < 3; r++) { c.beginPath(); c.moveTo(x - 6 * s, y - r * 2.4 * s); c.lineTo(x + 6 * s, y - r * 2.4 * s); c.stroke(); }
    c.fillStyle = g.T('#b9b6af'); ell(c, x, y - 7 * s, 6 * s, 2 * s);
    c.fillStyle = g.T('#2c4a5c'); ell(c, x, y - 7 * s, 4.6 * s, 1.3 * s);
    c.fillStyle = g.T('#7a5236'); rect(c, x - 5.6 * s, y - 17 * s, 1.1 * s, 10 * s); rect(c, x + 4.5 * s, y - 17 * s, 1.1 * s, 10 * s);
    c.fillStyle = g.T('#b85a46'); poly(c, [x - 8 * s, y - 15.5 * s, x + 8 * s, y - 15.5 * s, x, y - 21.5 * s]);
    c.fillStyle = g.T('#9a4636'); poly(c, [x, y - 21.5 * s, x + 8 * s, y - 15.5 * s, x + 2 * s, y - 15.5 * s]);
    c.strokeStyle = g.T('#5e4430'); c.lineWidth = 0.4 * s;
    c.beginPath(); c.moveTo(x, y - 15.5 * s); c.lineTo(x, y - 11 * s); c.stroke();
    c.fillStyle = g.T('#8f6a43'); poly(c, [x - 1.4 * s, y - 11 * s, x + 1.4 * s, y - 11 * s, x + 1 * s, y - 8.6 * s, x - 1 * s, y - 8.6 * s]);
  };

  D.lighthouse = function (g) {
    var c = g.ctx, s = g.s, x = g.x, y = g.y, t = g.t;
    c.fillStyle = g.T('#7f838c'); ell(c, x, y, 13 * s, 4.6 * s);
    c.fillStyle = g.T('#a2a6ae'); ell(c, x - 3 * s, y - 1.3 * s, 8 * s, 3 * s);
    var h = 44 * s, wb = 6.5 * s, wt = 4.2 * s, y0 = y - 1 * s;
    function band(a, b, col, colDark) {
      var ya = y0 - a * h, yb = y0 - b * h;
      var wa = wb + (wt - wb) * a, wbb = wb + (wt - wb) * b;
      c.fillStyle = g.T(col); poly(c, [x - wa, ya, x, ya, x, yb, x - wbb, yb]);
      c.fillStyle = g.T(colDark); poly(c, [x, ya, x + wa, ya, x + wbb, yb, x, yb]);
    }
    var cuts = [0, 0.2, 0.36, 0.56, 0.72, 1];
    for (var i = 0; i < cuts.length - 1; i++) band(cuts[i], cuts[i + 1], i % 2 ? '#e1574a' : '#f8f4ec', i % 2 ? '#b8443a' : '#d9d3c7');
    var ty = y0 - h;
    c.fillStyle = g.T('#3b3f4a'); rect(c, x - 5.6 * s, ty - 1 * s, 11.2 * s, 1.4 * s);
    var lampOn = g.n > 0.25;
    c.fillStyle = lampOn ? '#fff6c2' : g.T('#cfe8f2'); rect(c, x - 3.4 * s, ty - 5.6 * s, 6.8 * s, 4.6 * s);
    c.fillStyle = g.T('#3b3f4a'); rect(c, x - 0.3 * s, ty - 5.6 * s, 0.6 * s, 4.6 * s);
    c.fillStyle = g.T('#d24a3d');
    c.beginPath(); c.moveTo(x - 4.4 * s, ty - 5.4 * s); c.quadraticCurveTo(x, ty - 11 * s, x + 4.4 * s, ty - 5.4 * s); c.closePath(); c.fill();
    if (lampOn) {
      g.glow(x, ty - 3.3 * s, 16 * s, [255, 240, 170], g.n);
      var a = t * (g.calm ? 0.25 : 0.7);
      var dir = Math.cos(a), lenB = 170 * s * Math.abs(dir), spread = 10 * s;
      if (lenB > 2 * s) g.beam(x, ty - 3.3 * s, x + dir * lenB, ty - 3.3 * s, spread, g.n * 0.32 * Math.abs(dir));
    }
  };

  D.tower = function (g) {
    var c = g.ctx, s = g.s, x = g.x, y = g.y;
    shadow(g, 11);
    var gr = c.createLinearGradient(x - 8 * s, 0, x + 8 * s, 0);
    gr.addColorStop(0, g.T('#e3dacb')); gr.addColorStop(1, g.T('#a99f90'));
    c.fillStyle = gr; rect(c, x - 8 * s, y - 31 * s, 16 * s, 31 * s);
    c.fillStyle = g.T('#9b9283'); ell(c, x, y, 8 * s, 2.4 * s);
    c.fillStyle = gr; ell(c, x, y - 0.3 * s, 8 * s, 2.2 * s);
    c.strokeStyle = 'rgba(90,80,70,0.25)'; c.lineWidth = 0.4 * s;
    for (var r = 1; r < 6; r++) { c.beginPath(); c.moveTo(x - 8 * s, y - r * 5.2 * s); c.lineTo(x + 8 * s, y - r * 5.2 * s); c.stroke(); }
    var lit = g.n > 0.35;
    var wins = [[-1.8, -24], [-1.8, -13]];
    for (var i = 0; i < wins.length; i++) {
      var wx = x + wins[i][0] * s, wy = y + wins[i][1] * s;
      c.fillStyle = lit ? '#ffd27a' : g.T('#5d7f99');
      c.beginPath(); c.moveTo(wx, wy + 5 * s); c.lineTo(wx, wy + 1.8 * s); c.arc(wx + 1.8 * s, wy + 1.8 * s, 1.8 * s, Math.PI, 0); c.lineTo(wx + 3.6 * s, wy + 5 * s); c.closePath(); c.fill();
      if (lit) g.glow(wx + 1.8 * s, wy + 3 * s, 8 * s, [255, 200, 110], g.n * 0.8);
    }
    c.fillStyle = g.T('#7d6cc0'); poly(c, [x - 10 * s, y - 30 * s, x, y - 30 * s, x, y - 50 * s]);
    c.fillStyle = g.T('#5a4aa0'); poly(c, [x, y - 30 * s, x + 10 * s, y - 30 * s, x, y - 50 * s]);
    c.strokeStyle = g.T('#4b3f33'); c.lineWidth = 0.6 * s;
    c.beginPath(); c.moveTo(x, y - 50 * s); c.lineTo(x, y - 56 * s); c.stroke();
    var w = g.calm ? 0 : Math.sin(g.t * 3.4) * 1 * s;
    c.fillStyle = g.T('#ffcf5a'); poly(c, [x, y - 56 * s, x + 6 * s, y - 55 * s + w, x, y - 53 * s]);
  };

  D.greattree = function (g) {
    var c = g.ctx, s = g.s, x = g.x, y = g.y, sw = sway(g, 0.5, 0.7);
    shadow(g, 30);
    c.fillStyle = g.T('#6b4532');
    c.beginPath(); c.moveTo(x - 12 * s, y); c.quadraticCurveTo(x - 5 * s, y - 6 * s, x - 5 * s, y - 34 * s);
    c.lineTo(x + 5 * s, y - 34 * s); c.quadraticCurveTo(x + 5 * s, y - 6 * s, x + 12 * s, y); c.closePath(); c.fill();
    c.fillStyle = g.T('#55362a');
    c.beginPath(); c.moveTo(x + 1 * s, y); c.lineTo(x + 1 * s, y - 34 * s); c.lineTo(x + 5 * s, y - 34 * s); c.quadraticCurveTo(x + 5 * s, y - 6 * s, x + 12 * s, y); c.closePath(); c.fill();
    canopy(g, x + sw, y - 50 * s,
      [[-24, 6, 14], [24, 6, 14], [-12, -8, 17], [12, -8, 17], [0, -20, 16], [0, 6, 15], [-30, -6, 10], [30, -6, 10]],
      '#2f6e44', '#3f8a52', '#6db66a');
    if (g.n > 0.3) {
      for (var i = 0; i < 12; i++) {
        var fx = x + Math.sin(g.t * 0.5 + i * 1.7) * 34 * s, fy = y - 40 * s + Math.cos(g.t * 0.7 + i * 2.3) * 18 * s;
        g.glow(fx, fy, 3.2 * s, [210, 255, 140], g.n * (0.6 + 0.4 * Math.sin(g.t * 3 + i)));
      }
    }
  };

  D.islet = function (g) { // a small palm island further out at sea
    var c = g.ctx, s = g.s, x = g.x, y = g.y;
    c.fillStyle = 'rgba(160,230,220,0.35)'; ell(c, x, y + 1 * s, 30 * s, 9 * s);
    c.fillStyle = g.T('#d6b77e'); ell(c, x, y + 1.5 * s, 22 * s, 7 * s);
    c.fillStyle = g.T('#f1dca6'); ell(c, x, y, 21 * s, 6.4 * s);
    c.fillStyle = g.T('#8fcf6c'); ell(c, x - 3 * s, y - 0.6 * s, 11 * s, 3.4 * s);
    var sw = sway(g, 0.9, 1);
    c.strokeStyle = g.T('#8a6142'); c.lineWidth = 2 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x + 2 * s, y - 1 * s); c.quadraticCurveTo(x + 7 * s, y - 12 * s, x + 4 * s + sw, y - 24 * s); c.stroke();
    var tx = x + 4 * s + sw, ty = y - 24 * s;
    c.fillStyle = g.T('#3f9a55');
    for (var i = 0; i < 6; i++) {
      var a = -Math.PI / 2 + (i - 2.5) * 0.62;
      c.beginPath(); c.moveTo(tx, ty);
      c.quadraticCurveTo(tx + Math.cos(a) * 9 * s, ty + Math.sin(a) * 9 * s - 3 * s, tx + Math.cos(a) * 15 * s, ty + Math.sin(a) * 15 * s + 4 * s);
      c.quadraticCurveTo(tx + Math.cos(a) * 8 * s, ty + Math.sin(a) * 8 * s + 1 * s, tx, ty);
      c.fill();
    }
    c.fillStyle = g.T('#7a5236'); circ(c, tx - 1 * s, ty + 1.5 * s, 1.2 * s); circ(c, tx + 1.3 * s, ty + 1.8 * s, 1.2 * s);
  };

  // The sprout that grows during a focus session. g.f = progress 0..1, g.wilted = true if the session failed.
  D.seedling = function (g) {
    var c = g.ctx, s = g.s, x = g.x, y = g.y, f = g.f || 0;
    if (!g.wilted) {
      var pulse = g.calm ? 0.5 : 0.5 + 0.5 * Math.sin(g.t * 2.2);
      var aura = c.createRadialGradient(x, y - 6 * s, 1, x, y - 6 * s, 14 * s);
      aura.addColorStop(0, 'rgba(200,255,190,' + (0.32 + 0.18 * pulse).toFixed(3) + ')');
      aura.addColorStop(1, 'rgba(200,255,190,0)');
      c.fillStyle = aura; circ(c, x, y - 6 * s, 14 * s);
    }
    c.fillStyle = g.T('#8a5e3c'); ell(c, x, y, 5 * s, 1.8 * s);
    c.fillStyle = g.T('#a5744c'); ell(c, x - 1 * s, y - 0.5 * s, 3 * s, 1 * s);
    var h = (3 + f * 13) * s;
    var stem = g.wilted ? g.T('#9c7b4f') : g.T('#5aa64a');
    var leaf = g.wilted ? g.T('#b8935e') : g.T('#79cc63');
    var tipX = g.wilted ? x + 5 * s : x + sway(g, 0.4, 1.8), tipY = g.wilted ? y - h * 0.55 : y - h;
    c.strokeStyle = stem; c.lineWidth = 1.1 * s; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x, y - h * 0.7, tipX, tipY); c.stroke();
    var pairs = 1 + Math.floor(f * 4);
    for (var i = 0; i < pairs; i++) {
      var k = (i + 1) / (pairs + 0.6);
      var lx = x + (tipX - x) * k * k, ly = y + (tipY - y) * k;
      var droop = g.wilted ? 0.9 : 0;
      var size = (2.2 + (1 - k) * 1.4) * s;
      c.fillStyle = leaf;
      c.beginPath(); c.ellipse(lx - size, ly + droop * size, size, size * 0.45, -0.5 + droop, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(lx + size, ly + droop * size, size, size * 0.45, 0.5 - droop, 0, TAU); c.fill();
    }
    if (f > 0.8 && !g.wilted) {
      c.fillStyle = '#ff9ccd'; circ(c, tipX, tipY - 1 * s, 1.6 * s);
      c.fillStyle = '#ffd3e8'; circ(c, tipX - 0.5 * s, tipY - 1.5 * s, 0.7 * s);
    }
  };

  root.FWItems = { draw: D, ell: ell, circ: circ, poly: poly };
})(this);
