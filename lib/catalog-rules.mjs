/* Focus World — the rules for src/catalog.json (the Toolshed's products, Follow links and categories).
   One copy of the rules, used in three places:
     - My Shop page (browser): checks the form before saving
     - My Shop server (Cloudflare Pages Function): checks again before writing to GitHub
     - build.py has the same rules in Python, so a bad file can never go live
   tests/test_rules.mjs checks that the JavaScript and Python rules always agree. */

const TYPES = ['kit', 'ebook', 'app', 'course', 'video', 'website', 'template', 'tool', 'group', 'social'];
// ask: a short "Before you go" form shown before the link opens, with these boxes. It needs a way to reach the
// visitor (WhatsApp number or email); visitors fill at least one, or skip.
const ASK_FIELDS = ['name', 'phone', 'email'];
const PLATFORMS = ['youtube', 'instagram', 'facebook', 'x', 'threads', 'linkedin', 'tiktok', 'telegram', 'whatsapp', 'pinterest', 'website'];
const LIMITS = {
  items: 60, social: 12, id: 48, title: 90, hook: 100, text: 260, kicker: 40, cta: 24,
  price: 14, imageAlt: 140, tags: 24, tag: 32, url: 600, label: 30, help: 2000,
  // categories: what problems a product helps with. Ask Pip matches people's words to a category's words.
  categories: 40, catId: 32, catName: 30, catEmoji: 8, catWords: 60, catWord: 40, itemCats: 3
};
const ITEM_KEYS = ['id', 'type', 'kicker', 'title', 'hook', 'text', 'price', 'free', 'cta', 'image', 'imageAlt',
  'url', 'local', 'tags', 'categories', 'featured', 'hidden', 'noPrice', 'ad', 'ask'];
const CATEGORY_KEYS = ['id', 'name', 'emoji', 'words'];
// friend: someone else's page (shown in its own row); ad: a paid promotion (shows an "Ad" label)
const SOCIAL_KEYS = ['platform', 'url', 'label', 'friend', 'ad'];
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const IMAGE_RE = /^shelf\/[a-z0-9]+(-[a-z0-9]+)*\.(jpg|png|webp)$/;
const LOCAL_RE = /^tools\/[a-z0-9]+(-[a-z0-9]+)*\.html$/;
// https only, a real-looking host, and only plain web-address characters after it (no spaces, quotes or
// angle brackets that could break out of a page attribute). Paste links as the browser copies them.
const URL_RE = /^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:[0-9]{1,5})?([/?#][A-Za-z0-9\-._~:/?#\[\]@!$&()*+,;=%]*)?$/;
// Control characters are never allowed in text (they can hide things or break the page).
const CTRL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function isStr(x) { return typeof x === 'string'; }
function isUrl(u) { return isStr(u) && u.length <= LIMITS.url && URL_RE.test(u); }

// Returns { ok, errors: [{ where, field, msg }] }. where is 'catalog', an item id (or '#3'), or 'link #2'.
// opts.imageExists(path) -> bool: optional extra check that a cover picture file really exists.
function validateCatalog(cat, opts) {
  const errors = [];
  function err(where, field, msg) { errors.push({ where: where, field: field, msg: msg }); }
  if (!cat || typeof cat !== 'object' || Array.isArray(cat)) {
    err('catalog', 'catalog', 'The shop file is not readable.');
    return { ok: false, errors: errors };
  }
  Object.keys(cat).forEach(function (k) {
    if (['_help', 'items', 'social', 'categories'].indexOf(k) < 0) err('catalog', k, 'Unknown part: ' + k);
  });
  if (cat._help !== undefined && (!isStr(cat._help) || cat._help.length > LIMITS.help)) err('catalog', '_help', 'Help note is too long.');
  const items = cat.items;
  if (!Array.isArray(items)) {
    err('catalog', 'items', 'The product list is missing.');
    return { ok: false, errors: errors };
  }
  if (items.length > LIMITS.items) err('catalog', 'items', 'Too many products (max ' + LIMITS.items + ').');
  // Category ids that exist, so a product can only point at a real category.
  const catIds = Object.create(null);
  if (Array.isArray(cat.categories)) {
    cat.categories.forEach(function (c) { if (c && typeof c === 'object' && isStr(c.id)) catIds[c.id] = true; });
  }
  const seen = Object.create(null);   // no inherited names like "constructor"
  items.forEach(function (it, n) {
    let where = '#' + (n + 1);
    if (!it || typeof it !== 'object' || Array.isArray(it)) { err(where, 'item', 'Not a product.'); return; }
    if (isStr(it.id) && it.id) where = it.id;
    Object.keys(it).forEach(function (k) { if (ITEM_KEYS.indexOf(k) < 0) err(where, k, 'Unknown field: ' + k); });
    // text fields
    [['id', true], ['type', true], ['title', true], ['text', true], ['cta', true], ['image', true], ['url', true],
      ['kicker', false], ['hook', false], ['price', false], ['imageAlt', false], ['local', false]].forEach(function (f) {
      const key = f[0], v = it[key];
      if (v === undefined || v === null || v === '') {
        if (f[1]) err(where, key, 'Missing ' + key + '.');
        return;
      }
      if (!isStr(v)) { err(where, key, key + ' must be text.'); return; }
      if (v.trim() !== v) err(where, key, key + ' has extra spaces at the start or end.');
      if (CTRL_RE.test(v)) err(where, key, key + ' has hidden characters.');
      if (LIMITS[key] && v.length > LIMITS[key]) err(where, key, key + ' is too long (max ' + LIMITS[key] + ').');
    });
    if (isStr(it.id) && it.id) {
      if (!ID_RE.test(it.id)) err(where, 'id', 'id can only use a-z, 0-9 and single dashes.');
      if (seen[it.id]) err(where, 'id', 'Two products have the same id.');
      seen[it.id] = true;
    }
    if (isStr(it.type) && it.type && TYPES.indexOf(it.type) < 0) err(where, 'type', 'Unknown kind of product.');
    if (isStr(it.url) && it.url && !isUrl(it.url)) err(where, 'url', 'The link must be a full https:// address.');
    if (isStr(it.image) && it.image) {
      if (!IMAGE_RE.test(it.image)) err(where, 'image', 'Cover picture name is not allowed.');
      else if (opts && opts.imageExists && !opts.imageExists(it.image)) err(where, 'image', 'Cover picture is missing.');
    }
    if (isStr(it.local) && it.local && !LOCAL_RE.test(it.local)) err(where, 'local', 'Local page name is not allowed.');
    ['free', 'featured', 'hidden', 'noPrice', 'ad'].forEach(function (k) {
      if (it[k] !== undefined && typeof it[k] !== 'boolean') err(where, k, k + ' must be true or false.');
    });
    const hasPrice = isStr(it.price) && it.price;
    if (it.free === true && it.noPrice === true) err(where, 'price', 'Pick Free or No price, not both.');
    else if (it.noPrice === true && hasPrice) err(where, 'price', 'Remove the price, or turn off No price.');
    else if (it.free !== true && it.noPrice !== true && !hasPrice) err(where, 'price', 'Add a price, or mark it Free or No price.');
    if (it.ask !== undefined) {
      if (!Array.isArray(it.ask) || !it.ask.length || it.ask.length > ASK_FIELDS.length) err(where, 'ask', 'Pick which details to ask for.');
      else {
        const seenAsk = Object.create(null);
        it.ask.forEach(function (f) {
          if (!isStr(f) || ASK_FIELDS.indexOf(f) < 0 || seenAsk[f]) err(where, 'ask', 'Pick which details to ask for.');
          else seenAsk[f] = true;
        });
        if (!seenAsk.phone && !seenAsk.email) err(where, 'ask', 'Ask for a WhatsApp number or an email, so you can reach them.');
      }
    }
    if (it.tags !== undefined) {
      if (!Array.isArray(it.tags)) err(where, 'tags', 'Search words must be a list.');
      else {
        if (it.tags.length > LIMITS.tags) err(where, 'tags', 'Too many search words (max ' + LIMITS.tags + ').');
        it.tags.forEach(function (t) {
          if (!isStr(t) || !t.trim() || t.length > LIMITS.tag || CTRL_RE.test(t)) err(where, 'tags', 'A search word is empty or too long.');
        });
      }
    }
    if (it.categories !== undefined) {
      if (!Array.isArray(it.categories)) err(where, 'categories', 'Categories must be a list.');
      else {
        if (it.categories.length > LIMITS.itemCats) err(where, 'categories', 'Pick up to ' + LIMITS.itemCats + ' categories.');
        const mine = Object.create(null);
        it.categories.forEach(function (c) {
          if (!isStr(c) || !catIds[c]) err(where, 'categories', 'A category does not exist.');
          else if (mine[c]) err(where, 'categories', 'The same category is picked twice.');
          else mine[c] = true;
        });
      }
    }
  });
  const social = cat.social;
  if (social !== undefined) {
    if (!Array.isArray(social)) err('catalog', 'social', 'Follow links must be a list.');
    else {
      if (social.length > LIMITS.social) err('catalog', 'social', 'Too many follow links (max ' + LIMITS.social + ').');
      social.forEach(function (s, n) {
        const where = 'link #' + (n + 1);
        if (!s || typeof s !== 'object' || Array.isArray(s)) { err(where, 'link', 'Not a link.'); return; }
        Object.keys(s).forEach(function (k) { if (SOCIAL_KEYS.indexOf(k) < 0) err(where, k, 'Unknown field: ' + k); });
        if (PLATFORMS.indexOf(s.platform) < 0) err(where, 'platform', 'Pick where this link goes.');
        if (!isUrl(s.url)) err(where, 'url', 'The link must be a full https:// address.');
        if (s.label !== undefined && (!isStr(s.label) || !s.label.trim() || s.label.length > LIMITS.label || CTRL_RE.test(s.label))) {
          err(where, 'label', 'The name is empty or too long.');
        }
        ['friend', 'ad'].forEach(function (k) {
          if (s[k] !== undefined && typeof s[k] !== 'boolean') err(where, k, k + ' must be true or false.');
        });
      });
    }
  }
  const cats = cat.categories;
  if (cats !== undefined) {
    if (!Array.isArray(cats)) err('catalog', 'categories', 'Categories must be a list.');
    else {
      if (cats.length > LIMITS.categories) err('catalog', 'categories', 'Too many categories (max ' + LIMITS.categories + ').');
      const ids = Object.create(null);
      cats.forEach(function (c, n) {
        let where = 'category #' + (n + 1);
        if (!c || typeof c !== 'object' || Array.isArray(c)) { err(where, 'category', 'Not a category.'); return; }
        if (isStr(c.id) && c.id) where = 'category ' + c.id;
        Object.keys(c).forEach(function (k) { if (CATEGORY_KEYS.indexOf(k) < 0) err(where, k, 'Unknown field: ' + k); });
        if (!isStr(c.id) || !ID_RE.test(c.id) || c.id.length > LIMITS.catId) err(where, 'id', 'Category id can only use a-z, 0-9 and single dashes.');
        else if (ids[c.id]) err(where, 'id', 'Two categories have the same id.');
        else ids[c.id] = true;
        if (!isStr(c.name) || !c.name.trim() || c.name.trim() !== c.name || c.name.length > LIMITS.catName || CTRL_RE.test(c.name)) {
          err(where, 'name', 'The category name is empty or too long (max ' + LIMITS.catName + ').');
        }
        if (c.emoji !== undefined && (!isStr(c.emoji) || !c.emoji.trim() || c.emoji.trim() !== c.emoji || c.emoji.length > LIMITS.catEmoji || CTRL_RE.test(c.emoji))) {
          err(where, 'emoji', 'The emoji is not allowed.');
        }
        if (!Array.isArray(c.words) || !c.words.length) err(where, 'words', 'Add some words people type.');
        else {
          if (c.words.length > LIMITS.catWords) err(where, 'words', 'Too many words (max ' + LIMITS.catWords + ').');
          c.words.forEach(function (w) {
            if (!isStr(w) || !w.trim() || w.trim() !== w || w.length > LIMITS.catWord || CTRL_RE.test(w)) err(where, 'words', 'A word is empty or too long.');
          });
        }
      });
    }
  }
  return { ok: errors.length === 0, errors: errors };
}

// A safe id from a title: "My Big Ebook!" -> "my-big-ebook".
function slugify(s) {
  const out = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return out || 'product';
}

// YouTube video id from any normal YouTube link, or '' if it is not one.
function youtubeId(u) {
  if (!isStr(u)) return '';
  const m = u.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/]|$)/);
  return m ? m[1] : '';
}

export { TYPES, PLATFORMS, ASK_FIELDS, LIMITS, validateCatalog, slugify, youtubeId, isUrl };
