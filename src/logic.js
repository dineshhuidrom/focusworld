/* Focus World — pure logic. No DOM, no browser APIs.
   Shared by the app (window.FWLogic) and the Node tests (module.exports). */
(function (root) {
  'use strict';

  var MIN = 60000;
  var DAY_MS = 86400000;
  var SCHEMA = 1;
  var STREAK_MIN_MS = 2 * MIN;      // a day counts for the streak after 2 focused minutes
  var MAX_TOTAL_MS = 1e11;          // ~190 years; anything above is corrupt data
  var MAX_DAYS = 6000;              // ~16 years of day records
  var SOUND_KEYS = ['rain', 'ocean', 'forest', 'fire', 'brown', 'lofi'];
  var SKY_MODES = ['live', 'morning', 'day', 'sunset', 'night'];

  // Things on the island. They unlock by lifetime focused minutes, in this order.
  var ITEMS = [
    { id: 'sprout', name: 'First sprout', at: 2 },
    { id: 'flowers1', name: 'Wildflowers', at: 10 },
    { id: 'tree1', name: 'Apple tree', at: 25 },
    { id: 'bush', name: 'Berry bush', at: 40 },
    { id: 'rocks', name: 'Mossy rocks', at: 60 },
    { id: 'pine1', name: 'Young pine', at: 80 },
    { id: 'butterflies', name: 'Butterflies', at: 100 },
    { id: 'tent', name: 'Little tent', at: 130 },
    { id: 'flowers2', name: 'Tulip patch', at: 160 },
    { id: 'campfire', name: 'Campfire', at: 200 },
    { id: 'tree2', name: 'Shade tree', at: 250 },
    { id: 'pond', name: 'Lily pond', at: 300 },
    { id: 'garden', name: 'Vegetable garden', at: 360 },
    { id: 'cottage', name: 'Cottage', at: 420 },
    { id: 'pines', name: 'Pine grove', at: 500 },
    { id: 'lamp', name: 'Lamp post', at: 580 },
    { id: 'windmill', name: 'Windmill', at: 680 },
    { id: 'dock', name: 'Dock and rowboat', at: 800 },
    { id: 'blossom', name: 'Cherry blossom', at: 950 },
    { id: 'well', name: 'Stone well', at: 1100 },
    { id: 'cottage2', name: 'Second cottage', at: 1250 },
    { id: 'lighthouse', name: 'Lighthouse', at: 1450 },
    { id: 'birds', name: 'Seabirds', at: 1700 },
    { id: 'sailboat', name: 'Sailboat', at: 2000 },
    { id: 'tower', name: 'Library tower', at: 2400 },
    { id: 'lanterns', name: 'Sky lanterns', at: 2800 },
    { id: 'balloon', name: 'Hot-air balloon', at: 3300 },
    { id: 'islet', name: 'Palm islet', at: 4000 },
    { id: 'aurora', name: 'Northern lights', at: 5000 },
    { id: 'greattree', name: 'The Great Tree', at: 6500 },
    { id: 'whale', name: 'Friendly whale', at: 8000 }
  ];
  var ITEM_IDS = ITEMS.map(function (i) { return i.id; });

  // Scenes unlock by lifetime focused minutes. place: 'island' scenes are moods of the island
  // (season, weather); every other place is a whole different land the garden moves to.
  var SCENES = [
    { id: 'valley', place: 'valley', name: 'Mountain Valley', icon: '\u26F0\uFE0F', at: 0 },
    { id: 'desert', place: 'desert', name: 'Desert Oasis', icon: '\uD83D\uDC2A', at: 0 },
    { id: 'rooftop', place: 'rooftop', name: 'City Rooftop', icon: '\uD83C\uDFD9\uFE0F', at: 0 },
    { id: 'forest', place: 'forest', name: 'Enchanted Forest', icon: '\uD83C\uDF44', at: 60 },
    { id: 'zen', place: 'zen', name: 'Zen Garden', icon: '\uD83C\uDF8B', at: 150 },
    { id: 'underwater', place: 'underwater', name: 'Underwater Dome', icon: '\uD83D\uDC20', at: 300 },
    { id: 'peaks', place: 'peaks', name: 'Snowy Peaks', icon: '\uD83C\uDFD4\uFE0F', at: 500 },
    { id: 'space', place: 'space', name: 'Space Garden', icon: '\uD83E\uDE90', at: 800 },
    { id: 'meadow', place: 'island', name: 'Sunny Meadow', icon: '\u2600\uFE0F', at: 0 },
    { id: 'spring', place: 'island', name: 'Cherry Spring', icon: '\uD83C\uDF38', at: 0 },
    { id: 'rain', place: 'island', name: 'Cozy Rain', icon: '\uD83C\uDF27\uFE0F', at: 0 },
    { id: 'fog', place: 'island', name: 'Misty Morning', icon: '\uD83C\uDF2B\uFE0F', at: 0 },
    { id: 'windy', place: 'island', name: 'Windy Kite Day', icon: '\uD83E\uDE81', at: 45 },
    { id: 'autumn', place: 'island', name: 'Golden Autumn', icon: '\uD83C\uDF42', at: 90 },
    { id: 'rainbow', place: 'island', name: 'Rainbow Day', icon: '\uD83C\uDF08', at: 180 },
    { id: 'tropical', place: 'island', name: 'Tropical Lagoon', icon: '\uD83C\uDFDD\uFE0F', at: 300 },
    { id: 'fireflies', place: 'island', name: 'Firefly Meadow', icon: '\u2728', at: 450 },
    { id: 'winter', place: 'island', name: 'Snowy Winter', icon: '\u2744\uFE0F', at: 650 },
    { id: 'clouds', place: 'island', name: 'Cloud Kingdom', icon: '\u2601\uFE0F', at: 900 },
    { id: 'stars', place: 'island', name: 'Starry Wishes', icon: '\uD83C\uDF20', at: 1300 }
  ];
  var SCENE_IDS = SCENES.map(function (x) { return x.id; });

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Local calendar date of a timestamp, e.g. "2026-11-10".
  function dateKey(ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // Move a date key by n calendar days (handles month/year ends and DST).
  function addDays(key, n) {
    var p = key.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2] + n, 12);
    return dateKey(d.getTime());
  }

  function randomSeed() { return Math.floor(Math.random() * 2147483646) + 1; }

  function defaultSettings() {
    return {
      focusMin: 25,
      breakMin: 5,
      autoBreak: true,
      strict: false,
      keepAwake: true,
      calm: null,          // null = follow the device's "reduce motion" setting
      sky: 'live',
      notify: false,
      chime: 0.6,
      master: 0.8,
      soundsOn: true,      // the 🔊 button on the timer: false = all sounds stopped
      breakSounds: false,  // keep playing during breaks (off = quiet breaks)
      sounds: { rain: 0, ocean: 0, forest: 0, fire: 0, brown: 0, lofi: 0 },
      scene: 'daily'       // 'daily', 'session', or a scene id the person picked
    };
  }

  function defaultState(now, seed) {
    return {
      v: SCHEMA,
      seed: seed || randomSeed(),
      createdAt: now,
      totalMs: 0,
      sessions: 0,
      days: {},
      bestStreak: 0,
      seen: [],
      onboarded: false,
      tips: {},
      settings: defaultSettings(),
      sceneNow: 'meadow',  // used when scenes change every session
      sceneDay: '',        // last day we announced the daily scene
      session: null
    };
  }

  // ---------- validation of saved data and backup files (untrusted input) ----------
  function num(x, lo, hi, fallback) { return isNum(x) ? clamp(x, lo, hi) : fallback; }
  function bool(x, fallback) { return typeof x === 'boolean' ? x : fallback; }

  function sanitizeSettings(raw) {
    var d = defaultSettings();
    if (!raw || typeof raw !== 'object') return d;
    d.focusMin = Math.round(num(raw.focusMin, 1, 180, d.focusMin));
    d.breakMin = Math.round(num(raw.breakMin, 1, 60, d.breakMin));
    d.autoBreak = bool(raw.autoBreak, d.autoBreak);
    d.strict = bool(raw.strict, d.strict);
    d.keepAwake = bool(raw.keepAwake, d.keepAwake);
    d.calm = raw.calm === null || typeof raw.calm === 'boolean' ? raw.calm : null;
    d.sky = SKY_MODES.indexOf(raw.sky) >= 0 ? raw.sky : 'live';
    d.notify = bool(raw.notify, d.notify);
    d.chime = num(raw.chime, 0, 1, d.chime);
    d.master = num(raw.master, 0, 1, d.master);
    d.soundsOn = bool(raw.soundsOn, d.soundsOn);
    d.breakSounds = bool(raw.breakSounds, d.breakSounds);
    d.scene = raw.scene === 'daily' || raw.scene === 'session' || SCENE_IDS.indexOf(raw.scene) >= 0 ? raw.scene : 'daily';
    if (raw.sounds && typeof raw.sounds === 'object') {
      SOUND_KEYS.forEach(function (k) { d.sounds[k] = num(raw.sounds[k], 0, 1, 0); });
    }
    return d;
  }

  function sanitizeSession(raw, now) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.kind !== 'focus' && raw.kind !== 'break') return null;
    if (!isNum(raw.plannedMs) || raw.plannedMs < 1000 || raw.plannedMs > 180 * MIN) return null;
    if (!isNum(raw.startedAt) || raw.startedAt > now + DAY_MS) return null;
    var s = {
      kind: raw.kind,
      plannedMs: raw.plannedMs,
      startedAt: raw.startedAt,
      pausedAt: isNum(raw.pausedAt) ? raw.pausedAt : null,
      pausedTotal: num(raw.pausedTotal, 0, 7 * DAY_MS, 0),
      strict: bool(raw.strict, false),
      tiny: bool(raw.tiny, false),
      hiddenAt: isNum(raw.hiddenAt) ? raw.hiddenAt : null,
      lastSeen: isNum(raw.lastSeen) ? raw.lastSeen : raw.startedAt
    };
    return s;
  }

  // Returns a clean state built only from valid fields, or null if the input is not a Focus World save.
  function sanitize(raw, now) {
    now = isNum(now) ? now : Date.now();
    if (!raw || typeof raw !== 'object' || raw.v !== SCHEMA) return null;
    if (!isNum(raw.seed) || raw.seed < 1 || raw.seed > 2147483647) return null;
    var s = defaultState(now, Math.floor(raw.seed));
    s.createdAt = num(raw.createdAt, 0, now + DAY_MS, now);
    s.totalMs = num(raw.totalMs, 0, MAX_TOTAL_MS, 0);
    s.sessions = Math.floor(num(raw.sessions, 0, 1e7, 0));
    s.bestStreak = Math.floor(num(raw.bestStreak, 0, MAX_DAYS, 0));
    s.onboarded = bool(raw.onboarded, false);
    if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
      var keys = Object.keys(raw.days).filter(function (k) { return /^\d{4}-\d{2}-\d{2}$/.test(k); });
      keys.sort();
      keys.slice(-MAX_DAYS).forEach(function (k) {
        var v = raw.days[k];
        if (isNum(v) && v > 0) s.days[k] = clamp(v, 0, DAY_MS);
      });
    }
    if (Array.isArray(raw.seen)) {
      s.seen = raw.seen.filter(function (id, i, a) { return ITEM_IDS.indexOf(id) >= 0 && a.indexOf(id) === i; });
    }
    if (raw.tips && typeof raw.tips === 'object' && !Array.isArray(raw.tips)) {
      Object.keys(raw.tips).slice(0, 100).forEach(function (k) {
        if (/^[a-z0-9_-]{1,32}$/i.test(k) && raw.tips[k] === true) s.tips[k] = true;
      });
    }
    s.settings = sanitizeSettings(raw.settings);
    s.sceneNow = SCENE_IDS.indexOf(raw.sceneNow) >= 0 ? raw.sceneNow : 'meadow';
    s.sceneDay = typeof raw.sceneDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.sceneDay) ? raw.sceneDay : '';
    s.session = sanitizeSession(raw.session, now);
    return s;
  }

  // ---------- sessions ----------
  function newSession(kind, plannedMs, now, opts) {
    opts = opts || {};
    return {
      kind: kind,
      plannedMs: plannedMs,
      startedAt: now,
      pausedAt: null,
      pausedTotal: 0,
      strict: !!opts.strict,
      tiny: !!opts.tiny,
      hiddenAt: null,
      lastSeen: now
    };
  }
  function elapsed(s, now) {
    var end = s.pausedAt != null ? s.pausedAt : now;
    return clamp(end - s.startedAt - s.pausedTotal, 0, s.plannedMs);
  }
  function remaining(s, now) { return s.plannedMs - elapsed(s, now); }
  function pause(s, now) { if (s.pausedAt == null) s.pausedAt = now; }
  function resume(s, now) {
    if (s.pausedAt != null) {
      s.pausedTotal += Math.max(0, now - s.pausedAt);
      s.pausedAt = null;
    }
  }

  // ---------- progress ----------
  function totalMin(state) { return state.totalMs / MIN; }

  function streakInfo(days, now) {
    var today = dateKey(now);
    var todayDone = (days[today] || 0) >= STREAK_MIN_MS;
    var key = todayDone ? today : addDays(today, -1);
    var count = 0;
    while ((days[key] || 0) >= STREAK_MIN_MS && count < MAX_DAYS) {
      count++;
      key = addDays(key, -1);
    }
    return { current: count, todayDone: todayDone };
  }

  // Add focused time. Returns the list of items that unlocked because of it.
  function creditFocus(state, ms, now) {
    ms = clamp(ms, 0, 180 * MIN);
    if (ms <= 0) return [];
    var before = totalMin(state);
    state.totalMs = Math.min(MAX_TOTAL_MS, state.totalMs + ms);
    var k = dateKey(now);
    state.days[k] = clamp((state.days[k] || 0) + ms, 0, DAY_MS);
    if (ms >= MIN) state.sessions += 1;
    var st = streakInfo(state.days, now).current;
    if (st > state.bestStreak) state.bestStreak = st;
    var after = totalMin(state);
    return ITEMS.filter(function (it) { return before < it.at && after >= it.at; });
  }

  function unlocked(min) { return ITEMS.filter(function (it) { return min >= it.at; }); }
  function nextItem(min) {
    for (var i = 0; i < ITEMS.length; i++) if (min < ITEMS[i].at) return ITEMS[i];
    return null;
  }
  function progressToNext(min) {
    var next = nextItem(min);
    if (!next) return { next: null, frac: 1, leftMin: 0 };
    var idx = ITEMS.indexOf(next);
    var prevAt = idx > 0 ? ITEMS[idx - 1].at : 0;
    return { next: next, frac: clamp((min - prevAt) / (next.at - prevAt), 0, 1), leftMin: Math.max(0, next.at - min) };
  }

  // How much of the island is grass (0..1). Grows fast at first, full after ~5 hours.
  function grassCover(min) {
    var x = clamp(min / 300, 0, 1);
    return 0.22 + 0.74 * (1 - (1 - x) * (1 - x));
  }
  // Items grow from 55% to full size over the hour after they appear.
  function itemGrowth(item, min) {
    return 0.55 + 0.45 * clamp((min - item.at) / 60, 0, 1);
  }

  function lastDays(days, now, n) {
    var out = [];
    var key = dateKey(now);
    for (var i = n - 1; i >= 0; i--) {
      var k = addDays(key, -i);
      out.push({ key: k, ms: days[k] || 0 });
    }
    return out;
  }

  // ---------- scenes ----------
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function scenesUnlocked(min) { return SCENES.filter(function (x) { return min >= x.at; }); }
  function sceneById(id) { for (var i = 0; i < SCENES.length; i++) if (SCENES[i].id === id) return SCENES[i]; return SCENES[SCENE_IDS.indexOf('meadow')]; }
  // Unlocked scenes grouped by place, in a stable order: [['valley',[...]], ['island',[...]], ...]
  function placeGroups(min) {
    var order = [], by = {};
    scenesUnlocked(min).forEach(function (x) {
      if (!by[x.place]) { by[x.place] = []; order.push(x.place); }
      by[x.place].push(x);
    });
    return order.map(function (p) { return by[p]; });
  }
  function dayNumber(key) {
    var p = key.split('-');
    return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }
  // A shuffled order of n places for one cycle of days (same result for the same seed and cycle).
  function cycleOrder(n, seed, cyc) {
    var a = [], i;
    for (i = 0; i < n; i++) a.push(i);
    for (i = n - 1; i > 0; i--) {
      var j = hash(seed + ':' + cyc + ':' + i) % (i + 1), tmp = a[i];
      a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  // Which place a day shows. Places go round in shuffled cycles, so the land is never the
  // same two days in a row and every unlocked place comes back regularly.
  function placeIndexFor(n, seed, day) {
    if (n < 2) return 0;
    if (n === 2) return (day + seed) % 2;
    var cyc = Math.floor(day / n), pos = day - cyc * n;
    var cur = cycleOrder(n, seed, cyc);
    if (cur[0] === cycleOrder(n, seed, cyc - 1)[n - 1]) { var t0 = cur[0]; cur[0] = cur[1]; cur[1] = t0; }
    return cur[pos];
  }
  // The scene for a given day: a different place from yesterday, then one of that place's looks.
  function dailyScene(min, seed, now) {
    var groups = placeGroups(min), key = dateKey(now);
    var group = groups[placeIndexFor(groups.length, seed, dayNumber(key))];
    return group[hash(key + ':' + seed) % group.length].id;
  }
  function currentScene(state, now) {
    var min = totalMin(state), mode = state.settings.scene;
    var open = function (id) { return min >= sceneById(id).at; };
    if (mode === 'session') return open(state.sceneNow) ? state.sceneNow : 'meadow';
    if (mode !== 'daily' && SCENE_IDS.indexOf(mode) >= 0 && open(mode)) return mode;
    return dailyScene(min, state.seed, now);
  }
  // A new scene for "new scene every session" (rnd: 0..1): a different place when there is one.
  function nextSessionScene(state, rnd) {
    var all = scenesUnlocked(totalMin(state)), place = sceneById(state.sceneNow).place;
    var list = all.filter(function (x) { return x.place !== place; });
    if (!list.length) list = all.filter(function (x) { return x.id !== state.sceneNow; });
    if (!list.length) return state.sceneNow;
    return list[Math.floor(rnd * list.length) % list.length].id;
  }

  // ---------- formatting ----------
  function fmtClock(ms) {
    var sec = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return pad2(m) + ':' + pad2(s);
  }
  function fmtDuration(ms) {
    var min = Math.floor(ms / MIN);
    if (min < 60) return min + ' min';
    var h = Math.floor(min / 60);
    var m = min % 60;
    return m ? h + ' h ' + m + ' min' : h + ' h';
  }

  var api = {
    MIN: MIN, SCHEMA: SCHEMA, ITEMS: ITEMS, SOUND_KEYS: SOUND_KEYS, SKY_MODES: SKY_MODES,
    STREAK_MIN_MS: STREAK_MIN_MS,
    clamp: clamp, dateKey: dateKey, addDays: addDays, randomSeed: randomSeed,
    defaultState: defaultState, defaultSettings: defaultSettings, sanitize: sanitize,
    newSession: newSession, elapsed: elapsed, remaining: remaining, pause: pause, resume: resume,
    totalMin: totalMin, streakInfo: streakInfo, creditFocus: creditFocus, unlocked: unlocked,
    nextItem: nextItem, progressToNext: progressToNext, grassCover: grassCover, itemGrowth: itemGrowth,
    lastDays: lastDays, fmtClock: fmtClock, fmtDuration: fmtDuration,
    SCENES: SCENES, scenesUnlocked: scenesUnlocked, placeGroups: placeGroups, sceneById: sceneById, dailyScene: dailyScene,
    currentScene: currentScene, nextSessionScene: nextSessionScene
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FWLogic = api;
})(this);
