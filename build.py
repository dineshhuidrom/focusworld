"""Build Focus World.

  python3 build.py                  -> dist/preview.html (one file, for the private preview)
  FW_SITE_URL=https://name.pages.dev python3 build.py --site
                                    -> also dist/site/ (the live site, with the My Shop page at /admin/)
  python3 build.py --icons          -> redraws the app icons and link picture into src/static/
                                       (needs Playwright + Pillow; run on our machine, not on Cloudflare)

The --site build uses only plain Python, so Cloudflare Pages can run it on every publish.
Optional: FW_CF_ANALYTICS=<token> adds Cloudflare Web Analytics (cookie-free visitor counts).
Cloudflare sets CF_PAGES_COMMIT_SHA during its builds; it goes into /version.json so My Shop
can tell when a publish is live.
"""
import json
import os
import re
import shutil
import sys
import asyncio
import urllib.parse
import html as htmllib
import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
DIST = os.path.join(ROOT, "dist")
VERSION = "1.0.0"
APP_NAME = "Focus World"
JS_ORDER = ["logic.js", "helper.js", "items.js", "places.js", "world.js", "audio.js", "app.js"]

# ---- catalog rules: the same rules as lib/catalog-rules.mjs (tests/test_rules.mjs checks they agree) ----
TYPES = ["kit", "ebook", "app", "course", "video", "website", "template", "tool", "group", "social"]
ASK_FIELDS = ["name", "phone", "email"]
PLATFORMS = ["youtube", "instagram", "facebook", "x", "threads", "linkedin", "tiktok", "telegram", "whatsapp",
             "pinterest", "website"]
LIMITS = {"items": 60, "social": 12, "id": 48, "title": 90, "hook": 100, "text": 260, "kicker": 40, "cta": 24,
          "price": 14, "imageAlt": 140, "tags": 24, "tag": 32, "url": 600, "label": 30, "help": 2000, "details": 3000,
          "categories": 40, "catId": 32, "catName": 30, "catEmoji": 8, "catWords": 60, "catWord": 40, "itemCats": 3}
ITEM_KEYS = ["id", "type", "kicker", "title", "hook", "text", "price", "free", "cta", "image", "imageAlt",
             "url", "local", "tags", "categories", "featured", "hidden", "noPrice", "ad", "ask", "details"]
CATEGORY_KEYS = ["id", "name", "emoji", "words"]
SOCIAL_KEYS = ["platform", "url", "label", "friend", "ad"]
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
IMAGE_RE = re.compile(r"^shelf/[a-z0-9]+(-[a-z0-9]+)*\.(jpg|png|webp)$")
LOCAL_RE = re.compile(r"^tools/[a-z0-9]+(-[a-z0-9]+)*\.html$")
URL_RE = re.compile(r"^https://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:[0-9]{1,5})?([/?#][A-Za-z0-9\-._~:/?#\[\]@!$&()*+,;=%]*)?$")
# The characters JavaScript's trim() removes, so " x" counts as untidy in both rule copies.
JS_WS = (" \t\n\r\x0b\x0c\u00a0\ufeff\u2028\u2029\u3000\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006"
         "\u2007\u2008\u2009\u200a\u202f\u205f")
CTRL_RE = re.compile("[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]")


def _is_str(x):
    return isinstance(x, str)


def _is_url(u):
    # fullmatch: Python's $ would also accept a newline at the end; JavaScript's does not.
    return _is_str(u) and len(u) <= LIMITS["url"] and URL_RE.fullmatch(u) is not None


def _js_len(s):
    # JavaScript counts UTF-16 units; count the same way so both rule copies agree on emoji.
    return len(s.encode("utf-16-le")) // 2


def validate_catalog(cat, image_exists=None):
    """Return a list of (where, field, message). Empty list = the catalog is fine."""
    errors = []

    def err(where, field, msg):
        errors.append((where, field, msg))

    if not isinstance(cat, dict):
        err("catalog", "catalog", "The shop file is not readable.")
        return errors
    for k in cat:
        if k not in ("_help", "items", "social", "categories"):
            err("catalog", k, "Unknown part: " + k)
    if "_help" in cat and (not _is_str(cat["_help"]) or _js_len(cat["_help"]) > LIMITS["help"]):
        err("catalog", "_help", "Help note is too long.")
    items = cat.get("items")
    if not isinstance(items, list):
        err("catalog", "items", "The product list is missing.")
        return errors
    if len(items) > LIMITS["items"]:
        err("catalog", "items", "Too many products.")
    cat_ids = set()
    if isinstance(cat.get("categories"), list):
        cat_ids = {c["id"] for c in cat["categories"] if isinstance(c, dict) and _is_str(c.get("id"))}
    seen = set()
    for n, it in enumerate(items):
        where = "#%d" % (n + 1)
        if not isinstance(it, dict):
            err(where, "item", "Not a product.")
            continue
        if _is_str(it.get("id")) and it.get("id"):
            where = it["id"]
        for k in it:
            if k not in ITEM_KEYS:
                err(where, k, "Unknown field: " + k)
        for key, required in (("id", True), ("type", True), ("title", True), ("text", True), ("cta", True),
                              ("image", True), ("url", True), ("kicker", False), ("hook", False),
                              ("price", False), ("imageAlt", False), ("local", False), ("details", False)):
            v = it.get(key)
            if v is None or v == "":
                if required:
                    err(where, key, "Missing " + key + ".")
                continue
            if not _is_str(v):
                err(where, key, key + " must be text.")
                continue
            if v.strip(JS_WS) != v:
                err(where, key, key + " has extra spaces at the start or end.")
            if CTRL_RE.search(v):
                err(where, key, key + " has hidden characters.")
            if key in LIMITS and _js_len(v) > LIMITS[key]:
                err(where, key, key + " is too long.")
        if _is_str(it.get("id")) and it.get("id"):
            if not ID_RE.fullmatch(it["id"]):
                err(where, "id", "id can only use a-z, 0-9 and single dashes.")
            if it["id"] in seen:
                err(where, "id", "Two products have the same id.")
            seen.add(it["id"])
        if _is_str(it.get("type")) and it.get("type") and it["type"] not in TYPES:
            err(where, "type", "Unknown kind of product.")
        if _is_str(it.get("url")) and it.get("url") and not _is_url(it["url"]):
            err(where, "url", "The link must be a full https:// address.")
        if _is_str(it.get("image")) and it.get("image"):
            if not IMAGE_RE.fullmatch(it["image"]):
                err(where, "image", "Cover picture name is not allowed.")
            elif image_exists and not image_exists(it["image"]):
                err(where, "image", "Cover picture is missing.")
        if _is_str(it.get("local")) and it.get("local") and not LOCAL_RE.fullmatch(it["local"]):
            err(where, "local", "Local page name is not allowed.")
        for k in ("free", "featured", "hidden", "noPrice", "ad"):
            if k in it and not isinstance(it[k], bool):
                err(where, k, k + " must be true or false.")
        has_price = _is_str(it.get("price")) and it.get("price")
        if it.get("free") is True and it.get("noPrice") is True:
            err(where, "price", "Pick Free or No price, not both.")
        elif it.get("noPrice") is True and has_price:
            err(where, "price", "Remove the price, or turn off No price.")
        elif it.get("free") is not True and it.get("noPrice") is not True and not has_price:
            err(where, "price", "Add a price, or mark it Free or No price.")
        if "ask" in it:
            ask = it["ask"]
            if not isinstance(ask, list) or not ask or len(ask) > len(ASK_FIELDS):
                err(where, "ask", "Pick which details to ask for.")
            else:
                seen_ask = set()
                for f in ask:
                    if not _is_str(f) or f not in ASK_FIELDS or f in seen_ask:
                        err(where, "ask", "Pick which details to ask for.")
                    else:
                        seen_ask.add(f)
                if "phone" not in seen_ask and "email" not in seen_ask:
                    err(where, "ask", "Ask for a WhatsApp number or an email.")
        if "tags" in it:
            if not isinstance(it["tags"], list):
                err(where, "tags", "Search words must be a list.")
            else:
                if len(it["tags"]) > LIMITS["tags"]:
                    err(where, "tags", "Too many search words.")
                for t in it["tags"]:
                    if not _is_str(t) or not t.strip(JS_WS) or _js_len(t) > LIMITS["tag"] or CTRL_RE.search(t):
                        err(where, "tags", "A search word is empty or too long.")
        if "categories" in it:
            ic = it["categories"]
            if not isinstance(ic, list):
                err(where, "categories", "Categories must be a list.")
            else:
                if len(ic) > LIMITS["itemCats"]:
                    err(where, "categories", "Pick up to 3 categories.")
                mine = set()
                for c in ic:
                    if not _is_str(c) or c not in cat_ids:
                        err(where, "categories", "A category does not exist.")
                    elif c in mine:
                        err(where, "categories", "The same category is picked twice.")
                    else:
                        mine.add(c)
    if "social" in cat:
        social = cat["social"]
        if not isinstance(social, list):
            err("catalog", "social", "Follow links must be a list.")
        else:
            if len(social) > LIMITS["social"]:
                err("catalog", "social", "Too many follow links.")
            for n, s in enumerate(social):
                where = "link #%d" % (n + 1)
                if not isinstance(s, dict):
                    err(where, "link", "Not a link.")
                    continue
                for k in s:
                    if k not in SOCIAL_KEYS:
                        err(where, k, "Unknown field: " + k)
                if s.get("platform") not in PLATFORMS:
                    err(where, "platform", "Pick where this link goes.")
                if not _is_url(s.get("url")):
                    err(where, "url", "The link must be a full https:// address.")
                if "label" in s:
                    lb = s["label"]
                    if not _is_str(lb) or not lb.strip(JS_WS) or _js_len(lb) > LIMITS["label"] or CTRL_RE.search(lb):
                        err(where, "label", "The name is empty or too long.")
                for k in ("friend", "ad"):
                    if k in s and not isinstance(s[k], bool):
                        err(where, k, k + " must be true or false.")
    if "categories" in cat:
        cats = cat["categories"]
        if not isinstance(cats, list):
            err("catalog", "categories", "Categories must be a list.")
        else:
            if len(cats) > LIMITS["categories"]:
                err("catalog", "categories", "Too many categories.")
            ids = set()

            def tidy(v, limit):
                return _is_str(v) and v.strip(JS_WS) != "" and v.strip(JS_WS) == v and _js_len(v) <= limit and not CTRL_RE.search(v)
            for n, c in enumerate(cats):
                where = "category #%d" % (n + 1)
                if not isinstance(c, dict):
                    err(where, "category", "Not a category.")
                    continue
                if _is_str(c.get("id")) and c.get("id"):
                    where = "category " + c["id"]
                for k in c:
                    if k not in CATEGORY_KEYS:
                        err(where, k, "Unknown field: " + k)
                cid = c.get("id")
                if not _is_str(cid) or not ID_RE.fullmatch(cid) or _js_len(cid) > LIMITS["catId"]:
                    err(where, "id", "Category id can only use a-z, 0-9 and single dashes.")
                elif cid in ids:
                    err(where, "id", "Two categories have the same id.")
                else:
                    ids.add(cid)
                if not tidy(c.get("name"), LIMITS["catName"]):
                    err(where, "name", "The category name is empty or too long.")
                if "emoji" in c and not tidy(c["emoji"], LIMITS["catEmoji"]):
                    err(where, "emoji", "The emoji is not allowed.")
                words = c.get("words")
                if not isinstance(words, list) or not words:
                    err(where, "words", "Add some words people type.")
                else:
                    if len(words) > LIMITS["catWords"]:
                        err(where, "words", "Too many words.")
                    for w in words:
                        if not tidy(w, LIMITS["catWord"]):
                            err(where, "words", "A word is empty or too long.")
    return errors


def load_catalog():
    """Read src/catalog.json and stop the build on any mistake (missing picture, bad link, duplicate id)."""
    with open(os.path.join(SRC, "catalog.json"), encoding="utf-8") as f:
        cat = json.load(f)
    problems = validate_catalog(cat, lambda p: os.path.isfile(os.path.join(SRC, p)))
    for it in cat.get("items", []):
        if isinstance(it, dict) and it.get("local") and not os.path.isfile(os.path.join(SRC, it["local"])):
            problems.append((it.get("id"), "local", "local page not found: %s" % it["local"]))
    if problems:
        raise SystemExit("Catalog problems:\n" + "\n".join("  %s / %s: %s" % p for p in problems))
    return cat


# When a paid promotion is on show (a product or link marked "Ad"), the site must stop saying "no ads".
ADS_SHOWN = False
_NO_ADS = (("No sign-up, no ads, and", "No sign-up, and"), ("No sign-up, no ads.", "No sign-up."),
           ("no sign-up, no ads.", "no sign-up."), ("No sign-up. No ads.", "No sign-up."), ("No sign-up and no ads.", "No sign-up."),
           (" with no ads.", "."), ("no sign-up, no ads", "no sign-up"))


def ads_wording(html):
    """Keeps every page honest: removes the "no ads" promise while a paid promotion is shown."""
    if not ADS_SHOWN:
        return html
    for a, b in _NO_ADS:
        html = html.replace(a, b)
    if re.search(r"no ads", html, re.I):
        raise SystemExit('A page still says "no ads" while a paid promotion is shown. Add the sentence to _NO_ADS in build.py.')
    return html


def shelf_for(items, site):
    """What the page needs. Hidden products are left out. On the live site, free tools open from our own address."""
    out = []
    for it in items:
        if it.get("hidden"):
            continue
        d = {k: it[k] for k in ("id", "type", "kicker", "title", "hook", "text", "price", "free", "noPrice", "ad",
                                "ask", "cta", "image", "imageAlt", "tags", "categories", "featured") if k in it}
        d["url"] = "/tools/%s/" % it["id"] if (site and it.get("local")) else it["url"]
        out.append(d)
    return out


def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        return f.read()


def categories_for(cat):
    """Categories with the words people type about each problem. Ask Pip uses them to recommend products."""
    return [{k: c[k] for k in ("id", "name", "emoji", "words") if k in c} for c in cat.get("categories", [])]


def social_for(cat):
    return [{k: s[k] for k in ("platform", "url", "label", "friend", "ad") if k in s} for s in cat.get("social", [])]


def build_html(site_url, pwa, analytics, shelf, social, categories=()):
    js = "\n".join(read(n) for n in JS_ORDER)
    css = read("style.css")
    if "</script" in js.lower() or "</style" in css.lower():
        raise SystemExit("Refusing to inline: a closing tag was found in the source.")
    config = {"appName": APP_NAME, "siteUrl": site_url, "pwa": pwa, "version": VERSION, "shelf": shelf,
              "social": social, "categories": list(categories),
              # Ask Pip can point to the study guides (live site only; the one-file preview cannot open other pages).
              "guides": [{"slug": g["slug"], "h1": g["h1"]} for g in load_guides()] if pwa else []}
    config_js = "window.FW_CONFIG = " + json.dumps(config).replace("</", "<\\/") + ";"
    head = []
    if pwa:
        head.append('<link rel="manifest" href="/manifest.webmanifest">')
        head.append('<link rel="apple-touch-icon" href="/icons/icon-180.png">')
    if site_url:
        # Tells search engines what this site is: a free web app (shown as structured data, not on screen).
        ld = {"@context": "https://schema.org", "@type": "WebApplication", "name": APP_NAME, "url": site_url + "/",
              "description": "A free focus timer for studying and work. Every minute you focus grows your own little "
                             "world. Calm sounds and lofi music, no sign-up, no ads.",
              "applicationCategory": "EducationalApplication", "operatingSystem": "Any (web browser)",
              "image": site_url + "/og.jpg", "isAccessibleForFree": True,
              "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}}
        head.append('<script type="application/ld+json">%s</script>' % json.dumps(ld).replace("</", "<\\/"))
        head.append('<link rel="canonical" href="%s/">' % site_url)
        head.append('<meta property="og:url" content="%s/">' % site_url)
        head.append('<meta property="og:image" content="%s/og.jpg">' % site_url)
        head.append('<meta name="twitter:card" content="summary_large_image">')
    if analytics:
        head.append("<script defer src=\"https://static.cloudflareinsights.com/beacon.min.js\" "
                    "data-cf-beacon='{\"token\": \"%s\"}'></script>" % analytics)
    html = read("index.html")
    # The live site uses real icon files (Google shows /favicon.ico in search results and Search Console);
    # the one-file preview keeps the icon inside the page.
    if pwa:
        favicon = ('<link rel="icon" href="/favicon.ico" sizes="48x48">\n'
                   '<link rel="icon" type="image/svg+xml" href="/favicon.svg">\n'
                   '<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png">')
    else:
        svg = read(os.path.join("static", "favicon.svg")).strip()
        favicon = '<link rel="icon" href="data:image/svg+xml,%s">' % urllib.parse.quote(svg, safe=" =:/'")
    html = html.replace("{{FAVICON}}", favicon)
    # Study guide links in "About & help" (live site only; the one-file preview cannot open other pages).
    guide_links = ""
    if pwa:
        gl = load_guides()
        if gl:
            guide_links = ('<h3>Study guides</h3><ul class="guide-links">%s<li><a href="/guides/">All study guides &rarr;</a></li></ul>'
                           % "".join('<li><a href="/guides/%s/">%s</a></li>' % (g["slug"], _e(g["h1"])) for g in gl))
    if pwa and shelf:
        # the Shop pages (one Google page per product) are linked from About & help too
        guide_links += ('<h3>Shop</h3><ul class="guide-links"><li><a href="/shop/">All kits, tools and pages (%d) &rarr;</a></li></ul>'
                        % len(shelf))
    html = html.replace("{{GUIDE_LINKS}}", guide_links)
    for key, val in (("{{CSS}}", css), ("{{JS}}", js), ("{{CONFIG}}", config_js),
                     ("{{HEAD_EXTRA}}", "\n".join(head)), ("{{APP_NAME}}", APP_NAME)):
        html = html.replace(key, val)
    left = re.findall(r"\{\{[A-Z_]+\}\}", html)
    if left:
        raise SystemExit("Unfilled template keys: %s" % left[:3])
    return ads_wording(html)


SW = """const CACHE = 'focusworld-%s';
const ASSETS = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // My Shop and the live-version check must always come fresh from the network.
  if (url.pathname.startsWith('/admin') || url.pathname === '/version.json') return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      // Only the home page is kept for offline use (not the /tools/ pages).
      if (url.pathname === '/' && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); }
      return res;
    }).catch(() => (url.pathname === '/' ? caches.match('/') : Response.error())));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('/');
  }));
});
"""


def headers(analytics):
    script = "'self' 'unsafe-inline'" + (" https://static.cloudflareinsights.com" if analytics else "")
    connect = "'self'" + (" https://cloudflareinsights.com" if analytics else "")
    csp = ("default-src 'self'; script-src %s; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
           "connect-src %s; manifest-src 'self'; worker-src 'self'; media-src 'self' blob:; "
           "base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'") % (script, connect)
    return "\n".join([
        "/*",
        "  Content-Security-Policy: " + csp,
        "  X-Content-Type-Options: nosniff",
        "  Referrer-Policy: strict-origin-when-cross-origin",
        "  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()",
        "  X-Frame-Options: DENY",
        "/tools/*",
        "  ! Content-Security-Policy",
        "  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; "
        "img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; "
        "frame-ancestors 'none'; object-src 'none'",
        "/admin/*",
        "  ! Content-Security-Policy",
        "  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; "
        "frame-ancestors 'none'; object-src 'none'",
        "  X-Robots-Tag: noindex, nofollow",
        "  Cache-Control: no-store",
        "  Referrer-Policy: no-referrer",
        "/sw.js",
        "  Cache-Control: no-cache",
        "/version.json",
        "  Cache-Control: no-cache",
        "/",
        "  Cache-Control: no-cache",
        "",
    ])


async def render_images(out_dir):
    """Draw the app icons and the link-preview picture with the real island renderer."""
    from playwright.async_api import async_playwright
    harness = "file://" + os.path.join(ROOT, "tests", "world_harness.html")
    os.makedirs(os.path.join(out_dir, "icons"), exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1200, "height": 630})
        await pg.goto(harness)
        icon_js = """async ([size, pad]) => {
          const c = document.createElement('canvas'); c.width = size; c.height = size;
          const x = c.getContext('2d');
          FWWorld.renderStatic(x, size, size, {l: -size*0.2 + pad, t: size*0.12 + pad, r: size*1.2 - pad, b: size*0.98 - pad},
            {min: 700, seed: 20261110, sky: 'day', rain: 0, calm: true, seedling: null}, 12.5);
          return c.toDataURL('image/png');
        }"""
        import base64
        for size, name, pad in ((192, "icon-192.png", 0), (512, "icon-512.png", 0), (180, "icon-180.png", 0),
                                (512, "icon-maskable-512.png", 60)):
            data = await pg.evaluate(icon_js, [size, pad])
            with open(os.path.join(out_dir, "icons", name), "wb") as f:
                f.write(base64.b64decode(data.split(",", 1)[1]))
        og_js = """async (name) => {
          const W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H;
          const x = c.getContext('2d');
          FWWorld.renderStatic(x, W, H, {l: -40, t: 40, r: 760, b: 620},
            {min: 3400, seed: 20261110, sky: 'sunset', rain: 0, calm: true, seedling: null}, 12.5);
          const g = x.createLinearGradient(640, 0, W, 0);
          g.addColorStop(0, 'rgba(10,14,36,0)'); g.addColorStop(0.35, 'rgba(10,14,36,.72)'); g.addColorStop(1, 'rgba(10,14,36,.86)');
          x.fillStyle = g; x.fillRect(640, 0, W - 640, H);
          const F = 'ui-rounded, "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
          const fit = (text, size, weight, maxW) => { let sz = size; do { x.font = weight + ' ' + sz + 'px ' + F; sz -= 2; } while (x.measureText(text).width > maxW && sz > 16); };
          const L0 = 740, MW = W - L0 - 44;
          x.fillStyle = '#fffaf0'; fit(name, 64, '800', MW); x.fillText(name, L0, 230);
          x.fillStyle = 'rgba(255,250,240,.9)'; fit('Focus and grow', 38, '700', MW); x.fillText('Focus and grow', L0, 292);
          fit('your own island.', 38, '700', MW); x.fillText('your own island.', L0, 338);
          x.fillStyle = 'rgba(255,214,140,.95)'; fit('Free · No sign-up · No ads', 26, '700', MW); x.fillText('Free · No sign-up · No ads', L0, 398);
          return c.toDataURL('image/png');
        }"""
        data = await pg.evaluate(og_js, APP_NAME)
        with open(os.path.join(out_dir, "og.png"), "wb") as f:
            f.write(base64.b64decode(data.split(",", 1)[1]))
        await b.close()
    # Shrink: link previews (WhatsApp etc.) need a small JPEG; icons get a 256-colour palette.
    from PIL import Image
    og_png = os.path.join(out_dir, "og.png")
    Image.open(og_png).convert("RGB").save(os.path.join(out_dir, "og.jpg"), "JPEG", quality=84, optimize=True, progressive=True)
    os.remove(og_png)
    for name in os.listdir(os.path.join(out_dir, "icons")):
        path = os.path.join(out_dir, "icons", name)
        Image.open(path).convert("RGB").quantize(colors=256, method=Image.Quantize.MEDIANCUT).save(path, optimize=True)


def build_admin():
    """The My Shop page: one file with its style, script and the shared catalog rules inside."""
    rules = open(os.path.join(ROOT, "lib", "catalog-rules.mjs"), encoding="utf-8").read()
    rules = re.sub(r"^export \{[^}]*\};\s*$", "", rules, flags=re.M)
    if "export " in rules:
        raise SystemExit("lib/catalog-rules.mjs: only one export line at the end is supported")
    # Ask Pip's matching (helper.js) lets the Categories editor test words exactly the way visitors' messages are matched.
    js = read("helper.js") + "\n" + read(os.path.join("admin", "admin.js"))
    css = read(os.path.join("admin", "admin.css"))
    both = rules + js
    if "</script" in both.lower() or "</style" in css.lower():
        raise SystemExit("Refusing to inline: a closing tag was found in the admin source.")
    html = read(os.path.join("admin", "admin.html"))
    for key, val in (("{{CSS}}", css), ("{{JS}}", rules + "\n" + js), ("{{APP_NAME}}", APP_NAME)):
        html = html.replace(key, val)
    left = re.findall(r"\{\{[A-Z_]+\}\}", html)
    if left:
        raise SystemExit("Unfilled admin template keys: %s" % left[:3])
    return html


# ---------- study guides (src/guides/<slug>.html -> /guides/<slug>/) ----------
GUIDE_FIELDS = ("title", "description", "h1", "kicker", "updated", "scene", "imageAlt", "answer")


def load_guides():
    """Each guide file starts with <!--meta {json} --> and then its article HTML (written by us, trusted)."""
    gdir = os.path.join(SRC, "guides")
    out = []
    for name in sorted(os.listdir(gdir)):
        if not name.endswith(".html") or name.startswith("_"):
            continue
        slug = name[:-5]
        text = open(os.path.join(gdir, name), encoding="utf-8").read()
        m = re.match(r"\s*<!--meta\s*(\{.*?\})\s*-->\s*(.*)$", text, re.S)
        if not m:
            raise SystemExit("guide %s: missing <!--meta {...} --> at the top" % name)
        meta = json.loads(m.group(1))
        for k in GUIDE_FIELDS:
            if not isinstance(meta.get(k), str) or not meta[k].strip():
                raise SystemExit("guide %s: missing %s" % (name, k))
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", slug):
            raise SystemExit("guide %s: file name must be a-z, 0-9 and dashes" % name)
        if len(meta["title"]) > 70 or len(meta["description"]) > 170:
            raise SystemExit("guide %s: title max 70 and description max 170 characters (Google cuts longer ones)" % name)
        datetime.date.fromisoformat(meta["updated"])
        body = m.group(2).strip()
        if "</script" in body.lower() or "<script" in body.lower():
            raise SystemExit("guide %s: no scripts inside the article" % name)
        img = os.path.join(SRC, "static", "guides", "img", slug + ".jpg")
        if not os.path.isfile(img):
            raise SystemExit("guide %s: picture missing - run: python3 tools/make_guide_heroes.py" % name)
        words = len(re.sub(r"<[^>]+>", " ", body).split())
        meta.update({"slug": slug, "image": slug, "body": body, "read_min": max(2, round(words / 200))})
        out.append(meta)
    return out


def _e(s):
    return htmllib.escape(s, quote=True)


def _human_date(iso):
    d = datetime.date.fromisoformat(iso)
    return "%d %s %d" % (d.day, d.strftime("%b"), d.year)


def _timer_link(t):
    return "/?focus=%d" % t["focus"] + ("&break=%d" % t["break"] if t.get("break") else "")


def _guide_cards(guides):
    cards = []
    for g in guides:
        cards.append('<a class="card" href="/guides/%s/"><img src="/guides/img/%s.jpg" alt="" width="1200" height="520" loading="lazy">'
                     '<span><b>%s</b><small>%s min read</small></span></a>' % (g["slug"], g["slug"], _e(g["h1"]), g["read_min"]))
    return '<div class="cards">%s</div>' % "".join(cards)


def render_guide(g, guides, site_url, is_index=False):
    by = {x["slug"]: x for x in guides}
    url = "%s/guides/%s/" % (site_url, g["slug"]) if not is_index else site_url + "/guides/"
    image_url = "%s/guides/img/%s.jpg" % (site_url, g["image"])
    timer = g.get("timer")
    if timer:
        f, b = int(timer["focus"]), int(timer.get("break") or 0)
        if not (1 <= f <= 180 and 0 <= b <= 60):
            raise SystemExit("guide %s: timer out of range" % g["slug"])
        label = "%d/%d" % (f, b) if b else "%d-minute" % f
        timer_box = ('<div class="timer-box"><span class="clock">%d:00%s</span><p>Opens %s with %d minutes of focus%s already set.</p>'
                     '<a class="btn" href="%s">Start a %s timer</a></div>'
                     % (f, "<small>+ %d min break</small>" % b if b else "", APP_NAME, f,
                        " and a %d-minute break" % b if b else "", _e(_timer_link(timer)), label))
        end_link, end_label = _timer_link(timer), "Start a free %s timer" % label
    else:
        timer_box, end_link, end_label = "", "/", "Open " + APP_NAME
    faq = ""
    if g.get("faq"):
        faq = '<section class="faq"><h2>Questions people ask</h2>%s</section>' % "".join(
            "<details><summary>%s</summary><p>%s</p></details>" % (_e(q["q"]), _e(q["a"])) for q in g["faq"])
    related = [by[s] for s in g.get("related", []) if s in by and s != g["slug"]]
    related_html = '<section class="related"><h2>More study guides</h2>%s</section>' % _guide_cards(related) if related else ""
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "Article", "headline": g["h1"], "description": g["description"], "image": image_url,
         "datePublished": g.get("published", g["updated"]), "dateModified": g["updated"], "mainEntityOfPage": url,
         "author": {"@type": "Organization", "name": APP_NAME, "url": site_url + "/"},
         "publisher": {"@type": "Organization", "name": APP_NAME, "logo": {"@type": "ImageObject", "url": site_url + "/icons/icon-512.png"}}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": site_url + "/"},
            {"@type": "ListItem", "position": 2, "name": "Study guides", "item": site_url + "/guides/"},
            {"@type": "ListItem", "position": 3, "name": g["h1"], "item": url}]}]}
    if is_index:
        ld = {"@context": "https://schema.org", "@graph": [
            {"@type": "CollectionPage", "name": g["h1"], "description": g["description"], "url": url,
             "hasPart": [{"@type": "Article", "headline": x["h1"], "url": "%s/guides/%s/" % (site_url, x["slug"])} for x in guides]},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": site_url + "/"},
                {"@type": "ListItem", "position": 2, "name": "Study guides", "item": url}]}]}
    page = read(os.path.join("guides", "_template.html"))
    fill = {
        "{{TITLE}}": _e(g["title"]), "{{DESCRIPTION}}": _e(g["description"]), "{{URL}}": _e(url), "{{IMAGE_URL}}": _e(image_url),
        "{{JSONLD}}": '<script type="application/ld+json">%s</script>' % json.dumps(ld).replace("</", "<\\/"),
        "{{CSS}}": read(os.path.join("guides", "guide.css")), "{{APP_NAME}}": APP_NAME,
        "{{IMAGE}}": "/guides/img/%s.jpg" % g["image"], "{{IMAGE_ALT}}": _e(g["imageAlt"]), "{{KICKER}}": _e(g["kicker"]),
        "{{H1}}": _e(g["h1"]), "{{UPDATED_HUMAN}}": _human_date(g["updated"]), "{{READ_MIN}}": str(g["read_min"]),
        "{{ANSWER}}": _e(g["answer"]), "{{TIMER_BOX}}": timer_box, "{{FAQ}}": faq, "{{RELATED}}": related_html,
        "{{END_LINK}}": _e(end_link), "{{END_LABEL}}": _e(end_label),
    }
    for k, v in fill.items():
        page = page.replace(k, v)
    page = page.replace("{{BODY}}", g["body"])
    left = re.findall(r"\{\{[A-Z_]+\}\}", page)
    if left:
        raise SystemExit("guide %s: unfilled keys %s" % (g["slug"], left[:3]))
    return ads_wording(page)


def render_guides_index(guides, site_url):
    g = {"slug": "", "title": "Study guides: focus, breaks and study methods | " + APP_NAME,
         "description": "Short, practical guides to studying with focus: study methods like 50/10 and Pomodoro, how long to study before a break, and more.",
         "h1": "Study guides", "kicker": "Learn to focus", "updated": max(x["updated"] for x in guides),
         "imageAlt": "A little island world made in " + APP_NAME, "read_min": 1,
         "answer": "Short, simple guides to help you study with focus. Each one comes with a free timer that is already set up for you.",
         "body": '<p class="list-intro">Pick a guide. Each one links to a free timer with the right times already set.</p>' + _guide_cards(guides)}
    return render_guide(dict(g, image=guides[0]["slug"]), guides, site_url, is_index=True)


PRIVACY_UPDATED = "2026-11-10"


def render_privacy(site_url, analytics, social, items=()):
    """The privacy page: what is kept (only the optional "Before you go" form), why, and how to delete it."""
    html = read("privacy.html")
    names = {"youtube": "YouTube", "instagram": "Instagram", "facebook": "Facebook", "x": "X", "threads": "Threads",
             "linkedin": "LinkedIn", "tiktok": "TikTok", "telegram": "Telegram", "whatsapp": "WhatsApp",
             "pinterest": "Pinterest", "website": "Website"}
    links = ['<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>' % (_e(x["url"]), _e(x.get("label") or names.get(x["platform"], "Link")))
             for x in social if not x.get("friend")]
    # Our own pages are shown as picture cards (products of kind Social page or Group), not as small links.
    links += ['<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>' % (_e(it["url"]), _e(it["title"]))
              for it in items if it.get("type") in ("social", "group") and not it.get("ad") and not it.get("hidden")]
    contact = ("Message us here: " + ", ".join(links) + ".") if links else "Use the links in the Toolshed."
    stats = ("<h2>Visit counts</h2><p>We count visits with Cloudflare Web Analytics. It uses no cookies and does not identify you.</p>"
             if analytics else "")
    for key, val in (("{{CSS}}", read(os.path.join("guides", "guide.css"))), ("{{APP_NAME}}", APP_NAME),
                     ("{{UPDATED}}", _human_date(PRIVACY_UPDATED)), ("{{CONTACT}}", contact), ("{{ANALYTICS}}", stats),
                     ("{{CANONICAL}}", '<link rel="canonical" href="%s/privacy/">' % site_url if site_url else "")):
        html = html.replace(key, val)
    left = re.findall(r"\{\{[A-Z_]+\}\}", html)
    if left:
        raise SystemExit("privacy page: unfilled %s" % left[:3])
    return ads_wording(html)


# ---------- product pages for Google (/shop/ and /shop/<id>/), made from My Shop's products ----------
TYPE_NAME = {"kit": "Kit", "ebook": "Ebook", "app": "App", "course": "Video course", "video": "Video", "website": "Website",
             "template": "Template", "tool": "Tool", "group": "Group", "social": "Social page"}
_CURRENCY = (("₹", "INR"), ("Rs", "INR"), ("INR", "INR"), ("US$", "USD"), ("USD", "USD"), ("$", "USD"),
             ("€", "EUR"), ("EUR", "EUR"), ("£", "GBP"), ("GBP", "GBP"))


def _offer_price(it):
    """(price, currency) for structured data, or None when the price can't be read (then no price is claimed)."""
    if it.get("free"):
        return ("0", "USD")
    p = it.get("price") or ""
    cur = next((code for sym, code in _CURRENCY if sym in p), None)
    m = re.search(r"\d[\d,]*(?:\.\d+)?", p)
    return (m.group(0).replace(",", ""), cur) if cur and m else None


def render_details(text):
    """The owner's longer text, made safe: blank line = new paragraph, '- ' = list item, '## ' = small heading."""
    out = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
        para, items = [], []

        def flush():
            if para:
                out.append("<p>%s</p>" % "<br>".join(_e(x) for x in para)); para.clear()
            if items:
                out.append("<ul>%s</ul>" % "".join("<li>%s</li>" % _e(x) for x in items)); items.clear()
        for ln in lines:
            if ln.startswith("## "):
                flush(); out.append("<h2>%s</h2>" % _e(ln[3:].strip()))
            elif ln.startswith("- "):
                if para:
                    flush()
                items.append(ln[2:].strip())
            else:
                if items:
                    flush()
                para.append(ln)
        flush()
    return "\n".join(out)


def _short(text, n):
    text = re.sub(r"\s+", " ", text or "").strip()
    return text if len(text) <= n else text[:n - 1].rsplit(" ", 1)[0].rstrip(",.;:") + "…"


def _product_cards(items):
    cards = []
    for it in items:
        cards.append('<a class="card p" href="/shop/%s/"><img src="/%s" alt="" width="960" height="540" loading="lazy">'
                     '<span><b>%s</b><small>%s</small></span></a>'
                     % (it["id"], _e(it["image"]), _e(it["title"]), _e(_price_label(it) + " · " + TYPE_NAME.get(it["type"], "Tool"))))
    return '<div class="cards">%s</div>' % "".join(cards)


def _price_label(it):
    return "Free" if it.get("free") else ("Link" if it.get("noPrice") else it.get("price", ""))


def _shop_page(title, description, url, image_url, og_type, ld, main, script=""):
    page = read(os.path.join("shop", "_product.html"))
    css = read(os.path.join("guides", "guide.css")) + "\n" + read(os.path.join("shop", "shop.css"))
    og_extra = []
    if url:
        og_extra.append('<meta property="og:url" content="%s">' % _e(url))
    if image_url:
        og_extra.append('<meta property="og:image" content="%s">' % _e(image_url))
    fill = {"{{TITLE}}": _e(title), "{{DESCRIPTION}}": _e(description), "{{OG_TYPE}}": og_type,
            "{{CANONICAL}}": '<link rel="canonical" href="%s">' % _e(url) if url else "", "{{OG_EXTRA}}": "\n".join(og_extra),
            "{{JSONLD}}": '<script type="application/ld+json">%s</script>' % json.dumps(ld).replace("</", "<\\/"),
            "{{CSS}}": css, "{{APP_NAME}}": APP_NAME, "{{SCRIPT}}": script}
    for k, v in fill.items():
        page = page.replace(k, v)
    page = page.replace("{{MAIN}}", main)
    left = re.findall(r"\{\{[A-Z_]+\}\}", page)
    if left:
        raise SystemExit("shop page: unfilled %s" % left[:3])
    return ads_wording(page)


def render_product(it, shown, cats, site_url):
    """One product's own page. `it` is the shelf entry (its url already points to /tools/... for our own tools)."""
    by_cat = {c["id"]: c for c in cats}
    url = "%s/shop/%s/" % (site_url, it["id"]) if site_url else ""
    image_url = "%s/%s" % (site_url, it["image"]) if site_url else ""
    my_cats = [by_cat[c] for c in it.get("categories", []) if c in by_cat]
    kicker = it.get("kicker") or TYPE_NAME.get(it["type"], "Tool")
    title = "%s | %s" % (it["title"], APP_NAME)
    description = _short(it.get("text") or it.get("hook") or it["title"], 158)
    offer = _offer_price(it)
    link = it["url"]
    host = "this site" if link.startswith("/") else urllib.parse.urlparse(link).hostname.replace("www.", "")
    rel = "noopener sponsored nofollow" if it.get("ad") else "noopener"
    price_html = ""
    if not it.get("noPrice"):
        price_html = '<span class="price%s">%s</span>' % (" free" if it.get("free") else "", _e(_price_label(it)))
    tags = ['<span class="tag">%s</span>' % _e(TYPE_NAME.get(it["type"], "Tool"))]
    if it.get("ad"):
        tags.append('<span class="tag ad" title="Paid promotion">Ad</span>')
    ask = [f for f in it.get("ask", []) if f in ("name", "phone", "email")]
    data = ' data-id="%s" data-title="%s" data-ask="%s"' % (_e(it["id"]), _e(it["title"]), ",".join(ask)) if ask else ""
    lead = ""
    if ask:
        lead = ('<section class="lead" id="leadBox" hidden aria-labelledby="leadTtl"><h2 id="leadTtl">Before you go &#x1F331;</h2>'
                '<p>Leave your details so %(app)s can help you with this.</p><form id="leadForm" novalidate>'
                '<label class="lead-field" id="l_nameRow"><span>Your name</span><input id="l_name" autocomplete="name" maxlength="60"></label>'
                '<label class="lead-field" id="l_phoneRow"><span>WhatsApp number</span>'
                '<input id="l_phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="22" placeholder="98123 45678"></label>'
                '<label class="lead-field" id="l_emailRow"><span>Email</span><input id="l_email" type="email" inputmode="email" '
                'autocomplete="email" maxlength="254" placeholder="you@example.com" spellcheck="false" autocapitalize="off"></label>'
                '<p class="small" id="l_either" hidden>Fill in at least one: your WhatsApp number or your email.</p>'
                '<label class="lead-ok"><input type="checkbox" id="l_ok"><span>Yes, %(app)s can contact me about this.</span></label>'
                '<input type="text" id="l_hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">'
                '<p class="msg" id="l_msg" role="alert"></p><button class="btn" type="submit">Continue &rarr;</button>'
                '<button class="skip" type="button" id="l_skip">Skip, just open it</button>'
                '<p class="small">Saved only so %(app)s can contact you. <a href="/privacy/">Privacy</a></p></form>'
                '<p id="l_done" hidden>Thank you! It&rsquo;s opening in a new tab. &#x1F331;</p></section>') % {"app": APP_NAME}
    details = render_details(it["details"]) if it.get("details") else ""
    good_for = ""
    if my_cats:
        good_for = '<section><h2>Helps with</h2><div class="good-for">%s</div></section>' % "".join(
            '<a class="tag" href="/shop/#cat-%s">%s %s</a>' % (c["id"], _e(c.get("emoji", "")), _e(c["name"])) for c in my_cats)
    same = [x for x in shown if x["id"] != it["id"] and set(x.get("categories", [])) & set(it.get("categories", []))]
    others = same + [x for x in shown if x["id"] != it["id"] and x not in same]
    related = '<section class="related"><h2>You might also like</h2>%s</section>' % _product_cards(others[:3]) if others else ""
    main = ('<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">›</span> '
            '<a href="/shop/">Shop</a></nav>'
            '<figure class="hero product"><img src="/%s" alt="%s" width="960" height="540"></figure>'
            '<p class="kicker">%s</p><h1>%s</h1><div class="price-line">%s%s</div>'
            '<div class="answer"><b>In short</b><p>%s</p></div>'
            '<div class="get"><a class="btn" id="getBtn" href="%s" target="_blank" rel="%s"%s>%s &rarr;</a><small>Opens %s</small></div>'
            '%s<article class="body">%s</article>%s%s'
            % (_e(it["image"]), _e(it.get("imageAlt") or it["title"]), _e(kicker), _e(it["title"]), price_html, "".join(tags),
               _e(it.get("text") or it.get("hook") or ""), _e(link), rel, data, _e(it.get("cta") or "Take a look"), _e(host),
               lead, details, good_for, related))
    crumbs = {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": site_url + "/"},
        {"@type": "ListItem", "position": 2, "name": "Shop", "item": site_url + "/shop/"},
        {"@type": "ListItem", "position": 3, "name": it["title"], "item": url}]}
    body_text = _short((it.get("text") or "") + " " + re.sub(r"(^|\n)(## |- )", r"\1", it.get("details") or ""), 600)
    if offer:
        thing = {"@type": "Product", "name": it["title"], "description": body_text, "image": image_url, "url": url,
                 "category": ", ".join(c["name"] for c in my_cats) or TYPE_NAME.get(it["type"], "Tool"),
                 "offers": {"@type": "Offer", "price": offer[0], "priceCurrency": offer[1],
                            "availability": "https://schema.org/InStock",
                            "url": (site_url + link) if link.startswith("/") else link}}
    else:
        thing = {"@type": "WebPage", "name": it["title"], "description": body_text, "url": url, "image": image_url}
    ld = {"@context": "https://schema.org", "@graph": [thing, crumbs]}
    script = "<script>%s</script>" % read(os.path.join("shop", "shop.js")) if ask else ""
    return _shop_page(title, description, url, image_url, "product" if offer else "website", ld, main, script)


def render_shop_index(shown, cats, site_url):
    url = site_url + "/shop/" if site_url else ""
    live = [c for c in cats if any(c["id"] in x.get("categories", []) for x in shown)]
    placed, sections = set(), []
    for c in live:
        group = [x for x in shown if c["id"] in x.get("categories", []) and x["id"] not in placed]
        if not group:
            continue
        placed.update(x["id"] for x in group)
        sections.append('<h2 class="shop-cat" id="cat-%s">%s %s</h2>%s' % (c["id"], _e(c.get("emoji", "")), _e(c["name"]), _product_cards(group)))
    rest = [x for x in shown if x["id"] not in placed]
    if rest:
        sections.append('<h2 class="shop-cat" id="cat-more">%s</h2>%s' % ("More" if sections else "Everything", _product_cards(rest)))
    names = ", ".join(c["name"].lower() for c in live[:4])
    description = _short("Helpful kits, tools, courses and pages%s. Some are free, some are paid." % (" for " + names if names else ""), 158)
    main = ('<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">›</span> Shop</nav>'
            '<p class="kicker">Handy helpers</p><h1>Shop</h1>'
            '<div class="answer"><b>What&rsquo;s here</b><p>Kits, tools, courses, groups and pages that can help. '
            'Some are free, some are paid. Paid promotions are marked &ldquo;Ad&rdquo;.</p></div>%s' % "".join(sections))
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "CollectionPage", "name": "Shop", "description": description, "url": url,
         "mainEntity": {"@type": "ItemList", "itemListElement": [
             {"@type": "ListItem", "position": i + 1, "url": "%s/shop/%s/" % (site_url, x["id"]), "name": x["title"]}
             for i, x in enumerate(shown)]}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": site_url + "/"},
            {"@type": "ListItem", "position": 2, "name": "Shop", "item": url}]}]}
    return _shop_page("Shop: kits, tools and pages that help | " + APP_NAME, description, url,
                      (site_url + "/og.jpg") if site_url else "", "website", ld, main)


def copy_shelf(dest, items, site):
    """Product cover pictures, plus (live site only) our own free tool pages under /tools/<id>/."""
    out = os.path.join(dest, "shelf")
    os.makedirs(out, exist_ok=True)
    for it in items:
        shutil.copyfile(os.path.join(SRC, it["image"]), os.path.join(out, os.path.basename(it["image"])))
        if site and it.get("local"):
            tdir = os.path.join(dest, "tools", it["id"])
            os.makedirs(tdir, exist_ok=True)
            shutil.copyfile(os.path.join(SRC, it["local"]), os.path.join(tdir, "index.html"))


def main():
    site = "--site" in sys.argv
    site_url = os.environ.get("FW_SITE_URL", "").rstrip("/")
    analytics = os.environ.get("FW_CF_ANALYTICS", "").strip()
    if site_url and not site_url.startswith("https://"):
        raise SystemExit("FW_SITE_URL must start with https://")
    if "--icons" in sys.argv:
        asyncio.run(render_images(os.path.join(SRC, "static")))
        print("pictures redrawn in src/static/")
        return
    os.makedirs(DIST, exist_ok=True)
    cat = load_catalog()
    items, social, cats = cat["items"], social_for(cat), categories_for(cat)
    global ADS_SHOWN
    ADS_SHOWN = any(it.get("ad") and not it.get("hidden") for it in items) or any(x.get("ad") for x in social)
    preview = build_html(site_url, pwa=False, analytics="", shelf=shelf_for(items, False), social=social, categories=cats)
    with open(os.path.join(DIST, "preview.html"), "w", encoding="utf-8") as f:
        f.write(preview)
    copy_shelf(DIST, items, False)
    print("preview:", os.path.join(DIST, "preview.html"), len(preview) // 1024, "KB")
    if not site:
        return
    out = os.path.join(DIST, "site")
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)
    with open(os.path.join(out, "index.html"), "w", encoding="utf-8") as f:
        f.write(build_html(site_url, pwa=True, analytics=analytics, shelf=shelf_for(items, True), social=social, categories=cats))
    copy_shelf(out, items, True)
    # Icons and the link-preview picture are drawn once (python3 build.py --icons) and kept in src/static/.
    static = os.path.join(SRC, "static")
    for need in ("icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "og.jpg",
                 "favicon.ico", "favicon.svg", "favicon-96.png"):
        if not os.path.isfile(os.path.join(static, need)):
            raise SystemExit("Missing src/static/%s - run: python3 build.py --icons" % need)
    shutil.copytree(static, out, dirs_exist_ok=True)
    guides = load_guides()
    for g in guides:
        gdir = os.path.join(out, "guides", g["slug"])
        os.makedirs(gdir, exist_ok=True)
        with open(os.path.join(gdir, "index.html"), "w", encoding="utf-8") as f:
            f.write(render_guide(g, guides, site_url))
    if guides:
        with open(os.path.join(out, "guides", "index.html"), "w", encoding="utf-8") as f:
            f.write(render_guides_index(guides, site_url))
    shown = shelf_for(items, True)
    for it in shown:
        pdir = os.path.join(out, "shop", it["id"])
        os.makedirs(pdir, exist_ok=True)
        with open(os.path.join(pdir, "index.html"), "w", encoding="utf-8") as f:
            f.write(render_product(dict(it, details=next(x.get("details", "") for x in items if x["id"] == it["id"])), shown, cats, site_url))
    if shown:
        with open(os.path.join(out, "shop", "index.html"), "w", encoding="utf-8") as f:
            f.write(render_shop_index(shown, cats, site_url))
    os.makedirs(os.path.join(out, "privacy"))
    with open(os.path.join(out, "privacy", "index.html"), "w", encoding="utf-8") as f:
        f.write(render_privacy(site_url, analytics, social, items))
    os.makedirs(os.path.join(out, "admin"))
    with open(os.path.join(out, "admin", "index.html"), "w", encoding="utf-8") as f:
        f.write(build_admin())
    # Only My Shop's server part and the "Before you go" form run code; everything else is plain files (free and unlimited).
    with open(os.path.join(out, "_routes.json"), "w") as f:
        json.dump({"version": 1, "include": ["/admin/api/*", "/api/*"], "exclude": []}, f)
    commit = re.sub(r"[^0-9a-f]", "", os.environ.get("CF_PAGES_COMMIT_SHA", "").lower())[:40]
    with open(os.path.join(out, "version.json"), "w") as f:
        json.dump({"commit": commit, "version": VERSION}, f)
    manifest = {
        "name": APP_NAME, "short_name": APP_NAME,
        "description": "A calm focus timer that grows your own island.",
        "start_url": "/", "scope": "/", "display": "standalone",
        "background_color": "#16204a", "theme_color": "#16204a",
        "icons": [
            {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
            {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            {"src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    with open(os.path.join(out, "manifest.webmanifest"), "w") as f:
        json.dump(manifest, f, indent=2)
    with open(os.path.join(out, "sw.js"), "w") as f:
        f.write(SW % VERSION)
    with open(os.path.join(out, "_headers"), "w") as f:
        f.write(headers(analytics))
    robots = "User-agent: *\nAllow: /\nDisallow: /admin/\n" + ("Sitemap: %s/sitemap.xml\n" % site_url if site_url else "")
    with open(os.path.join(out, "robots.txt"), "w") as f:
        f.write(robots)
    if site_url:
        pages = ["/"] + ["/tools/%s/" % it["id"] for it in items if it.get("local") and not it.get("hidden")] + ["/privacy/"]
        pages += (["/shop/"] + ["/shop/%s/" % it["id"] for it in shown]) if shown else []
        pages += (["/guides/"] + ["/guides/%s/" % g["slug"] for g in guides]) if guides else []
        with open(os.path.join(out, "sitemap.xml"), "w") as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                    + "".join("<url><loc>%s%s</loc></url>" % (site_url, p) for p in pages) + "</urlset>\n")
    print("site folder:", out, sorted(os.listdir(out)))


if __name__ == "__main__":
    main()
