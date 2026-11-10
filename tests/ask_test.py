"""Ask Pip in a real browser, on the built site with its real security headers.
Run: python3 build.py --site && python3 tests/ask_test.py"""
import asyncio, threading, http.server, functools, os, sys
from playwright.async_api import async_playwright

SITE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist", "site")


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
    """Serves the built site with the same headers (including the security policy) as the live site."""
    def end_headers(self):
        for k, v in headers_for(self.path.split("?")[0]).values():
            self.send_header(k, v)
        super().end_headers()

    def log_message(self, *a):
        pass


PORT = 8767
srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), functools.partial(H, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = "http://127.0.0.1:%d/" % PORT
SHOTS = os.path.join(os.path.dirname(__file__), "shots")
fails = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        fails.append(msg)


async def fresh(b, w, h):
    pg = await b.new_page(viewport={"width": w, "height": h})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(URL)
    await pg.wait_for_timeout(800)
    await pg.click("#obBtns .btn.primary"); await pg.click("#obBtns .btn.primary"); await pg.click("#obBtns .btn.soft")
    await pg.wait_for_timeout(300)
    return pg, errs


async def last_bot(pg):
    for _ in range(40):
        if await pg.evaluate("!document.querySelector('#askLog .typing')"):
            break
        await pg.wait_for_timeout(100)
    return await pg.evaluate("""() => { const b = [...document.querySelectorAll('#askLog .msg.bot .bubble')].pop();
      return { text: b.innerText, cards: [...b.querySelectorAll('.chat-card')].map(a => a.getAttribute('href')),
        acts: [...b.querySelectorAll('.chat-act')].map(a => [a.textContent, a.getAttribute('href')]),
        chips: [...document.querySelectorAll('#askLog .chat-chips button')].map(c => c.textContent) }; }""")


async def say(pg, text):
    await pg.fill("#askInput", text)
    await pg.press("#askInput", "Enter")
    await pg.wait_for_timeout(150)
    return await last_bot(pg)


async def dock_fits(pg):
    return await pg.evaluate("""() => { const d = document.querySelector('.dock').getBoundingClientRect();
      const bs = [...document.querySelectorAll('.dock-btn')];
      return { n: bs.length, fits: bs.every(b => { const r = b.getBoundingClientRect(); return r.left >= d.left - 1 && r.right <= d.right + 1 && r.width >= 48; }),
        labels: bs.every(b => b.scrollWidth <= b.clientWidth + 1) }; }""")


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg, errs = await fresh(b, 390, 844)

        d = await dock_fits(pg)
        check(d["n"] == 5 and d["fits"] and d["labels"], "phone: five dock buttons fit with full labels %s" % d)

        await pg.click("#askBtn"); await pg.wait_for_timeout(500)
        check(await pg.is_visible("#sheetAsk"), "Ask Pip opens")
        w = await last_bot(pg)
        check("Pip" in w["text"] and len(w["chips"]) == 6, "welcome message with 6 buttons: %s" % w["chips"])
        await pg.screenshot(path=os.path.join(SHOTS, "ask_welcome.png"))

        await pg.click("#askLog .chat-chips button:has-text(\"can’t focus\")"); await pg.wait_for_timeout(150)
        r = await last_bot(pg)
        check("phone in another room" in r["text"] and any("Start 25" in a[0] for a in r["acts"]), "button answer: can't focus")
        check(await pg.evaluate("document.querySelectorAll('#askLog .msg.me').length") == 1, "the tapped button shows as my message")

        r = await say(pg, "my teacher says I used ChatGPT on my essay")
        check(len(r["cards"]) == 2 and "/tools/first-reply/" in r["cards"], "AI accusation shows the 2 matching products: %s" % r["cards"])
        await pg.screenshot(path=os.path.join(SHOTS, "ask_products.png"))
        target = await pg.get_attribute("#askLog .chat-card", "target")
        check(target == "_blank", "product links open in a new tab")

        r = await say(pg, "how long should I study before a break")
        check(any(h == "/guides/50-10-study-method/" for _, h in r["acts"]), "links to the published study guide")

        r = await say(pg, "what can i unlock")
        check("Next up: First sprout" in r["text"], "uses the person's own progress")

        r = await say(pg, "I want to die")
        check(any(h == "tel:14416" for _, h in r["acts"]) and any("findahelpline.com" in (h or "") for _, h in r["acts"]) and not r["cards"],
              "someone in danger gets helplines, not products")

        r = await say(pg, "something else is wrong")
        check(len(r["cards"]) == 4 and any("School" in c for c in r["chips"]) and any("Money" in c for c in r["chips"]),
              "'something else' shows the shelf and category buttons: %s" % r["chips"])
        await pg.locator("#askLog .chat-chips button", has_text="Money").click(); await pg.wait_for_timeout(150)
        r = await last_bot(pg)
        check("Money & taxes" in r["text"] and len(r["cards"]) == 2, "a category button shows that category's products")

        r = await say(pg, "qwzx")
        check("didn’t catch" in r["text"] and r["chips"], "unknown message gets a gentle hint and buttons")

        # A button that changes the timer
        r = await say(pg, "exam tomorrow")
        await pg.locator("#askLog .msg.bot").last.locator(".chat-act", has_text="Set 50 + 10").click()
        await pg.wait_for_timeout(600)
        st = await pg.evaluate("window.__fw.state().settings")
        check(not await pg.is_visible("#sheetAsk") and st["focusMin"] == 50 and st["breakMin"] == 10, "Set 50 + 10 sets the timer and closes the chat")
        check("50" in (await pg.text_content("#startBtn")), "start button now says 50 min")

        # The chat is still there when it opens again
        await pg.click("#askBtn"); await pg.wait_for_timeout(500)
        n = await pg.evaluate("document.querySelectorAll('#askLog .msg.me').length")
        check(n >= 9, "conversation is kept while the page is open (%d of my messages)" % n)

        # Keyboard: Escape closes, focus goes back to the button
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(500)
        check(not await pg.is_visible("#sheetAsk"), "Escape closes Ask Pip")

        # Ways in from the Toolshed and About pages
        await pg.click("#toolsBtn"); await pg.wait_for_timeout(400)
        await pg.click("#sheetTools [data-ask]"); await pg.wait_for_timeout(500)
        check(await pg.is_visible("#sheetAsk") and not await pg.is_visible("#sheetTools"), "Toolshed link opens Ask Pip")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(400)
        await pg.click("#menuBtn"); await pg.wait_for_timeout(300); await pg.click("#aboutBtn"); await pg.wait_for_timeout(400)
        await pg.click("#sheetAbout [data-ask]"); await pg.wait_for_timeout(500)
        check(await pg.is_visible("#sheetAsk"), "About & help button opens Ask Pip")

        # Start a session from the chat; during focus, Pip waits
        r = await say(pg, "I keep procrastinating")
        await pg.locator("#askLog .msg.bot").last.locator(".chat-act", has_text="2 tiny minutes").click()
        await pg.wait_for_timeout(600)
        check(await pg.evaluate("window.__fw.state().session && window.__fw.state().session.kind") == "focus", "Start 2 tiny minutes starts a session")
        op = await pg.evaluate("getComputedStyle(document.getElementById('askBtn')).opacity")
        check(float(op) < 0.5, "Ask Pip is dimmed while focusing")
        await pg.evaluate("document.getElementById('askBtn').click()"); await pg.wait_for_timeout(400)
        check(not await pg.is_visible("#sheetAsk"), "Ask Pip stays closed during focus (keyboard can't sneak in)")

        check(not errs, "no errors in the console: %s" % errs[:3])
        await pg.close()

        # Small phones: the dock still fits
        for wd, ht in ((360, 740), (320, 640)):
            pg, errs = await fresh(b, wd, ht)
            d = await dock_fits(pg)
            check(d["n"] == 5 and d["fits"], "%dpx phone: dock fits %s" % (wd, d))
            await pg.screenshot(path=os.path.join(SHOTS, "ask_dock_%d.png" % wd))
            await pg.click("#askBtn"); await pg.wait_for_timeout(500)
            await say(pg, "teacher thinks i used ai")
            over = await pg.evaluate("document.getElementById('sheetAsk').scrollWidth > document.getElementById('sheetAsk').clientWidth + 1")
            check(not over, "%dpx phone: chat has no sideways scrolling" % wd)
            await pg.screenshot(path=os.path.join(SHOTS, "ask_chat_%d.png" % wd))
            check(not errs, "%dpx: no console errors" % wd)
            await pg.close()

        # Laptop
        pg, errs = await fresh(b, 1440, 900)
        await pg.click("#askBtn"); await pg.wait_for_timeout(500)
        focused = await pg.evaluate("document.activeElement && document.activeElement.id")
        check(focused == "askInput", "laptop: the typing box is ready right away")
        await pg.keyboard.type("is it free"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(150)
        r = await last_bot(pg)
        check("free" in r["text"].lower(), "laptop: typed question answered")
        await say(pg, "what do you sell")
        await pg.screenshot(path=os.path.join(SHOTS, "ask_desktop.png"))
        check(not errs, "laptop: no console errors")
        await b.close()
    srv.shutdown()
    print("\n%d problem(s)" % len(fails) if fails else "\nall Ask Pip checks passed")
    sys.exit(1 if fails else 0)


asyncio.run(main())
