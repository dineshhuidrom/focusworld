"""Sounds follow the timer, the 🔊 buttons work, breaks are quiet unless chosen, and the lofi music has no gaps.
Run after `python3 build.py`:   python3 tests/sound_test.py
"""
import asyncio, math, os
from playwright.async_api import async_playwright

PAGE = "file:///home/claude/focusworld/dist/preview.html"
OUT = "/home/claude/focusworld/tests/shots"
os.makedirs(OUT, exist_ok=True)
MIN = 60000
fails, passes = [], 0


def check(cond, msg):
    global passes
    if cond:
        passes += 1
        print("ok  -", msg)
    else:
        fails.append(msg)
        print("FAIL:", msg)


async def levels(pg):
    # what the sound engine is asked to play right now (0 = silent)
    return await pg.evaluate("({ ...window.__fw.engine.levels })")


async def playing(pg):
    lv = await levels(pg)
    return any(v > 0 for v in lv.values())


async def shift_session(pg, ms):
    await pg.evaluate("ms => { const s = window.__fw.state().session; s.startedAt -= ms; s.lastSeen = Date.now(); }", ms)
    await pg.wait_for_timeout(800)


async def close_pip(pg):
    if await pg.is_visible("#pip"):
        btns = pg.locator("#pipBtns button:not(.primary)")
        if await btns.count():
            await btns.first.click()
        else:
            await pg.click("#pipText")
        await pg.wait_for_timeout(300)


# Render 40 s of lofi music without speakers and look for quiet gaps and clicks.
GAPS_JS = r"""
async () => {
  const sr = 22050, secs = 40;
  const oc = new OfflineAudioContext(2, sr * secs, sr);
  const e = new FWAudio.Engine(); e.init(oc);
  e.setLevels({ lofi: 0.5 }, 0.8); clearInterval(e.timer);
  e.pumpAll(secs);
  const L = (await oc.startRendering()).getChannelData(0), win = sr / 10, db = [];
  let clicks = 0;
  for (let i = 0; i + win <= L.length; i += win) {
    let s = 0; for (let j = i; j < i + win; j++) s += L[j] * L[j];
    db.push(20 * Math.log10(Math.max(Math.sqrt(s / win), 1e-6)));
  }
  for (let i = 1; i < L.length; i++) if (Math.abs(L[i] - L[i - 1]) > 0.25) clicks++;
  return { db, clicks };
}
"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome",
                                    args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        pg.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)
        await pg.goto(PAGE)
        await pg.evaluate("localStorage.clear()")
        await pg.reload(); await pg.wait_for_timeout(1200)

        # 1. first visit: the 2-minute start plays lofi + rain while focusing
        for _ in range(3):
            await pg.click("#obBtns .btn.primary")
        await pg.wait_for_timeout(1500)
        lv = await levels(pg)
        check(lv.get("lofi", 0) > 0 and lv.get("rain", 0) > 0, "focusing: lofi + rain play %s" % lv)
        check("\U0001F50A" in await pg.inner_text("#toast"), "the toast says how to stop it (tap 🔊)")
        check(await pg.is_visible("#muteBtn"), "a 🔊 button sits beside Pause and Stop")
        await pg.screenshot(path=os.path.join(OUT, "sound_01_focus_on.png"))

        # 2. one tap stops all sounds, one tap brings them back
        await pg.click("#muteBtn"); await pg.wait_for_timeout(400)
        st = await pg.evaluate("window.__fw.state().settings.soundsOn")
        check(not await playing(pg) and st is False, "🔊 tap: all sounds stop")
        check("off" in (await pg.get_attribute("#muteBtn", "class")) and
              await pg.get_attribute("#muteBtn", "aria-label") == "Play the sounds", "the button shows it is off")
        await pg.screenshot(path=os.path.join(OUT, "sound_02_focus_off.png"))
        await pg.click("#muteBtn"); await pg.wait_for_timeout(400)
        check(await playing(pg), "🔊 tap again: sounds play again")

        # 3. pause = quiet, resume = music again
        await pg.click("#pauseBtn"); await pg.wait_for_timeout(400)
        check(not await playing(pg), "paused: quiet")
        await pg.click("#pauseBtn"); await pg.wait_for_timeout(400)
        check(await playing(pg), "resumed: music again")

        # 4. the 2 minutes end: the music fades out and the sound engine stops completely
        await shift_session(pg, 2 * MIN)
        check(not await playing(pg), "timer ended: the music stops")
        await pg.wait_for_timeout(2500)
        ch = await pg.evaluate("Object.keys(window.__fw.engine.ch)")
        check(ch == [], "a moment later nothing is running at all: %s" % ch)
        await close_pip(pg)

        # 5. a full session: the break is quiet by default, and the visitor can choose music in breaks
        await pg.click("button[data-min='25']")
        await pg.click("#startBtn"); await pg.wait_for_timeout(1200)
        check(await playing(pg), "25-minute focus: music plays")
        await shift_session(pg, 25 * MIN)
        mode = await pg.get_attribute("#panel", "data-mode")
        check(mode == "break" and not await playing(pg), "break: quiet by default (%s)" % mode)
        await close_pip(pg)
        check(await pg.is_visible("#breakMuteBtn") and "off" in (await pg.get_attribute("#breakMuteBtn", "class")),
              "in the break, a 🔊 button offers music")
        await pg.screenshot(path=os.path.join(OUT, "sound_03_break_quiet.png"))
        await pg.click("#breakMuteBtn"); await pg.wait_for_timeout(500)
        st = await pg.evaluate("window.__fw.state().settings.breakSounds")
        check(await playing(pg) and st is True, "tap it: music in the break, and it is remembered")
        await pg.click("#breakMuteBtn"); await pg.wait_for_timeout(400)
        check(not await playing(pg), "tap again: quiet break")
        await pg.click("#skipBreakBtn"); await pg.wait_for_timeout(400)
        check(not await playing(pg), "idle after the break: quiet")

        # 6. the Sounds panel: plays while open (to hear what you pick), stops when closed; the breaks switch
        await pg.click("#soundBtn"); await pg.wait_for_timeout(1200)
        check(await playing(pg), "Sounds panel open: you can hear your mix")
        check(await pg.is_visible("text=Play during breaks"), "the panel has 'Play during breaks'")
        check(await pg.is_checked("#breakSoundSwitch") is False, "…and it is off (quiet breaks)")
        await pg.click("label:has(#breakSoundSwitch)"); await pg.wait_for_timeout(200)
        st = await pg.evaluate("window.__fw.state().settings.breakSounds")
        check(st is True, "switching it on saves the choice")
        await pg.screenshot(path=os.path.join(OUT, "sound_04_panel.png"))
        await pg.click("label:has(#breakSoundSwitch)")
        await pg.click("#sheetSounds [data-close]"); await pg.wait_for_timeout(500)
        check(not await playing(pg), "panel closed while idle: quiet again")

        # 7. muted, then picking a sound in the panel turns sound back on
        await pg.click("#startBtn"); await pg.wait_for_timeout(600)
        await pg.click("#muteBtn"); await pg.wait_for_timeout(300)
        await pg.click("#soundBtn"); await pg.wait_for_timeout(500)
        await pg.click(".sound-row:nth-child(3) .sound-toggle"); await pg.wait_for_timeout(500)
        await pg.click("#sheetSounds [data-close]"); await pg.wait_for_timeout(500)
        st = await pg.evaluate("window.__fw.state().settings.soundsOn")
        check(st is True and await playing(pg), "picking a sound while muted turns sound on again")
        check("off" not in (await pg.get_attribute("#muteBtn", "class")), "…and the 🔊 button agrees")

        # 8. the music itself: no quiet gaps, no clicks
        r = await pg.evaluate(GAPS_JS)
        db = r["db"][10:]   # skip the first second (the music fades in)
        med = sorted(db)[len(db) // 2]
        run = longest = 0
        for v in db:
            run = run + 1 if v < med - 12 else 0
            longest = max(longest, run)
        check(longest < 5, "lofi music: no quiet gap of half a second or more (longest %.1f s)" % (longest / 10))
        check(r["clicks"] == 0, "lofi music: no clicks (%d)" % r["clicks"])

        check(not errors, "no errors: %s" % errors[:3])
        await b.close()
    print("passed: %d failed: %d" % (passes, len(fails)))
    raise SystemExit(1 if fails else 0)


asyncio.run(main())
