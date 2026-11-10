/* Focus World — sounds made by code with the Web Audio API.
   No audio files, no licences. Every channel has pump(until) which schedules its
   events ahead of time, so sounds keep playing when the browser slows timers. */
(function (root) {
  'use strict';

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  // Seamless looping noise buffers (crossfaded ends so there is no click at the loop point).
  function noise(c, type) {
    var sec = 6, fade = Math.floor(c.sampleRate * 0.08);
    var len = Math.floor(c.sampleRate * sec);
    var buf = c.createBuffer(2, len - fade, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var tmp = new Float32Array(len);
      var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0, i;
      for (i = 0; i < len; i++) {
        var w = Math.random() * 2 - 1;
        if (type === 'white') tmp[i] = w * 0.5;
        else if (type === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          tmp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02; tmp[i] = last * 3.2;
        }
      }
      var out = buf.getChannelData(ch), n = len - fade;
      for (i = 0; i < n; i++) out[i] = tmp[i];
      for (i = 0; i < fade; i++) { var k = i / fade; out[i] = tmp[i] * k + tmp[n + i] * (1 - k); }
    }
    return buf;
  }

  function Engine() {
    this.ctx = null; this.master = null; this.comp = null;
    this.ch = {}; this.levels = {}; this.masterLevel = 0.8;
    this.timer = null; this.hidden = false; this.stopTimers = {};
  }
  var BASE = { rain: 0.85, ocean: 0.95, forest: 1.0, fire: 0.9, brown: 0.55, lofi: 0.95 };
  var MAKERS = {};

  Engine.prototype.supported = function () { return !!(root.AudioContext || root.webkitAudioContext); };
  Engine.prototype.init = function (givenCtx) {
    if (this.ctx) return this.ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    try { this.ctx = givenCtx || (AC ? new AC() : null); } catch (e) { this.ctx = null; }
    if (!this.ctx) return null;
    var c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 10; this.comp.ratio.value = 3.5;
    this.comp.attack.value = 0.005; this.comp.release.value = 0.25;
    this.comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = this.masterLevel * 0.9;
    this.master.connect(this.comp);
    this.buf = { white: noise(c, 'white'), pink: noise(c, 'pink'), brown: noise(c, 'brown') };
    return c;
  };
  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  // A silent looping sound file. Playing it tells iPhones this page plays media,
  // so Web Audio is heard even when the silent switch is on.
  function silentMedia() {
    try {
      var sr = 8000, n = sr / 2, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
      var str = function (o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
      str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
      v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
      v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
      var a = document.createElement('audio');
      a.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
      a.loop = true; a.setAttribute('playsinline', '');
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function () { /* blocked until the next tap */ });
      return a;
    } catch (e) { return null; }
  }
  // Must be called from a tap/click (browsers block sound until the person interacts).
  Engine.prototype.unlock = function () {
    var c = this.init();
    if (!c) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
    if (isIOS()) {
      if (!this.keepAlive) this.keepAlive = silentMedia();
      else if (this.keepAlive.paused) { var pp = this.keepAlive.play(); if (pp && pp.catch) pp.catch(function () { /* retry next tap */ }); }
    }
    if (c.state === 'suspended' && c.resume) { try { c.resume(); } catch (e) { /* resume refused; next tap retries */ } }
    try {
      var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
    } catch (e) { /* silent primer is optional */ }
  };
  Engine.prototype.setMaster = function (v) {
    this.masterLevel = v;
    if (this.master) this.master.gain.setTargetAtTime(v * 0.9, this.ctx.currentTime, 0.1);
  };
  // fade: seconds to fade in or out (default quick). Channels that reach 0 are stopped after the fade,
  // so nothing keeps running (or using the phone's battery) when no sound is wanted.
  Engine.prototype.setLevels = function (levels, master, fade) {
    if (master != null) this.setMaster(master);
    var f = fade > 0 ? fade : 0;
    var c = this.ctx;
    var self = this;
    Object.keys(BASE).forEach(function (k) {
      var lv = Math.max(0, Math.min(1, levels[k] || 0));
      self.levels[k] = lv;
      if (!c) return;
      if (lv > 0) {
        if (self.stopTimers[k]) { clearTimeout(self.stopTimers[k]); self.stopTimers[k] = null; }
        if (!self.ch[k]) self.ch[k] = MAKERS[k](self);
        self.ch[k].out.gain.setTargetAtTime(BASE[k] * Math.pow(lv, 1.6), c.currentTime, f ? f / 3 : 0.25);
      } else if (self.ch[k]) {
        self.ch[k].out.gain.setTargetAtTime(0, c.currentTime, f ? f / 4 : 0.15);
        if (!self.stopTimers[k]) {
          self.stopTimers[k] = setTimeout(function () {
            self.stopTimers[k] = null;
            if (self.ch[k] && !(self.levels[k] > 0)) { self.ch[k].stop(); delete self.ch[k]; }
          }, Math.max(900, f * 1000 + 400));
        }
      }
    });
    this.loop();
  };
  Engine.prototype.anyOn = function () {
    for (var k in this.levels) if (this.levels[k] > 0) return true;
    return false;
  };
  Engine.prototype.pumpAll = function (until) {
    for (var k in this.ch) if (this.ch[k].pump) this.ch[k].pump(until);
  };
  Engine.prototype.loop = function () {
    var self = this;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (!this.ctx || !this.anyOn()) return;
    // Notes are booked this far ahead. 1 s on screen survives a busy phone; more when the tab is hidden
    // because browsers slow timers down there.
    var ahead = this.hidden ? 3 : 1;
    var every = this.hidden ? 500 : 200;
    this.pumpAll(this.ctx.currentTime + ahead);
    this.timer = setInterval(function () { self.pumpAll(self.ctx.currentTime + ahead); }, every);
  };
  Engine.prototype.setHidden = function (h) { this.hidden = h; this.loop(); };

  // A soft two-note bell when a session ends.
  Engine.prototype.chime = function (vol) {
    var c = this.init();
    if (!c || !(vol > 0)) return;
    var t = c.currentTime + 0.03;
    [[76, 0], [83, 0.2], [88, 0.42]].forEach(function (n) {
      var tt = t + n[1], f = mtof(n[0]);
      var o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
      o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.76;
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.32 * vol, tt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.8);
      g2.gain.setValueAtTime(0.0001, tt); g2.gain.exponentialRampToValueAtTime(0.06 * vol, tt + 0.005); g2.gain.exponentialRampToValueAtTime(0.0001, tt + 0.5);
      o.connect(g); o2.connect(g2); g.connect(this.comp); g2.connect(this.comp);
      o.start(tt); o2.start(tt); o.stop(tt + 1.9); o2.stop(tt + 0.6);
    }, this);
  };

  // ---------- helpers ----------
  function gainN(c, v) { var g = c.createGain(); g.gain.value = v; return g; }
  function filt(c, type, f, q) { var b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
  function loopSrc(e, name) {
    var s = e.ctx.createBufferSource(); s.buffer = e.buf[name]; s.loop = true;
    s.start(0, Math.random() * 3);
    return s;
  }
  function burst(e, out, t, dur, peak, type, f, q, offset) {
    var c = e.ctx, b = c.createBufferSource(); b.buffer = e.buf.white;
    var fl = filt(c, type, f, q), g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    b.connect(fl); fl.connect(g); g.connect(out);
    b.start(t, offset == null ? Math.random() * 3 : offset, dur + 0.02);
  }
  function stopAll(list) { list.forEach(function (n) { try { n.stop(); } catch (e) { /* already stopped */ } }); }
  function channel(e) { var out = gainN(e.ctx, 0); out.connect(e.master); return out; }

  MAKERS.rain = function (e) {
    var c = e.ctx, out = channel(e);
    var s1 = loopSrc(e, 'pink'), hp = filt(c, 'highpass', 500, 0.5), lp = filt(c, 'lowpass', 6000, 0.5), g1 = gainN(c, 0.5);
    s1.connect(hp); hp.connect(lp); lp.connect(g1); g1.connect(out);
    var s2 = loopSrc(e, 'brown'), lp2 = filt(c, 'lowpass', 350, 0.5), g2 = gainN(c, 0.5);
    s2.connect(lp2); lp2.connect(g2); g2.connect(out);
    var next = c.currentTime + 0.05;
    return {
      out: out,
      pump: function (until) {
        if (next < c.currentTime) next = c.currentTime + 0.02;   // after a stall: carry on from now
        while (next < until) {
          burst(e, out, next, 0.025 + Math.random() * 0.05, 0.03 + Math.random() * 0.09, 'bandpass', 2200 + Math.random() * 4000, 2 + Math.random() * 3);
          next += 0.015 + Math.random() * 0.05;
        }
      },
      stop: function () { stopAll([s1, s2]); out.disconnect(); }
    };
  };

  MAKERS.ocean = function (e) {
    var c = e.ctx, out = channel(e);
    var s = loopSrc(e, 'brown'), lp = filt(c, 'lowpass', 600, 0.7), env = gainN(c, 0.15);
    s.connect(lp); lp.connect(env); env.connect(out);
    var h = loopSrc(e, 'pink'), bp = filt(c, 'bandpass', 2500, 0.5), henv = gainN(c, 0);
    h.connect(bp); bp.connect(henv); henv.connect(out);
    var next = c.currentTime + 0.1;
    return {
      out: out,
      pump: function (until) {
        if (next < c.currentTime) next = c.currentTime + 0.05;
        while (next < until) {
          var P = 6 + Math.random() * 4, peak = 0.6 + Math.random() * 0.4;
          env.gain.setTargetAtTime(peak, next, P * 0.18); env.gain.setTargetAtTime(0.12, next + P * 0.45, P * 0.2);
          lp.frequency.setTargetAtTime(1300, next, P * 0.18); lp.frequency.setTargetAtTime(450, next + P * 0.45, P * 0.22);
          henv.gain.setTargetAtTime(0.18 * peak, next + P * 0.25, P * 0.1); henv.gain.setTargetAtTime(0, next + P * 0.5, P * 0.2);
          next += P;
        }
      },
      stop: function () { stopAll([s, h]); out.disconnect(); }
    };
  };

  MAKERS.forest = function (e) {
    var c = e.ctx, out = channel(e);
    var s = loopSrc(e, 'pink'), bp = filt(c, 'bandpass', 700, 0.5), g = gainN(c, 0.45);
    s.connect(bp); bp.connect(g); g.connect(out);
    var pan = c.createStereoPanner ? c.createStereoPanner() : null;
    var birdOut = gainN(c, 1);
    if (pan) { birdOut.connect(pan); pan.connect(out); } else birdOut.connect(out);
    var nextWind = c.currentTime, nextBird = c.currentTime + 1.5;
    function chirp(t) {
      if (pan) pan.pan.setValueAtTime(Math.random() * 1.6 - 0.8, t);
      var n = 2 + Math.floor(Math.random() * 4), base = 2400 + Math.random() * 1600;
      for (var j = 0; j < n; j++) {
        var tt = t + j * (0.09 + Math.random() * 0.05), f0 = base * (0.9 + Math.random() * 0.3);
        var o = c.createOscillator(), gg = c.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f0 * (1.25 + Math.random() * 0.3), tt + 0.05);
        o.frequency.exponentialRampToValueAtTime(f0 * 0.9, tt + 0.09);
        gg.gain.setValueAtTime(0.0001, tt); gg.gain.exponentialRampToValueAtTime(0.06, tt + 0.01); gg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.1);
        o.connect(gg); gg.connect(birdOut); o.start(tt); o.stop(tt + 0.12);
      }
    }
    return {
      out: out,
      pump: function (until) {
        if (nextWind < c.currentTime) nextWind = c.currentTime;
        if (nextBird < c.currentTime) nextBird = c.currentTime + 1;
        while (nextWind < until) {
          var d = 4 + Math.random() * 3;
          bp.frequency.setTargetAtTime(400 + Math.random() * 700, nextWind, d * 0.4);
          g.gain.setTargetAtTime(0.5 + Math.random() * 0.35, nextWind, d * 0.4);
          nextWind += d;
        }
        while (nextBird < until) { chirp(nextBird); nextBird += 2.5 + Math.random() * 6; }
      },
      stop: function () { stopAll([s]); out.disconnect(); }
    };
  };

  MAKERS.fire = function (e) {
    var c = e.ctx, out = channel(e);
    var s = loopSrc(e, 'brown'), lp = filt(c, 'lowpass', 500, 0.5), g = gainN(c, 0.6);
    s.connect(lp); lp.connect(g); g.connect(out);
    var h = loopSrc(e, 'white'), hp = filt(c, 'highpass', 3000, 0.5), hg = gainN(c, 0.025);
    h.connect(hp); hp.connect(hg); hg.connect(out);
    var next = c.currentTime + 0.05;
    return {
      out: out,
      pump: function (until) {
        if (next < c.currentTime) next = c.currentTime + 0.02;
        while (next < until) {
          var big = Math.random() < 0.07;
          burst(e, out, next, 0.004 + Math.random() * 0.018, big ? 0.45 : 0.04 + Math.random() * 0.14, 'highpass', 1200 + Math.random() * 3500, 0.7);
          next += 0.02 + Math.random() * Math.random() * 0.35;
        }
      },
      stop: function () { stopAll([s, h]); out.disconnect(); }
    };
  };

  MAKERS.brown = function (e) {
    var c = e.ctx, out = channel(e);
    var s = loopSrc(e, 'brown'), lp = filt(c, 'lowpass', 1100, 0.5), g = gainN(c, 0.9);
    s.connect(lp); lp.connect(g); g.connect(out);
    return { out: out, pump: null, stop: function () { stopAll([s]); out.disconnect(); } };
  };

  // ---------- lofi music ----------
  // Chord progressions (MIDI notes around middle C) with a bass root for each chord.
  var PROGS = [
    [{ r: 41, n: [53, 57, 60, 64] }, { r: 40, n: [52, 55, 59, 62] }, { r: 38, n: [50, 53, 57, 60] }, { r: 36, n: [48, 52, 55, 59] }],
    [{ r: 38, n: [53, 57, 60, 64] }, { r: 43, n: [53, 55, 59, 62] }, { r: 36, n: [52, 55, 59, 62] }, { r: 45, n: [52, 55, 57, 60] }],
    [{ r: 39, n: [51, 55, 58, 62] }, { r: 38, n: [50, 53, 57, 60] }, { r: 36, n: [51, 55, 58, 60] }, { r: 34, n: [50, 53, 57, 58] }],
    [{ r: 36, n: [52, 55, 59, 62] }, { r: 45, n: [52, 55, 57, 60] }, { r: 41, n: [53, 57, 60, 64] }, { r: 43, n: [53, 55, 59, 62] }]
  ];
  var KICK = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
  var SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];

  function softCurve() {
    var n = 1024, a = new Float32Array(n), k = 1.6, d = Math.tanh(k);
    for (var i = 0; i < n; i++) { var x = i / (n - 1) * 2 - 1; a[i] = Math.tanh(k * x) / d; }
    return a;
  }

  MAKERS.lofi = function (e) {
    var c = e.ctx, out = channel(e);
    var bus = gainN(c, 0.5), shaper = c.createWaveShaper(), tone = filt(c, 'lowpass', 3600, 0.3);
    shaper.curve = softCurve(); shaper.oversample = '2x';
    bus.connect(shaper); shaper.connect(tone); tone.connect(out);
    var keys = filt(c, 'lowpass', 2300, 0.4), wobble = c.createDelay(0.1);
    wobble.delayTime.value = 0.012; keys.connect(wobble); wobble.connect(bus);
    var drums = gainN(c, 0.6), dtone = filt(c, 'lowpass', 6500, 0.4); drums.connect(dtone); dtone.connect(bus);
    var wow = c.createOscillator(), wowG = gainN(c, 0.0009); wow.frequency.value = 0.45; wow.connect(wowG); wowG.connect(wobble.delayTime); wow.start();
    var key = pick([0, 2, -3, 5, -2]), bpm = 70 + Math.floor(Math.random() * 10), beat = 60 / bpm;
    var mBus = gainN(c, 1), dly = c.createDelay(2), fb = gainN(c, 0.3), wet = gainN(c, 0.35);
    dly.delayTime.value = beat * 0.75;
    mBus.connect(bus); mBus.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(bus);

    var step = 0, bar = 0, prog = pick(PROGS), next = c.currentTime + 0.15;

    function osc(type, f, t, stop) { var o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(t); o.stop(stop); return o; }
    function epiano(t, m, vel, dur) {
      var f = mtof(m + key);
      var end = t + dur + 0.6;
      var o1 = osc('sine', f, t, end), o3 = osc('triangle', f, t, end), o2 = osc('sine', f * 2, t, t + 0.7);
      o3.detune.value = -6;
      var g = c.createGain(), g3 = gainN(c, 0.25), g2 = c.createGain();
      // strike, settle, hold softly for the whole bar, then fade while the next chord comes in
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + 0.015);
      g.gain.exponentialRampToValueAtTime(vel * 0.5, t + 0.45); g.gain.exponentialRampToValueAtTime(vel * 0.32, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(vel * 0.3, t + 0.008); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o1.connect(g); o3.connect(g3); g3.connect(g); o2.connect(g2);
      g.connect(keys); g2.connect(keys);
    }
    function chord(t, ch) {
      for (var i = 0; i < ch.n.length; i++) epiano(t + i * 0.018 + Math.random() * 0.01, ch.n[i], 0.075 + Math.random() * 0.02, beat * 4);
    }
    function bass(t, m, dur) {
      var f = mtof(m + key);
      var o = osc('sine', f, t, t + dur + 0.05), o2 = osc('triangle', f, t, t + dur + 0.05), o4 = osc('sine', f * 2, t, t + dur + 0.05);
      var lp = filt(c, 'lowpass', 420, 0.6), g = c.createGain(), g2 = gainN(c, 0.3), g4 = gainN(c, 0.35);
      o4.connect(g4); g4.connect(g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.34, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(bus);
    }
    function kick(t) {
      var o = osc('sine', 120, t, t + 0.36), g = c.createGain();
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.7, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(g); g.connect(drums);
    }
    function snare(t) {
      burst(e, drums, t, 0.17, 0.2, 'bandpass', 1900, 0.7);
      var o = osc('triangle', 185, t, t + 0.1), g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(g); g.connect(drums);
    }
    function hat(t, v) { burst(e, drums, t, 0.035, v, 'highpass', 7500, 0.7); }
    function bell(t, m) {
      var f = mtof(m + key);
      var o = osc('sine', f, t, t + 1.3), o2 = osc('sine', f * 2.76, t, t + 0.4), g = c.createGain(), g2 = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.012, t + 0.004); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g); o2.connect(g2); g.connect(mBus); g2.connect(mBus);
    }
    function melodyNote(ch) {
      var pool = ch.n.slice(1).map(function (n) { return n + 12; });
      return pick(pool);
    }
    function scheduleStep(s, t0) {
      var t = s % 4 === 2 ? t0 + beat * 0.08 : t0; // swing
      var ch = prog[bar % 4];
      var intro = bar < 2, breakdown = bar % 16 === 14 || bar % 16 === 15;
      if (s === 0) { chord(t, ch); if (!intro) bass(t, ch.r, beat * 1.8); }
      if (!intro) {
        if (s === 8 && Math.random() < 0.7) bass(t, ch.r + (Math.random() < 0.5 ? 7 : 12), beat * 0.9);
        if (s === 14 && Math.random() < 0.35) bass(t, ch.r, beat * 0.4);
        if (!breakdown) {
          if (KICK[s] || (s === 7 && Math.random() < 0.25)) kick(t);
          if (SNARE[s]) snare(t);
          if (s % 2 === 0) hat(t, s % 4 === 0 ? 0.05 : 0.035);
        }
        if (s % 4 === 0 && !breakdown && Math.random() < 0.15) bell(t, melodyNote(ch));
      }
    }
    return {
      out: out,
      pump: function (until) {
        var late = c.currentTime + 0.02;
        while (next < until) {
          // a beat already in the past is skipped, not crammed in; a missed chord still comes in, a moment late
          if (next >= late) scheduleStep(step, next); else if (step === 0) scheduleStep(0, late);
          next += beat / 4;
          step = (step + 1) % 16;
          if (step === 0) { bar++; if (bar % 8 === 0) prog = pick(PROGS); }
        }
      },
      stop: function () { stopAll([wow]); out.disconnect(); }
    };
  };

  root.FWAudio = { Engine: Engine, SOUNDS: Object.keys(BASE) };
})(this);
