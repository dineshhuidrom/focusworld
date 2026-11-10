// Run: node tests/test_logic.js
'use strict';
const assert = require('assert');
const L = require('../src/logic.js');
let passed = 0;
function t(name, fn) { fn(); passed++; }

const MIN = 60000;
const now = new Date(2026, 10, 10, 15, 0, 0).getTime(); // 10 Nov 2026, 15:00 local

t('dateKey and addDays', () => {
  assert.strictEqual(L.dateKey(now), '2026-11-10');
  assert.strictEqual(L.addDays('2026-11-10', -10), '2026-10-31');
  assert.strictEqual(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(L.addDays('2024-03-01', -1), '2024-02-29');
});

t('session timing with pause', () => {
  const s = L.newSession('focus', 25 * MIN, now);
  assert.strictEqual(L.remaining(s, now), 25 * MIN);
  L.pause(s, now + 5 * MIN);
  assert.strictEqual(L.elapsed(s, now + 20 * MIN), 5 * MIN); // paused: time does not move
  L.resume(s, now + 20 * MIN);
  assert.strictEqual(L.elapsed(s, now + 25 * MIN), 10 * MIN);
  assert.strictEqual(L.remaining(s, now + 99 * MIN), 0);       // never below 0
  assert.strictEqual(L.elapsed(s, now - 5 * MIN), 0);         // clock moved back: never negative
});

t('credit unlocks items exactly once', () => {
  const st = L.defaultState(now, 42);
  const u1 = L.creditFocus(st, 2 * MIN, now);
  assert.deepStrictEqual(u1.map(i => i.id), ['sprout']);
  const u2 = L.creditFocus(st, 25 * MIN, now);
  assert.deepStrictEqual(u2.map(i => i.id), ['flowers1', 'tree1']);
  assert.strictEqual(L.creditFocus(st, 0, now).length, 0);
  assert.strictEqual(st.sessions, 2);
  assert.strictEqual(Math.round(L.totalMin(st)), 27);
});

t('tiny credits under a minute do not count as a session', () => {
  const st = L.defaultState(now, 42);
  L.creditFocus(st, 30000, now);
  assert.strictEqual(st.sessions, 0);
});

t('streak counts consecutive days, today optional', () => {
  const days = {};
  days['2026-11-08'] = 30 * MIN;
  days['2026-11-09'] = 3 * MIN;
  let s = L.streakInfo(days, now);
  assert.deepStrictEqual(s, { current: 2, todayDone: false });
  days['2026-11-10'] = 2 * MIN;
  s = L.streakInfo(days, now);
  assert.deepStrictEqual(s, { current: 3, todayDone: true });
  days['2026-11-09'] = 1 * MIN; // below the 2-minute bar breaks the chain
  s = L.streakInfo(days, now);
  assert.deepStrictEqual(s, { current: 1, todayDone: true });
});

t('best streak is kept', () => {
  const st = L.defaultState(now, 7);
  st.days['2026-11-09'] = 10 * MIN;
  L.creditFocus(st, 5 * MIN, now);
  assert.strictEqual(st.bestStreak, 2);
});

t('progress to next item', () => {
  const p = L.progressToNext(30);
  assert.strictEqual(p.next.id, 'bush');
  assert.ok(p.frac > 0.3 && p.frac < 0.4);
  assert.strictEqual(p.leftMin, 10);
  const end = L.progressToNext(99999);
  assert.strictEqual(end.next, null);
});

t('grass grows and stays in range', () => {
  assert.ok(Math.abs(L.grassCover(0) - 0.22) < 1e-9);
  assert.ok(L.grassCover(10) > 0.26);
  assert.ok(Math.abs(L.grassCover(300) - 0.96) < 1e-9);
  assert.ok(Math.abs(L.grassCover(5000) - 0.96) < 1e-9);
});

t('sanitize rejects junk and keeps good data', () => {
  assert.strictEqual(L.sanitize(null, now), null);
  assert.strictEqual(L.sanitize({ v: 2, seed: 5 }, now), null);
  assert.strictEqual(L.sanitize({ v: 1, seed: 'x' }, now), null);
  assert.strictEqual(L.sanitize('{"v":1}', now), null);
  const raw = {
    v: 1, seed: 1234, totalMs: 120 * MIN, sessions: 4, bestStreak: 3, onboarded: true,
    days: { '2026-11-09': 60 * MIN, 'bad-key': 5, '2026-11-10': -5, '2026-11-08': 1e12 },
    seen: ['sprout', 'sprout', '<script>', 'tree1'],
    tips: { first: true, '<b>': true, x: 'yes' },
    settings: { focusMin: 999, breakMin: 'a', sky: 'evil', sounds: { rain: 5, lofi: 0.4, hack: 1 }, calm: 'x' },
    session: { kind: 'focus', plannedMs: 25 * MIN, startedAt: now - MIN, strict: true },
    extra: 'ignored'
  };
  const s = L.sanitize(raw, now);
  assert.ok(s);
  assert.strictEqual(s.totalMs, 120 * MIN);
  assert.deepStrictEqual(Object.keys(s.days).sort(), ['2026-11-08', '2026-11-09']);
  assert.strictEqual(s.days['2026-11-08'], 86400000); // clamped to one day
  assert.deepStrictEqual(s.seen, ['sprout', 'tree1']);
  assert.deepStrictEqual(s.tips, { first: true });
  assert.strictEqual(s.settings.focusMin, 180);
  assert.strictEqual(s.settings.breakMin, 5);
  assert.strictEqual(s.settings.sky, 'live');
  assert.strictEqual(s.settings.calm, null);
  assert.strictEqual(s.settings.sounds.rain, 1);
  assert.strictEqual(s.settings.sounds.lofi, 0.4);
  assert.strictEqual(s.settings.sounds.hack, undefined);
  assert.strictEqual(s.session.kind, 'focus');
  assert.strictEqual(s.session.strict, true);
  assert.strictEqual(s.extra, undefined);
  // a broken session is dropped, the rest survives
  const s2 = L.sanitize({ v: 1, seed: 9, session: { kind: 'focus', plannedMs: -1, startedAt: now } }, now);
  assert.strictEqual(s2.session, null);
});

t('round trip through JSON', () => {
  const st = L.defaultState(now, 99);
  L.creditFocus(st, 50 * MIN, now);
  st.session = L.newSession('break', 5 * MIN, now, {});
  const back = L.sanitize(JSON.parse(JSON.stringify(st)), now);
  assert.deepStrictEqual(back, st);
});

t('formatting', () => {
  assert.strictEqual(L.fmtClock(25 * MIN), '25:00');
  assert.strictEqual(L.fmtClock(61001), '01:02');
  assert.strictEqual(L.fmtClock(-5), '00:00');
  assert.strictEqual(L.fmtDuration(45 * MIN), '45 min');
  assert.strictEqual(L.fmtDuration(125 * MIN), '2 h 5 min');
  assert.strictEqual(L.fmtDuration(120 * MIN), '2 h');
});

t('items are in unlock order with unique ids', () => {
  const ids = new Set();
  for (let i = 0; i < L.ITEMS.length; i++) {
    assert.ok(!ids.has(L.ITEMS[i].id));
    ids.add(L.ITEMS[i].id);
    if (i) assert.ok(L.ITEMS[i].at > L.ITEMS[i - 1].at);
  }
});

t('scenes unlock and change every day', () => {
  assert.strictEqual(L.scenesUnlocked(0).length, 7);
  assert.strictEqual(L.scenesUnlocked(99999).length, 20);
  const place = id => L.sceneById(id).place;
  for (const min of [0, 60, 400, 5000]) {
    for (const seed of [1, 42, 777, 2147483000]) {
      for (let i = 0; i < 400; i++) {
        const day = now + i * 86400000, prev = day - 86400000;
        const a = L.dailyScene(min, seed, day), b = L.dailyScene(min, seed, prev);
        assert.notStrictEqual(place(a), place(b), 'same place two days in a row (min ' + min + ', seed ' + seed + ', day ' + i + ')');
        assert.strictEqual(a, L.dailyScene(min, seed, day), 'same day gives same scene');
        assert.ok(min >= L.sceneById(a).at, 'only unlocked scenes show');
      }
    }
  }
  // every unlocked place comes back within a couple of weeks
  const groups = L.placeGroups(5000).length;
  assert.strictEqual(groups, 9);
  for (let start = 0; start < 60; start++) {
    const places = new Set();
    for (let i = 0; i < groups * 2 - 1; i++) places.add(place(L.dailyScene(5000, 7, now + (start + i) * 86400000)));
    assert.strictEqual(places.size, groups, 'all places visit within ' + (groups * 2 - 1) + ' days');
  }
  const seen = new Set();
  for (let i = 0; i < 120; i++) seen.add(L.dailyScene(5000, 7, now + i * 86400000));
  assert.ok(seen.size >= 14, 'many scenes over 4 months: ' + seen.size);
  const start = ['valley', 'desert', 'rooftop', 'meadow', 'spring', 'rain', 'fog'];
  for (let i = 0; i < 30; i++) assert.ok(start.includes(L.dailyScene(0, 3, now + i * 86400000)));
});

t('scene choice: daily, session, or a fixed favourite', () => {
  const st = L.defaultState(now, 11);
  st.settings.scene = 'winter';               // locked at 0 minutes -> falls back to the daily scene
  assert.strictEqual(L.currentScene(st, now), L.dailyScene(0, 11, now));
  st.totalMs = 700 * MIN;
  assert.strictEqual(L.currentScene(st, now), 'winter');
  st.settings.scene = 'session'; st.sceneNow = 'autumn';
  assert.strictEqual(L.currentScene(st, now), 'autumn');
  for (const r of [0, 0.2, 0.5, 0.99]) {
    const nx = L.nextSessionScene(st, r);
    assert.notStrictEqual(L.sceneById(nx).place, 'island', 'after an island scene, the next session goes somewhere new');
    assert.ok(L.scenesUnlocked(700).some(x => x.id === nx));
  }
  st.sceneNow = 'desert';
  assert.notStrictEqual(L.sceneById(L.nextSessionScene(st, 0.3)).place, 'desert');
  const back = L.sanitize(JSON.parse(JSON.stringify(Object.assign({}, st, { sceneNow: 'evil', settings: Object.assign({}, st.settings, { scene: '<x>' }) }))), now);
  assert.strictEqual(back.sceneNow, 'meadow');
  assert.strictEqual(back.settings.scene, 'daily');
});

console.log('logic tests passed:', passed);
