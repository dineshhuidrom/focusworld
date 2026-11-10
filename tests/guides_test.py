# Opens every study guide like a visitor (with the live _headers rules), checks for errors,
# and checks the one-tap timer link opens the app with the right times. Screenshots go to tests/shots/.
import asyncio, functools, http.server, os, re, sys, threading
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
SITE = "/home/claude/focusworld/dist/site"
PORT = 8766


def parse_headers(text):
    rules, cur = [], None
    for line in text.splitlines():
        if not line.strip():
            continue
        if not line.startswith(" "):
            cur = [line.strip(), []]; rules.append(cur)
        else:
            cur[1].append(line.strip())
    return rules


RULES = parse_headers(open(os.path.join(SITE, "_headers")).read())


def headers_for(path):
    out = {}
    for pat, lines in RULES:
        if not (path.startswith(pat[:-1]) if pat.endswith("*") else path == pat):
            continue
        for l in lines:
            if l.startswith("!"):
                out.pop(l[1:].strip().lower(), None)
            else:
                k, v = l.split(":", 1); out[k.strip().lower()] = (k.strip(), v.strip())
    return out


class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        for k, v in headers_for(self.path.split("?")[0]).values():
            self.send_header(k, v)
        super().end_headers()

    def log_message(self, *a):
        pass


srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(H, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = "http://127.0.0.1:%d" % PORT
fails = 0


def check(ok, what):
    global fails
    print(("ok  - " if ok else "FAIL - ") + what)
    if not ok:
        fails += 1


async def main():
    slugs = sorted(d for d in os.listdir(os.path.join(SITE, "guides")) if d not in ("img",) and os.path.isdir(os.path.join(SITE, "guides", d)))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        pg = await ctx.new_page()
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("response", lambda r: errs.append("%d %s" % (r.status, r.url)) if r.status >= 400 else None)
        for path in ["/guides/"] + ["/guides/%s/" % s for s in slugs]:
            r = await pg.goto(BASE + path)
            await pg.wait_for_timeout(400)
            check(r.status == 200, "%s loads" % path)
            h1 = await pg.inner_text("h1")
            title = await pg.title()
            canon = await pg.get_attribute("link[rel=canonical]", "href")
            check(bool(h1) and bool(title) and canon.endswith(path), "%s has title, heading and canonical (%s)" % (path, canon))
            ld = await pg.eval_on_selector_all('script[type="application/ld+json"]', "n => n.map(x => JSON.parse(x.textContent)['@graph'].length)")
            check(ld == [2], "%s has valid structured data" % path)
            name = "guide_" + (path.strip("/").split("/")[-1] or "index")
            await pg.screenshot(path="/home/claude/focusworld/tests/shots/%s.png" % name, full_page=True)
        # one-tap timer link
        await pg.goto(BASE + "/guides/%s/" % slugs[0])
        href = await pg.get_attribute(".timer-box .btn", "href")
        await pg.click(".timer-box .btn")
        await pg.wait_for_timeout(1200)
        btn = await pg.inner_text("#startBtn")
        check(m := re.search(r"\d+", href) is not None, "timer link present: %s" % href)
        want = re.search(r"focus=(\d+)", href).group(1)
        check(("Grow for %s min" % want) in btn, "app opens with %s minutes set: %r" % (want, btn))
        check("focus=" not in pg.url, "link details are removed from the address bar: " + pg.url)
        brk = await pg.evaluate("window.__fw.state().settings.breakMin")
        wb = re.search(r"break=(\d+)", href)
        check(not wb or brk == int(wb.group(1)), "break set to %s" % brk)
        check(not errs, "no errors or missing files: %s" % errs[:4])
        await b.close()
    print("guides test failures:", fails)
    sys.exit(1 if fails else 0)

asyncio.run(main())
