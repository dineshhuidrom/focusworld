/* Focus World — app controller: timer, saving, screens, sounds, sharing, backups. */
(function () {
  'use strict';
  var L = window.FWLogic, A = window.FWAudio, WW = window.FWWorld;
  var CFG = window.FW_CONFIG || {};
  var APP = CFG.appName || 'Focus World';
  var MIN = L.MIN;
  var KEY = 'focusworld:v1';
  var STRICT_GRACE = 10000;
  var FONT = 'ui-rounded, "SF Pro Rounded", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
  function $(id) { return document.getElementById(id); }
  function now() { return Date.now(); }

  // ---------- saved state ----------
  var storageOk = true;
  function loadState() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? L.sanitize(JSON.parse(raw), now()) : null;
    } catch (e) { storageOk = false; return null; }
  }
  var S = loadState() || L.defaultState(now());
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; } catch (e) { storageOk = false; }
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }

  var el = {};
  ['world', 'worldDesc', 'top', 'panel', 'phase', 'timer', 'lengths', 'sub', 'idleActions', 'runActions', 'breakActions',
    'startBtn', 'tinyBtn', 'pauseBtn', 'stopBtn', 'skipBreakBtn', 'nextName', 'nextLeft', 'nextBar', 'nextBarWrap', 'soundBtn', 'soundDot',
    'progressBtn', 'shareBtn', 'streakBtn', 'streakNum', 'menuBtn', 'live', 'pip', 'pipText', 'pipBtns', 'toast', 'scrim',
    'soundList', 'masterVol', 'soundWarn', 'stats', 'week', 'collection', 'collTitle', 'progressBackupBtn', 'shareImg', 'shareNowBtn',
    'saveImgBtn', 'notifySwitch', 'calmSwitch', 'skySeg', 'chimeVol', 'storageWarn', 'exportBtn', 'importBtn', 'resetBtn', 'sceneBtn', 'sceneIcon', 'sceneName', 'sceneMode', 'sceneGrid', 'sceneCount', 'toolsBtn', 'toolsList', 'followRow', 'followLinks', 'aboutBtn', 'toolsSearch', 'toolsChips', 'toolsCount', 'promo', 'promoX', 'promoLink', 'promoImg', 'promoKicker', 'promoTitle', 'promoCta', 'promoPrice',
    'askBtn', 'askLog', 'askForm', 'askInput', 'leadTitle', 'leadForm', 'leadName', 'leadPhone', 'leadEmail', 'leadNameRow', 'leadPhoneRow', 'leadEmailRow', 'leadPhoneNote',
    'leadEmailNote', 'leadEither', 'leadOk', 'leadOkText', 'leadHp', 'leadMsg', 'leadSkip', 'friendRow', 'friendLinks', 'confirmTitle', 'confirmText', 'confirmYes', 'confirmNo', 'onboard', 'obTitle', 'obText', 'obDots', 'obBtns', 'importFile', 'customBtn'
  ].forEach(function (id) { el[id] = $(id); });

  // ---------- sound ----------
  var engine = new A.Engine();
  var audioReady = false;
  function ensureAudio() {
    if (!engine.supported()) return false;
    engine.unlock();
    if (!audioReady && engine.ctx) { audioReady = true; engine.setLevels(S.settings.sounds, S.settings.master); }
    return audioReady;
  }
  function anySound() { return L.SOUND_KEYS.some(function (k) { return S.settings.sounds[k] > 0; }); }
  function applySounds() {
    if (audioReady) engine.setLevels(S.settings.sounds, S.settings.master);
    el.soundDot.hidden = !anySound();
  }
  function firstGesture() {
    ['click', 'keydown', 'touchend'].forEach(function (ev) { window.removeEventListener(ev, firstGesture, true); });
    if (anySound()) ensureAudio();
  }
  ['click', 'keydown', 'touchend'].forEach(function (ev) { window.addEventListener(ev, firstGesture, true); });

  // ---------- world ----------
  var world = new WW.World(el.world);
  function reduceMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function isCalm() { return S.settings.calm == null ? reduceMotion() : S.settings.calm; }
  function layoutWorld() {
    var w = window.innerWidth, h = window.innerHeight;
    var pr = el.panel.getBoundingClientRect(), hr = el.top.getBoundingClientRect();
    var area = pr.left > w * 0.45
      ? { l: 0, t: hr.bottom + 4, r: pr.left - 16, b: h - 16 }
      : { l: 0, t: hr.bottom + 2, r: w, b: pr.top - 6 };
    var dpr = Math.min(window.devicePixelRatio || 1, isCalm() ? 1.25 : 2);
    world.resize(w, h, dpr, area);
    document.documentElement.style.setProperty('--panel-h', Math.max(0, h - pr.top) + 'px');
    document.body.classList.toggle('calm', isCalm());
  }
  var wiltUntil = 0, wiltF = 0, bloomUntil = 0;
  function seedlingNow(t) {
    var s = S.session;
    if (s && s.kind === 'focus') return { f: L.elapsed(s, t) / s.plannedMs, wilted: false };
    if (t < wiltUntil) return { f: wiltF, wilted: true };
    if (t < bloomUntil) return { f: 1, wilted: false };
    return null;
  }
  var lastDraw = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    var fps = isCalm() ? 12 : 30;
    if (ts - lastDraw < 1000 / fps - 3) return;
    lastDraw = ts;
    var sc = L.currentScene(S, now());
    if (sc !== shownScene) renderSceneBtn();
    world.set({ min: L.totalMin(S), seed: S.seed, sky: S.settings.sky, rain: S.settings.sounds.rain, calm: isCalm(), seedling: seedlingNow(now()), scene: sc });
    world.frame(ts);
  }

  // ---------- small helpers ----------
  function announce(msg) { el.live.textContent = ''; setTimeout(function () { el.live.textContent = msg; }, 30); }
  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg; el.toast.hidden = false;
    void el.toast.offsetWidth; el.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.toast.classList.remove('on');
      setTimeout(function () { if (!el.toast.classList.contains('on')) el.toast.hidden = true; }, 350);
    }, 3400);
  }
  var pipTimer = null;
  function pip(text, buttons, ms) {
    el.pipText.textContent = text;
    el.pipBtns.textContent = '';
    (buttons || []).forEach(function (b) {
      var bt = document.createElement('button');
      bt.type = 'button'; bt.textContent = b.label;
      if (b.primary) bt.className = 'primary';
      bt.addEventListener('click', function () { hidePip(); if (b.fn) b.fn(); });
      el.pipBtns.appendChild(bt);
    });
    el.pipBtns.hidden = !(buttons && buttons.length);
    el.pip.hidden = false; el.pip.classList.remove('show'); void el.pip.offsetWidth; el.pip.classList.add('show');
    clearTimeout(pipTimer);
    if (!(buttons && buttons.length)) pipTimer = setTimeout(hidePip, ms || 6500);
    announce(text);
  }
  function hidePip() { clearTimeout(pipTimer); el.pip.hidden = true; }
  el.pip.addEventListener('click', function (e) { if (!e.target.closest('.pip-btns') && !el.pipBtns.children.length) hidePip(); });
  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function itemName(id) { for (var i = 0; i < L.ITEMS.length; i++) if (L.ITEMS[i].id === id) return L.ITEMS[i].name; return id; }

  // ---------- keep screen on / notifications ----------
  var wakeLock = null;
  function requestWake() {
    var s = S.session;
    if (!s || s.kind !== 'focus' || s.pausedAt != null) return;
    if (!(S.settings.keepAwake || s.strict) || !('wakeLock' in navigator) || wakeLock || document.hidden) return;
    navigator.wakeLock.request('screen').then(function (lock) {
      wakeLock = lock;
      lock.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () { wakeLock = null; });
  }
  function releaseWake() { if (wakeLock) { var w = wakeLock; wakeLock = null; w.release().catch(function () { /* already released */ }); } }
  function notify(title, body) {
    if (!S.settings.notify || !document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    var opts = { body: body, tag: 'focusworld' };
    try { new Notification(title, opts); } catch (e) {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(function (r) { return r.showNotification(title, opts); }).catch(function () { /* notification refused */ });
      }
    }
  }

  // ---------- sessions ----------
  function mode() {
    var s = S.session;
    if (!s) return 'idle';
    if (s.kind === 'break') return 'break';
    return s.pausedAt != null ? 'paused' : 'focus';
  }
  function startFocus(minutes, tiny) {
    if (S.session) return;
    hidePip();
    ensureAudio();
    var m = Math.max(1, Math.min(180, Math.round(minutes || S.settings.focusMin)));
    hidePromo();
    if (!S.tips.soundSet && !anySound()) {
      // First session ever: start a gentle mix so the person hears something. They can change it in Sounds.
      S.tips.soundSet = true;
      S.settings.sounds.lofi = 0.5; S.settings.sounds.rain = 0.3;
      applySounds();
      setTimeout(function () { toast('Playing lofi + soft rain \uD83C\uDFA7 Change it in Sounds'); }, 400);
    }
    S.session = L.newSession('focus', m * MIN, now(), { strict: S.settings.strict, tiny: !!tiny });
    wiltUntil = 0; bloomUntil = 0;
    save(); requestWake(); renderAll();
    announce('Focus started: ' + m + ' minutes.');
    if (S.session.strict && !('wakeLock' in navigator)) toast('Phone-free mode: keep this page open and your screen on');
  }
  function pauseToggle() {
    var s = S.session;
    if (!s || s.kind !== 'focus' || s.strict) return;
    var t = now();
    if (s.pausedAt == null) { L.pause(s, t); releaseWake(); announce('Paused'); }
    else { L.resume(s, t); requestWake(); announce('Resumed'); }
    save(); renderAll();
  }
  function stopFocus() {
    var s = S.session;
    if (!s || s.kind !== 'focus') return;
    if (s.strict) {
      confirmBox('Give up this one?', 'In phone-free mode, stopping early makes your sprout droop.', 'Let it droop', 'Stay and grow')
        .then(function (ok) { if (ok && S.session === s) wilt(); });
      return;
    }
    var e1 = L.elapsed(s, now()), m1 = Math.floor(e1 / MIN);
    var text = e1 >= 30000
      ? 'No worries! Your ' + (m1 < 1 ? 'focus time' : m1 + (m1 === 1 ? ' minute' : ' minutes')) + ' still count. Your island keeps them.'
      : 'It has been less than a minute, so nothing gets added yet.';
    confirmBox('Leaving so soon?', text, 'Stop for now', 'Keep growing').then(function (ok) {
      if (!ok || S.session !== s) return;
      var t = now(), e2 = L.elapsed(s, t);
      if (e2 >= 30000) finishFocus(s, t, e2, false);
      else { S.session = null; releaseWake(); save(); renderAll(); }
    });
  }
  function startBreak() {
    S.session = L.newSession('break', S.settings.breakMin * MIN, now(), {});
    schedulePromo(1500);
    save(); renderAll();
    announce('Break started: ' + S.settings.breakMin + ' minutes.');
  }
  function finishBreak(natural) {
    S.session = null;
    save(); renderAll();
    if (natural) {
      if (audioReady) engine.chime(S.settings.chime * 0.7);
      notify('Break\u2019s over \uD83C\uDF3F', 'Ready for another round?');
      toast('Break\u2019s over! Ready when you are \uD83C\uDF3F');
    }
  }
  function wilt() {
    var s = S.session;
    wiltF = s ? L.clamp(L.elapsed(s, now()) / s.plannedMs, 0.1, 1) : 0.3;
    S.session = null;
    wiltUntil = now() + 6000;
    releaseWake(); save(); renderAll();
    pip('Oh no, your sprout drooped because you wandered off. It happens to everyone! Try a short one?', [
      { label: 'Try 10 minutes', primary: true, fn: function () { startFocus(10); } },
      { label: 'Not now' }
    ]);
  }
  function finishFocus(s, t, credit, natural) {
    var before = L.streakInfo(S.days, t).current;
    var minBefore = L.totalMin(S);
    var unlocked = L.creditFocus(S, credit, t);
    var minAfter = L.totalMin(S);
    // scenes whose unlock point we just passed (places first, they are the bigger surprise)
    var newScenes = L.SCENES.filter(function (x) { return x.at > minBefore && x.at <= minAfter; })
      .sort(function (p, q) { return (p.place === 'island') - (q.place === 'island'); });
    var sceneMsg = '';
    if (natural && S.settings.scene === 'session') {
      S.sceneNow = L.nextSessionScene(S, Math.random());
      var ns = L.sceneById(S.sceneNow);
      sceneMsg = 'New scene: ' + ns.icon + ' ' + ns.name;
    }
    var after = L.streakInfo(S.days, t).current;
    var tiny = s.tiny;
    S.session = null;
    releaseWake();
    bloomUntil = now() + 2600;
    var sp = world.seedlingPoint();
    world.burst(sp.x, sp.y - world.Lo.u * 14, 26, [[255, 230, 140], [180, 255, 190], [255, 255, 255]]);
    var tw = performance.now() / 1000;
    unlocked.forEach(function (it, i) {
      world.pop(it.id, tw + 0.9 + i * 0.7);
      if (S.seen.indexOf(it.id) < 0) S.seen.push(it.id);
    });
    if (natural) {
      if (audioReady) engine.chime(S.settings.chime);
      notify('Ding! Session done \uD83C\uDF31', 'You focused for ' + L.fmtDuration(credit) + '. Your island grew!');
    }
    el.nextBarWrap.classList.remove('pulse'); void el.nextBarWrap.offsetWidth; el.nextBarWrap.classList.add('pulse');
    if (after > before) { el.streakBtn.classList.remove('glow'); void el.streakBtn.offsetWidth; el.streakBtn.classList.add('glow'); }
    var firstEver = !S.tips.first;
    S.tips.first = true;
    if (natural && !tiny && S.settings.autoBreak) startBreak(); else { save(); renderAll(); }
    save();
    if (newScenes.length) {
      toast((newScenes[0].place === 'island' ? 'New scene unlocked: ' : 'New place unlocked: ') + newScenes[0].icon + ' ' + newScenes[0].name);
      el.sceneBtn.classList.remove('new'); void el.sceneBtn.offsetWidth; el.sceneBtn.classList.add('new');
    } else if (unlocked.length) toast('New on your island: ' + unlocked.map(function (i) { return i.name; }).join(', ') + ' \u2728');
    else if (sceneMsg) toast(sceneMsg);
    else if (!natural) toast('+' + L.fmtDuration(credit) + ' added to your island \uD83C\uDF31');
    announce('Session complete. ' + L.fmtDuration(credit) + ' added.');

    // Pip speaks at most once, most important message first.
    var milestones = [3, 7, 14, 30, 60, 100, 365];
    if (newScenes.length && !firstEver && !(tiny && natural)) {
      pip(newScenes[0].place === 'island'
        ? 'Woohoo! You unlocked a new scene: ' + newScenes[0].name + ' ' + newScenes[0].icon + ' It will come and visit your island soon!'
        : 'Pack your bags! Your garden can now travel to ' + newScenes[0].name + ' ' + newScenes[0].icon + ' Want to go see it?', [
        { label: 'Show me', primary: true, fn: function () { S.settings.scene = newScenes[0].id; save(); renderSceneBtn(); } },
        { label: 'Later' }
      ]);
    } else if (tiny && natural) {
      var rest = Math.max(5, S.settings.focusMin - 2);
      pip('Yay, you started! That was the hardest part. Keep the magic going for ' + rest + ' more minutes?', [
        { label: 'Keep going \u2728', primary: true, fn: function () { startFocus(rest); } },
        { label: 'Done for now' }
      ]);
    } else if (firstEver) {
      pip('You did it! Your very first sprout is in the ground \uD83C\uDF31 Come back tomorrow and we\u2019ll start a streak!');
    } else if (after > before && milestones.indexOf(after) >= 0) {
      pip(after + ' days in a row! Your island is so proud of you \uD83C\uDF89');
    } else if (unlocked.length) {
      pip('Ooh, look! ' + unlocked[unlocked.length - 1].name + ' just popped up on your island!');
    } else if (!S.tips.backup && L.totalMin(S) >= 420) {
      S.tips.backup = true; save();
      pip('Your island is getting big and beautiful! Tuck a backup somewhere safe?', [
        { label: 'Save it', primary: true, fn: exportBackup },
        { label: 'Later' }
      ]);
    }
  }

  // Runs 4 times a second (slower when the tab is in the background).
  var lastPersist = 0;
  function tick() {
    var t = now(), s = S.session;
    if (s) {
      if (s.strict && s.kind === 'focus' && s.pausedAt == null) {
        if (s.hiddenAt != null && t - s.hiddenAt > STRICT_GRACE) { wilt(); return; }
        if (!document.hidden) {
          s.lastSeen = t;
          if (t - lastPersist > 5000) { lastPersist = t; save(); }
        }
      }
      if (s.pausedAt == null && L.remaining(s, t) <= 0) {
        if (s.kind === 'focus') finishFocus(s, t, s.plannedMs, true);
        else finishBreak(true);
        return;
      }
    }
    renderTimer();
  }
  function resolveOnLoad() {
    var s = S.session, t = now();
    if (!s) return;
    if (s.kind === 'focus') {
      if (s.strict && s.pausedAt == null && t - (s.lastSeen || s.startedAt) > STRICT_GRACE) {
        wilt();
        return;
      } else if (s.pausedAt == null && L.remaining(s, t) <= 0) {
        finishFocus(s, t, s.plannedMs, false);
        toast('Welcome back! Your session finished while you were away \uD83C\uDF31');
      } else {
        s.hiddenAt = null; s.lastSeen = t;
      }
    } else if (s.pausedAt == null && L.remaining(s, t) <= 0) {
      S.session = null;
    }
    save();
  }

  // ---------- rendering the panel ----------
  var lastClock = '';
  function greeting() {
    var h = new Date().getHours();
    if (S.totalMs === 0) return 'Your tiny island says hi';
    if (h >= 5 && h < 12) return 'Good morning, sunshine';
    if (h >= 12 && h < 17) return 'Hello, afternoon hero';
    if (h >= 17 && h < 22) return 'Cozy evening, cozy focus';
    return 'Night owl mode \uD83E\uDD89';
  }
  function renderPanel() {
    var m = mode(), s = S.session;
    el.panel.setAttribute('data-mode', m);
    el.idleActions.hidden = m !== 'idle';
    el.runActions.hidden = !(m === 'focus' || m === 'paused');
    el.breakActions.hidden = m !== 'break';
    el.lengths.hidden = m !== 'idle';
    el.pauseBtn.hidden = !!(s && s.strict);
    el.pauseBtn.textContent = m === 'paused' ? 'Keep going' : 'Pause';
    var phase = greeting(), sub = '';
    if (m === 'focus') {
      phase = s.tiny ? '2 tiny minutes' : 'Growing your island';
      sub = s.strict ? 'Phone-free mode \u00b7 your sprout is watching \uD83D\uDC40' : (s.tiny ? 'Just begin. Tiny steps count!' : 'Shh\u2026 your sprout is growing');
    } else if (m === 'paused') {
      phase = 'Paused'; sub = 'Your sprout is holding its breath';
    } else if (m === 'break') {
      phase = 'Break time'; sub = 'Stretch like a cat, sip some water, rest your eyes';
    }
    el.phase.textContent = phase;
    el.sub.hidden = m === 'idle';
    el.sub.textContent = sub;
    if (m !== 'break') hidePromo();
    var preset = [15, 25, 50, 90].indexOf(S.settings.focusMin) >= 0;
    Array.prototype.forEach.call(el.lengths.querySelectorAll('button[data-min]'), function (b) {
      var v = b.getAttribute('data-min');
      b.setAttribute('aria-pressed', String(v === 'custom' ? !preset : +v === S.settings.focusMin));
    });
    if (!preset) { el.customBtn.textContent = S.settings.focusMin + 'm'; el.customBtn.setAttribute('aria-label', 'Custom length: ' + S.settings.focusMin + ' minutes'); }
    else if (!el.customBtn.querySelector('svg')) { el.customBtn.innerHTML = CUSTOM_ICON; el.customBtn.setAttribute('aria-label', 'Custom length'); }
    el.startBtn.textContent = 'Grow for ' + S.settings.focusMin + ' min';
    lastClock = '';
    renderTimer();
  }
  var CUSTOM_ICON = el.customBtn.innerHTML;
  function renderTimer() {
    var s = S.session, t = now();
    var txt = s ? L.fmtClock(L.remaining(s, t)) : L.fmtClock(S.settings.focusMin * MIN);
    if (txt === lastClock) return;
    lastClock = txt;
    el.timer.textContent = txt;
    document.title = s ? txt + (s.kind === 'focus' ? ' · Focus' : ' · Break') + ' — ' + APP : APP + ' — focus and grow your island';
    renderNext();
  }
  function renderNext() {
    var base = L.totalMin(S), s = S.session;
    var extra = s && s.kind === 'focus' ? L.elapsed(s, now()) / MIN : 0;
    var p = L.progressToNext(base);
    if (!p.next) {
      el.nextName.textContent = 'Your island is complete! \uD83C\uDFDD\uFE0F';
      el.nextLeft.textContent = L.fmtDuration(S.totalMs) + ' focused';
      el.nextBar.style.width = '100%';
      el.nextBarWrap.setAttribute('aria-valuenow', '100');
      return;
    }
    var idx = L.ITEMS.indexOf(p.next), prevAt = idx > 0 ? L.ITEMS[idx - 1].at : 0;
    var proj = base + extra;
    var frac = L.clamp((proj - prevAt) / (p.next.at - prevAt), 0, 1);
    var left = p.next.at - proj;
    el.nextName.textContent = 'Next up: ' + p.next.name;
    el.nextLeft.textContent = left <= 0 ? 'pops up when you finish!' : Math.ceil(left) + ' min away';
    el.nextBar.style.width = (frac * 100).toFixed(1) + '%';
    el.nextBarWrap.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
  }
  function renderStreak() {
    var st = L.streakInfo(S.days, now());
    el.streakNum.textContent = String(st.current);
    el.streakBtn.setAttribute('aria-label', 'Streak: ' + st.current + (st.current === 1 ? ' day' : ' days') + '. Open your progress');
  }
  function renderDesc() {
    var have = L.unlocked(L.totalMin(S));
    el.worldDesc.textContent = 'Your island has ' + have.length + ' of ' + L.ITEMS.length + ' things' +
      (have.length ? ': ' + have.map(function (i) { return i.name; }).join(', ') + '.' : '. It is still just sand and a little grass.');
  }
  function renderAll() { renderPanel(); renderStreak(); renderDesc(); el.soundDot.hidden = !anySound(); }

  // ---------- product showcase (our own products: Tools page, and a picture card during breaks) ----------
  var SHELF = Array.isArray(CFG.shelf) ? CFG.shelf.filter(function (p) {
    return p && p.title && /^(https:\/\/|\/tools\/[a-z0-9-]+\/$)/.test(p.url || '') && /^[a-z0-9_\/.-]+\.(jpg|jpeg|png|webp)$/i.test(p.image || '');
  }) : [];
  // Every product link. A product set to "ask details first" opens the short form before its link.
  function shelfAnchor(p, cls) {
    var a = document.createElement('a');
    a.href = p.url; a.target = '_blank'; a.rel = 'noopener'; if (cls) a.className = cls;
    if (askFields(p)) a.addEventListener('click', function (e) { e.preventDefault(); openLead(p); });
    return a;
  }
  function priceText(p) { return p.free ? 'Free' : (p.noPrice ? '' : (p.price || '')); }
  // The boxes a product's "Before you go" form shows, or null when the link just opens.
  function askFields(p) {
    var f = Array.isArray(p.ask) ? p.ask.filter(function (x) { return x === 'name' || x === 'phone' || x === 'email'; }) : [];
    return f.indexOf('phone') >= 0 || f.indexOf('email') >= 0 ? f : null;
  }
  var TYPE_LABEL = { kit: 'Kit', ebook: 'Ebook', app: 'App', course: 'Video course', video: 'Video', website: 'Website', template: 'Template', tool: 'Tool',
    group: 'Group', social: 'Social page' };
  var TYPE_PLURAL = { kit: 'Kits', ebook: 'Ebooks', app: 'Apps', course: 'Video courses', video: 'Videos', website: 'Websites', template: 'Templates', tool: 'Tools',
    group: 'Groups', social: 'Social pages' };
  SHELF.forEach(function (p) {
    p._hay = [p.title, p.text, p.kicker, p.hook, TYPE_LABEL[p.type], p.free ? 'free' : '', (p.tags || []).join(' ')].join(' ').toLowerCase();
  });
  var toolsFilter = 'all', searchTimer = null;
  function toolCard(p) {
    var a = shelfAnchor(p, 'tool-card');
    var pic = document.createElement('span'); pic.className = 'tool-pic';
    var im = document.createElement('img');
    im.src = p.image; im.alt = p.imageAlt || p.title; im.width = 960; im.height = 540; im.loading = 'lazy';
    pic.appendChild(im);
    var badges = document.createElement('span'); badges.className = 'tool-badges';
    var tb = document.createElement('i'); tb.textContent = TYPE_LABEL[p.type] || 'Tool'; badges.appendChild(tb);
    if (p.free) { var fb = document.createElement('i'); fb.className = 'free'; fb.textContent = 'Free'; badges.appendChild(fb); }
    if (p.ad) { var ab = document.createElement('i'); ab.className = 'ad'; ab.textContent = 'Ad'; ab.title = 'Paid promotion'; badges.appendChild(ab); }
    pic.appendChild(badges);
    if (p.type === 'video' || p.type === 'course') {
      var play = document.createElement('span'); play.className = 'tool-play';
      play.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="#fffaf0"/></svg>';
      pic.appendChild(play);
    }
    a.appendChild(pic);
    var body = document.createElement('span'); body.className = 'tool-body';
    var small = document.createElement('small'); small.textContent = p.kicker || TYPE_LABEL[p.type] || 'Take a look';
    var b = document.createElement('b'); b.textContent = p.title;
    var d = document.createElement('span'); d.className = 'desc'; d.textContent = p.text || '';
    var buy = document.createElement('span'); buy.className = 'tool-buy';
    var price = document.createElement('span'); price.className = 'price' + (p.free ? ' free' : ''); price.textContent = priceText(p);
    var cta = document.createElement('span'); cta.className = 'cta'; cta.textContent = (p.cta || 'Take a look') + ' →';
    buy.appendChild(price); buy.appendChild(cta);
    body.appendChild(small); body.appendChild(b); body.appendChild(d); body.appendChild(buy);
    a.appendChild(body);
    return a;
  }
  function renderChips() {
    el.toolsChips.textContent = '';
    var kinds = ['all'];
    Object.keys(TYPE_LABEL).forEach(function (t) { if (SHELF.some(function (p) { return p.type === t; })) kinds.push(t); });
    if (SHELF.some(function (p) { return p.free; })) kinds.push('free');
    if (kinds.indexOf(toolsFilter) < 0) toolsFilter = 'all';
    kinds.forEach(function (k) {
      var bt = document.createElement('button');
      bt.type = 'button';
      bt.textContent = k === 'all' ? 'Everything' : k === 'free' ? 'Free stuff' : TYPE_PLURAL[k];
      bt.setAttribute('aria-pressed', String(k === toolsFilter));
      bt.addEventListener('click', function () { toolsFilter = k; renderChips(); renderToolList(); });
      el.toolsChips.appendChild(bt);
    });
  }
  function renderToolList() {
    var words = el.toolsSearch.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    var list = SHELF.filter(function (p) {
      if (toolsFilter === 'free' ? !p.free : (toolsFilter !== 'all' && p.type !== toolsFilter)) return false;
      return words.every(function (w) { return p._hay.indexOf(w) >= 0; });
    });
    el.toolsList.textContent = '';
    list.forEach(function (p) { el.toolsList.appendChild(toolCard(p)); });
    el.toolsCount.textContent = list.length ? (list.length === 1 ? '1 little helper' : list.length + ' little helpers') : '';
    if (!list.length) {
      var e = document.createElement('div'); e.className = 'tools-empty';
      var big = document.createElement('b'); big.textContent = '🔎';
      var t = document.createElement('span');
      t.textContent = SHELF.length ? 'Hmm, nothing for that yet. Try a simpler word, or tap Everything.' : 'The Toolshed is getting stocked. Check back soon!';
      e.appendChild(big); e.appendChild(t);
      el.toolsList.appendChild(e);
    }
  }
  // Small follow links, set in My Shop: our own pages ("Follow Focus World") and other people's ("Worth a follow").
  var SOCIAL_NAME = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook', x: 'X', threads: 'Threads', linkedin: 'LinkedIn',
    tiktok: 'TikTok', telegram: 'Telegram', whatsapp: 'WhatsApp', pinterest: 'Pinterest', website: 'Website' };
  var SOCIAL_ICON = { youtube: '\u25B6\uFE0F', instagram: '\uD83D\uDCF8', facebook: '\uD83D\uDC4D', x: '\u2716\uFE0F', threads: '\uD83E\uDDF5',
    linkedin: '\uD83D\uDCBC', tiktok: '\uD83C\uDFB5', telegram: '\u2708\uFE0F', whatsapp: '\uD83D\uDCAC', pinterest: '\uD83D\uDCCC', website: '\uD83C\uDF10' };
  var SOCIAL = Array.isArray(CFG.social) ? CFG.social.filter(function (x) {
    return x && SOCIAL_NAME[x.platform] && /^https:\/\/[^\s"'<>]+$/.test(x.url || '');
  }) : [];
  var OWN_LINKS = SOCIAL.filter(function (x) { return !x.friend; });
  var FRIEND_LINKS = SOCIAL.filter(function (x) { return !!x.friend; });
  function followChip(x) {
    var a = document.createElement('a');
    a.className = 'follow-chip'; a.href = x.url; a.target = '_blank'; a.rel = 'noopener noreferrer' + (x.ad ? ' sponsored' : '');
    var ic = document.createElement('span'); ic.setAttribute('aria-hidden', 'true'); ic.textContent = SOCIAL_ICON[x.platform];
    var tx = document.createElement('span'); tx.textContent = x.label || SOCIAL_NAME[x.platform];
    a.appendChild(ic); a.appendChild(tx);
    if (x.ad) { var ad = document.createElement('i'); ad.className = 'ad'; ad.textContent = 'Ad'; a.appendChild(ad); }
    a.setAttribute('aria-label', (x.label || SOCIAL_NAME[x.platform]) + (x.ad ? ', paid promotion' : '') + ' (opens in a new tab)');
    return a;
  }
  function renderFollow() {
    el.followRow.hidden = !OWN_LINKS.length;
    el.followLinks.textContent = '';
    OWN_LINKS.forEach(function (x) { el.followLinks.appendChild(followChip(x)); });
    el.friendRow.hidden = !FRIEND_LINKS.length;
    el.friendLinks.textContent = '';
    FRIEND_LINKS.forEach(function (x) { el.friendLinks.appendChild(followChip(x)); });
  }
  function renderTools() { renderChips(); renderToolList(); renderFollow(); }
  el.toolsSearch.addEventListener('input', function () { clearTimeout(searchTimer); searchTimer = setTimeout(renderToolList, 120); });
  var promoTimer = null, promoDismissed = false, promoItem = null;
  function schedulePromo(ms) { clearTimeout(promoTimer); promoDismissed = false; promoTimer = setTimeout(showPromo, ms); }
  function showPromo() {
    if (mode() !== 'break' || promoDismissed || !SHELF.length || openSheetEl) return;
    if (!el.pip.hidden) { promoTimer = setTimeout(showPromo, 2500); return; } // never on top of Pip
    var pool = SHELF.filter(function (x) { return x.featured; });
    if (!pool.length) pool = SHELF;
    var p = pool[(S.sessions || 0) % pool.length];
    el.promoLink.href = p.url; promoItem = p;
    el.promoImg.hidden = !p.image;
    if (p.image) { el.promoImg.src = p.image; el.promoImg.alt = p.imageAlt || p.title; }
    el.promoKicker.textContent = p.ad ? 'Ad \u00B7 Paid promotion' : 'Psst\u2026 you might like this';
    el.promoTitle.textContent = p.hook || p.title;
    el.promoCta.textContent = (p.cta || 'Take a look') + ' \u2192';
    el.promoPrice.textContent = priceText(p);
    el.promo.hidden = false;
  }
  function hidePromo() { clearTimeout(promoTimer); el.promo.hidden = true; }
  el.promoX.addEventListener('click', function () { promoDismissed = true; hidePromo(); });

  // ---------- scenes ----------
  var shownScene = '';
  function renderSceneBtn() {
    var sc = L.sceneById(L.currentScene(S, now()));
    shownScene = sc.id;
    el.sceneIcon.textContent = sc.icon;
    el.sceneName.textContent = sc.name;
    var how = S.settings.scene === 'daily' ? 'Today\u2019s scene' : S.settings.scene === 'session' ? 'This session\u2019s scene' : 'Your scene';
    el.sceneBtn.setAttribute('aria-label', how + ': ' + sc.name + '. Change scene');
  }
  function renderScenes() {
    var min = L.totalMin(S), cur = L.currentScene(S, now()), open = L.scenesUnlocked(min).length;
    Array.prototype.forEach.call(el.sceneMode.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-mode') === S.settings.scene));
    });
    el.sceneCount.textContent = open + ' of ' + L.SCENES.length + ' scenes unlocked';
    el.sceneGrid.textContent = '';
    var lastGroup = '';
    L.SCENES.forEach(function (sc) {
      var grp = sc.place === 'island' ? 'island' : 'away';
      if (grp !== lastGroup) {
        lastGroup = grp;
        var head = document.createElement('div');
        head.className = 'scene-group';
        var h3 = document.createElement('h3');
        h3.textContent = grp === 'away' ? '\u2708\uFE0F Faraway places' : '\uD83C\uDFDD\uFE0F Island moods';
        var p = document.createElement('p');
        p.textContent = grp === 'away' ? 'Your whole garden packs up and travels here. Wheee!' : 'Your home island, in every season and every weather.';
        head.appendChild(h3); head.appendChild(p);
        el.sceneGrid.appendChild(head);
      }
      var locked = min < sc.at;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene-card' + (locked ? ' locked' : '') + (sc.id === cur ? ' current' : '');
      var cv = document.createElement('canvas');
      cv.width = 300; cv.height = 190;
      var cx = cv.getContext('2d');
      cx.setTransform(2, 0, 0, 2, 0, 0);
      try {
        WW.renderStatic(cx, 150, 95, { l: 0, t: 4, r: 150, b: 92 }, { min: min, seed: S.seed, sky: S.settings.sky, rain: 0, calm: true, seedling: null, scene: sc.id }, 12.3);
      } catch (e) { cx.fillStyle = '#1b2350'; cx.fillRect(0, 0, 150, 95); }
      b.appendChild(cv);
      var name = document.createElement('b'); name.textContent = sc.icon + ' ' + sc.name;
      var st = document.createElement('small');
      if (locked) {
        st.textContent = 'Unlocks at ' + sc.at + ' min \u00b7 ' + Math.ceil(sc.at - min) + ' to go';
        var lk = document.createElement('span'); lk.className = 'lock'; lk.setAttribute('aria-hidden', 'true'); lk.textContent = '\uD83D\uDD12';
        b.appendChild(lk);
        b.setAttribute('aria-disabled', 'true');
      } else {
        st.textContent = sc.id === cur ? (S.settings.scene === sc.id ? 'Your pick \u2764\uFE0F' : 'Visiting now') : 'Tap to keep this one';
      }
      b.appendChild(name); b.appendChild(st);
      b.setAttribute('aria-label', sc.name + (locked ? ', locked' : sc.id === cur ? ', showing now' : ''));
      b.addEventListener('click', function () {
        if (locked) { toast('Focus ' + Math.ceil(sc.at - min) + ' more minutes to unlock ' + sc.name + ' ' + sc.icon); return; }
        S.settings.scene = sc.id; save(); renderSceneBtn(); renderScenes();
        toast(sc.icon + ' ' + sc.name + ' it is! It stays until you change it');
      });
      el.sceneGrid.appendChild(b);
    });
  }
  Array.prototype.forEach.call(el.sceneMode.querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () {
      var m = b.getAttribute('data-mode');
      if (m === 'session' && S.settings.scene !== 'session') S.sceneNow = L.currentScene(S, now());
      S.settings.scene = m; save(); renderSceneBtn(); renderScenes();
      toast(m === 'daily' ? 'A brand new place every day \uD83C\uDF08' : 'A new place after every session \u2728');
    });
  });
  el.sceneBtn.addEventListener('click', function () { renderScenes(); openSheet('sheetScenes'); });

  // ---------- sheets ----------
  var openSheetEl = null, lastFocus = null, confirmResolve = null;
  function setInert(on) {
    [el.panel, el.top, el.pip].forEach(function (n) {
      if ('inert' in n) n.inert = on; else if (on) n.setAttribute('aria-hidden', 'true'); else n.removeAttribute('aria-hidden');
    });
  }
  function openSheet(id) {
    closeSheet(true);
    var sh = $(id);
    lastFocus = document.activeElement;
    el.scrim.hidden = false; sh.hidden = false;
    void sh.offsetWidth;
    el.scrim.classList.add('on'); sh.classList.add('open');
    setInert(true);
    openSheetEl = sh;
    var f = sh.querySelector('[data-close], button, input, a[href]');
    setTimeout(function () { if (f && openSheetEl === sh) f.focus({ preventScroll: true }); }, 80);
  }
  function closeSheet(instant) {
    var sh = openSheetEl;
    if (!sh) return;
    openSheetEl = null;
    if (sh.id === 'sheetConfirm' && confirmResolve) { var r = confirmResolve; confirmResolve = null; r(false); }
    sh.classList.remove('open'); el.scrim.classList.remove('on');
    setInert(false);
    var done = function () {
      if (!sh.classList.contains('open')) sh.hidden = true;
      if (!openSheetEl) el.scrim.hidden = true;
    };
    if (instant) done(); else setTimeout(done, 340);
    if (!instant && lastFocus && lastFocus.focus && document.body.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  function confirmBox(title, text, yes, no) {
    return new Promise(function (resolve) {
      el.confirmTitle.textContent = title; el.confirmText.textContent = text;
      el.confirmYes.textContent = yes; el.confirmNo.textContent = no || 'Cancel';
      openSheet('sheetConfirm');
      confirmResolve = resolve;
    });
  }
  el.confirmYes.addEventListener('click', function () { var r = confirmResolve; confirmResolve = null; closeSheet(); if (r) r(true); });
  el.confirmNo.addEventListener('click', function () { closeSheet(); });
  el.scrim.addEventListener('click', function () { closeSheet(); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', function () { closeSheet(); }); });
  function trapTab(e) {
    var f = Array.prototype.filter.call(openSheetEl.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])'), function (n) {
      return !n.disabled && !n.hidden && n.offsetParent !== null;
    });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // ---------- sounds sheet ----------
  var SOUND_META = [
    { k: 'rain', name: 'Rain', svg: '<path d="M7 15a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6 1.4A3.3 3.3 0 0 1 17 15z" fill="currentColor"/><path d="M8 18l-1 2.5M12 18l-1 2.5M16 18l-1 2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
    { k: 'ocean', name: 'Ocean', svg: '<path d="M2.5 14c2.2 0 2.2-2 4.4-2s2.2 2 4.4 2 2.2-2 4.4-2 2.2 2 4.4 2M2.5 18.5c2.2 0 2.2-2 4.4-2s2.2 2 4.4 2 2.2-2 4.4-2 2.2 2 4.4 2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M6 9.5c1.5-3 5-4.5 8-3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' },
    { k: 'forest', name: 'Forest', svg: '<path d="M12 3l5 7h-3l4 6H6l4-6H7z" fill="currentColor"/><rect x="11" y="16" width="2" height="5" rx="1" fill="currentColor"/>' },
    { k: 'fire', name: 'Campfire', svg: '<path d="M12 3c1 3.5 5 5 5 9.5A5 5 0 0 1 7 12.5c0-2 1-3.4 2.2-4.4.2 1.6 1 2.6 2 3 0-3 .3-5.4.8-8.1z" fill="currentColor"/><path d="M5 20.5l14-2.5M5 18l14 2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
    { k: 'brown', name: 'Brown noise', svg: '<path d="M3 12h2l1.5-4 2 9 2-12 2 14 2-9 1.5 5 1.5-3H21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' },
    { k: 'lofi', name: 'Lofi music', svg: '<path d="M9 17.5V6l10-2v11.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="6.5" cy="17.5" r="2.6" fill="currentColor"/><circle cx="16.5" cy="15.5" r="2.6" fill="currentColor"/>' }
  ];
  var lastLevel = {};
  function buildSounds() {
    el.soundList.textContent = '';
    SOUND_META.forEach(function (m) {
      var row = document.createElement('div'); row.className = 'sound-row';
      var bt = document.createElement('button'); bt.type = 'button'; bt.className = 'sound-toggle';
      bt.innerHTML = '<span class="ico"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' + m.svg + '</svg></span>';
      var label = document.createElement('span'); label.textContent = m.name; bt.appendChild(label);
      var rg = document.createElement('input'); rg.type = 'range'; rg.min = '0'; rg.max = '100'; rg.step = '1';
      rg.setAttribute('aria-label', m.name + ' volume');
      function sync() {
        var v = S.settings.sounds[m.k];
        bt.setAttribute('aria-pressed', String(v > 0));
        rg.value = String(Math.round(v * 100));
      }
      function set(v) {
        ensureAudio();
        S.tips.soundSet = true;
        S.settings.sounds[m.k] = L.clamp(v, 0, 1);
        if (v > 0) lastLevel[m.k] = v;
        applySounds(); sync(); saveSoon();
      }
      bt.addEventListener('click', function () { set(S.settings.sounds[m.k] > 0 ? 0 : (lastLevel[m.k] || 0.6)); });
      rg.addEventListener('input', function () { set(+rg.value / 100); });
      sync();
      row.appendChild(bt); row.appendChild(rg);
      el.soundList.appendChild(row);
    });
    el.masterVol.value = String(Math.round(S.settings.master * 100));
    el.soundWarn.hidden = engine.supported();
  }
  el.masterVol.addEventListener('input', function () { ensureAudio(); S.settings.master = +el.masterVol.value / 100; applySounds(); saveSoon(); });

  // ---------- progress sheet ----------
  function stat(value, label) {
    var d = document.createElement('div'); d.className = 'stat';
    var b = document.createElement('b'); b.textContent = value;
    var s = document.createElement('span'); s.textContent = label;
    d.appendChild(b); d.appendChild(s);
    return d;
  }
  function renderProgress() {
    var t = now(), st = L.streakInfo(S.days, t), today = S.days[L.dateKey(t)] || 0;
    el.stats.textContent = '';
    el.stats.appendChild(stat(L.fmtDuration(today), 'today'));
    el.stats.appendChild(stat(st.current + (st.current === 1 ? ' day' : ' days'), 'streak' + (st.todayDone || !st.current ? '' : ' (focus today to keep it going!)')));
    el.stats.appendChild(stat(L.fmtDuration(S.totalMs), 'focused in total'));
    el.stats.appendChild(stat(S.bestStreak + (S.bestStreak === 1 ? ' day' : ' days'), 'best streak'));
    var days = L.lastDays(S.days, t, 7);
    var max = Math.max(30 * MIN, Math.max.apply(null, days.map(function (d) { return d.ms; })));
    var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    el.week.textContent = '';
    days.forEach(function (d, i) {
      var p = d.key.split('-');
      var wd = new Date(+p[0], +p[1] - 1, +p[2]).getDay();
      var box = document.createElement('div'); box.className = 'day' + (i === 6 ? ' today' : '');
      var col = document.createElement('div'); col.className = 'col' + (d.ms ? '' : ' zero');
      col.style.height = Math.max(4, d.ms / max * 100) + '%'; col.style.animationDelay = (i * 0.05) + 's';
      col.title = names[wd] + ': ' + L.fmtDuration(d.ms);
      var lb = document.createElement('span'); lb.textContent = i === 6 ? 'Today' : names[wd];
      box.setAttribute('aria-label', names[wd] + ' ' + L.fmtDuration(d.ms));
      box.appendChild(col); box.appendChild(lb);
      el.week.appendChild(box);
    });
    var mins = L.totalMin(S), have = L.unlocked(mins), next = L.nextItem(mins);
    el.collTitle.textContent = 'Island treasures \u00b7 ' + have.length + ' of ' + L.ITEMS.length;
    el.collection.textContent = '';
    function li(cls, text, note) {
      var n = document.createElement('li'); if (cls) n.className = cls;
      n.appendChild(document.createElement('i'));
      n.appendChild(document.createTextNode(text));
      if (note) { var sm = document.createElement('small'); sm.textContent = note; n.appendChild(sm); }
      el.collection.appendChild(n);
    }
    have.forEach(function (it) { li('', it.name); });
    if (next) {
      li('next', next.name, 'in ' + Math.ceil(next.at - mins) + ' min');
      var restCount = L.ITEMS.length - have.length - 1;
      if (restCount > 0) li('locked', restCount + (restCount === 1 ? ' more surprise' : ' more surprises') + ' \uD83C\uDF81', '');
    }
  }

  // ---------- share picture ----------
  var shareBlob = null, shareUrl = null;
  function fitText(c, text, maxW, size, weight) {
    var s = size;
    do { c.font = weight + ' ' + s + 'px ' + FONT; s -= 2; } while (c.measureText(text).width > maxW && s > 18);
  }
  function buildCard(cb) {
    var Wc = 1080, Hc = 1350, cv = document.createElement('canvas');
    cv.width = Wc; cv.height = Hc;
    var c = cv.getContext('2d');
    WW.renderStatic(c, Wc, Hc, { l: 30, t: 120, r: 1050, b: 1030 }, { min: L.totalMin(S), seed: S.seed, sky: S.settings.sky, rain: 0, calm: true, seedling: null, scene: L.currentScene(S, now()) }, 14.2);
    var g = c.createLinearGradient(0, 900, 0, Hc);
    g.addColorStop(0, 'rgba(10,14,36,0)'); g.addColorStop(0.35, 'rgba(10,14,36,.8)'); g.addColorStop(1, 'rgba(10,14,36,.94)');
    c.fillStyle = g; c.fillRect(0, 900, Wc, Hc - 900);
    var st = L.streakInfo(S.days, now()).current, have = L.unlocked(L.totalMin(S)).length;
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    c.fillStyle = '#fffaf0';
    fitText(c, 'My focus island', 960, 76, '800'); c.fillText('My focus island', 64, 1130);
    var line2 = L.fmtDuration(S.totalMs) + ' focused' + (st ? ' · ' + st + '-day streak' : '');
    c.fillStyle = 'rgba(255,250,240,.9)'; fitText(c, line2, 960, 44, '700'); c.fillText(line2, 64, 1196);
    c.fillStyle = 'rgba(255,250,240,.6)'; fitText(c, have + ' of ' + L.ITEMS.length + ' things grown', 960, 34, '600'); c.fillText(have + ' of ' + L.ITEMS.length + ' things grown', 64, 1250);
    var foot = CFG.siteUrl ? CFG.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : APP;
    c.fillStyle = 'rgba(255,214,140,.95)'; fitText(c, foot, 600, 32, '800'); c.fillText(foot, 64, 1306);
    c.fillStyle = 'rgba(10,14,36,.35)';
    c.beginPath();
    if (c.roundRect) c.roundRect(40, 40, 360, 72, 36); else c.rect(40, 40, 360, 72);
    c.fill();
    c.fillStyle = '#fffaf0'; fitText(c, APP, 300, 34, '800'); c.fillText(APP, 72, 88);
    cv.toBlob(function (b) { cb(b); }, 'image/png');
  }
  function openShare() {
    openSheet('sheetShare');
    el.shareImg.removeAttribute('src');
    el.shareNowBtn.disabled = true; el.saveImgBtn.disabled = true;
    setTimeout(function () {
      buildCard(function (blob) {
        if (!blob) { toast('Could not make the picture on this browser'); return; }
        shareBlob = blob;
        if (shareUrl) URL.revokeObjectURL(shareUrl);
        shareUrl = URL.createObjectURL(blob);
        el.shareImg.src = shareUrl;
        el.shareNowBtn.disabled = false; el.saveImgBtn.disabled = false;
      });
    }, 120);
  }
  el.shareNowBtn.addEventListener('click', function () {
    if (!shareBlob) return;
    var text = 'I\u2019ve focused for ' + L.fmtDuration(S.totalMs) + ' and grew my own little island \uD83C\uDFDD\uFE0F' + (CFG.siteUrl ? ' ' + CFG.siteUrl : '');
    var file = null;
    try { file = new File([shareBlob], 'my-focus-island.png', { type: 'image/png' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], text: text, title: APP }).catch(function () { /* person closed the share sheet */ });
    } else if (navigator.share) {
      navigator.share({ text: text, title: APP, url: CFG.siteUrl || undefined }).catch(function () { /* person closed the share sheet */ });
    } else {
      downloadBlob(shareBlob, 'my-focus-island.png');
      toast('Saved! Share it from your photos or downloads');
    }
  });
  el.saveImgBtn.addEventListener('click', function () { if (shareBlob) { downloadBlob(shareBlob, 'my-focus-island.png'); toast('Saved! \uD83D\uDCF8'); } });

  // ---------- backup ----------
  function exportBackup() {
    var data = JSON.parse(JSON.stringify(S)); data.session = null;
    var wrap = { app: 'focus-world', version: 1, exportedAt: new Date().toISOString(), state: data };
    downloadBlob(new Blob([JSON.stringify(wrap)], { type: 'application/json' }), 'focus-world-backup-' + L.dateKey(now()) + '.json');
    S.tips.backup = true; save();
    toast('Backup tucked into your downloads \uD83D\uDCE6');
  }
  el.exportBtn.addEventListener('click', exportBackup);
  el.progressBackupBtn.addEventListener('click', exportBackup);
  el.importBtn.addEventListener('click', function () { el.importFile.click(); });
  el.importFile.addEventListener('change', function () {
    var f = el.importFile.files && el.importFile.files[0];
    el.importFile.value = '';
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast('Hmm, that file is too big to be a backup'); return; }
    var r = new FileReader();
    r.onload = function () {
      var obj = null;
      try { obj = JSON.parse(String(r.result)); } catch (e) { obj = null; }
      var st = obj ? L.sanitize(obj.app === 'focus-world' ? obj.state : obj, now()) : null;
      if (!st) { toast('Hmm, that file isn\u2019t a ' + APP + ' backup'); return; }
      st.session = null; st.onboarded = true;
      confirmBox('Load this backup?', 'Your island here (' + L.fmtDuration(S.totalMs) + ') will be swapped for the backup (' + L.fmtDuration(st.totalMs) + ').', 'Swap islands', 'Cancel')
        .then(function (ok) {
          if (!ok) return;
          releaseWake();
          S = st;
          S.seen = L.unlocked(L.totalMin(S)).map(function (i) { return i.id; });
          save(); applySounds(); syncSettingsUI(); renderAll();
          toast('Welcome back, island! \uD83C\uDFDD\uFE0F');
        });
    };
    r.onerror = function () { toast('Oops, couldn\u2019t read that file'); };
    r.readAsText(f);
  });
  el.resetBtn.addEventListener('click', function () {
    confirmBox('Start a brand-new island?', 'This deletes your island and progress on this device. Save a backup first if you might miss it.', 'Yes, start fresh', 'Keep my island')
      .then(function (ok) {
        if (!ok) return;
        var settings = S.settings;
        releaseWake();
        S = L.defaultState(now()); S.settings = settings; S.onboarded = true;
        save(); renderAll();
        toast('A fresh little island is ready \uD83C\uDFDD\uFE0F');
      });
  });

  // ---------- settings ----------
  function stepValue(key, v, d) {
    if (key === 'focusMin') {
      if (d > 0) return v < 10 ? v + 1 : Math.floor(v / 5) * 5 + 5;
      return v <= 10 ? v - 1 : Math.ceil(v / 5) * 5 - 5;
    }
    return v + d;
  }
  function syncSettingsUI() {
    Array.prototype.forEach.call(document.querySelectorAll('.stepper'), function (stp) {
      var key = stp.getAttribute('data-key');
      stp.querySelector('output').textContent = S.settings[key] + ' min';
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[data-set]'), function (sw) {
      sw.checked = !!S.settings[sw.getAttribute('data-set')];
    });
    el.notifySwitch.checked = !!S.settings.notify && 'Notification' in window && Notification.permission === 'granted';
    el.calmSwitch.checked = isCalm();
    Array.prototype.forEach.call(el.skySeg.querySelectorAll('button'), function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-sky') === S.settings.sky));
    });
    el.chimeVol.value = String(Math.round(S.settings.chime * 100));
    el.storageWarn.hidden = storageOk;
  }
  Array.prototype.forEach.call(document.querySelectorAll('.stepper'), function (stp) {
    var key = stp.getAttribute('data-key'), lo = +stp.getAttribute('data-min'), hi = +stp.getAttribute('data-max');
    Array.prototype.forEach.call(stp.querySelectorAll('button'), function (b) {
      b.addEventListener('click', function () {
        S.settings[key] = L.clamp(stepValue(key, S.settings[key], +b.getAttribute('data-d')), lo, hi);
        saveSoon(); syncSettingsUI(); renderPanel();
      });
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('input[data-set]'), function (sw) {
    sw.addEventListener('change', function () {
      var key = sw.getAttribute('data-set');
      S.settings[key] = sw.checked; save();
      if (key === 'strict' && S.session) toast('This kicks in from your next session');
      if (key === 'keepAwake') { if (sw.checked) requestWake(); else if (!(S.session && S.session.strict)) releaseWake(); }
    });
  });
  el.notifySwitch.addEventListener('change', function () {
    if (!el.notifySwitch.checked) { S.settings.notify = false; save(); return; }
    if (!('Notification' in window)) { el.notifySwitch.checked = false; toast('Aw, this browser can\u2019t do notifications'); return; }
    var done = function (p) {
      S.settings.notify = p === 'granted';
      el.notifySwitch.checked = S.settings.notify;
      if (p !== 'granted') toast('Notifications are blocked. You can allow them in your browser settings');
      save();
    };
    var r = Notification.requestPermission(done);
    if (r && r.then) r.then(done);
  });
  el.calmSwitch.addEventListener('change', function () { S.settings.calm = el.calmSwitch.checked; save(); layoutWorld(); });
  Array.prototype.forEach.call(el.skySeg.querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () { S.settings.sky = b.getAttribute('data-sky'); save(); syncSettingsUI(); });
  });
  el.chimeVol.addEventListener('change', function () { S.settings.chime = +el.chimeVol.value / 100; save(); if (ensureAudio()) engine.chime(S.settings.chime); });

  // ---------- onboarding ----------
  var OB = [
    { t: 'Hi! I\u2019m Pip \uD83C\uDF31', p: 'This tiny island is all yours. Right now it\u2019s just sand and a little patch of grass\u2026 but not for long!' },
    { t: 'Focus is magic here', p: 'Every minute you focus, your island grows. Trees, a cozy cottage, a windmill, even a lighthouse!' },
    { t: 'No sign-up. No ads. Just you.', p: 'Everything stays on your device. Let\u2019s start super small: just 2 tiny minutes.' }
  ];
  function showOnboard(i) {
    el.onboard.hidden = false;
    setInert(true);
    el.obTitle.textContent = OB[i].t; el.obText.textContent = OB[i].p;
    el.obTitle.classList.remove('swap'); el.obText.classList.remove('swap'); void el.obText.offsetWidth;
    el.obTitle.classList.add('swap'); el.obText.classList.add('swap');
    Array.prototype.forEach.call(el.obDots.children, function (d, k) { d.className = k === i ? 'on' : ''; });
    el.obBtns.textContent = '';
    function btn(label, cls, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + cls; b.textContent = label;
      b.addEventListener('click', fn); el.obBtns.appendChild(b); return b;
    }
    var first;
    if (i < OB.length - 1) first = btn(i ? 'Ooh, nice!' : 'Hi Pip!', 'primary', function () { showOnboard(i + 1); });
    else {
      first = btn('Let\u2019s go!', 'primary', function () { endOnboard(); startFocus(2, true); });
      btn('Just look around', 'soft', endOnboard);
    }
    setTimeout(function () { first.focus({ preventScroll: true }); }, 50);
  }
  function endOnboard() {
    S.onboarded = true; save();
    el.onboard.hidden = true;
    setInert(false);
  }

  // ---------- "Before you go": a short form for products set to ask for details first ----------
  // Each product picks its boxes (name, WhatsApp number, email). The details go to the owner's private list (live
  // site only). A number or an email is needed; the visitor can always skip.
  var LEAD_KEY = KEY + ':me', leadFor = null, leadAsk = [];
  // A WhatsApp number as people really type it. No "+" means an Indian number: 98123 45678, 098123 45678 and
  // 91 98123 45678 all become +919812345678. Numbers from other countries start with + (or 00) and their code.
  // Returns '' when empty, null when it can't be a phone number. (Same rule as lib/leads.mjs.)
  function cleanPhone(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var intl = s.charAt(0) === '+' || /^00/.test(s);
    var d = s.replace(/[^0-9]/g, '');
    if (intl) { if (/^00/.test(s)) d = d.slice(2); return d.length >= 8 && d.length <= 15 ? '+' + d : null; }
    if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    else if (d.length === 12 && d.slice(0, 2) === '91') d = d.slice(2);
    return /^[6-9][0-9]{9}$/.test(d) ? '+91' + d : null;
  }
  var EMAIL_OK = /^[^\s@"'<>(),;:]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)+$/;
  function openLead(p) {
    leadFor = p; leadAsk = askFields(p) || ['phone'];
    var has = function (f) { return leadAsk.indexOf(f) >= 0; };
    var both = has('phone') && has('email');
    el.leadTitle.textContent = p.title;
    el.leadNameRow.hidden = !has('name');
    el.leadPhoneRow.hidden = !has('phone');
    el.leadEmailRow.hidden = !has('email');
    el.leadEither.hidden = !both;
    el.leadEmailNote.textContent = both ? 'or your number' : '';
    el.leadOkText.textContent = 'Yes, ' + APP + ' can contact me about this' + (has('phone') && !has('email') ? ' on WhatsApp.' : '.');
    var me = {};
    try { me = JSON.parse(localStorage.getItem(LEAD_KEY) || '{}') || {}; } catch (e) { me = {}; }
    el.leadName.value = typeof me.name === 'string' ? me.name : '';
    el.leadPhone.value = typeof me.phone === 'string' ? me.phone : '';
    el.leadEmail.value = typeof me.email === 'string' ? me.email : '';
    el.leadOk.checked = false;                 // asked each time, never assumed
    el.leadMsg.textContent = '';
    hidePromo();
    openSheet('sheetLead');
  }
  function leadBad(input, msg) {
    el.leadMsg.textContent = msg;
    input.focus();
  }
  el.leadForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var p = leadFor;
    if (!p) return;
    var has = function (f) { return leadAsk.indexOf(f) >= 0; };
    var name = has('name') ? el.leadName.value.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    var phone = has('phone') ? cleanPhone(el.leadPhone.value) : '';
    var email = has('email') ? el.leadEmail.value.trim().toLowerCase() : '';
    if (has('name') && !name) return leadBad(el.leadName, 'Please add your name.');
    if (phone === null) return leadBad(el.leadPhone, 'That number doesn\u2019t look right. Type your 10-digit number, like 98123 45678.');
    if (email && (email.length > 254 || !EMAIL_OK.test(email))) return leadBad(el.leadEmail, 'That email doesn’t look right. Check it, please.');
    if (!phone && !email) {
      return leadBad(has('phone') ? el.leadPhone : el.leadEmail,
        has('phone') && has('email') ? 'Add your WhatsApp number or your email, or tap Skip.' : has('phone') ? 'Add your WhatsApp number, or tap Skip.' : 'Add your email, or tap Skip.');
    }
    if (!el.leadOk.checked) return leadBad(el.leadOk, 'Please tick the box so ' + APP + ' can contact you, or tap Skip.');
    // Open the link now, inside the tap, so the browser allows it. The details are sent at the same time.
    window.open(p.url, '_blank', 'noopener');
    try {
      var keep = {};
      try { keep = JSON.parse(localStorage.getItem(LEAD_KEY) || '{}') || {}; } catch (er) { keep = {}; }
      if (name) keep.name = name;
      if (phone) keep.phone = phone;
      if (email) keep.email = email;
      localStorage.setItem(LEAD_KEY, JSON.stringify(keep));
    } catch (er) { /* fine: just not prefilled next time */ }
    if (CFG.pwa) {
      fetch('/api/lead', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: p.id, title: p.title, name: name, phone: phone, email: email, ok: true, website: el.leadHp.value })
      }).catch(function () { /* offline: the link still opens */ });
    }
    closeSheet();
    toast('Thank you' + (name ? ', ' + name.split(' ')[0] : '') + '! Opening it now 🌱');
  });
  el.leadSkip.addEventListener('click', function () {
    var p = leadFor;
    if (p) window.open(p.url, '_blank', 'noopener');
    closeSheet();
  });

  // ---------- Ask Pip: a small helper chat. Not an AI: the answers live in helper.js and nothing typed leaves the device ----------
  var H = window.FWHelper;
  var GUIDES = Array.isArray(CFG.guides) ? CFG.guides.filter(function (g) {
    return g && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.slug || '') && typeof g.h1 === 'string';
  }) : [];
  // My Shop categories: the words people type about each problem, so Pip can recommend the right products.
  var CATEGORIES = Array.isArray(CFG.categories) ? CFG.categories.filter(function (c) {
    return c && typeof c.id === 'string' && typeof c.name === 'string' && Array.isArray(c.words);
  }) : [];
  var askStarted = false, askBusy = false;
  var finePointer = (function () { try { return window.matchMedia('(pointer: fine)').matches; } catch (e) { return false; } })();
  var PIP_FACE = '<svg class="avatar" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 22 C32 17 32 14 32 11" stroke="#4e9a46" stroke-width="2.6" stroke-linecap="round" fill="none"/>' +
    '<ellipse cx="26.5" cy="10.5" rx="6" ry="3" transform="rotate(-24 26.5 10.5)" fill="#7fd06a"/><ellipse cx="37.5" cy="9.5" rx="6" ry="3" transform="rotate(24 37.5 9.5)" fill="#62bb57"/>' +
    '<path d="M32 21c11 0 18 8 18 18 0 11-8 17-18 17S14 50 14 39c0-10 7-18 18-18z" fill="#bfe8a6"/>' +
    '<ellipse cx="25.5" cy="36.5" rx="2.8" ry="3.2" fill="#23331f"/><ellipse cx="38.5" cy="36.5" rx="2.8" ry="3.2" fill="#23331f"/>' +
    '<path d="M29 42.5q3 2.6 6 0" stroke="#23331f" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
  var PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="#fffaf0"/></svg>';

  // The person's own numbers, so "what's next?" gets a real answer.
  function askCtx() {
    var total = L.totalMin(S), st = L.streakInfo(S.days, now()).current, p = L.progressToNext(total);
    return {
      products: SHELF, categories: CATEGORIES, guides: GUIDES, hasSocial: OWN_LINKS.length > 0,
      streak: st + (st === 1 ? ' day' : ' days'), total: L.fmtDuration(S.totalMs),
      next: p.next ? p.next.name + ', ' + Math.max(1, Math.ceil(p.next.at - total)) + ' min away' : 'nothing left, your island is complete'
    };
  }
  function askScroll(node) {
    var log = el.askLog;
    if (node.offsetHeight > log.clientHeight - 24) log.scrollTop = Math.max(0, node.offsetTop - 6);   // long answer: show its start
    else log.scrollTop = log.scrollHeight;
  }
  function askTrim() { while (el.askLog.children.length > 80) el.askLog.removeChild(el.askLog.firstChild); }
  function askUserMsg(text) {
    var m = document.createElement('div'); m.className = 'msg me';
    var b = document.createElement('div'); b.className = 'bubble'; b.textContent = text;
    var sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = 'You said: ';
    b.insertBefore(sr, b.firstChild);
    m.appendChild(b); el.askLog.appendChild(m); askScroll(m);
  }
  function chatCard(p) {
    var a = shelfAnchor(p, 'chat-card');
    var th = document.createElement('span'); th.className = 'thumb';
    var im = document.createElement('img'); im.src = p.image; im.alt = ''; im.width = 960; im.height = 540; im.loading = 'lazy';
    th.appendChild(im);
    if (p.type === 'video' || p.type === 'course') { var pl = document.createElement('span'); pl.className = 'play'; pl.innerHTML = PLAY_ICON; th.appendChild(pl); }
    var info = document.createElement('span'); info.className = 'info';
    var k = document.createElement('small'); k.textContent = (p.ad ? 'Ad \u00B7 ' : '') + (p.kicker || TYPE_LABEL[p.type] || 'Take a look');
    var t = document.createElement('b'); t.textContent = p.title;
    var buy = document.createElement('span'); buy.className = 'buy';
    var pr = document.createElement('em'); pr.textContent = priceText(p); if (p.free) pr.className = 'free';
    var cta = document.createElement('span'); cta.textContent = (p.cta || 'Take a look') + ' →';
    buy.appendChild(pr); buy.appendChild(cta);
    info.appendChild(k); info.appendChild(t); info.appendChild(buy);
    a.appendChild(th); a.appendChild(info);
    a.setAttribute('aria-label', p.title + (priceText(p) ? ', ' + priceText(p) : '') + ' (opens in a new tab)');
    return a;
  }
  function chatLink(label, href, soft, newTab) {
    var a = document.createElement('a'); a.className = 'chat-act' + (soft ? ' soft' : ''); a.href = href; a.textContent = label;
    if (newTab) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  }
  function askActions(r) {
    var row = document.createElement('div'); row.className = 'chat-acts';
    r.acts.forEach(function (id, i) {
      if (id === 'follow') {
        OWN_LINKS.forEach(function (x) { row.appendChild(chatLink(SOCIAL_ICON[x.platform] + ' ' + (x.label || SOCIAL_NAME[x.platform]), x.url, true, true)); });
      } else if (id === 'call-14416') row.appendChild(chatLink(H.ACTIONS[id], 'tel:14416', false, false));
      else if (id === 'helplines') row.appendChild(chatLink(H.ACTIONS[id], 'https://findahelpline.com/', true, true));
      else {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'chat-act' + (i ? ' soft' : ''); b.textContent = H.ACTIONS[id];
        b.addEventListener('click', function () { askRun(id); });
        row.appendChild(b);
      }
    });
    r.guides.forEach(function (g) { row.appendChild(chatLink('📖 ' + g.h1, '/guides/' + g.slug + '/', true, false)); });
    return row.children.length ? row : null;
  }
  function askBotMsg(r) {
    var m = document.createElement('div'); m.className = 'msg bot';
    m.insertAdjacentHTML('beforeend', PIP_FACE);   // fixed markup of our own, never typed text
    var b = document.createElement('div'), list = null;
    b.className = 'bubble';
    var sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = 'Pip says: '; b.appendChild(sr);
    r.say.forEach(function (line) {
      if (line.indexOf('• ') === 0) {
        if (!list) { list = document.createElement('ul'); b.appendChild(list); }
        var li = document.createElement('li'); li.textContent = line.slice(2); list.appendChild(li);
      } else {
        list = null;
        var p = document.createElement('p'); p.textContent = line; b.appendChild(p);
      }
    });
    if (r.products.length) {
      if (r.pre) { var pre = document.createElement('p'); pre.className = 'pre'; pre.textContent = r.pre; b.appendChild(pre); }
      r.products.forEach(function (p) { b.appendChild(chatCard(p)); });
    }
    var acts = askActions(r);
    if (acts) b.appendChild(acts);
    m.appendChild(b);
    el.askLog.appendChild(m);
    if (r.chips.length) {
      var row = document.createElement('div'); row.className = 'chat-chips'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Quick answers');
      r.chips.forEach(function (c) {
        var bt = document.createElement('button'); bt.type = 'button'; bt.textContent = c.label;
        bt.addEventListener('click', function () { askSend(c.label, c); });
        row.appendChild(bt);
      });
      el.askLog.appendChild(row);
    }
    askTrim();
    askScroll(m);
  }
  // chip: a tapped button ({ topic } or { cat }) is answered directly, without guessing from the words.
  function askSend(text, chip) {
    if (askBusy) return false;
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!text) return false;
    Array.prototype.forEach.call(el.askLog.querySelectorAll('.chat-chips'), function (c) { c.parentNode.removeChild(c); });
    askUserMsg(text);
    var ctx = askCtx();
    var r = chip && chip.cat ? H.replyCategory(chip.cat, ctx) : chip && chip.topic ? H.replyTopic(chip.topic, ctx) : H.reply(text, ctx);
    askBusy = true;
    var dots = document.createElement('div'); dots.className = 'msg bot typing'; dots.setAttribute('aria-hidden', 'true');
    dots.innerHTML = PIP_FACE + '<div class="bubble"><i></i><i></i><i></i></div>';
    el.askLog.appendChild(dots); askScroll(dots);
    setTimeout(function () {
      if (dots.parentNode) dots.parentNode.removeChild(dots);
      askBusy = false;
      askBotMsg(r);
    }, isCalm() ? 120 : 550);
    return true;
  }
  // Buttons under an answer: start a timer, open a screen, save a backup...
  function askRun(id) {
    var st = /^start-(\d+)$/.exec(id), set = /^set-(\d+)-(\d+)$/.exec(id), m = mode();
    if (st) {
      closeSheet();
      if (m === 'focus' || m === 'paused') { toast('You’re already focusing. Keep going! 🌱'); return; }
      if (m === 'break') finishBreak(false);
      startFocus(+st[1], +st[1] === 2);
      return;
    }
    if (set) {
      S.settings.focusMin = +set[1]; S.settings.breakMin = +set[2]; save(); renderPanel();
      closeSheet();
      toast('Timer set: ' + set[1] + ' min focus + ' + set[2] + ' min break. Tap Grow when you’re ready! 🌱');
      return;
    }
    if (id === 'sounds') { ensureAudio(); buildSounds(); openSheet('sheetSounds'); }
    else if (id === 'settings') { syncSettingsUI(); openSheet('sheetMenu'); }
    else if (id === 'custom') { syncSettingsUI(); openSheet('sheetCustom'); }
    else if (id === 'progress') { renderProgress(); openSheet('sheetProgress'); }
    else if (id === 'scenes') { renderScenes(); openSheet('sheetScenes'); }
    else if (id === 'tools') { renderTools(); openSheet('sheetTools'); }
    else if (id === 'share') { closeSheet(true); openShare(); }
    else if (id === 'backup') exportBackup();
  }
  // Phones: keep the chat above the on-screen keyboard.
  function fitChat() {
    var sh = $('sheetAsk'), vv = window.visualViewport;
    if (!vv || window.innerWidth >= 900) { sh.style.bottom = ''; sh.style.height = ''; return; }
    var kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    if (kb > 80) { sh.style.bottom = kb + 'px'; sh.style.height = Math.max(240, Math.floor(vv.height) - 8) + 'px'; }
    else { sh.style.bottom = ''; sh.style.height = ''; }
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
      if (openSheetEl && openSheetEl.id === 'sheetAsk') { fitChat(); el.askLog.scrollTop = el.askLog.scrollHeight; }
    });
  }
  function openAsk() {
    var m = mode();
    if (m === 'focus' || m === 'paused') { toast('Pip will be right here after your session 🌱'); return; }
    hidePromo();
    if (!askStarted) { askStarted = true; askBotMsg(H.welcome()); }
    openSheet('sheetAsk');
    fitChat();
    if (finePointer) setTimeout(function () { if (openSheetEl && openSheetEl.id === 'sheetAsk') el.askInput.focus({ preventScroll: true }); }, 120);
  }
  el.askForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (askSend(el.askInput.value)) el.askInput.value = '';
  });
  el.askBtn.addEventListener('click', openAsk);
  Array.prototype.forEach.call(document.querySelectorAll('[data-ask]'), function (b) { b.addEventListener('click', openAsk); });

  // ---------- wiring ----------
  el.startBtn.addEventListener('click', function () { startFocus(); });
  el.tinyBtn.addEventListener('click', function () { startFocus(2, true); });
  el.pauseBtn.addEventListener('click', pauseToggle);
  el.stopBtn.addEventListener('click', stopFocus);
  el.skipBreakBtn.addEventListener('click', function () { finishBreak(false); });
  Array.prototype.forEach.call(el.lengths.querySelectorAll('button[data-min]'), function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-min');
      if (v === 'custom') { syncSettingsUI(); openSheet('sheetCustom'); return; }
      S.settings.focusMin = +v; saveSoon(); renderPanel();
    });
  });
  el.soundBtn.addEventListener('click', function () { ensureAudio(); buildSounds(); openSheet('sheetSounds'); });
  el.progressBtn.addEventListener('click', function () { renderProgress(); openSheet('sheetProgress'); });
  el.streakBtn.addEventListener('click', function () { renderProgress(); openSheet('sheetProgress'); });
  el.shareBtn.addEventListener('click', openShare);
  el.menuBtn.addEventListener('click', function () { syncSettingsUI(); openSheet('sheetMenu'); });
  el.toolsBtn.addEventListener('click', function () { hidePromo(); renderTools(); openSheet('sheetTools'); });
  el.aboutBtn.addEventListener('click', function () { openSheet('sheetAbout'); });
  el.promoLink.addEventListener('click', function (e) {
    promoDismissed = true; hidePromo();
    if (promoItem && askFields(promoItem)) { e.preventDefault(); openLead(promoItem); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (openSheetEl) { e.preventDefault(); closeSheet(); }
      else if (!el.onboard.hidden) endOnboard();
      else if (!el.pip.hidden) hidePip();
      return;
    }
    if (e.key === 'Tab' && openSheetEl) { trapTab(e); return; }
    if ((e.key === ' ' || e.code === 'Space') && !openSheetEl && el.onboard.hidden) {
      var tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'A' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      var m = mode();
      if (m === 'idle') startFocus(); else if (m === 'focus' || m === 'paused') pauseToggle();
    }
  });
  document.addEventListener('visibilitychange', function () {
    var t = now(), s = S.session;
    if (audioReady) engine.setHidden(document.hidden);
    if (document.hidden) {
      if (s && s.strict && s.kind === 'focus' && s.pausedAt == null) { s.hiddenAt = t; save(); }
      return;
    }
    if (s && s.hiddenAt != null) {
      if (t - s.hiddenAt > STRICT_GRACE) { wilt(); return; }
      s.hiddenAt = null; s.lastSeen = t; save();
    }
    if (S.session) requestWake();
    tick();
  });
  window.addEventListener('pagehide', save);
  var resizeTimer = null;
  function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(layoutWorld, 60); }
  window.addEventListener('resize', onResize);
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(el.panel);
  try { window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', layoutWorld); } catch (e) { /* old browsers */ }

  // ---------- start ----------
  try { localStorage.setItem(KEY + ':probe', '1'); localStorage.removeItem(KEY + ':probe'); } catch (e) { storageOk = false; }
  S.seen = L.unlocked(L.totalMin(S)).map(function (i) { return i.id; });
  resolveOnLoad();
  // One-tap timer links from the study guides, e.g. /?focus=50&break=10 (never changes a running session).
  var presetMsg = '';
  (function applyLinkPreset() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (!q.has('focus')) return;
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* the link stays visible; harmless */ }
    var f = parseInt(q.get('focus'), 10), b = parseInt(q.get('break'), 10);
    if (!(f >= 1 && f <= 180) || S.session) return;
    S.settings.focusMin = f;
    if (b >= 1 && b <= 60) S.settings.breakMin = b; else b = 0;
    save();
    presetMsg = 'Timer set: ' + f + ' min focus' + (b ? ' + ' + b + ' min break' : '') + '. Tap Grow when you\u2019re ready! \uD83C\uDF31';
  })();
  renderAll();
  layoutWorld();
  requestAnimationFrame(loop);
  setInterval(tick, 250);
  if (S.session) requestWake();
  if (mode() === 'break') schedulePromo(1500);
  renderSceneBtn();
  (function announceScene() {
    var today = L.dateKey(now());
    if (S.settings.scene !== 'daily' || S.sceneDay === today) return;
    var first = !S.sceneDay;
    S.sceneDay = today; save();
    if (!S.onboarded || first) return;
    var sc = L.sceneById(L.currentScene(S, now()));
    setTimeout(function () {
      toast('Today\u2019s scene: ' + sc.icon + ' ' + sc.name);
      el.sceneBtn.classList.remove('new'); void el.sceneBtn.offsetWidth; el.sceneBtn.classList.add('new');
    }, 1400);
  })();
  if (!S.onboarded) setTimeout(function () { showOnboard(0); }, 500);
  else if (presetMsg) setTimeout(function () { toast(presetMsg); }, 700);
  if (CFG.pwa && 'serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () { /* offline mode unavailable */ }); });
  }
  window.__fw = { state: function () { return S; }, world: world, engine: engine };
})();
