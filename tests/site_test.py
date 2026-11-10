import asyncio, threading, http.server, functools, os
from playwright.async_api import async_playwright
SITE = "/home/claude/focusworld/dist/site"
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
        ok = path.startswith(pat[:-1]) if pat.endswith("*") else path == pat
        if not ok:
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
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8765), functools.partial(H, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 390, "height": 844})
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        r = await pg.goto("http://127.0.0.1:8765/")
        print("status", r.status, "csp header present:", "content-security-policy" in r.headers)
        await pg.wait_for_timeout(1000)
        await pg.click("#obBtns .btn.primary"); await pg.click("#obBtns .btn.primary"); await pg.click("#obBtns .btn.soft")
        await pg.click("#soundBtn"); await pg.wait_for_timeout(300)
        await pg.click(".sound-row:nth-child(1) .sound-toggle"); await pg.wait_for_timeout(400)
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(400)
        await pg.click("#shareBtn")
        w = 0
        for _ in range(40):
            w = await pg.evaluate("document.getElementById('shareImg').naturalWidth")
            if w: break
            await pg.wait_for_timeout(200)
        print("share picture width:", w)
        for path in ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/sw.js", "/og.jpg", "/robots.txt"]:
            rr = await pg.request.get("http://127.0.0.1:8765" + path)
            print(path, rr.status)
        print("console errors/warnings:", errs)
        for tool in ["/tools/first-reply/", "/tools/irs-letter-check/"]:
            tp = await b.new_page(viewport={"width": 390, "height": 844})
            terrs = []
            tp.on("console", lambda m: terrs.append(m.text) if m.type == "error" else None)
            tp.on("pageerror", lambda e: terrs.append(str(e)))
            rr = await tp.goto("http://127.0.0.1:8765" + tool)
            await tp.wait_for_timeout(1200)
            title = await tp.title()
            csp = [e for e in terrs if "Content Security Policy" in e]
            other = [e for e in terrs if "Content Security Policy" not in e and "fonts.g" not in e and "net::ERR" not in e and "Failed to load resource" not in e]
            print(tool, rr.status, title, "| CSP problems:", csp, "| other errors:", other)
            await tp.close()
        await b.close()
asyncio.run(main())
srv.shutdown()
