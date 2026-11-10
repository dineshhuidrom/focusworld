/* Focus World — different places for the garden (not just the island).
   Each place can draw: sky (full background, replaces the normal sky), bg (far scenery + ground),
   ground (the plot the things stand on) and fg (things in front). P carries the shared helpers. */
(function (root) {
  'use strict';
  var TAU = Math.PI * 2;

  // A mountain ridge with sharp peaks; optional snow caps.
  function ridge(P, baseY, height, count, col, k, snow) {
    var c = P.c, W = P.W, pts = [], i;
    for (i = 0; i <= count * 2; i++) {
      var x = (i / (count * 2)) * W * 1.2 - W * 0.1;
      var peak = i % 2 === 0;
      var h = peak ? height * (0.55 + 0.45 * P.rand(P.seed, k, i)) : height * (0.18 + 0.2 * P.rand(P.seed, k, i));
      pts.push([x, baseY - h]);
    }
    c.fillStyle = col;
    c.beginPath(); c.moveTo(-20, baseY + 2);
    for (i = 0; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.lineTo(W + 20, baseY + 2); c.closePath(); c.fill();
    if (!snow) return;
    c.fillStyle = snow;
    for (i = 2; i < pts.length - 2; i += 2) {
      var p = pts[i], a = pts[i - 1], b = pts[i + 1], f = 0.28;
      c.beginPath(); c.moveTo(p[0], p[1]);
      c.lineTo(p[0] + (a[0] - p[0]) * f, p[1] + (a[1] - p[1]) * f);
      c.lineTo(p[0] + (a[0] - p[0]) * f * 0.6 + 3, p[1] + (a[1] - p[1]) * f * 0.75);
      c.lineTo(p[0], p[1] + (b[1] - p[1]) * f * 0.6);
      c.lineTo(p[0] + (b[0] - p[0]) * f, p[1] + (b[1] - p[1]) * f);
      c.closePath(); c.fill();
    }
  }
  function groundFill(P, top, bottom) {
    var g = P.c.createLinearGradient(0, P.Lo.hy, 0, P.H);
    g.addColorStop(0, P.T(top)); g.addColorStop(1, P.T(bottom));
    P.c.fillStyle = g; P.c.fillRect(0, P.Lo.hy, P.W, P.H - P.Lo.hy);
  }
  function plot(P, fill, shadow, shadowScale) {
    var c = P.c;
    if (shadow) { c.fillStyle = shadow; c.beginPath(); P.shape(shadowScale || 1.1, P.Lo.ry * 0.12, 0, TAU, true); c.fill(); }
    c.fillStyle = fill; c.beginPath(); P.shape(1, 0, 0, TAU, true); c.fill();
  }
  // A soft patch of ground under the garden: it fades into the land around it (no island edge).
  function soft(P, hex, scale, inner) {
    var c = P.c, Lo = P.Lo, r = Lo.rx * (scale || 1.2);
    c.save(); c.translate(Lo.cx, Lo.cy); c.scale(1, Lo.ry / Lo.rx);
    var g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, P.TA(hex, 1)); g.addColorStop(inner || 0.62, P.TA(hex, 1)); g.addColorStop(1, P.TA(hex, 0));
    c.fillStyle = g; c.fillRect(-r, -r, r * 2, r * 2);
    c.restore();
  }
  function tuft(P, x, y, s, col) {
    var c = P.c;
    c.strokeStyle = col; c.lineWidth = Math.max(1, s * 0.5); c.lineCap = 'round';
    for (var i = -2; i <= 2; i++) {
      var sw = P.calm ? 0 : Math.sin(P.t * 1.6 + i + x) * s * 0.6;
      c.beginPath(); c.moveTo(x + i * s * 0.8, y); c.quadraticCurveTo(x + i * s * 1.2, y - s * 4, x + i * s * 1.6 + sw, y - s * (6 + Math.abs(i))); c.stroke();
    }
  }
  function fade(P, col, a) { return P.css(P.mix(P.rgb(col), [30, 38, 88], P.env.n * 0.6), a); }

  var PL = {};

  // ---------- Mountain Valley ----------
  PL.valley = {
    bg: function (P) {
      var c = P.c, Lo = P.Lo, W = P.W, n = P.env.n, k = Lo.k, i;
      ridge(P, Lo.hy + 2, Lo.hy * 0.6, 5, P.css(P.mix(P.mix(P.sk.bot, [112, 132, 172], 0.5), [30, 36, 80], n * 0.55)), 101, P.css([255, 255, 255], 0.8 - n * 0.4));
      ridge(P, Lo.hy + 4, Lo.hy * 0.3, 7, P.T('#7fa98c'), 102);
      groundFill(P, '#a3d283', '#5b9849');
      c.fillStyle = P.T('#8fc671');
      for (i = 0; i < 4; i++) { c.beginPath(); c.ellipse(W * (i / 3), Lo.hy + 4 * k, W * 0.32, Lo.hy * 0.1, 0, Math.PI, TAU); c.fill(); }
      // a river winding across the middle distance, behind the garden
      var top = Lo.hy + 3 * k, low = Lo.cy - Lo.ry * 1.05, mid = (top + low) / 2, rw = Math.max(3, (low - top) * 0.16);
      c.strokeStyle = P.T('#79c3df'); c.lineCap = 'round';
      c.lineWidth = rw;
      c.beginPath(); c.moveTo(W * 0.04, top);
      c.bezierCurveTo(W * 0.2, low + rw, W * 0.5, top - rw * 0.5, W * 0.72, mid);
      c.quadraticCurveTo(W * 0.88, low, W + 10, mid + rw * 0.6); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,' + (0.5 - n * 0.3).toFixed(3) + ')'; c.lineWidth = Math.max(1, rw * 0.18);
      c.setLineDash([rw * 1.4, rw * 2.2]); c.lineDashOffset = P.calm ? 0 : -P.t * rw * 1.2;
      c.beginPath(); c.moveTo(W * 0.04, top);
      c.bezierCurveTo(W * 0.2, low + rw, W * 0.5, top - rw * 0.5, W * 0.72, mid);
      c.quadraticCurveTo(W * 0.88, low, W + 10, mid + rw * 0.6); c.stroke();
      c.setLineDash([]); c.lineDashOffset = 0;
    },
    grass: true,
    ground: function (P) { soft(P, '#9fd17f', 1.3); },
    fg: function (P) {
      var Lo = P.Lo, u = Lo.u;
      tuft(P, P.W * 0.07, P.H - 6 * u, 1.7 * u, P.T('#4f8a3c'));
      tuft(P, P.W * 0.93, P.H - 10 * u, 1.9 * u, P.T('#4f8a3c'));
      tuft(P, P.W * 0.8, Lo.cy + Lo.ry * 1.7, 1.2 * u, P.T('#5c9a48'));
      tuft(P, P.W * 0.2, Lo.cy + Lo.ry * 1.9, 1.1 * u, P.T('#5c9a48'));
    }
  };

  // ---------- Desert Oasis ----------
  PL.desert = {
    bg: function (P) {
      var c = P.c, Lo = P.Lo, W = P.W, H = P.H, n = P.env.n, k = Lo.k, i;
      var mesa = P.css(P.mix(P.mix(P.sk.bot, [205, 128, 92], 0.55), [40, 34, 70], n * 0.55));
      c.fillStyle = mesa;
      [[0.18, 0.2, 0.22], [0.72, 0.28, 0.16], [0.9, 0.12, 0.1]].forEach(function (m) {
        var x = W * m[0], w = W * m[1], h = Lo.hy * m[2];
        c.beginPath(); c.moveTo(x - w * 0.5, Lo.hy + 2); c.lineTo(x - w * 0.36, Lo.hy - h); c.lineTo(x + w * 0.36, Lo.hy - h); c.lineTo(x + w * 0.5, Lo.hy + 2); c.closePath(); c.fill();
      });
      c.fillStyle = P.T('#f2cb8c'); c.fillRect(0, Lo.hy - 1, W, H - Lo.hy + 1);
      var cols = ['#f2cb8c', '#e8b672', '#dba15e'];
      for (i = 0; i < 3; i++) {
        var top = Lo.hy + 10 * k + (H - Lo.hy) * i * 0.22;
        c.fillStyle = P.T(cols[i]);
        c.beginPath(); c.moveTo(0, H);
        for (var x = 0; x <= W + 20; x += 20) c.lineTo(x, top + Math.sin(x * 0.006 + i * 2) * 10 * k + Math.sin(x * 0.017 + i) * 4 * k);
        c.lineTo(W, H); c.closePath(); c.fill();
      }
      // a little oasis between the dunes and the garden, with two palms
      var ox = Math.max(W * 0.2, Lo.cx - Lo.rx * 0.75), oy = Lo.hy + (Lo.cy - Lo.ry - Lo.hy) * 0.55, ow = Math.min(W * 0.12, 70 * k);
      c.fillStyle = P.T('#7cc7a0'); c.beginPath(); c.ellipse(ox, oy, ow * 1.25, ow * 0.3, 0, 0, TAU); c.fill();
      c.fillStyle = P.T('#4fb3d4'); c.beginPath(); c.ellipse(ox, oy, ow, ow * 0.22, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,' + (0.5 - n * 0.3).toFixed(3) + ')'; c.fillRect(ox - ow * 0.4, oy - 1, ow * 0.5, 1.2 * k);
      [[-0.95, 1], [0.85, 0.8]].forEach(function (pp, j) {
        var px = ox + ow * pp[0], py = oy, s = pp[1] * k, lean = j ? 0.18 : -0.14;
        c.strokeStyle = P.T('#8a6a46'); c.lineWidth = 2.4 * s; c.lineCap = 'round';
        var tx = px + lean * 40 * s, ty = py - 34 * s;
        c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px + lean * 10 * s, py - 18 * s, tx, ty); c.stroke();
        c.strokeStyle = P.T('#3f9a55'); c.lineWidth = 2.6 * s;
        for (var f = 0; f < 6; f++) {
          var ang = -Math.PI + f * (Math.PI / 5) + (P.calm ? 0 : Math.sin(P.t * 1.2 + f + j) * 0.06);
          c.beginPath(); c.moveTo(tx, ty);
          c.quadraticCurveTo(tx + Math.cos(ang) * 9 * s, ty + Math.sin(ang) * 9 * s - 4 * s, tx + Math.cos(ang) * 16 * s, ty + Math.sin(ang) * 10 * s + 5 * s); c.stroke();
        }
      });
      // camels far away
      var cx = ((P.t * (P.calm ? 2 : 6)) % (W + 160)) - 80;
      c.fillStyle = fade(P, '#7a5a3c', 0.85);
      for (i = 0; i < 3; i++) {
        var bx = cx - i * 22 * k, by = Lo.hy + 6 * k, s = 1.1 * k;
        c.beginPath(); c.ellipse(bx, by - 6 * s, 6 * s, 3 * s, 0, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(bx - 1 * s, by - 9 * s, 2.6 * s, 2.4 * s, 0, 0, TAU); c.fill();
        c.fillRect(bx + 4 * s, by - 13 * s, 1.6 * s, 7 * s); c.fillRect(bx + 3.4 * s, by - 14 * s, 3.4 * s, 2 * s);
        for (var l = 0; l < 4; l++) c.fillRect(bx - 4.5 * s + l * 2.6 * s, by - 4 * s, 1 * s, 5 * s);
      }
    },
    ground: function (P) {
      soft(P, '#f3dfad', 1.3);
      var c = P.c, Lo = P.Lo;
      c.fillStyle = P.TA('#c9a46a', 0.5);
      for (var i = 0; i < 14; i++) {
        var a = P.rand(P.seed, 105, i) * TAU, r = 0.35 + P.rand(P.seed, 106, i) * 0.85;
        P.I.ell(c, Lo.cx + Math.cos(a) * r * Lo.rx, Lo.cy + Math.sin(a) * r * Lo.ry, Lo.u * (1.2 + P.rand(P.seed, 107, i) * 1.6), Lo.u * 0.8);
      }
    },
    fg: function (P) {
      var c = P.c;
      function cactus(x, y, s) {
        c.fillStyle = P.T('#4f9a5a');
        c.beginPath(); c.roundRect ? c.roundRect(x - 3 * s, y - 26 * s, 6 * s, 26 * s, 3 * s) : c.rect(x - 3 * s, y - 26 * s, 6 * s, 26 * s); c.fill();
        c.beginPath(); c.roundRect ? c.roundRect(x - 10 * s, y - 18 * s, 4 * s, 10 * s, 2 * s) : c.rect(x - 10 * s, y - 18 * s, 4 * s, 10 * s); c.fill();
        c.fillRect(x - 8 * s, y - 10 * s, 6 * s, 3 * s);
        c.beginPath(); c.roundRect ? c.roundRect(x + 6 * s, y - 22 * s, 4 * s, 11 * s, 2 * s) : c.rect(x + 6 * s, y - 22 * s, 4 * s, 11 * s); c.fill();
        c.fillRect(x + 2 * s, y - 13 * s, 6 * s, 3 * s);
        c.fillStyle = P.T('#6fb873'); c.fillRect(x - 2 * s, y - 25 * s, 1.4 * s, 23 * s);
      }
      var u = P.Lo.u;
      cactus(P.W * 0.08, P.H - 4 * u, 1.05 * u);
      cactus(P.W * 0.93, P.H - 14 * u, 0.75 * u);
    }
  };

  // ---------- City Rooftop ----------
  PL.rooftop = {
    grass: true,
    bg: function (P) {
      var c = P.c, Lo = P.Lo, W = P.W, H = P.H, n = P.env.n, k = Lo.k, i, j;
      function skyline(layer, col, maxH, kk) {
        var x = -10;
        i = 0;
        while (x < W + 10) {
          var bw = (22 + P.rand(P.seed, kk, i) * 36) * k, bh = Lo.hy * maxH * (0.35 + P.rand(P.seed, kk + 1, i) * 0.65);
          c.fillStyle = col; c.fillRect(x, Lo.hy - bh, bw - 2 * k, bh + 3);
          if (n > 0.2) {
            for (var wy = Lo.hy - bh + 5 * k; wy < Lo.hy - 4 * k; wy += 7 * k) {
              for (var wx = x + 4 * k; wx < x + bw - 7 * k; wx += 7 * k) {
                if (P.rand(P.seed, kk + 2, i * 97 + Math.round(wy) + Math.round(wx)) > 0.55) {
                  c.fillStyle = 'rgba(255,214,140,' + (n * (layer ? 0.85 : 0.5)).toFixed(3) + ')'; c.fillRect(wx, wy, 3 * k, 3.5 * k);
                }
              }
            }
          }
          if (layer && P.rand(P.seed, kk + 3, i) > 0.7) {
            c.fillStyle = col; c.fillRect(x + bw * 0.4, Lo.hy - bh - 10 * k, 1.4 * k, 10 * k);
            if (n > 0.2 && Math.sin(P.t * 3 + i) > 0) P.glow(x + bw * 0.4, Lo.hy - bh - 10 * k, 5 * k, [255, 80, 80], n);
          }
          x += bw; i++;
        }
      }
      skyline(0, P.css(P.mix(P.mix(P.sk.bot, [120, 130, 160], 0.45), [25, 30, 60], n * 0.6)), 0.75, 120);
      skyline(1, P.css(P.mix([78, 88, 120], [20, 24, 50], n * 0.6)), 0.45, 130);
      var g = c.createLinearGradient(0, Lo.hy, 0, H);
      g.addColorStop(0, P.css(P.mix([92, 100, 128], [18, 22, 46], n * 0.6))); g.addColorStop(1, P.css(P.mix([60, 66, 90], [10, 12, 30], n * 0.6)));
      c.fillStyle = g; c.fillRect(0, Lo.hy, W, H - Lo.hy);
      for (j = 0; j < 30 && n > 0.2; j++) {
        c.fillStyle = 'rgba(255,220,150,' + (n * 0.35).toFixed(3) + ')';
        c.fillRect(P.rand(P.seed, 140, j) * W, Lo.hy + P.rand(P.seed, 141, j) * (H - Lo.hy), 2 * k, 2 * k);
      }
    },
    ground: function (P) {
      var c = P.c, Lo = P.Lo, cx = Lo.cx, cy = Lo.cy, rx = Lo.rx, ry = Lo.ry, u = Lo.u, i;
      var bl = [cx - rx * 1.3, cy + ry * 1.2], br = [cx + rx * 1.3, cy + ry * 1.2], tl = [cx - rx * 1.18, cy - ry * 1.15], tr = [cx + rx * 1.18, cy - ry * 1.15];
      c.fillStyle = P.T('#a5705e');
      c.fillRect(bl[0], bl[1], br[0] - bl[0], P.H - bl[1]);
      for (var wy = bl[1] + 10 * u; wy < P.H; wy += 16 * u) {
        for (var wx = bl[0] + 8 * u; wx < br[0] - 10 * u; wx += 18 * u) {
          var lit = P.env.n > 0.25 && P.rand(P.seed, 150, Math.round(wx * 3 + wy)) > 0.45;
          c.fillStyle = lit ? 'rgba(255,214,140,' + (0.4 + P.env.n * 0.6).toFixed(3) + ')' : P.T('#6e8aa0');
          c.fillRect(wx, wy, 8 * u, 9 * u);
        }
      }
      c.fillStyle = P.T('#cfc8bd');
      P.I.poly(c, [tl[0], tl[1], tr[0], tr[1], br[0], br[1], bl[0], bl[1]]);
      c.strokeStyle = P.T('#bdb5a9'); c.lineWidth = Math.max(1, u * 0.4);
      for (i = 1; i < 6; i++) {
        var f = i / 6;
        c.beginPath(); c.moveTo(tl[0] + (bl[0] - tl[0]) * f, tl[1] + (bl[1] - tl[1]) * f); c.lineTo(tr[0] + (br[0] - tr[0]) * f, tr[1] + (br[1] - tr[1]) * f); c.stroke();
      }
      c.fillStyle = P.T('#8c857b'); c.fillRect(bl[0], bl[1], br[0] - bl[0], 3 * u);
      // water tank (back left) and string lights (back)
      var tx = tl[0] + rx * 0.25, ty = tl[1] + ry * 0.2;
      c.fillStyle = P.T('#6b5a4a'); c.fillRect(tx - 7 * u, ty - 10 * u, 1.4 * u, 10 * u); c.fillRect(tx + 6 * u, ty - 10 * u, 1.4 * u, 10 * u);
      c.fillStyle = P.T('#9a7a5a'); c.fillRect(tx - 8 * u, ty - 28 * u, 17 * u, 18 * u);
      c.fillStyle = P.T('#7d6249'); P.I.poly(c, [tx - 9 * u, ty - 28 * u, tx + 10 * u, ty - 28 * u, tx + 0.5 * u, ty - 34 * u]);
      var ax = tl[0] + rx * 0.7, bx = tr[0] - rx * 0.4, ay = tl[1] - 22 * u;
      c.strokeStyle = P.T('#3c3c48'); c.lineWidth = Math.max(1, u * 0.5);
      c.beginPath(); c.moveTo(ax, tl[1]); c.lineTo(ax, ay); c.moveTo(bx, tr[1]); c.lineTo(bx, ay); c.stroke();
      c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo((ax + bx) / 2, ay + 14 * u, bx, ay); c.stroke();
      for (i = 1; i < 10; i++) {
        var q = i / 10, lx = ax + (bx - ax) * q, ly = ay + 2 * (1 - q) * q * 14 * u;
        c.fillStyle = P.env.n > 0.2 ? '#ffe39a' : P.T('#f4e2b0'); P.I.circ(c, lx, ly + 1.5 * u, 1.2 * u);
        P.glow(lx, ly + 1.5 * u, 6 * u, [255, 220, 140], P.env.n * 0.9);
      }
      // a wooden deck for the garden
      var dx0 = cx - rx * 1.06, dx1 = cx + rx * 1.06, dy0 = cy - ry * 1.02, dy1 = cy + ry * 1.0, sl = rx * 0.08;
      c.fillStyle = P.T('#8a6447');
      P.I.poly(c, [dx0 + sl, dy0, dx1 - sl, dy0, dx1, dy1 + 3 * u, dx0, dy1 + 3 * u]);
      c.fillStyle = P.T('#c79a6b');
      P.I.poly(c, [dx0 + sl, dy0, dx1 - sl, dy0, dx1, dy1, dx0, dy1]);
      c.strokeStyle = P.T('#aa7f55'); c.lineWidth = Math.max(1, u * 0.45);
      for (i = 1; i < 9; i++) {
        var q2 = i / 9, yy = dy0 + (dy1 - dy0) * q2, inset = sl * (1 - q2);
        c.beginPath(); c.moveTo(dx0 + inset, yy); c.lineTo(dx1 - inset, yy); c.stroke();
      }
    },
    fg: function (P) {
      var c = P.c, Lo = P.Lo, u = Lo.u, y = Lo.cy + Lo.ry * 1.2, x0 = Lo.cx - Lo.rx * 1.3, x1 = Lo.cx + Lo.rx * 1.3;
      c.strokeStyle = P.T('#3d4350'); c.lineWidth = Math.max(1, u * 0.7);
      c.beginPath(); c.moveTo(x0, y - 9 * u); c.lineTo(x1, y - 9 * u); c.stroke();
      for (var x = x0; x <= x1 + 1; x += 9 * u) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 9 * u); c.stroke(); }
    }
  };

  // ---------- Enchanted Forest ----------
  function treeLine(P, baseY, h, col, kk, count) {
    var c = P.c, W = P.W;
    c.fillStyle = col;
    for (var i = 0; i < count; i++) {
      var x = (i / (count - 1)) * W * 1.1 - W * 0.05 + (P.rand(P.seed, kk, i) - 0.5) * 20;
      var th = h * (0.6 + P.rand(P.seed, kk + 1, i) * 0.5), w = th * 0.32;
      c.beginPath(); c.moveTo(x - w, baseY + 2); c.lineTo(x, baseY - th); c.lineTo(x + w, baseY + 2); c.closePath(); c.fill();
    }
  }
  PL.forest = {
    bg: function (P) {
      var Lo = P.Lo, n = P.env.n, c = P.c, i;
      treeLine(P, Lo.hy + 4, Lo.hy * 0.75, P.css(P.mix(P.mix(P.sk.bot, [70, 120, 105], 0.6), [20, 30, 50], n * 0.6)), 160, 16);
      treeLine(P, Lo.hy + 8, Lo.hy * 0.55, P.T('#2f6448'), 170, 12);
      groundFill(P, '#5f9a52', '#2c5a36');
      if (n < 0.6) {
        c.save(); c.globalCompositeOperation = 'lighter';
        for (i = 0; i < 4; i++) {
          var x = P.W * (0.15 + i * 0.25) + (P.calm ? 0 : Math.sin(P.t * 0.2 + i) * 10);
          c.fillStyle = 'rgba(255,245,200,' + (0.07 * (1 - n)).toFixed(3) + ')';
          P.I.poly(c, [x, 0, x + 40 * Lo.k, 0, x + 160 * Lo.k, P.H, x + 90 * Lo.k, P.H]);
        }
        c.restore();
      }
    },
    grass: true,
    ground: function (P) { soft(P, '#7fb560', 1.35); },
    fg: function (P) {
      var c = P.c, Lo = P.Lo, k = Lo.k, W = P.W, H = P.H;
      [[0.02, 1.0], [0.98, 0.9]].forEach(function (f, j) {
        var x = W * f[0], w = 14 * k * f[1];
        c.fillStyle = P.T('#4a3527'); c.fillRect(x - w / 2, Lo.hy * 0.2, w, H);
        c.fillStyle = P.T('#1f4a33');
        for (var i = 0; i < 4; i++) P.I.circ(c, x + (j ? -1 : 1) * i * 16 * k, Lo.hy * (0.1 + i * 0.12), (40 - i * 6) * k);
      });
      function shroom(x, y, s) {
        c.fillStyle = P.T('#f3ead8'); c.fillRect(x - 2 * s, y - 7 * s, 4 * s, 7 * s);
        c.fillStyle = P.T('#e0503f'); c.beginPath(); c.ellipse(x, y - 7 * s, 7 * s, 4.5 * s, 0, Math.PI, TAU); c.fill();
        c.fillStyle = '#fff'; P.I.circ(c, x - 3 * s, y - 9 * s, 1 * s); P.I.circ(c, x + 2 * s, y - 10 * s, 0.9 * s); P.I.circ(c, x + 4 * s, y - 8 * s, 0.7 * s);
        P.glow(x, y - 8 * s, 14 * s, [255, 150, 120], P.env.n * 0.6);
      }
      var u = Lo.u;
      shroom(W * 0.1, H - 8 * u, 1.3 * u); shroom(W * 0.17, H - 4 * u, 0.8 * u); shroom(W * 0.86, H - 12 * u, 1.1 * u);
    }
  };

  // ---------- Zen Garden ----------
  PL.zen = {
    bg: function (P) {
      var c = P.c, Lo = P.Lo, W = P.W, n = P.env.n, k = Lo.k, i;
      var mx = W * 0.3, mw = Math.min(W * 0.5, Lo.hy * 2.2), mh = Lo.hy * 0.7;
      c.fillStyle = P.css(P.mix(P.mix(P.sk.bot, [120, 140, 175], 0.5), [30, 36, 80], n * 0.55));
      c.beginPath(); c.moveTo(mx - mw / 2, Lo.hy + 2); c.lineTo(mx - mw * 0.08, Lo.hy - mh); c.lineTo(mx + mw * 0.08, Lo.hy - mh); c.lineTo(mx + mw / 2, Lo.hy + 2); c.closePath(); c.fill();
      c.fillStyle = P.css([255, 255, 255], 0.85 - n * 0.4);
      c.beginPath(); c.moveTo(mx - mw * 0.08, Lo.hy - mh); c.lineTo(mx + mw * 0.08, Lo.hy - mh); c.lineTo(mx + mw * 0.17, Lo.hy - mh * 0.72);
      c.lineTo(mx + mw * 0.06, Lo.hy - mh * 0.78); c.lineTo(mx, Lo.hy - mh * 0.68); c.lineTo(mx - mw * 0.07, Lo.hy - mh * 0.78); c.lineTo(mx - mw * 0.17, Lo.hy - mh * 0.72); c.closePath(); c.fill();
      // tea house far right
      var hx = W * 0.8, hy = Lo.hy, s = 1.2 * k;
      c.fillStyle = fade(P, '#5b4a44', 0.9);
      c.fillRect(hx - 16 * s, hy - 14 * s, 32 * s, 14 * s);
      P.I.poly(c, [hx - 26 * s, hy - 13 * s, hx + 26 * s, hy - 13 * s, hx + 16 * s, hy - 24 * s, hx - 16 * s, hy - 24 * s]);
      P.I.poly(c, [hx - 18 * s, hy - 23 * s, hx + 18 * s, hy - 23 * s, hx + 8 * s, hy - 31 * s, hx - 8 * s, hy - 31 * s]);
      if (n > 0.3) P.glow(hx, hy - 7 * s, 14 * s, [255, 200, 120], n * 0.8);
      groundFill(P, '#ede6d6', '#d6ccb6');
      c.strokeStyle = P.T('#d9cfb9'); c.lineWidth = Math.max(1, Lo.u * 0.5);
      for (i = 0; i < 9; i++) { c.beginPath(); P.shape(1.12 + i * 0.13, Lo.ry * 0.08, 0, TAU, true); c.stroke(); }
    },
    ground: function (P) {
      var c = P.c, Lo = P.Lo, u = Lo.u;
      soft(P, '#a9cf86', 1.12, 0.7);
      // three resting stones in the raked gravel
      [[-1.12, 0.62, 7], [1.16, 0.5, 5.5], [0.98, 0.96, 4]].forEach(function (r) {
        var x = Lo.cx + r[0] * Lo.rx, y = Lo.cy + r[1] * Lo.ry, s = r[2] * u;
        c.fillStyle = P.TA('#6c665c', 0.25); P.I.ell(c, x, y + s * 0.35, s * 1.3, s * 0.4);
        c.fillStyle = P.T('#8d877c'); P.I.ell(c, x, y, s, s * 0.62);
        c.fillStyle = P.T('#a8a296'); P.I.ell(c, x - s * 0.25, y - s * 0.22, s * 0.5, s * 0.25);
      });
    },
    fg: function (P) {
      var c = P.c, W = P.W, H = P.H;
      function bamboo(x, top, s) {
        for (var i = 0; i < 3; i++) {
          var bx = x + i * 9 * s, sw = P.calm ? 0 : Math.sin(P.t * 0.9 + i) * 3 * s;
          c.strokeStyle = P.T(i % 2 ? '#5f9e4a' : '#78b45a'); c.lineWidth = 4 * s;
          c.beginPath(); c.moveTo(bx, H); c.quadraticCurveTo(bx, top + 40 * s, bx + sw, top); c.stroke();
          c.strokeStyle = P.T('#4c8a3c'); c.lineWidth = 1 * s;
          for (var y = H - 18 * s; y > top + 10 * s; y -= 22 * s) { c.beginPath(); c.moveTo(bx - 2.5 * s, y); c.lineTo(bx + 2.5 * s, y); c.stroke(); }
          c.fillStyle = P.T('#6fb05a');
          c.beginPath(); c.ellipse(bx + 6 * s + sw, top + 8 * s, 7 * s, 1.8 * s, 0.4, 0, TAU); c.fill();
        }
      }
      var u = P.Lo.u;
      bamboo(-4 * u, P.Lo.hy * 0.45, 0.75 * u);
      bamboo(W - 13 * u, P.Lo.hy * 0.65, 0.6 * u);
      var lx = W * 0.14, ly = H - 8 * u, s = 0.85 * u;
      c.fillStyle = P.T('#9b968c');
      c.fillRect(lx - 3 * s, ly - 18 * s, 6 * s, 18 * s); c.fillRect(lx - 8 * s, ly - 3 * s, 16 * s, 3 * s);
      c.fillRect(lx - 7 * s, ly - 26 * s, 14 * s, 8 * s);
      P.I.poly(c, [lx - 10 * s, ly - 26 * s, lx + 10 * s, ly - 26 * s, lx, ly - 33 * s]);
      c.fillStyle = P.env.n > 0.3 ? '#ffe2a0' : P.T('#5f5a52'); c.fillRect(lx - 3 * s, ly - 24 * s, 6 * s, 4 * s);
      P.glow(lx, ly - 22 * s, 14 * s, [255, 210, 130], P.env.n * 0.8);
    }
  };

  // ---------- Underwater Dome ----------
  PL.underwater = {
    sky: function (P) {
      var c = P.c, Lo = P.Lo, W = P.W, H = P.H, n = P.env.n, k = Lo.k, t = P.t, i;
      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, P.css(P.mix([64, 178, 214], [10, 30, 70], n * 0.8)));
      g.addColorStop(0.6, P.css(P.mix([22, 96, 150], [6, 20, 50], n * 0.8)));
      g.addColorStop(1, P.css(P.mix([10, 50, 92], [3, 10, 30], n * 0.8)));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.save(); c.globalCompositeOperation = 'lighter';
      for (i = 0; i < 5; i++) {
        var x = W * (0.1 + i * 0.22) + (P.calm ? 0 : Math.sin(t * 0.3 + i) * 20);
        c.fillStyle = 'rgba(200,240,255,' + (0.07 * (1 - n * 0.8)).toFixed(3) + ')';
        P.I.poly(c, [x, 0, x + 30 * k, 0, x + 110 * k, H * 0.8, x + 50 * k, H * 0.8]);
      }
      c.restore();
      // fish swimming far away
      for (i = 0; i < 9; i++) {
        var dir = i % 2 ? 1 : -1, sp = (14 + P.rand(P.seed, 160, i) * 20) * (P.calm ? 0.3 : 1);
        var fx = dir > 0 ? ((t * sp + P.rand(P.seed, 161, i) * W) % (W + 60)) - 30 : W + 30 - ((t * sp + P.rand(P.seed, 161, i) * W) % (W + 60));
        var fy = H * (0.08 + P.rand(P.seed, 162, i) * 0.4) + Math.sin(t + i) * 4;
        var fs = (1 + P.rand(P.seed, 163, i)) * k;
        c.fillStyle = P.css(P.mix([255, 170, 90], [120, 220, 255], P.rand(P.seed, 164, i)), 0.75 - n * 0.3);
        c.beginPath(); c.ellipse(fx, fy, 6 * fs, 2.6 * fs, 0, 0, TAU); c.fill();
        P.I.poly(c, [fx - dir * 5 * fs, fy, fx - dir * 10 * fs, fy - 3 * fs, fx - dir * 10 * fs, fy + 3 * fs]);
      }
      // sea floor
      var top = Lo.cy - Lo.ry * 1.4;
      var sg = c.createLinearGradient(0, top, 0, H);
      sg.addColorStop(0, P.T('#d8c592')); sg.addColorStop(1, P.T('#a88f60'));
      c.fillStyle = sg; c.beginPath(); c.moveTo(0, H);
      for (var xx = 0; xx <= W + 20; xx += 20) c.lineTo(xx, top + Math.sin(xx * 0.01) * 8 * k + Math.sin(xx * 0.031) * 4 * k);
      c.lineTo(W, H); c.closePath(); c.fill();
      // kelp at the back
      for (i = 0; i < 7; i++) {
        var kx = W * (0.04 + i * 0.16), kh = Lo.ry * (1.6 + P.rand(P.seed, 165, i)), ky = top + 10 * k;
        c.strokeStyle = P.T(i % 2 ? '#2f8a5a' : '#3fa268'); c.lineWidth = 4 * k; c.lineCap = 'round';
        c.beginPath(); c.moveTo(kx, ky);
        for (var s2 = 1; s2 <= 6; s2++) c.lineTo(kx + Math.sin(t * 0.8 + s2 + i) * 6 * k * (P.calm ? 0.3 : 1), ky - kh * s2 / 6);
        c.stroke();
      }
      P.env.sun = null; P.env.moon = null;
    },
    ground: function (P) { soft(P, '#efdcab', 1.25); },
    fg: function (P) {
      var c = P.c, Lo = P.Lo, k = Lo.k, t = P.t, i;
      var cx = Lo.cx, cy = Lo.cy, rx = Lo.rx * 1.08, top = Lo.rx * 1.12;
      c.fillStyle = 'rgba(200,240,255,0.07)';
      c.beginPath(); c.ellipse(cx, cy, rx, top, 0, Math.PI, TAU); c.fill();
      c.strokeStyle = 'rgba(225,250,255,0.55)'; c.lineWidth = 2 * k;
      c.beginPath(); c.ellipse(cx, cy, rx, top, 0, Math.PI, TAU); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 5 * k; c.lineCap = 'round';
      c.beginPath(); c.ellipse(cx, cy, rx * 0.88, top * 0.9, 0, Math.PI * 1.15, Math.PI * 1.45); c.stroke();
      c.strokeStyle = P.T('#8fa3b0'); c.lineWidth = 3 * k;
      c.beginPath(); c.ellipse(cx, cy, rx, Lo.ry * 1.05, 0, 0, Math.PI); c.stroke();
      c.fillStyle = 'rgba(230,250,255,0.55)';
      for (i = 0; i < (P.calm ? 6 : 18); i++) {
        var life = ((t * 0.12 + P.rand(P.seed, 170, i)) % 1);
        var bx = P.W * P.rand(P.seed, 171, i) + Math.sin(t * 2 + i) * 4, by = P.H * (1 - life);
        c.beginPath(); c.arc(bx, by, (1.2 + P.rand(P.seed, 172, i) * 2.4) * k, 0, TAU); c.fill();
      }
    }
  };

  // ---------- Snowy Peaks ----------
  PL.peaks = {
    bg: function (P) {
      var Lo = P.Lo, n = P.env.n;
      ridge(P, Lo.hy + 2, Lo.hy * 0.85, 3, P.css(P.mix(P.mix(P.sk.bot, [120, 140, 180], 0.5), [30, 36, 80], n * 0.55)), 180, P.css([255, 255, 255], 0.9 - n * 0.4));
      ridge(P, Lo.hy + 4, Lo.hy * 0.45, 5, P.css(P.mix([150, 170, 195], [30, 36, 80], n * 0.55)), 181, P.css([250, 252, 255], 0.85 - n * 0.4));
      treeLine(P, Lo.hy + 6, Lo.hy * 0.18, P.T('#2f5c4b'), 182, 34);
      groundFill(P, '#f2f6fa', '#c9d8e4');
    },
    ground: function (P) {
      soft(P, '#ffffff', 1.3);
      var c = P.c, Lo = P.Lo;
      c.fillStyle = P.TA('#c4d4e2', 0.6);
      for (var i = 0; i < 10; i++) {
        var a = P.rand(P.seed, 185, i) * TAU, r = 0.3 + P.rand(P.seed, 186, i) * 0.8;
        P.I.ell(c, Lo.cx + Math.cos(a) * r * Lo.rx, Lo.cy + Math.sin(a) * r * Lo.ry, Lo.u * (4 + P.rand(P.seed, 187, i) * 5), Lo.u * 0.9);
      }
    },
    fg: function (P) {
      var c = P.c;
      [[0.05, 1.2], [0.95, 1.0]].forEach(function (f) {
        var x = P.W * f[0], y = P.H - 4 * P.Lo.u, s = f[1] * P.Lo.u * 1.05;
        for (var i = 0; i < 3; i++) {
          var w = (12 - i * 3) * s, yb = y - 4 * s - i * 9 * s;
          c.fillStyle = P.T('#2f5c4b'); P.I.poly(c, [x - w, yb, x, yb - 14 * s, x + w, yb]);
          c.fillStyle = P.T('#f4f8fb'); P.I.poly(c, [x - w * 0.5, yb - 7 * s, x, yb - 14 * s, x + w * 0.5, yb - 7 * s]);
        }
      });
    }
  };

  // ---------- Space Garden ----------
  PL.space = {
    sky: function (P) {
      var c = P.c, W = P.W, H = P.H, k = P.Lo.k, t = P.t, i;
      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#090a22'); g.addColorStop(1, '#1d1446');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      [[0.25, 0.3, [150, 80, 210]], [0.75, 0.55, [60, 170, 210]], [0.5, 0.85, [220, 90, 160]]].forEach(function (nb) {
        var r = Math.max(W, H) * 0.4, ng = c.createRadialGradient(W * nb[0], H * nb[1], 0, W * nb[0], H * nb[1], r);
        ng.addColorStop(0, P.css(nb[2], 0.18)); ng.addColorStop(1, P.css(nb[2], 0));
        c.fillStyle = ng; c.fillRect(0, 0, W, H);
      });
      for (i = 0; i < 180; i++) {
        var tw = P.calm ? 0.8 : 0.5 + 0.5 * Math.sin(t * (0.6 + P.rand(P.seed, 190, i) * 2) + i);
        c.fillStyle = 'rgba(255,255,245,' + (0.85 * tw).toFixed(3) + ')';
        P.I.circ(c, P.rand(P.seed, 191, i) * W, P.rand(P.seed, 192, i) * H, (0.4 + P.rand(P.seed, 193, i) * 1.3) * k);
      }
      var px = W * 0.82, py = H * 0.16, pr = Math.min(W, H) * 0.11;
      var pg = c.createLinearGradient(px - pr, py - pr, px + pr, py + pr);
      pg.addColorStop(0, '#ffcf8a'); pg.addColorStop(1, '#c0587a');
      c.strokeStyle = 'rgba(255,220,180,0.55)'; c.lineWidth = pr * 0.12;
      c.beginPath(); c.ellipse(px, py, pr * 1.75, pr * 0.42, -0.35, Math.PI * 0.95, Math.PI * 2.05); c.stroke();
      c.fillStyle = pg; P.I.circ(c, px, py, pr);
      c.beginPath(); c.ellipse(px, py, pr * 1.75, pr * 0.42, -0.35, -0.05, Math.PI * 0.95); c.stroke();
      c.fillStyle = '#cfd3e6'; P.I.circ(c, W * 0.12, H * 0.12, pr * 0.32);
      c.fillStyle = 'rgba(150,155,180,0.5)'; P.I.circ(c, W * 0.12 - pr * 0.08, H * 0.12 - pr * 0.05, pr * 0.08);
      // a tiny rocket now and then
      var ph = (t % 26) / 26;
      if (ph < 0.3 && !P.calm) {
        var q = ph / 0.3, rx0 = -20 + q * (W + 40), ry0 = H * 0.42 - q * H * 0.25, s = 1.4 * k;
        c.save(); c.translate(rx0, ry0); c.rotate(-0.35);
        c.fillStyle = '#ff9a5a'; P.I.poly(c, [-10 * s, -2 * s, -16 * s - Math.random() * 4 * s, 0, -10 * s, 2 * s]);
        c.fillStyle = '#f3f1ea'; c.beginPath(); c.ellipse(0, 0, 10 * s, 3.4 * s, 0, 0, TAU); c.fill();
        c.fillStyle = '#e1574a'; P.I.poly(c, [-6 * s, -3 * s, -10 * s, -6 * s, -9 * s, -2 * s]); P.I.poly(c, [-6 * s, 3 * s, -10 * s, 6 * s, -9 * s, 2 * s]);
        c.fillStyle = '#7ad3ff'; P.I.circ(c, 3 * s, 0, 1.4 * s);
        c.restore();
      }
      P.env.sun = null; P.env.moon = null;
    },
    ground: function (P) {
      var c = P.c, Lo = P.Lo, cx = Lo.cx, cy = Lo.cy + Lo.side, rx = Lo.rx, ry = Lo.ry, u = Lo.u;
      var gr = c.createLinearGradient(0, cy, 0, cy + ry * 2.4);
      gr.addColorStop(0, P.T('#8c7fa6')); gr.addColorStop(1, P.T('#3b3358'));
      c.fillStyle = gr; c.beginPath();
      P.shape(1, Lo.side, 0, Math.PI, true);
      c.lineTo(cx - rx * 0.8, cy + ry * 0.9); c.lineTo(cx - rx * 0.5, cy + ry * 1.6); c.lineTo(cx - rx * 0.2, cy + ry * 1.9);
      c.lineTo(cx + rx * 0.1, cy + ry * 2.4); c.lineTo(cx + rx * 0.35, cy + ry * 1.7); c.lineTo(cx + rx * 0.7, cy + ry * 1.1); c.lineTo(cx + rx * 0.95, cy + ry * 0.5);
      c.closePath(); c.fill();
      c.fillStyle = P.T('#6a5f86');
      for (var i = 0; i < 6; i++) P.I.ell(c, cx + (i / 5 - 0.5) * rx * 1.2, cy + ry * (0.6 + (i % 3) * 0.3), 5 * u, 2.5 * u);
      for (var j = 0; j < 4; j++) {
        var fx = cx + [-1.3, 1.25, 1.05, -1.0][j] * rx, fy = cy + [0.2, -0.3, 1.4, 1.6][j] * ry + (P.calm ? 0 : Math.sin(P.t * 0.6 + j) * 4 * u), s = u * [4, 3.5, 2.5, 3][j];
        c.fillStyle = P.T('#7d7199'); P.I.poly(c, [fx - 3 * s, fy, fx + 3 * s, fy - 1 * s, fx + 2 * s, fy + 3 * s, fx - 2 * s, fy + 2.5 * s]);
      }
      plot(P, P.T('#cfc6dd'), null);
      c.fillStyle = P.T('#b7add0');
      for (var m = 0; m < 7; m++) {
        var a = P.rand(P.seed, 195, m) * TAU, r = 0.45 + P.rand(P.seed, 196, m) * 0.45, cr = (3 + P.rand(P.seed, 197, m) * 4) * u;
        var qx = cx + Math.cos(a) * r * rx, qy = Lo.cy + Math.sin(a) * r * ry;
        P.I.ell(c, qx, qy, cr, cr * 0.45);
        c.fillStyle = P.T('#e0d9ec'); P.I.ell(c, qx, qy + cr * 0.12, cr * 0.8, cr * 0.28); c.fillStyle = P.T('#b7add0');
      }
    },
    fg: null
  };

  root.FWPlaces = PL;
})(this);
