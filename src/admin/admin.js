/* Focus World — My Shop page (the owner's private product editor at /admin/).
   Uses the shared rules (validateCatalog, slugify, youtubeId, isUrl, LIMITS) placed above this script by build.py.
   Flow: log in -> load the shop file from GitHub -> edit (kept as a draft on this device) -> Publish -> one GitHub
   commit -> Cloudflare rebuilds the site -> this page watches /version.json and says "Live!" when it is. */
(function () {
  'use strict';
  const DRAFT_KEY = 'fw-myshop-draft-v1';
  const PENDING_KEY = 'fw-myshop-pending-v1';
  const $ = (id) => document.getElementById(id);
  const APP_NAME_SHOP = (document.title.split('·')[1] || 'Focus World').trim();
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const KINDS = [
    ['ebook', '📘', 'Ebook', 'Read it'],
    ['app', '📱', 'App', 'Open the app'],
    ['website', '🌐', 'Website', 'Visit'],
    ['course', '🎓', 'Video course', 'Start learning'],
    ['video', '▶️', 'YouTube video', 'Watch now'],
    ['template', '🧩', 'Template', 'Get it'],
    ['tool', '🛠️', 'Tool', 'Try it'],
    ['kit', '🎁', 'Kit', 'Peek inside'],
    ['group', '💬', 'Group', 'Join the group'],
    ['social', '📣', 'Social page', 'Follow']
  ];
  const GATE_HINT = {
    '': 'The button opens your link straight away.',
    form: 'Visitors see a short form first, then your link opens. They can skip it. You see their details in the Leads tab.'
  };
  const ASK_NAME = { name: 'Name', phone: 'WhatsApp number', email: 'Email' };
  const KIND = {};
  KINDS.forEach((k) => { KIND[k[0]] = { icon: k[1], name: k[2], cta: k[3] }; });
  const PLAT = {
    youtube: ['▶️', 'YouTube', /(^|\.)(youtube\.com|youtu\.be)$/],
    instagram: ['📸', 'Instagram', /(^|\.)instagram\.com$/],
    facebook: ['👍', 'Facebook', /(^|\.)(facebook\.com|fb\.com)$/],
    x: ['✖️', 'X', /(^|\.)(x\.com|twitter\.com)$/],
    threads: ['🧵', 'Threads', /(^|\.)threads\.(net|com)$/],
    linkedin: ['💼', 'LinkedIn', /(^|\.)linkedin\.com$/],
    tiktok: ['🎵', 'TikTok', /(^|\.)tiktok\.com$/],
    telegram: ['✈️', 'Telegram', /(^|\.)(t\.me|telegram\.me)$/],
    whatsapp: ['💬', 'WhatsApp', /(^|\.)(wa\.me|whatsapp\.com)$/],
    pinterest: ['📌', 'Pinterest', /(^|\.)pinterest\.[a-z.]+$/],
    website: ['🌐', 'Website', null]
  };
  // Quick picks for a category's emoji (any emoji can also be typed).
  const EMOJIS = ['📚', '🗣️', '🎓', '💼', '💰', '🏪', '🎬', '💻', '⏱️', '🧘', '🌐', '🎨', '🧠', '💡', '❤️', '🏋️',
    '🍳', '✈️', '🏠', '👶', '🐾', '🎮', '📈', '🌱'];

  // ---------- state ----------
  const S = {
    catalog: null,       // what you are editing
    published: '',       // the shop as it is on GitHub (JSON text) — to count changes
    baseSha: '',         // version id of the shop file we started from
    uploads: {},         // new pictures: path -> GitHub blob id
    previews: {},        // new pictures: path -> data URL (so they show before the site rebuilds)
    pending: null        // { commit, at } a publish we are waiting to see live
  };
  const clone = (x) => JSON.parse(JSON.stringify(x));

  // ---------- small UI helpers ----------
  let toastTimer = 0;
  function toast(text, ms) {
    const t = $('toast');
    t.textContent = text; t.hidden = false;
    t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2600);
  }
  let dlgResolve = null, dlgReturn = null;
  function ask(o) {
    return new Promise((resolve) => {
      dlgReturn = document.activeElement;
      $('dlgEmoji').textContent = o.emoji || '';
      $('dlgTitle').textContent = o.title;
      $('dlgText').textContent = o.text || '';
      $('dlgYes').textContent = o.yes || 'OK';
      $('dlgNo').textContent = o.no || 'Cancel';
      $('dlgNo').hidden = o.no === null;
      $('scrim').hidden = false; $('dialog').hidden = false;
      dlgResolve = resolve;
      $('dlgYes').focus();
    });
  }
  function closeDialog(v) {
    $('scrim').hidden = true; $('dialog').hidden = true;
    const r = dlgResolve; dlgResolve = null;
    if (dlgReturn && dlgReturn.focus) dlgReturn.focus();
    if (r) r(v);
  }
  $('dlgYes').addEventListener('click', () => closeDialog(true));
  $('dlgNo').addEventListener('click', () => closeDialog(false));
  $('scrim').addEventListener('click', () => closeDialog(false));

  function busy(btn, on) { btn.classList.toggle('busy', on); btn.disabled = on; }

  async function api(method, path, body, raw) {
    const opt = { method: method, headers: {}, credentials: 'same-origin', cache: 'no-store' };
    if (body !== undefined) {
      opt.body = raw ? body : JSON.stringify(body);
      opt.headers['Content-Type'] = raw ? 'text/plain' : 'application/json';
    }
    let res;
    try { res = await fetch('/admin/api/' + path, opt); }
    catch (e) { const err = new Error('No internet? Check your connection and try again.'); err.code = 'offline'; throw err; }
    if (res.ok && (res.headers.get('Content-Type') || '').indexOf('json') < 0) return res;
    let data = {};
    try { data = await res.json(); } catch (e) { data = { message: 'Unexpected answer from the server.' }; }
    if (!res.ok) {
      const err = new Error(data.message || 'Something went wrong.');
      err.code = data.error || 'server'; err.status = res.status; err.details = data.details || [];
      if (res.status === 401 && path !== 'login') showLogin(path === 'me' ? '' : 'Please log in again. Your changes are kept on this phone.');
      throw err;
    }
    return data;
  }

  // ---------- confetti (small, and skipped for reduced motion) ----------
  function confetti() {
    if (reduceMotion) return;
    const cv = $('confetti'), c = cv.getContext('2d');
    const W = cv.width = innerWidth, H = cv.height = innerHeight;
    const cols = ['#ffc66d', '#9fe3b8', '#ff9a8a', '#8fc8ff', '#f8f5ee'];
    const ps = Array.from({ length: 90 }, () => ({
      x: W / 2, y: H * 0.35, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 11 - 3,
      r: 3 + Math.random() * 4, col: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6, life: 1
    }));
    let last = performance.now();
    function step(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      c.clearRect(0, 0, W, H);
      let alive = 0;
      ps.forEach((p) => {
        p.vy += 22 * dt; p.x += p.vx * 60 * dt; p.y += p.vy * 60 * dt; p.a += 6 * dt; p.life -= 0.45 * dt;
        if (p.life <= 0 || p.y > H + 20) return;
        alive++;
        c.globalAlpha = Math.max(0, p.life);
        c.fillStyle = p.col;
        c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); c.restore();
      });
      if (alive) requestAnimationFrame(step); else c.clearRect(0, 0, W, H);
    }
    requestAnimationFrame(step);
  }

  // ---------- login ----------
  function showLogin(message) {
    $('app').hidden = true; $('editor').hidden = true; $('linkEditor').hidden = true;
    $('login').hidden = false;
    $('loginMsg').textContent = message || '';
    $('loginMsg').className = 'msg';
    setTimeout(() => $('pw').focus(), 50);
  }
  $('pwShow').addEventListener('click', () => {
    const show = $('pw').type === 'password';
    $('pw').type = show ? 'text' : 'password';
    $('pwShow').textContent = show ? 'Hide' : 'Show';
    $('pwShow').setAttribute('aria-pressed', String(show));
    $('pwShow').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  $('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('pw').value;
    if (!pw) { $('loginMsg').textContent = 'Type your password first.'; $('pw').focus(); return; }
    busy($('loginBtn'), true);
    $('loginMsg').textContent = '';
    try {
      await api('POST', 'login', { password: pw });
      $('pw').value = '';
      document.querySelector('.login .mascot').classList.add('happy');
      $('loginMsg').className = 'msg good';
      $('loginMsg').textContent = 'Yay, come on in!';
      setTimeout(loadShop, reduceMotion ? 0 : 500);
    } catch (err) {
      $('loginMsg').className = 'msg';
      $('loginMsg').textContent = err.code === 'wrong_password' ? 'Hmm, that’s not it. Try again?' : err.message;
      const card = $('loginForm'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      $('pw').select();
    } finally { busy($('loginBtn'), false); }
  });

  // ---------- drafts (unpublished changes stay on this device) ----------
  function saveDraft() {
    const changed = changes().length > 0;
    try {
      if (!changed) { localStorage.removeItem(DRAFT_KEY); return; }
      const used = usedUploads();
      const d = { baseSha: S.baseSha, catalog: S.catalog, uploads: used, previews: {} };
      Object.keys(used).forEach((p) => { if (S.previews[p]) d.previews[p] = S.previews[p]; });
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); }
      catch (e) { d.previews = {}; localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); }
    } catch (e) { /* private mode: drafts just are not kept */ }
  }
  function readDraft() {
    try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return d && d.catalog && d.baseSha ? d : null; } catch (e) { return null; }
  }
  function usedUploads() {
    const out = {};
    (S.catalog.items || []).forEach((it) => { if (S.uploads[it.image]) out[it.image] = S.uploads[it.image]; });
    return out;
  }

  // ---------- what changed ----------
  function changes() {
    if (!S.catalog || !S.published) return [];
    const before = JSON.parse(S.published), out = [];
    const old = {}, now = {};
    before.items.forEach((it) => { old[it.id] = it; });
    S.catalog.items.forEach((it) => { now[it.id] = it; });
    S.catalog.items.forEach((it) => {
      const o = old[it.id];
      if (!o) out.push('Added “' + it.title + '”');
      else if (JSON.stringify(o) !== JSON.stringify(it)) {
        if (!!o.hidden !== !!it.hidden && JSON.stringify(Object.assign({}, o, { hidden: !!it.hidden })) === JSON.stringify(Object.assign({}, it, { hidden: !!it.hidden }))) {
          out.push((it.hidden ? 'Hid' : 'Showed') + ' “' + it.title + '”');
        } else out.push('Edited “' + it.title + '”');
      }
    });
    before.items.forEach((it) => { if (!now[it.id]) out.push('Removed “' + it.title + '”'); });
    const ids = (list) => list.filter((it) => old[it.id] && now[it.id]).map((it) => it.id).join(',');
    if (ids(before.items) !== ids(S.catalog.items)) out.push('New order');
    if (JSON.stringify(before.social || []) !== JSON.stringify(S.catalog.social || [])) out.push('Small links');
    if (JSON.stringify(before.categories || []) !== JSON.stringify(S.catalog.categories || [])) out.push('Categories');
    return out;
  }
  function changedIds() {
    const before = JSON.parse(S.published || '{"items":[]}'), old = {};
    before.items.forEach((it) => { old[it.id] = JSON.stringify(it); });
    const out = {};
    S.catalog.items.forEach((it) => { out[it.id] = !old[it.id] ? 'new' : (old[it.id] !== JSON.stringify(it) ? 'edited' : ''); });
    return out;
  }

  // ---------- status chip ----------
  function setStatus(kind, text) {
    const s = $('status');
    s.className = 'status ' + kind;
    s.querySelector('span').textContent = text;
  }
  function refreshStatus() {
    const n = changes().length;
    if (S.pending) setStatus('busy', 'Going live… about 2 min');
    else if (n) setStatus('draft', n === 1 ? '1 change not published' : n + ' changes not published');
    else setStatus('live', 'All live');
    const bar = $('publishBar');
    bar.hidden = n === 0;
    $('changeCount').textContent = n === 1 ? '1 change' : n + ' changes';
  }
  let pollTimer = 0;
  async function checkLive() {
    clearTimeout(pollTimer);
    if (!S.pending) return;
    try {
      const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
      const v = await res.json();
      if (v.commit && v.commit === S.pending.commit) {
        S.pending = null;
        try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* fine */ }
        refreshStatus();
        setStatus('live', 'Live now! 🎉');
        confetti();
        toast('It’s live! 🎉 Open your site to see it.', 4000);
        return;
      }
    } catch (e) { /* offline for a moment: keep trying */ }
    if (Date.now() - S.pending.at > 10 * 60 * 1000) {
      setStatus('bad', 'Still building… tap to check');
      return;
    }
    refreshStatus();
    pollTimer = setTimeout(checkLive, 8000);
  }
  $('status').addEventListener('click', () => {
    if (S.pending) { setStatus('busy', 'Checking…'); S.pending.at = Date.now(); checkLive(); }
  });

  // ---------- load ----------
  async function loadShop(opts) {
    $('login').hidden = true; $('app').hidden = false;
    setStatus('busy', 'Loading your shop…');
    let data;
    try { data = await api('GET', 'catalog'); }
    catch (err) {
      if (err.status === 401) return;
      setStatus('bad', 'Could not load');
      await ask({ emoji: '😕', title: 'Could not open your shop', text: err.message, yes: 'Try again', no: null });
      return loadShop(opts);
    }
    S.published = JSON.stringify(data.catalog);
    S.baseSha = data.sha;
    S.catalog = clone(data.catalog);
    if (!Array.isArray(S.catalog.social)) S.catalog.social = [];
    if (!Array.isArray(S.catalog.categories)) S.catalog.categories = [];
    S.uploads = {}; S.previews = {};
    try { S.pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (e) { S.pending = null; }
    const d = (opts && opts.fresh) ? null : readDraft();
    if (d) {
      if (d.baseSha === S.baseSha) {
        S.catalog = d.catalog; S.uploads = d.uploads || {}; S.previews = d.previews || {};
        if (!Array.isArray(S.catalog.categories)) S.catalog.categories = [];
        const n = changes().length;
        if (n) toast('Welcome back! Your ' + (n === 1 ? 'unpublished change is' : n + ' unpublished changes are') + ' still here ✨', 3500);
      } else {
        const keep = await ask({
          emoji: '🤔', title: 'Your shop changed since your last visit',
          text: 'You have changes on this phone that were never published, but the shop on GitHub is newer. Keep your changes (they will replace the newer shop when you publish), or start from the newest shop?',
          yes: 'Keep my changes', no: 'Use the newest'
        });
        if (keep) {
          S.catalog = d.catalog; S.uploads = d.uploads || {}; S.previews = d.previews || {};
          if (!Array.isArray(S.catalog.categories)) S.catalog.categories = [];
        }
        else { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* fine */ } }
      }
    }
    render();
    if (S.pending) checkLive();
  }

  // ---------- lists ----------
  function picSrc(path) { return S.previews[path] || ('/' + path); }
  function makePic(path, cls) {
    const box = document.createElement('span'); box.className = cls;
    const im = document.createElement('img');
    im.alt = ''; im.loading = 'lazy'; im.src = picSrc(path);
    im.addEventListener('error', () => { im.remove(); const ph = document.createElement('span'); ph.className = 'ph'; ph.textContent = '🖼️'; box.appendChild(ph); });
    box.appendChild(im);
    return box;
  }
  function toolBtn(label, aria, on, fn, dir) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    if (dir) b.dataset.dir = dir;
    b.setAttribute('aria-label', aria);
    if (on !== null) { b.setAttribute('aria-pressed', String(!!on)); if (on) b.classList.add('on'); }
    b.addEventListener('click', fn);
    return b;
  }
  function move(list, i, d, after) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const t = list[i]; list[i] = list[j]; list[j] = t;
    commit(); after(j);
  }
  function commit() { saveDraft(); render(); }
  let flashId = '';
  function render() {
    const items = S.catalog.items, ch = changedIds();
    $('countProducts').textContent = items.length;
    $('countLinks').textContent = S.catalog.social.length;
    $('countCats').textContent = S.catalog.categories.length;
    const list = $('productList');
    list.textContent = '';
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'row' + (it.hidden ? ' hiddenp' : '') + (ch[it.id] ? ' changed' : '') + (flashId === it.id ? ' flash' : '');
      row.style.animationDelay = Math.min(i * 40, 300) + 'ms';
      const th = document.createElement('button'); th.type = 'button'; th.className = 'thumb'; th.setAttribute('aria-label', 'Edit ' + it.title);
      th.appendChild(makePic(it.image, 'thumbpic'));
      th.querySelector('.thumbpic').style.cssText = 'position:absolute;inset:0';
      th.addEventListener('click', () => openEditor(i, th));
      const info = document.createElement('div'); info.className = 'info';
      const b = document.createElement('b'); b.textContent = it.title;
      const meta = document.createElement('div'); meta.className = 'meta';
      const add = (t, c) => { const x = document.createElement('i'); x.textContent = t; if (c) x.className = c; meta.appendChild(x); };
      add((KIND[it.type] ? KIND[it.type].icon + ' ' + KIND[it.type].name : it.type));
      add(it.free ? 'Free' : it.noPrice ? 'No price' : it.price, it.free ? 'free' : '');
      if (it.ask) add('📝 Asks details');
      if (it.ad) add('Ad', 'ad');
      const cs = (it.categories || []).map(catById).filter(Boolean);
      if (cs.length) {
        add(cs.map((c) => c.emoji || '🏷️').join(' '), 'cats');
        meta.lastChild.title = cs.map((c) => c.name).join(', ');
        meta.lastChild.setAttribute('aria-label', 'Categories: ' + meta.lastChild.title);
      }
      if (it.hidden) add('Hidden');
      if (ch[it.id] === 'new') add('New', 'new'); else if (ch[it.id] === 'edited') add('Edited', 'new');
      info.appendChild(b); info.appendChild(meta);
      const tools = document.createElement('div'); tools.className = 'tools';
      tools.appendChild(toolBtn(it.featured ? '⭐ Featured' : '☆ Feature', 'Show "' + it.title + '" on the break card', it.featured, () => {
        it.featured = !it.featured; if (!it.featured) delete it.featured; flashId = it.id; commit();
        toast(it.featured ? 'It can pop up during breaks now ⭐' : 'Off the break card');
      }));
      tools.appendChild(toolBtn(it.hidden ? '🙈 Hidden' : '👁️ Shown', (it.hidden ? 'Show ' : 'Hide ') + '"' + it.title + '"', !it.hidden, () => {
        if (it.hidden) delete it.hidden; else it.hidden = true; flashId = it.id; commit();
        toast(it.hidden ? 'Hidden. It stays in your list.' : 'Back in the shop 👋');
      }));
      tools.appendChild(toolBtn('↑', 'Move "' + it.title + '" up', null, () => move(items, i, -1, (j) => focusRow(j, 'up')), 'up'));
      tools.appendChild(toolBtn('↓', 'Move "' + it.title + '" down', null, () => move(items, i, 1, (j) => focusRow(j, 'down')), 'down'));
      const ed = toolBtn('Edit', 'Edit "' + it.title + '"', null, () => openEditor(i, ed)); ed.className = 'edit';
      tools.appendChild(ed);
      row.appendChild(th); row.appendChild(info); row.appendChild(tools);
      list.appendChild(row);
    });
    flashId = '';
    $('productsEmpty').hidden = items.length > 0;
    const ll = $('linkList');
    ll.textContent = '';
    S.catalog.social.forEach((s, i) => {
      const row = document.createElement('div'); row.className = 'row link';
      const th = document.createElement('button'); th.type = 'button'; th.className = 'thumb'; th.textContent = (PLAT[s.platform] || PLAT.website)[0];
      th.setAttribute('aria-label', 'Edit ' + (s.label || (PLAT[s.platform] || PLAT.website)[1]));
      th.addEventListener('click', () => openLink(i, th));
      const info = document.createElement('div'); info.className = 'info';
      const b = document.createElement('b'); b.textContent = s.label || (PLAT[s.platform] || PLAT.website)[1];
      const u = document.createElement('div'); u.className = 'meta'; const ui = document.createElement('i'); ui.textContent = s.url.replace(/^https:\/\//, ''); u.appendChild(ui);
      if (s.friend) { const fi = document.createElement('i'); fi.textContent = 'Someone else’s'; u.appendChild(fi); }
      if (s.ad) { const ai = document.createElement('i'); ai.className = 'ad'; ai.textContent = 'Ad'; u.appendChild(ai); }
      info.appendChild(b); info.appendChild(u);
      const tools = document.createElement('div'); tools.className = 'tools';
      tools.appendChild(toolBtn('↑', 'Move up', null, () => move(S.catalog.social, i, -1, () => {})));
      tools.appendChild(toolBtn('↓', 'Move down', null, () => move(S.catalog.social, i, 1, () => {})));
      const ed = toolBtn('Edit', 'Edit link', null, () => openLink(i, ed)); ed.className = 'edit';
      tools.appendChild(ed);
      row.appendChild(th); row.appendChild(info); row.appendChild(tools);
      ll.appendChild(row);
    });
    $('linksEmpty').hidden = S.catalog.social.length > 0;
    const cl = $('catList');
    cl.textContent = '';
    S.catalog.categories.forEach((c, i) => {
      const n = S.catalog.items.filter((it) => (it.categories || []).indexOf(c.id) >= 0).length;
      const row = document.createElement('div'); row.className = 'row link cat';
      const th = document.createElement('button'); th.type = 'button'; th.className = 'thumb'; th.textContent = c.emoji || '🏷️';
      th.setAttribute('aria-label', 'Edit ' + c.name);
      th.addEventListener('click', () => openCat(i, th));
      const info = document.createElement('div'); info.className = 'info';
      const b = document.createElement('b'); b.textContent = c.name;
      const meta = document.createElement('div'); meta.className = 'meta';
      const pi = document.createElement('i'); pi.textContent = n === 1 ? '1 product' : n + ' products'; if (n) pi.className = 'free';
      const wi = document.createElement('i'); wi.textContent = c.words.length + ' words';
      meta.appendChild(pi); meta.appendChild(wi);
      info.appendChild(b); info.appendChild(meta);
      const tools = document.createElement('div'); tools.className = 'tools';
      const ed = toolBtn('Edit', 'Edit "' + c.name + '"', null, () => openCat(i, ed)); ed.className = 'edit';
      tools.appendChild(ed);
      row.appendChild(th); row.appendChild(info); row.appendChild(tools);
      cl.appendChild(row);
    });
    $('catsEmpty').hidden = S.catalog.categories.length > 0;
    refreshStatus();
  }
  function catById(id) { return (S.catalog.categories || []).find((c) => c.id === id) || null; }
  function focusRow(j, dir) {
    const rows = $('productList').querySelectorAll('.row');
    const b = rows[j] && rows[j].querySelector('[data-dir="' + dir + '"]');
    if (b) b.focus();
  }

  // tabs
  const TABS = [['products', 'tabProducts', 'paneProducts'], ['links', 'tabLinks', 'paneLinks'], ['cats', 'tabCats', 'paneCats'],
    ['leads', 'tabLeads', 'paneLeads']];
  function selectTab(which) {
    TABS.forEach((t) => {
      const on = t[0] === which;
      $(t[1]).setAttribute('aria-selected', String(on)); $(t[1]).tabIndex = on ? 0 : -1; $(t[2]).hidden = !on;
    });
    if (which === 'leads') loadLeads();
  }
  TABS.forEach((t, i) => {
    $(t[1]).addEventListener('click', () => selectTab(t[0]));
    $(t[1]).addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      const n = TABS[(i + d + TABS.length) % TABS.length];
      selectTab(n[0]); $(n[1]).focus();
    });
  });
  selectTab('products');

  // menu
  function toggleMenu(open) {
    $('menu').hidden = !open; $('menuBtn').setAttribute('aria-expanded', String(open));
    if (open) $('menu').querySelector('button').focus();
  }
  $('menuBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu($('menu').hidden); });
  document.addEventListener('click', (e) => { if (!$('menu').hidden && !$('menu').contains(e.target)) toggleMenu(false); });
  $('reloadBtn').addEventListener('click', async () => {
    toggleMenu(false);
    if (changes().length && !(await ask({ emoji: '🔄', title: 'Get the newest shop?', text: 'Your unpublished changes on this phone will be dropped.', yes: 'Get newest', no: 'Keep mine' }))) return;
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* fine */ }
    loadShop({ fresh: true });
  });
  $('logoutBtn').addEventListener('click', async () => {
    toggleMenu(false);
    try { await api('POST', 'logout', {}); } catch (e) { /* logging out anyway */ }
    showLogin('You are logged out. See you soon 👋');
  });
  $('undoAll').addEventListener('click', async () => {
    if (!(await ask({ emoji: '↩️', title: 'Undo all changes?', text: 'Your shop goes back to how it is live right now.', yes: 'Undo all', no: 'Keep them' }))) return;
    S.catalog = JSON.parse(S.published); if (!Array.isArray(S.catalog.social)) S.catalog.social = [];
    if (!Array.isArray(S.catalog.categories)) S.catalog.categories = [];
    commit(); toast('Back to how it was ↩️');
  });

  // ---------- product editor ----------
  let E = null, edIndex = -1, edReturn = null, edDirty = false, srcImage = null, fitMode = 'fill', pendingCover = null, kindTouched = false, priceTouched = false, ctaTouched = false;
  const FIELDS = { title: 'fTitle', hook: 'fHook', text: 'fText', kicker: 'fKicker', cta: 'fCta', price: 'fPrice', url: 'fUrl' };

  function buildKinds() {
    const box = $('kinds'); box.textContent = '';
    KINDS.forEach((k) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.kind = k[0];
      const ic = document.createElement('b'); ic.textContent = k[1]; ic.setAttribute('aria-hidden', 'true');
      const tx = document.createElement('span'); tx.textContent = k[2];
      b.appendChild(ic); b.appendChild(tx);
      b.addEventListener('click', () => { kindTouched = true; setKind(k[0]); bumpPreview(); });
      box.appendChild(b);
    });
    radioKeys(box);
  }
  function radioKeys(box) {
    box.addEventListener('keydown', (e) => {
      const btns = Array.from(box.querySelectorAll('button'));
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      const n = btns[(i + d + btns.length) % btns.length]; n.focus(); n.click();
    });
  }
  function setKind(k) {
    E.type = k;
    $('kinds').querySelectorAll('button').forEach((b) => {
      const on = b.dataset.kind === k;
      b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    });
    $('fCta').placeholder = KIND[k].cta;
    updatePreview();
  }
  function setPreviewPic(src) {
    $('coverImg').src = src; $('coverImg').hidden = !src; $('coverEmpty').hidden = !!src;
    $('fitSeg').hidden = !srcImage;
  }
  function openEditor(i, from) {
    edReturn = from || document.activeElement;
    edIndex = i;
    const isNew = i === null || i < 0;
    E = isNew ? { type: 'ebook', free: false } : clone(S.catalog.items[i]);
    kindTouched = !isNew; priceTouched = !isNew; ctaTouched = !isNew && !!E.cta && E.cta !== (KIND[E.type] || {}).cta;
    srcImage = null; pendingCover = null; fitMode = 'fill'; edDirty = false;
    $('edTitle').textContent = isNew ? 'New product' : 'Edit product';
    Object.keys(FIELDS).forEach((k) => { $(FIELDS[k]).value = E[k] || ''; $(FIELDS[k]).closest('.field').classList.remove('bad'); });
    if (!ctaTouched) $('fCta').value = '';
    $('fFree').checked = !!E.free;
    $('fNoPrice').checked = !!E.noPrice;
    $('fAd').checked = !!E.ad;
    askList = Array.isArray(E.ask) ? E.ask.slice() : [];
    setGate(askList.length ? 'form' : '');
    $('fFeatured').checked = !!E.featured;
    $('fVisible').checked = !E.hidden;
    $('priceField').hidden = !!E.free || !!E.noPrice;
    $('edMsg').textContent = ''; $('urlHint').textContent = ''; $('coverHint').textContent = '';
    $('fFile').value = '';
    renderTags();
    renderCatPick();
    setKind(E.type);
    setPreviewPic(E.image ? picSrc(E.image) : '');
    $('edDelete').hidden = isNew;
    $('ytBtn').hidden = !youtubeId(E.url || '');
    $('fitSeg').querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.fit === 'fill')));
    counters();
    $('editor').hidden = false; $('app').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = 'hidden';
    $('edBody').scrollTop = 0;
    $('edBody').querySelector('.preview-wrap').classList.remove('mini');
    updatePreview();
    setTimeout(() => { (isNew ? $('kinds').querySelector('[aria-checked="true"]') : $('fTitle')).focus(); }, 60);
  }
  async function closeEditor(force) {
    if (!force && edDirty && !(await ask({ emoji: '🤔', title: 'Leave without saving?', text: 'What you typed in this product will be lost.', yes: 'Leave', no: 'Keep editing' }))) return;
    $('editor').hidden = true; $('app').removeAttribute('aria-hidden');
    document.body.style.overflow = '';
    if (edReturn && edReturn.isConnected) edReturn.focus();
  }
  $('addProduct').addEventListener('click', () => openEditor(-1, $('addProduct')));
  $('edCancel').addEventListener('click', () => closeEditor(false));

  // live preview — the same card the Toolshed shows
  let rafPrev = 0;
  function updatePreview() { cancelAnimationFrame(rafPrev); rafPrev = requestAnimationFrame(drawPreview); }
  function bumpPreview() { const p = $('preview'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }
  function drawPreview() {
    const p = $('preview'); p.textContent = '';
    const v = (id) => $(id).value.trim();
    const pic = document.createElement('div'); pic.className = 'cp-pic';
    const src = pendingCover ? pendingCover.dataUrl : (E.image ? picSrc(E.image) : '');
    if (src) { const im = document.createElement('img'); im.alt = ''; im.src = src; pic.appendChild(im); }
    else { const ph = document.createElement('div'); ph.className = 'ph'; ph.textContent = 'Your cover picture goes here'; pic.appendChild(ph); }
    const badges = document.createElement('div'); badges.className = 'cp-badges';
    const kb = document.createElement('i'); kb.textContent = KIND[E.type].name; badges.appendChild(kb);
    if ($('fFree').checked) { const fb = document.createElement('i'); fb.className = 'free'; fb.textContent = 'Free'; badges.appendChild(fb); }
    if ($('fAd').checked) { const ab = document.createElement('i'); ab.className = 'ad'; ab.textContent = 'Ad'; badges.appendChild(ab); }
    pic.appendChild(badges);
    if (E.type === 'video' || E.type === 'course') {
      const pl = document.createElement('div'); pl.className = 'cp-play';
      pl.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="#fffaf0"/></svg>';
      pic.appendChild(pl);
    }
    const body = document.createElement('div'); body.className = 'cp-body';
    const sm = document.createElement('small'); sm.textContent = v('fKicker') || KIND[E.type].name;
    const b = document.createElement('b'); b.textContent = v('fTitle') || 'Your title'; if (!v('fTitle')) b.className = 'cp-empty';
    const d = document.createElement('span'); d.className = 'd'; d.textContent = v('fText') || 'Your short description shows here.';
    const buy = document.createElement('div'); buy.className = 'cp-buy';
    const pr = document.createElement('span'); pr.className = 'price' + ($('fFree').checked ? ' free' : '');
    pr.textContent = $('fFree').checked ? 'Free' : $('fNoPrice').checked ? '' : (v('fPrice') || '$…');
    const cta = document.createElement('span'); cta.className = 'cta'; cta.textContent = (v('fCta') || KIND[E.type].cta) + ' →';
    buy.appendChild(pr); buy.appendChild(cta);
    body.appendChild(sm); body.appendChild(b); body.appendChild(d); body.appendChild(buy);
    p.appendChild(pic); p.appendChild(body);
  }
  function counters() {
    document.querySelectorAll('.count').forEach((c) => {
      const inp = $(c.dataset.for), max = Number(inp.getAttribute('maxlength'));
      c.textContent = inp.value.length + '/' + max;
      c.classList.toggle('near', inp.value.length >= max * 0.9);
    });
  }
  ['fTitle', 'fHook', 'fText', 'fKicker', 'fCta', 'fPrice'].forEach((id) => {
    $(id).addEventListener('input', () => {
      edDirty = true; counters(); updatePreview(); $('edMsg').textContent = '';
      $(id).closest('.field').classList.remove('bad');
      if (id === 'fPrice') priceTouched = true;
      if (id === 'fCta') ctaTouched = true;
    });
  });
  $('fFree').addEventListener('change', () => {
    edDirty = true; priceTouched = true;
    if ($('fFree').checked) $('fNoPrice').checked = false;
    $('priceField').hidden = $('fFree').checked || $('fNoPrice').checked; updatePreview(); bumpPreview();
  });
  $('fNoPrice').addEventListener('change', () => {
    edDirty = true; priceTouched = true;
    if ($('fNoPrice').checked) $('fFree').checked = false;
    $('priceField').hidden = $('fFree').checked || $('fNoPrice').checked; updatePreview(); bumpPreview();
  });
  $('fAd').addEventListener('change', () => { edDirty = true; updatePreview(); bumpPreview(); });
  // what happens when a visitor taps it: open the link, or ask for their details first (the boxes you pick)
  let gateOn = false, askList = [];
  function setGate(g) {
    gateOn = g === 'form';
    if (gateOn && !askList.length) askList = ['name', 'phone'];
    $('gateSeg').querySelectorAll('button').forEach((b) => {
      const on = b.dataset.gate === (g || '');
      b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    });
    $('askBox').hidden = !gateOn;
    renderAsk();
  }
  function renderAsk(warn) {
    $('askPick').querySelectorAll('.cat-chip').forEach((b) => b.setAttribute('aria-pressed', String(askList.indexOf(b.dataset.f) >= 0)));
    const h = $('gateHint');
    if (warn) { h.className = 'hint warn'; h.textContent = warn; return; }
    h.className = 'hint';
    h.textContent = gateOn
      ? 'The form asks for: ' + ['name', 'phone', 'email'].filter((f) => askList.indexOf(f) >= 0).map((f) => ASK_NAME[f]).join(' + ') + '. ' + GATE_HINT.form
      : GATE_HINT[''];
  }
  $('gateSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { edDirty = true; setGate(b.dataset.gate); }));
  radioKeys($('gateSeg'));
  $('askPick').querySelectorAll('.cat-chip').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.f, k = askList.indexOf(f);
    if (k >= 0) {
      const rest = askList.filter((x) => x !== f);
      if (rest.indexOf('phone') < 0 && rest.indexOf('email') < 0) return renderAsk('Keep a WhatsApp number or an email, so you can reach them.');
      askList = rest;
    } else askList.push(f);
    edDirty = true; renderAsk();
    if (k < 0) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  }));
  ['fFeatured', 'fVisible'].forEach((id) => $(id).addEventListener('change', () => { edDirty = true; }));

  // link field: friendly checks + YouTube helper
  function fixUrl(u) {
    u = u.trim();
    if (u && !/^[a-z]+:\/\//i.test(u) && /^[\w-]+(\.[\w-]+)+/.test(u)) u = 'https://' + u;
    return u.replace(/^http:\/\//i, 'https://');
  }
  function urlFeedback() {
    const u = $('fUrl').value.trim(), h = $('urlHint');
    $('fUrl').closest('.field').classList.remove('bad');
    const yt = youtubeId(u);
    $('ytBtn').hidden = !yt;
    if (!u) { h.textContent = ''; h.className = 'hint'; return; }
    if (isUrl(u)) {
      h.className = 'hint good';
      const kind = linkKind(u);
      h.textContent = yt ? 'A YouTube video ✓ You can use its cover below.'
        : kind === 'group' ? 'A group link ✓' : kind === 'social' ? 'A social page ✓' : 'Looks good ✓';
      if (yt && edIndex < 0) {
        if (!kindTouched) { setKind('video'); bumpPreview(); }
        if (!priceTouched) { $('fFree').checked = true; $('fNoPrice').checked = false; $('priceField').hidden = true; updatePreview(); }
      } else if (kind && edIndex < 0) {
        if (!kindTouched) { setKind(kind); bumpPreview(); }
        if (!priceTouched) {
          $('fFree').checked = kind === 'group'; $('fNoPrice').checked = kind === 'social';
          $('priceField').hidden = true; updatePreview();
        }
      }
    } else { h.className = 'hint warn'; h.textContent = 'Paste the full link, starting with https://'; }
  }
  // WhatsApp/Telegram groups and channels -> Group; Instagram, Facebook, a YouTube channel... -> Social page
  function linkKind(u) {
    let x;
    try { x = new URL(u); } catch (e) { return ''; }
    const host = x.hostname.toLowerCase().replace(/^www\./, ''), path = x.pathname;
    if (host === 'chat.whatsapp.com' || (host === 'whatsapp.com' && path.indexOf('/channel/') === 0) || host === 't.me' || host === 'telegram.me') return 'group';
    if (/(^|\.)(instagram\.com|facebook\.com|fb\.com|x\.com|twitter\.com|tiktok\.com|linkedin\.com|threads\.net|pinterest\.com)$/.test(host)) return 'social';
    if (/(^|\.)youtube\.com$/.test(host) && !youtubeId(u) && /^\/(@|c\/|channel\/|user\/)/.test(path)) return 'social';
    return '';
  }
  $('fUrl').addEventListener('input', () => { edDirty = true; $('edMsg').textContent = ''; urlFeedback(); });
  // shrink the preview to a mini card once the form is scrolled, so there is room to type on a phone
  // (two thresholds, so the page can't flip back and forth when shrinking the preview changes the scroll position)
  $('edBody').addEventListener('scroll', () => {
    const w = $('edBody').querySelector('.preview-wrap'), y = $('edBody').scrollTop;
    if (y > 160) w.classList.add('mini'); else if (y < 60) w.classList.remove('mini');
  }, { passive: true });
  $('fUrl').addEventListener('blur', () => { const f = fixUrl($('fUrl').value); if (f !== $('fUrl').value) { $('fUrl').value = f; urlFeedback(); } });
  $('ytBtn').addEventListener('click', async () => {
    const id = youtubeId(fixUrl($('fUrl').value));
    if (!id) return;
    busy($('ytBtn'), true); $('cover').classList.add('busy');
    try {
      const res = await api('GET', 'yt?id=' + encodeURIComponent(id));
      const blob = await res.blob();
      await useImage(blob);
      $('coverHint').className = 'hint good'; $('coverHint').textContent = 'Got the cover from YouTube ✓';
    } catch (err) {
      $('coverHint').className = 'hint warn'; $('coverHint').textContent = err.message;
    } finally { busy($('ytBtn'), false); $('cover').classList.remove('busy'); }
  });

  // cover picture: always becomes a 960x540 JPEG made here on the phone (small and fast for visitors)
  $('fFile').addEventListener('change', async () => {
    const f = $('fFile').files && $('fFile').files[0];
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { $('coverHint').className = 'hint warn'; $('coverHint').textContent = 'Please pick a JPG, PNG or WebP picture.'; return; }
    if (f.size > 25 * 1024 * 1024) { $('coverHint').className = 'hint warn'; $('coverHint').textContent = 'That picture is very big. Try a smaller one.'; return; }
    $('cover').classList.add('busy');
    $('edMsg').textContent = '';
    try { await useImage(f); $('coverHint').className = 'hint good'; $('coverHint').textContent = 'Nice picture ✓'; }
    catch (e) { $('coverHint').className = 'hint warn'; $('coverHint').textContent = 'Could not open that picture. Try another one.'; }
    finally { $('cover').classList.remove('busy'); }
  });
  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob), im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      im.src = url;
    });
  }
  async function useImage(blob) {
    srcImage = await loadImage(blob);
    // A tall picture (phone screenshot, book cover) looks better shown whole.
    fitMode = srcImage.naturalWidth / srcImage.naturalHeight < 1.2 ? 'fit' : 'fill';
    $('fitSeg').querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.fit === fitMode)));
    renderCover();
  }
  function renderCover() {
    const W = 960, H = 540, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d'), im = srcImage, iw = im.naturalWidth, ih = im.naturalHeight;
    function cover(scaleFn) { const s = scaleFn(W / iw, H / ih); const w = iw * s, h = ih * s; c.drawImage(im, (W - w) / 2, (H - h) / 2, w, h); }
    if (fitMode === 'fill') cover(Math.max);
    else {
      c.fillStyle = '#16204a'; c.fillRect(0, 0, W, H);
      c.save(); c.filter = 'blur(28px) brightness(.7)'; cover(Math.max); c.restore();
      c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 30; cover(Math.min); c.shadowBlur = 0;
    }
    let q = 0.86, url = cv.toDataURL('image/jpeg', q);
    while (url.length > 700 * 1024 && q > 0.5) { q -= 0.1; url = cv.toDataURL('image/jpeg', q); }
    pendingCover = { dataUrl: url, b64: url.slice(url.indexOf(',') + 1) };
    edDirty = true;
    setPreviewPic(url);
    $('fitSeg').hidden = false;
    updatePreview(); bumpPreview();
  }
  $('fitSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    fitMode = b.dataset.fit;
    $('fitSeg').querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    if (srcImage) renderCover();
  }));
  radioKeys($('fitSeg'));

  // search words
  function renderTags() {
    const box = $('tagBox');
    box.querySelectorAll('.tag').forEach((t) => t.remove());
    (E.tags || []).forEach((t, i) => {
      const s = document.createElement('span'); s.className = 'tag';
      const tx = document.createElement('span'); tx.textContent = t;
      const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove ' + t);
      x.addEventListener('click', (e) => { e.preventDefault(); E.tags.splice(i, 1); edDirty = true; renderTags(); $('fTag').focus(); });
      s.appendChild(tx); s.appendChild(x);
      box.insertBefore(s, $('fTag'));
    });
  }
  function addTag() {
    const raw = $('fTag').value.replace(/,/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
    $('fTag').value = '';
    if (!raw) return;
    E.tags = E.tags || [];
    if (E.tags.indexOf(raw) >= 0) return;
    if (E.tags.length >= LIMITS.tags) { toast('That’s plenty of search words 😊'); return; }
    E.tags.push(raw.slice(0, LIMITS.tag)); edDirty = true; renderTags();
  }
  $('fTag').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
    else if (e.key === 'Backspace' && !$('fTag').value && E.tags && E.tags.length) { E.tags.pop(); edDirty = true; renderTags(); }
  });
  $('fTag').addEventListener('blur', addTag);

  // categories this product helps with (Ask Pip recommends by these)
  function renderCatPick() {
    const box = $('catPick'), mine = (E.categories || []).filter((id) => catById(id));
    E.categories = mine;
    box.textContent = '';
    const full = mine.length >= LIMITS.itemCats;
    S.catalog.categories.forEach((c) => {
      const on = mine.indexOf(c.id) >= 0;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cat-chip';
      b.setAttribute('aria-pressed', String(on));
      const ic = document.createElement('b'); ic.setAttribute('aria-hidden', 'true'); ic.textContent = c.emoji || '🏷️';
      const tx = document.createElement('span'); tx.textContent = c.name;
      b.appendChild(ic); b.appendChild(tx);
      if (!on && full) b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', () => {
        const list = E.categories;
        const k = list.indexOf(c.id);
        if (k >= 0) list.splice(k, 1);
        else if (list.length >= LIMITS.itemCats) {
          $('catHint').className = 'hint warn'; $('catHint').textContent = 'That’s 3 already, the most for one product. Tap one to remove it first.';
          return;
        } else list.push(c.id);
        edDirty = true; renderCatPick();
        const btn = box.querySelectorAll('.cat-chip')[S.catalog.categories.indexOf(c)];
        if (btn) { btn.focus(); if (k < 0) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); } }
      });
      box.appendChild(b);
    });
    const h = $('catHint');
    if (!S.catalog.categories.length) { h.className = 'hint'; h.textContent = 'No categories yet. Add some in the Categories tab.'; }
    else if (!mine.length) { h.className = 'hint'; h.textContent = 'Pick the problems this product solves, so Pip can recommend it.'; }
    else { h.className = 'hint good'; h.textContent = 'Pip will suggest it for: ' + mine.map((id) => catById(id).name).join(', ') + ' ✓'; }
  }

  // save
  function friendlyField(f) { return { title: 'fTitle', text: 'fText', url: 'fUrl', price: 'fPrice', hook: 'fHook', kicker: 'fKicker', cta: 'fCta' }[f]; }
  function markBad(field, msg) {
    $('edMsg').textContent = msg;
    const id = friendlyField(field);
    if (id) { const f = $(id).closest('.field'); f.classList.remove('bad'); void f.offsetWidth; f.classList.add('bad'); $(id).focus(); }
    else if (field === 'image') { $('cover').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' }); }
  }
  $('edSave').addEventListener('click', async () => {
    const v = (id) => $(id).value.trim();
    $('fUrl').value = fixUrl($('fUrl').value);
    addTag();
    if (!v('fTitle')) return markBad('title', 'Give it a title first.');
    if (!v('fText')) return markBad('text', 'Add a short description (1–2 sentences).');
    if (!v('fUrl')) return markBad('url', 'Paste the link the button should open.');
    if (!isUrl(v('fUrl'))) return markBad('url', 'The link must be a full address starting with https://');
    if (!pendingCover && !E.image) return markBad('image', 'Pick a cover picture (or use the YouTube cover).');
    if (!$('fFree').checked && !$('fNoPrice').checked && !v('fPrice')) return markBad('price', 'Add a price, or switch on “It’s free” or “No price”.');
    const item = {};
    const isNew = edIndex < 0;
    if (isNew) {
      const ids = {}; S.catalog.items.forEach((it) => { ids[it.id] = true; });
      let id = slugify(v('fTitle')), n = 2;
      while (ids[id]) id = slugify(v('fTitle')).slice(0, 36).replace(/-+$/, '') + '-' + (n++);
      item.id = id;
    } else item.id = E.id;
    item.type = E.type;
    if (v('fKicker')) item.kicker = v('fKicker');
    item.title = v('fTitle');
    if (v('fHook')) item.hook = v('fHook');
    item.text = v('fText');
    if ($('fFree').checked) item.free = true; else if ($('fNoPrice').checked) item.noPrice = true; else item.price = v('fPrice');
    item.cta = v('fCta') || KIND[E.type].cta;
    item.image = E.image || '';
    item.imageAlt = (E.imageAlt && !isNew && !pendingCover) ? E.imageAlt : ('Cover: ' + item.title).slice(0, LIMITS.imageAlt);
    item.url = v('fUrl');
    if (E.local) item.local = E.local;
    if (E.tags && E.tags.length) item.tags = E.tags.slice();
    if (E.categories && E.categories.length) item.categories = E.categories.slice();
    if ($('fFeatured').checked) item.featured = true;
    if (!$('fVisible').checked) item.hidden = true;
    if ($('fAd').checked) item.ad = true;
    if (gateOn) item.ask = ['name', 'phone', 'email'].filter((f) => askList.indexOf(f) >= 0);
    busy($('edSave'), true);
    try {
      if (pendingCover) {
        const up = await api('POST', 'image?name=' + encodeURIComponent(item.id.slice(0, 40).replace(/-+$/, '')), pendingCover.b64, true);
        S.uploads[up.path] = up.sha; S.previews[up.path] = pendingCover.dataUrl;
        item.image = up.path;
        pendingCover = null;
      }
      // check the whole shop with the same rules the server and the build use
      const trial = clone(S.catalog);
      if (isNew) trial.items.unshift(item); else trial.items[edIndex] = item;
      const check = validateCatalog(trial);
      const mine = check.errors.filter((er) => er.where === item.id);
      if (mine.length) {
        busy($('edSave'), false);
        if (mine[0].field === 'categories') { $('edMsg').textContent = mine[0].msg; $('catPick').scrollIntoView({ block: 'center' }); return; }
        if (mine[0].field === 'ask') { $('edMsg').textContent = mine[0].msg; $('gateSeg').scrollIntoView({ block: 'center' }); return; }
        return markBad(mine[0].field, mine[0].msg);
      }
      S.catalog = trial;
      flashId = item.id;
      edDirty = false;
      commit();
      await closeEditor(true);
      toast(isNew ? 'Added to your shop ✨ Tap Publish when ready.' : 'Saved ✓ Tap Publish when ready.', 3000);
    } catch (err) {
      if (err.status !== 401) $('edMsg').textContent = err.message;
    } finally { busy($('edSave'), false); }
  });
  $('edDelete').addEventListener('click', async () => {
    const it = S.catalog.items[edIndex];
    if (!(await ask({ emoji: '🗑️', title: 'Delete “' + it.title + '”?', text: 'It leaves your shop when you publish. Tip: you can hide it instead.', yes: 'Delete', no: 'Keep it' }))) return;
    S.catalog.items.splice(edIndex, 1);
    commit(); await closeEditor(true);
    toast('Deleted. Undo all brings it back before you publish.');
  });

  // ---------- follow link editor ----------
  let L = null, leIndex = -1, leReturn = null, platTouched = false;
  function buildPlatforms() {
    const box = $('platforms'); box.textContent = '';
    Object.keys(PLAT).forEach((k) => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.p = k;
      const ic = document.createElement('b'); ic.textContent = PLAT[k][0]; ic.setAttribute('aria-hidden', 'true');
      const tx = document.createElement('span'); tx.textContent = PLAT[k][1];
      b.appendChild(ic); b.appendChild(tx);
      b.addEventListener('click', () => { platTouched = true; setPlat(k); });
      box.appendChild(b);
    });
    radioKeys(box);
  }
  function setPlat(k) {
    L.platform = k;
    $('platforms').querySelectorAll('button').forEach((b) => { const on = b.dataset.p === k; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  }
  // whose page: your own links show under "Follow Focus World", other people's under "Worth a follow"
  function setOwner(friend) {
    L.friend = !!friend;
    $('ownerSeg').querySelectorAll('button').forEach((b) => { const on = (b.dataset.friend === '1') === L.friend; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
    $('ownerHint').textContent = L.friend ? 'Shows under “Worth a follow”.' : 'Shows under “Follow ' + APP_NAME_SHOP + '”.';
  }
  $('ownerSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setOwner(b.dataset.friend === '1')));
  radioKeys($('ownerSeg'));
  function openLink(i, from) {
    leReturn = from || document.activeElement; leIndex = i;
    const isNew = i < 0;
    L = isNew ? { platform: 'youtube', url: '' } : clone(S.catalog.social[i]);
    platTouched = !isNew;
    $('lUrl').value = L.url || ''; $('lLabel').value = L.label || '';
    $('leMsg').textContent = ''; $('leDelete').hidden = isNew;
    $('lUrl').closest('.field').classList.remove('bad');
    setPlat(L.platform); setOwner(!!L.friend); $('lAd').checked = !!L.ad; counters();
    $('linkEditor').hidden = false; $('app').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $(isNew ? 'lUrl' : 'lLabel').focus(), 60);
  }
  function closeLink() {
    $('linkEditor').hidden = true; $('app').removeAttribute('aria-hidden');
    document.body.style.overflow = '';
    if (leReturn && leReturn.isConnected) leReturn.focus();
  }
  $('addLink').addEventListener('click', () => openLink(-1, $('addLink')));
  $('leCancel').addEventListener('click', closeLink);
  $('lLabel').addEventListener('input', counters);
  $('lUrl').addEventListener('input', () => {
    $('lUrl').closest('.field').classList.remove('bad');
    if (platTouched) return;
    let host = '';
    try { host = new URL(fixUrl($('lUrl').value)).hostname.toLowerCase(); } catch (e) { return; }
    const hit = Object.keys(PLAT).find((k) => PLAT[k][2] && PLAT[k][2].test(host));
    setPlat(hit || 'website');
  });
  $('leSave').addEventListener('click', () => {
    $('lUrl').value = fixUrl($('lUrl').value);
    const u = $('lUrl').value.trim(), label = $('lLabel').value.trim();
    if (!isUrl(u)) {
      $('leMsg').textContent = 'Paste the full link, starting with https://';
      const f = $('lUrl').closest('.field'); f.classList.remove('bad'); void f.offsetWidth; f.classList.add('bad'); $('lUrl').focus();
      return;
    }
    const link = { platform: L.platform, url: u };
    if (label) link.label = label;
    if (L.friend) link.friend = true;
    if ($('lAd').checked) link.ad = true;
    const trial = clone(S.catalog);
    if (leIndex < 0) trial.social.push(link); else trial.social[leIndex] = link;
    const check = validateCatalog(trial);
    const bad = check.errors.find((er) => er.where.indexOf('link') === 0);
    if (bad) { $('leMsg').textContent = bad.msg; return; }
    S.catalog = trial; commit(); closeLink();
    toast(leIndex < 0 ? 'Link added 👋' : 'Saved ✓');
  });
  $('leDelete').addEventListener('click', async () => {
    if (!(await ask({ emoji: '🗑️', title: 'Delete this link?', yes: 'Delete', no: 'Keep it' }))) return;
    S.catalog.social.splice(leIndex, 1); commit(); closeLink();
  });

  // ---------- category editor ----------
  let C = null, ceIndex = -1, ceReturn = null, ceDirty = false;
  function buildEmojis() {
    const box = $('emojiPick'); box.textContent = '';
    EMOJIS.forEach((em) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = em; b.setAttribute('aria-label', 'Use ' + em);
      b.addEventListener('click', () => { $('cEmoji').value = em; ceDirty = true; markEmoji(); tryCat(); });
      box.appendChild(b);
    });
  }
  function markEmoji() {
    const v = $('cEmoji').value.trim();
    $('emojiPick').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === v)));
  }
  function renderWords() {
    const box = $('cWordBox');
    box.querySelectorAll('.tag').forEach((t) => t.remove());
    C.words.forEach((w, i) => {
      const s = document.createElement('span'); s.className = 'tag';
      const tx = document.createElement('span'); tx.textContent = w;
      const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove ' + w);
      x.addEventListener('click', (e) => { e.preventDefault(); C.words.splice(i, 1); ceDirty = true; renderWords(); tryCat(); $('cWord').focus(); });
      s.appendChild(tx); s.appendChild(x);
      box.insertBefore(s, $('cWord'));
    });
    const n = C.words.length;
    $('wordCount').textContent = n + '/' + LIMITS.catWords;
  }
  function addWord() {
    const raw = $('cWord').value.replace(/,/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');
    $('cWord').value = '';
    if (!raw) return;
    if (C.words.indexOf(raw) >= 0) return;
    if (C.words.length >= LIMITS.catWords) { toast('That’s plenty of words 😊'); return; }
    C.words.push(raw.slice(0, LIMITS.catWord)); ceDirty = true; renderWords(); tryCat();
  }
  // Uses Pip's own matching, so what you see here is what visitors get.
  function tryCat() {
    const q = $('cTry').value.trim(), r = $('cTryRes');
    if (!q) { r.className = 'try-result'; r.textContent = ''; return; }
    const H = window.FWHelper;
    const score = H ? H.categoryScore({ name: $('cName').value.trim(), words: C.words }, q) : 0;
    if (score >= 2) { r.className = 'try-result good'; r.textContent = '✓ Pip would pick this category for that.'; }
    else { r.className = 'try-result warn'; r.textContent = '✗ No match yet. Add a word from that sentence, like “' + guessWord(q) + '”.'; }
  }
  function guessWord(q) {
    const skip = /^(i|im|me|my|a|an|the|to|of|in|on|and|or|is|am|are|was|how|what|can|cant|do|dont|want|need|help|with|for|it|this|that|so|very|really|about|get|be)$/;
    const w = q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((x) => x.length > 2 && !skip.test(x));
    return w.sort((a, b) => b.length - a.length)[0] || 'a key word';
  }
  function openCat(i, from) {
    ceReturn = from || document.activeElement; ceIndex = i; ceDirty = false;
    const isNew = i < 0;
    C = isNew ? { id: '', name: '', emoji: '', words: [] } : clone(S.catalog.categories[i]);
    $('ceTitle').textContent = isNew ? 'New category' : 'Edit category';
    $('cEmoji').value = C.emoji || ''; $('cName').value = C.name || ''; $('cWord').value = ''; $('cTry').value = '';
    $('ceMsg').textContent = ''; $('ceDelete').hidden = isNew;
    ['cName', 'cEmoji'].forEach((id) => $(id).closest('.field').classList.remove('bad'));
    markEmoji(); renderWords(); tryCat(); counters();
    $('catEditor').hidden = false; $('app').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = 'hidden';
    setTimeout(() => $(isNew ? 'cName' : 'cWord').focus(), 60);
  }
  async function closeCat(force) {
    if (!force && ceDirty && !(await ask({ emoji: '🤔', title: 'Leave without saving?', text: 'Your changes to this category will be lost.', yes: 'Leave', no: 'Keep editing' }))) return;
    $('catEditor').hidden = true; $('app').removeAttribute('aria-hidden');
    document.body.style.overflow = '';
    if (ceReturn && ceReturn.isConnected) ceReturn.focus();
  }
  function badCat(id, msg) {
    $('ceMsg').textContent = msg;
    if (id) { const f = $(id).closest('.field'); f.classList.remove('bad'); void f.offsetWidth; f.classList.add('bad'); $(id).focus(); }
  }
  $('addCat').addEventListener('click', () => openCat(-1, $('addCat')));
  $('ceCancel').addEventListener('click', () => closeCat(false));
  $('cName').addEventListener('input', () => { ceDirty = true; counters(); $('ceMsg').textContent = ''; $('cName').closest('.field').classList.remove('bad'); tryCat(); });
  $('cEmoji').addEventListener('input', () => { ceDirty = true; markEmoji(); });
  $('cTry').addEventListener('input', tryCat);
  $('cWord').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addWord(); }
    else if (e.key === 'Backspace' && !$('cWord').value && C.words.length) { C.words.pop(); ceDirty = true; renderWords(); tryCat(); }
  });
  $('cWord').addEventListener('blur', addWord);
  $('ceSave').addEventListener('click', async () => {
    addWord();
    const name = $('cName').value.trim(), emoji = $('cEmoji').value.trim();
    if (!name) return badCat('cName', 'Give the category a name.');
    if (!C.words.length) { $('ceMsg').textContent = 'Add a few words people type about this problem.'; $('cWord').focus(); return; }
    const isNew = ceIndex < 0;
    const others = S.catalog.categories.filter((c, k) => k !== ceIndex);
    if (others.some((c) => c.name.toLowerCase() === name.toLowerCase())) return badCat('cName', 'You already have a category with that name.');
    let id = C.id;
    if (isNew) {
      const base = slugify(name).slice(0, 28).replace(/-+$/, '') || 'category';
      let n = 2; id = base;
      while (others.some((c) => c.id === id)) id = base + '-' + (n++);
    }
    const cat = { id: id, name: name };
    if (emoji) cat.emoji = emoji;
    cat.words = C.words.slice();
    const trial = clone(S.catalog);
    if (isNew) trial.categories.push(cat); else trial.categories[ceIndex] = cat;
    const bad = validateCatalog(trial).errors.find((er) => er.where === 'category ' + id || er.where.indexOf('category #') === 0);
    if (bad) return badCat(bad.field === 'name' ? 'cName' : bad.field === 'emoji' ? 'cEmoji' : null, bad.msg);
    S.catalog = trial; ceDirty = false; commit(); await closeCat(true);
    toast(isNew ? 'Category added 🏷️ Now pick it on a product.' : 'Saved ✓');
  });
  $('ceDelete').addEventListener('click', async () => {
    const c = S.catalog.categories[ceIndex];
    const users = S.catalog.items.filter((it) => (it.categories || []).indexOf(c.id) >= 0);
    const text = users.length
      ? 'It is picked on ' + (users.length === 1 ? '1 product' : users.length + ' products') + '. It will be removed from ' + (users.length === 1 ? 'it' : 'them') + ' too.'
      : 'Pip will stop using its words.';
    if (!(await ask({ emoji: '🗑️', title: 'Delete “' + c.name + '”?', text: text, yes: 'Delete', no: 'Keep it' }))) return;
    S.catalog.items.forEach((it) => {
      if (!it.categories) return;
      it.categories = it.categories.filter((x) => x !== c.id);
      if (!it.categories.length) delete it.categories;
    });
    S.catalog.categories.splice(ceIndex, 1);
    commit(); await closeCat(true);
    toast('Deleted. Undo all brings it back before you publish.');
  });

  // ---------- leads (visitors' details) ----------
  let leads = [], leadsBusy = false;
  function ago(ms) {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    if (m < 60 * 24) return Math.round(m / 60) + ' h ago';
    const d = new Date(ms);
    return d.getDate() + ' ' + d.toLocaleString('en', { month: 'short' }) + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  }
  async function loadLeads() {
    if (leadsBusy) return;
    leadsBusy = true; busy($('leadsReload'), true);
    try {
      const r = await api('GET', 'leads');
      $('leadsSetup').hidden = r.setup !== false;
      leads = r.leads || [];
      renderLeads(r.setup !== false);
    } catch (err) {
      if (err.status !== 401) toast(err.message, 4000);
    } finally { leadsBusy = false; busy($('leadsReload'), false); }
  }
  function renderLeads(ready) {
    const box = $('leadList'); box.textContent = '';
    $('countLeads').textContent = leads.length;
    leads.forEach((l) => {
      const who = l.name || l.phone || l.email;
      const waLink = l.phone ? 'https://wa.me/' + String(l.phone).replace(/[^0-9]/g, '') : '';
      const mailLink = l.email ? 'mailto:' + encodeURIComponent(l.email).replace(/%40/g, '@') : '';
      const row = document.createElement('div'); row.className = 'row link lead';
      // the big button: WhatsApp them if they left a number, otherwise email them
      const th = document.createElement('a'); th.className = 'thumb wa'; th.textContent = waLink ? '💬' : '✉️';
      th.href = waLink || mailLink; th.target = '_blank'; th.rel = 'noopener noreferrer';
      th.setAttribute('aria-label', (waLink ? 'Message ' + who + ' on WhatsApp' : 'Email ' + who));
      const info = document.createElement('div'); info.className = 'info';
      const b = document.createElement('b'); b.textContent = l.name || 'No name given';
      const meta = document.createElement('div'); meta.className = 'meta';
      const chip = (text, cls) => { const x = document.createElement('i'); x.textContent = text; if (cls) x.className = cls; meta.appendChild(x); };
      if (l.phone) chip(l.phone);
      if (l.email) chip(l.email);
      chip(l.title, 'free');
      chip(ago(l.at));
      info.appendChild(b); info.appendChild(meta);
      const tools = document.createElement('div'); tools.className = 'tools';
      if (waLink && mailLink) {
        const em = document.createElement('a'); em.className = 'mail-btn'; em.href = mailLink; em.textContent = '✉️';
        em.setAttribute('aria-label', 'Email ' + who); tools.appendChild(em);
      }
      const del = toolBtn('🗑️', 'Delete ' + who, null, async () => {
        if (!(await ask({ emoji: '🗑️', title: 'Delete ' + who + '?', text: 'Their details are removed for good.', yes: 'Delete', no: 'Keep' }))) return;
        try { await api('POST', 'leads-delete', { id: l.id }); leads = leads.filter((x) => x.id !== l.id); renderLeads(true); toast('Deleted'); }
        catch (err) { if (err.status !== 401) toast(err.message); }
      });
      tools.appendChild(del);
      row.appendChild(th); row.appendChild(info); row.appendChild(tools);
      box.appendChild(row);
    });
    $('leadsEmpty').hidden = !ready || leads.length > 0;
    $('leadsCsv').disabled = !leads.length;
    $('leadsClear').hidden = !leads.length;
  }
  // A spreadsheet file (opens in Excel or Google Sheets). Cells that start like a formula are made plain text.
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  $('leadsCsv').addEventListener('click', () => {
    const lines = [['Date', 'Name', 'WhatsApp', 'Email', 'Product'].map(csvCell).join(',')];
    leads.forEach((l) => {
      // the number as text (="+91..."), so spreadsheets keep the + and don't show 9.19E+11; it is digits only
      const phone = l.phone ? '"=""+' + String(l.phone).replace(/[^0-9]/g, '') + '"""' : '""';
      lines.push([csvCell(new Date(l.at).toISOString().slice(0, 16).replace('T', ' ')), csvCell(l.name), phone, csvCell(l.email), csvCell(l.title)].join(','));
    });
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'focus-world-leads-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Downloaded ✓ Keep it somewhere private.');
  });
  $('leadsReload').addEventListener('click', loadLeads);
  $('leadsClear').addEventListener('click', async () => {
    if (!(await ask({ emoji: '🗑️', title: 'Delete all ' + leads.length + ' leads?', text: 'Download the list first if you need it. This cannot be undone.', yes: 'Delete all', no: 'Keep them' }))) return;
    try { await api('POST', 'leads-delete', { all: true }); leads = []; renderLeads(true); toast('All deleted'); }
    catch (err) { if (err.status !== 401) toast(err.message); }
  });

  // ---------- publish ----------
  async function doPublish() {
    const list = changes();
    const used = usedUploads();
    busy($('publishBtn'), true);
    setStatus('busy', 'Sending to GitHub…');
    try {
      const r = await api('POST', 'publish', {
        catalog: S.catalog, baseSha: S.baseSha,
        uploads: Object.keys(used).map((p) => ({ path: p, sha: used[p] })),
        note: list.slice(0, 3).join('; ') + (list.length > 3 ? ' +' + (list.length - 3) + ' more' : '')
      });
      S.published = JSON.stringify(S.catalog);
      S.baseSha = r.catalogSha;
      S.pending = { commit: r.commit, at: Date.now() };
      try { localStorage.setItem(PENDING_KEY, JSON.stringify(S.pending)); localStorage.removeItem(DRAFT_KEY); } catch (e) { /* fine */ }
      render();
      confetti();
      toast('Sent! 🚀 Your site is updating. You can keep working.', 3500);
      pollTimer = setTimeout(checkLive, 8000);
    } catch (err) {
      refreshStatus();
      if (err.status === 401) return;
      if (err.code === 'conflict') {
        const keep = await ask({ emoji: '🤔', title: 'Your shop changed somewhere else', text: 'Maybe in another tab. Publish your version anyway (it replaces that change), or load the newest and drop yours?', yes: 'Publish mine', no: 'Load newest' });
        if (keep) {
          try { const cur = await api('GET', 'catalog'); S.baseSha = cur.sha; S.published = JSON.stringify(cur.catalog); saveDraft(); return doPublish(); }
          catch (e) { toast(e.message); }
        } else { try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* fine */ } loadShop({ fresh: true }); }
        return;
      }
      if (err.code === 'invalid' && err.details.length) {
        const lines = err.details.slice(0, 3).map((d) => {
          const it = S.catalog.items.find((x) => x.id === d.where);
          const cat = String(d.where).indexOf('category ') === 0 ? catById(String(d.where).slice(9)) : null;
          return '• ' + (it ? '“' + it.title + '”: ' : cat ? 'Category “' + cat.name + '”: ' : '') + d.msg;
        }).join('\n');
        await ask({ emoji: '🛠️', title: 'A few things need a fix', text: lines, yes: 'OK', no: null });
        return;
      }
      await ask({ emoji: '😕', title: 'Could not publish', text: err.message, yes: 'OK', no: null });
    } finally { busy($('publishBtn'), false); }
  }
  $('publishBtn').addEventListener('click', async () => {
    const list = changes();
    if (!list.length) return;
    const shown = list.slice(0, 4).join('\n') + (list.length > 4 ? '\n…and ' + (list.length - 4) + ' more' : '');
    const ok = await ask({ emoji: '🚀', title: 'Publish ' + (list.length === 1 ? '1 change' : list.length + ' changes') + '?', text: shown + '\n\nYour site updates in about 2 minutes.', yes: 'Publish', no: 'Not yet' });
    if (ok) doPublish();
  });

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('dialog').hidden) return closeDialog(false);
    if (!$('menu').hidden) { toggleMenu(false); $('menuBtn').focus(); return; }
    if (!$('editor').hidden) return closeEditor(false);
    if (!$('linkEditor').hidden) return closeLink();
    if (!$('catEditor').hidden) return closeCat(false);
  });
  // keep focus inside an open dialog
  document.addEventListener('focusin', (e) => {
    if (!$('dialog').hidden && !$('dialog').contains(e.target)) $('dlgYes').focus();
  });

  // ---------- start ----------
  buildKinds(); buildPlatforms(); buildEmojis();
  (async function start() {
    try {
      const me = await api('GET', 'me');
      if (me.github !== 'ok') toast(me.github, 6000);
      loadShop();
    } catch (err) {
      if (err.status === 401) return; // api() already showed the login
      showLogin(err.code === 'setup' ? err.message : (err.code === 'offline' ? err.message : 'Could not reach your shop. ' + err.message));
    }
  })();
})();
