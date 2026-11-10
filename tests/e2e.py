"""End-to-end checks of dist/preview.html in headless Chrome (phone + laptop)."""
import asyncio, json, os, time
from playwright.async_api import async_playwright

PAGE = "file:///home/claude/focusworld/dist/preview.html"
OUT = "/home/claude/focusworld/tests/shots"
os.makedirs(OUT, exist_ok=True)
MIN = 60000
fails = []
passes = 0


def check(cond, msg):
    global passes
    if cond:
        passes += 1
    else:
        fails.append(msg)
        print("FAIL:", msg)


async def state(pg):
    return await pg.evaluate("JSON.parse(JSON.stringify(window.__fw.state()))")


async def shift_session(pg, ms):
    # Move the running session back in time, as if `ms` had passed.
    await pg.evaluate("ms => { const s = window.__fw.state().session; s.startedAt -= ms; s.lastSeen = Date.now(); }", ms)
    await pg.wait_for_timeout(700)


async def snap(pg, name):
    await pg.wait_for_timeout(450)
    await pg.screenshot(path=os.path.join(OUT, name + ".png"))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome",
                                    args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, accept_downloads=True)
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        pg.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)

        # 1. first visit -> onboarding
        await pg.goto(PAGE)
        await pg.evaluate("localStorage.clear()")
        await pg.reload()
        await pg.wait_for_timeout(1200)
        check(await pg.is_visible("#onboard"), "onboarding shows on first visit")
        await snap(pg, "e2e_01_onboard")
        await pg.click("#obBtns .btn.primary")
        await pg.click("#obBtns .btn.primary")
        txt = await pg.inner_text("#obBtns")
        check("go!" in txt and "Just look around" in txt, "last onboarding step offers the 2-minute start")
        await pg.click("text=Look around")
        await pg.wait_for_timeout(300)
        check(not await pg.is_visible("#onboard"), "onboarding closes")
        st = await state(pg)
        check(st["onboarded"] is True, "onboarded saved")
        await snap(pg, "e2e_02_idle_empty")
        name = (await pg.inner_text("#sceneName")).strip()
        check(name in ("Mountain Valley", "Desert Oasis", "City Rooftop", "Sunny Meadow", "Cherry Spring", "Cozy Rain", "Misty Morning"), "a starting scene shows: %s" % name)

        # 2. Just 2 minutes -> completes -> sprout + Pip offer
        await pg.click("#tinyBtn")
        await pg.wait_for_timeout(300)
        check(await pg.get_attribute("#panel", "data-mode") == "focus", "2-minute session starts")
        check((await pg.inner_text("#timer")).strip() in ("02:00", "01:59"), "timer shows 2 minutes")
        await pg.wait_for_timeout(500)
        ch = await pg.evaluate("Object.keys(window.__fw.engine.ch)")
        check("lofi" in ch and "rain" in ch, "first session starts lofi + rain sound: %s" % ch)
        check("lofi + soft rain" in await pg.inner_text("#toast"), "toast says which sound is playing")
        await shift_session(pg, 50 * 1000)
        await snap(pg, "e2e_03_focus_running")
        await shift_session(pg, 75 * 1000)
        st = await state(pg)
        check(st["session"] is None and abs(st["totalMs"] - 2 * MIN) < 1, "2-minute session credited")
        check("sprout" in st["seen"], "sprout unlocked")
        pip_txt = await pg.inner_text("#pipText") if await pg.is_visible("#pip") else ""
        check("Keep going" in await pg.inner_text("#pipBtns") and "Yay, you started" in pip_txt, "Pip offers to keep going")
        await snap(pg, "e2e_04_tiny_done")

        # 3. keep going -> pause/resume -> stop early (under 30 s, nothing added)
        await pg.click("#pipBtns .primary")
        await pg.wait_for_timeout(300)
        st = await state(pg)
        check(st["session"] and st["session"]["plannedMs"] == 23 * MIN, "keep going starts 23 more minutes")
        await pg.click("#pauseBtn")
        await pg.wait_for_timeout(200)
        check(await pg.get_attribute("#panel", "data-mode") == "paused", "pause works")
        t1 = await pg.inner_text("#timer"); await pg.wait_for_timeout(1300); t2 = await pg.inner_text("#timer")
        check(t1 == t2, "timer frozen while paused")
        await pg.click("#pauseBtn")
        await pg.wait_for_timeout(200)
        check(await pg.get_attribute("#panel", "data-mode") == "focus", "resume works")
        await pg.click("#stopBtn")
        await pg.wait_for_timeout(450)
        check(await pg.is_visible("#sheetConfirm"), "stop asks to confirm")
        await snap(pg, "e2e_05_stop_confirm")
        await pg.click("#confirmYes")
        await pg.wait_for_timeout(450)
        st = await state(pg)
        check(st["session"] is None and abs(st["totalMs"] - 2 * MIN) < 1, "early stop under 30 s adds nothing")

        # 4. reload during a session keeps it running
        await pg.click("button[data-min='25']")
        await pg.click("#startBtn")
        await shift_session(pg, 3 * MIN)
        await pg.reload()
        await pg.wait_for_timeout(900)
        st = await state(pg)
        check(st["session"] is not None and st["session"]["kind"] == "focus", "session survives a reload")
        # 5. full session -> auto break with shelf line -> skip break
        await shift_session(pg, 23 * MIN)
        st = await state(pg)
        check(st["session"] and st["session"]["kind"] == "break", "break starts after focus")
        check(abs(st["totalMs"] - 27 * MIN) < 1, "25 minutes credited (total 27)")
        check(not await pg.is_visible("#promo"), "product card waits while Pip is talking")
        if await pg.is_visible("#pip"):
            await pg.click("#pipText")
        await pg.wait_for_timeout(3200)
        check(await pg.is_visible("#promo"), "product card with picture shows during break")
        nw = await pg.evaluate("document.getElementById('promoImg').naturalWidth")
        check(nw == 960, "cover picture loaded in break card")
        href = await pg.get_attribute("#promoLink", "href")
        check(href and href.startswith("https://dineshcraft02588.gumroad.com/l/paper-trail"), "card links to Paper Trail")
        check(await pg.get_attribute("#promoLink", "rel") == "noopener", "card link uses rel=noopener")
        check("$19" in await pg.inner_text("#promo"), "card shows the price")
        await snap(pg, "e2e_06_break_shelf")
        await pg.click("#skipBreakBtn")
        await pg.wait_for_timeout(300)
        check(not await pg.is_visible("#promo"), "card goes away when the break ends")
        check(await pg.get_attribute("#panel", "data-mode") == "idle", "skip break returns to idle")

        # 6. phone-free mode wilts after leaving the page
        await pg.click("#menuBtn"); await pg.wait_for_timeout(450)
        await pg.click("input[data-set='strict']", force=True)
        await pg.click("#sheetMenu [data-close]"); await pg.wait_for_timeout(450)
        await pg.click("#startBtn"); await pg.wait_for_timeout(300)
        st = await state(pg)
        check(st["session"]["strict"] is True, "strict session started")
        check(not await pg.is_visible("#pauseBtn"), "no pause in phone-free mode")
        await pg.evaluate("""() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
          window.__fw.state().session.hiddenAt = Date.now() - 12000;
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
          document.dispatchEvent(new Event('visibilitychange'));
        }""")
        await pg.wait_for_timeout(500)
        st = await state(pg)
        check(st["session"] is None and abs(st["totalMs"] - 27 * MIN) < 1, "leaving in phone-free mode wilts, no credit")
        check("drooped" in (await pg.inner_text("#pipText")), "Pip explains the droop")
        await snap(pg, "e2e_07_wilted")
        await pg.click("#pipBtns button:not(.primary)")
        await pg.click("#menuBtn"); await pg.wait_for_timeout(450)
        await pg.click("input[data-set='strict']", force=True)
        await pg.click("#sheetMenu [data-close]"); await pg.wait_for_timeout(450)

        # 7. a big island via a backup file (also tests import validation)
        days = {}
        for i in range(9):
            d = time.localtime(time.time() - i * 86400)
            days["%04d-%02d-%02d" % (d.tm_year, d.tm_mon, d.tm_mday)] = (40 + i * 7) * MIN
        good = {"app": "focus-world", "version": 1, "state": {
            "v": 1, "seed": 777, "createdAt": int(time.time() * 1000) - 9 * 86400000, "totalMs": 1600 * MIN, "sessions": 60,
            "days": days, "bestStreak": 9, "seen": [], "onboarded": True, "tips": {"first": True},
            "settings": {"focusMin": 50, "breakMin": 10, "sounds": {"rain": 0.5}}, "session": None}}
        with open("/tmp/fw_good.json", "w") as f: json.dump(good, f)
        with open("/tmp/fw_bad.json", "w") as f: f.write('{"hello": "<img src=x onerror=alert(1)>"}')
        await pg.set_input_files("#importFile", "/tmp/fw_bad.json")
        await pg.wait_for_timeout(400)
        check("Focus World backup" in await pg.inner_text("#toast"), "bad backup file is refused")
        await pg.set_input_files("#importFile", "/tmp/fw_good.json")
        await pg.wait_for_timeout(500)
        check(await pg.is_visible("#sheetConfirm"), "good backup asks to confirm")
        await pg.click("#confirmYes"); await pg.wait_for_timeout(600)
        st = await state(pg)
        check(abs(st["totalMs"] - 1600 * MIN) < 1 and st["settings"]["focusMin"] == 50, "backup loaded")
        check((await pg.inner_text("#streakNum")).strip() == "9", "streak chip shows 9 days")
        await snap(pg, "e2e_08_big_island")

        # 7b. scenes
        await pg.click("#sceneBtn"); await pg.wait_for_timeout(700)
        cards = await pg.eval_on_selector_all("#sceneGrid .scene-card", "n => n.length")
        locked = await pg.eval_on_selector_all("#sceneGrid .scene-card.locked", "n => n.length")
        groups = await pg.eval_on_selector_all("#sceneGrid .scene-group", "n => n.length")
        check(cards == 20 and locked == 0 and groups == 2, "20 scenes in 2 groups, all unlocked at 1600 min: %s/%s/%s" % (cards, locked, groups))
        await snap(pg, "e2e_08b_scenes")
        await pg.click("#sceneGrid .scene-card[aria-label^='Snowy Winter']")
        await pg.wait_for_timeout(300)
        st = await state(pg)
        check(st["settings"]["scene"] == "winter", "picking a scene keeps it")
        check("Snowy Winter" in await pg.inner_text("#sceneName"), "scene button shows the pick")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(600)
        await snap(pg, "e2e_08c_winter")
        await pg.click("#sceneBtn"); await pg.wait_for_timeout(500)
        await pg.click("#sceneMode button[data-mode='daily']")
        st = await state(pg)
        check(st["settings"]["scene"] == "daily", "back to a new scene every day")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(500)

        # 8. sheets
        await pg.click("#progressBtn"); await pg.wait_for_timeout(500)
        coll = await pg.inner_text("#collection")
        check("Lighthouse" in coll and "Seabirds" in coll, "collection lists the next item")
        await snap(pg, "e2e_09_progress")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(450)
        check(not await pg.is_visible("#sheetProgress"), "Esc closes a sheet")
        await pg.click("#soundBtn"); await pg.wait_for_timeout(500)
        rows = await pg.query_selector_all(".sound-row")
        check(len(rows) == 6, "six sound rows")
        await pg.click(".sound-row:nth-child(2) .sound-toggle")
        await pg.wait_for_timeout(1300)
        info = await pg.evaluate("({ ch: Object.keys(window.__fw.engine.ch), state: window.__fw.engine.ctx && window.__fw.engine.ctx.state })")
        check("ocean" in info["ch"] and "rain" in info["ch"], "ocean and rain channels running: %s" % info)
        await snap(pg, "e2e_10_sounds")
        await pg.click("#sheetSounds [data-close]"); await pg.wait_for_timeout(450)
        await pg.click("#menuBtn"); await pg.wait_for_timeout(500)
        await snap(pg, "e2e_11_settings")
        await pg.click("#sheetMenu [data-close]"); await pg.wait_for_timeout(450)
        await pg.click("#toolsBtn"); await pg.wait_for_timeout(700)
        nw = await pg.evaluate("document.querySelector('.tool-card img').naturalWidth")
        check(nw == 960, "Tools page shows the cover picture")
        check("$19" in await pg.inner_text("#toolsList"), "Tools page shows the price")
        await snap(pg, "e2e_11b_tools")
        cards = await pg.eval_on_selector_all("#toolsList .tool-card", "n => n.length")
        check(cards == 4, "Toolshed shows all 4 items: %s" % cards)
        await pg.fill("#toolsSearch", "irs letter")
        await pg.wait_for_timeout(400)
        cards = await pg.eval_on_selector_all("#toolsList .tool-card", "n => n.length")
        check(cards == 2, "search 'irs letter' finds 2: %s" % cards)
        await snap(pg, "e2e_11c_search")
        await pg.fill("#toolsSearch", "")
        await pg.click("#toolsChips button:has-text('Free stuff')")
        await pg.wait_for_timeout(200)
        cards = await pg.eval_on_selector_all("#toolsList .tool-card", "n => n.length")
        check(cards == 2, "Free stuff shows 2: %s" % cards)
        check("Free" in await pg.inner_text("#toolsList .tool-badges"), "free badge shows")
        await pg.click("#toolsChips button:has-text('Everything')")
        await pg.fill("#toolsSearch", "zzzz")
        await pg.wait_for_timeout(400)
        check(await pg.is_visible(".tools-empty"), "friendly empty result")
        await pg.fill("#toolsSearch", "")
        await pg.click("#sheetTools [data-close]"); await pg.wait_for_timeout(450)
        await pg.click("#shareBtn")
        await pg.wait_for_function("document.getElementById('shareImg').naturalWidth > 0", timeout=8000)
        w = await pg.evaluate("document.getElementById('shareImg').naturalWidth")
        check(w == 1080, "share picture is 1080 px wide")
        await snap(pg, "e2e_12_share")
        img = await pg.evaluate("""() => new Promise(r => { const i = document.getElementById('shareImg');
          const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; c.getContext('2d').drawImage(i, 0, 0);
          r(c.toDataURL('image/png')); })""")
        import base64
        with open(os.path.join(OUT, "e2e_share_card.png"), "wb") as f: f.write(base64.b64decode(img.split(",", 1)[1]))
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(450)

        # 9. backup download
        async with pg.expect_download() as dl:
            await pg.click("#menuBtn"); await pg.wait_for_timeout(450)
            await pg.click("#exportBtn")
        d = await dl.value
        path = await d.path()
        data = json.load(open(path))
        check(data.get("app") == "focus-world" and data["state"]["totalMs"] == 1600 * MIN, "backup file has the island")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(400)

        # 10. every button has a name; no tiny tap targets in the main panel
        unnamed = await pg.evaluate("""() => Array.from(document.querySelectorAll('button')).filter(b => {
            const n = (b.getAttribute('aria-label') || b.textContent || '').trim(); return !n; }).map(b => b.outerHTML.slice(0, 80))""")
        check(not unnamed, "all buttons have names: %s" % unnamed)
        small = await pg.evaluate("""() => Array.from(document.querySelectorAll('#panel button, .top button')).filter(b => b.offsetParent)
            .map(b => b.getBoundingClientRect()).filter(r => r.height < 40 || r.width < 40).length""")
        check(small == 0, "panel buttons are at least 40px")

        # 11. night sky + calm mode render without errors
        await pg.evaluate("() => { const s = window.__fw.state(); s.settings.sky = 'night'; }")
        await snap(pg, "e2e_13_night")
        # 12. laptop size
        await pg.set_viewport_size({"width": 1280, "height": 800})
        await pg.wait_for_timeout(600)
        await pg.evaluate("() => { const s = window.__fw.state(); s.settings.sky = 'live'; }")
        await snap(pg, "e2e_14_desktop")
        await pg.click("#startBtn")
        await shift_session(pg, 20 * MIN)
        await snap(pg, "e2e_15_desktop_focus")
        await pg.evaluate("() => { const s = window.__fw.state(); s.settings.scene = 'session'; s.sceneNow = 'meadow'; }")
        await shift_session(pg, 31 * MIN)
        st = await state(pg)
        check(st["sceneNow"] != "meadow", "new scene after a session: %s" % st["sceneNow"])

        await b.close()
        real = [e for e in errors if "favicon" not in e]
        check(not real, "no console errors: %s" % real[:5])
    print("passed:", passes, "failed:", len(fails))


asyncio.run(main())
