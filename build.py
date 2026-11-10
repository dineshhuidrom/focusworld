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

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
DIST = os.path.join(ROOT, "dist")
VERSION = "1.0.0"
APP_NAME = "Focus World"
JS_ORDER = ["logic.js", "items.js", "places.js", "world.js", "audio.js", "app.js"]

# ---- catalog rules: the same rules as lib/catalog-rules.mjs (tests/test_rules.mjs checks they agree) ----
TYPES = ["kit", "ebook", "app", "course", "video", "website", "template", "tool"]
PLATFORMS = ["youtube", "instagram", "facebook", "x", "threads", "linkedin", "tiktok", "telegram", "whatsapp",
             "pinterest", "website"]
LIMITS = {"items": 60, "social": 12, "id": 48, "title": 90, "hook": 100, "text": 260, "kicker": 40, "cta": 24,
          "price": 14, "imageAlt": 140, "tags": 24, "tag": 32, "url": 600, "label": 30, "help": 2000}
ITEM_KEYS = ["id", "type", "kicker", "title", "hook", "text", "price", "free", "cta", "image", "imageAlt",
             "url", "local", "tags", "featured", "hidden"]
SOCIAL_KEYS = ["platform", "url", "label"]
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
        if k not in ("_help", "items", "social"):
            err("catalog", k, "Unknown part: " + k)
    if "_help" in cat and (not _is_str(cat["_help"]) or _js_len(cat["_help"]) > LIMITS["help"]):
        err("catalog", "_help", "Help note is too long.")
    items = cat.get("items")
    if not isinstance(items, list):
        err("catalog", "items", "The product list is missing.")
        return errors
    if len(items) > LIMITS["items"]:
        err("catalog", "items", "Too many products.")
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
                              ("price", False), ("imageAlt", False), ("local", False)):
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
        for k in ("free", "featured", "hidden"):
            if k in it and not isinstance(it[k], bool):
                err(where, k, k + " must be true or false.")
        if it.get("free") is not True and not (_is_str(it.get("price")) and it.get("price")):
            err(where, "price", "Add a price, or mark it Free.")
        if "tags" in it:
            if not isinstance(it["tags"], list):
                err(where, "tags", "Search words must be a list.")
            else:
                if len(it["tags"]) > LIMITS["tags"]:
                    err(where, "tags", "Too many search words.")
                for t in it["tags"]:
                    if not _is_str(t) or not t.strip(JS_WS) or _js_len(t) > LIMITS["tag"] or CTRL_RE.search(t):
                        err(where, "tags", "A search word is empty or too long.")
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


def shelf_for(items, site):
    """What the page needs. Hidden products are left out. On the live site, free tools open from our own address."""
    out = []
    for it in items:
        if it.get("hidden"):
            continue
        d = {k: it[k] for k in ("id", "type", "kicker", "title", "hook", "text", "price", "free", "cta",
                                "image", "imageAlt", "tags", "featured") if k in it}
        d["url"] = "/tools/%s/" % it["id"] if (site and it.get("local")) else it["url"]
        out.append(d)
    return out


def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as f:
        return f.read()


def social_for(cat):
    return [{k: s[k] for k in ("platform", "url", "label") if k in s} for s in cat.get("social", [])]


def build_html(site_url, pwa, analytics, shelf, social):
    js = "\n".join(read(n) for n in JS_ORDER)
    css = read("style.css")
    if "</script" in js.lower() or "</style" in css.lower():
        raise SystemExit("Refusing to inline: a closing tag was found in the source.")
    config = {"appName": APP_NAME, "siteUrl": site_url, "pwa": pwa, "version": VERSION, "shelf": shelf,
              "social": social}
    config_js = "window.FW_CONFIG = " + json.dumps(config).replace("</", "<\\/") + ";"
    head = []
    if pwa:
        head.append('<link rel="manifest" href="/manifest.webmanifest">')
        head.append('<link rel="apple-touch-icon" href="/icons/icon-180.png">')
    if site_url:
        head.append('<link rel="canonical" href="%s/">' % site_url)
        head.append('<meta property="og:url" content="%s/">' % site_url)
        head.append('<meta property="og:image" content="%s/og.jpg">' % site_url)
        head.append('<meta name="twitter:card" content="summary_large_image">')
    if analytics:
        head.append("<script defer src=\"https://static.cloudflareinsights.com/beacon.min.js\" "
                    "data-cf-beacon='{\"token\": \"%s\"}'></script>" % analytics)
    html = read("index.html")
    for key, val in (("{{CSS}}", css), ("{{JS}}", js), ("{{CONFIG}}", config_js),
                     ("{{HEAD_EXTRA}}", "\n".join(head)), ("{{APP_NAME}}", APP_NAME)):
        html = html.replace(key, val)
    left = re.findall(r"\{\{[A-Z_]+\}\}", html)
    if left:
        raise SystemExit("Unfilled template keys: %s" % left[:3])
    return html


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
    js = read(os.path.join("admin", "admin.js"))
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
    items, social = cat["items"], social_for(cat)
    preview = build_html(site_url, pwa=False, analytics="", shelf=shelf_for(items, False), social=social)
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
        f.write(build_html(site_url, pwa=True, analytics=analytics, shelf=shelf_for(items, True), social=social))
    copy_shelf(out, items, True)
    # Icons and the link-preview picture are drawn once (python3 build.py --icons) and kept in src/static/.
    static = os.path.join(SRC, "static")
    for need in ("icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "og.jpg"):
        if not os.path.isfile(os.path.join(static, need)):
            raise SystemExit("Missing src/static/%s - run: python3 build.py --icons" % need)
    shutil.copytree(static, out, dirs_exist_ok=True)
    os.makedirs(os.path.join(out, "admin"))
    with open(os.path.join(out, "admin", "index.html"), "w", encoding="utf-8") as f:
        f.write(build_admin())
    # Only My Shop's server part runs code; everything else is plain files (free and unlimited).
    with open(os.path.join(out, "_routes.json"), "w") as f:
        json.dump({"version": 1, "include": ["/admin/api/*"], "exclude": []}, f)
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
        with open(os.path.join(out, "sitemap.xml"), "w") as f:
            f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                    "<url><loc>%s/</loc></url></urlset>\n" % site_url)
    print("site folder:", out, sorted(os.listdir(out)))


if __name__ == "__main__":
    main()
