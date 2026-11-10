# End-to-end test of My Shop against the local stand-in (tests/dev_server.mjs must be running on PORT).
#   node tests/dev_server.mjs 8790 /tmp/fw-dev &   then   python3 tests/admin_e2e.py
import asyncio, json, os, sys
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

PORT = int(os.environ.get("PORT", "8790"))
BASE = "http://127.0.0.1:%d" % PORT
SHOTS = "/home/claude/focusworld/tests/shots/"
PASSWORD = "test-password-for-local-only"
passed, failed = 0, 0


def check(ok, what):
    global passed, failed
    if ok:
        passed += 1; print("ok  -", what)
    else:
        failed += 1; print("FAIL -", what)


def make_picture(path):
    # a tall picture, like a phone screenshot (My Shop should pick "Show it all")
    im = Image.new("RGB", (600, 1000), (40, 90, 160))
    d = ImageDraw.Draw(im)
    for i in range(10):
        d.rectangle([40, 60 + i * 90, 560, 120 + i * 90], fill=(255, 200 - i * 12, 110))
    d.ellipse([200, 380, 400, 580], fill=(250, 250, 240))
    im.save(path)


async def wait_js(pg, expr, timeout=5000):
    # page.wait_for_function is blocked by the page's security rules (no eval), so poll instead
    for _ in range(int(timeout / 150)):
        if await pg.evaluate("() => !!(" + expr + ")"):
            return
        await pg.wait_for_timeout(150)
    raise AssertionError("timed out waiting for: " + expr)


async def text(pg, sel):
    return (await pg.inner_text(sel)).strip()


async def main():
    make_picture("/tmp/fw_cover.png")
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        pg = await ctx.new_page()
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") and "401" not in m.text else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("response", lambda r: errs.append("404 " + r.url) if r.status == 404 else None)

        # 1. login
        await pg.goto(BASE + "/admin/")
        await pg.wait_for_selector("#login:not([hidden])")
        check(await pg.is_visible("#pw"), "login screen shows")
        await pg.screenshot(path=SHOTS + "shop_01_login.png")
        await pg.fill("#pw", "wrong-password")
        await pg.click("#loginBtn")
        await wait_js(pg, "document.getElementById('loginMsg').textContent.length > 0", 5000)
        check("not it" in await text(pg, "#loginMsg"), "wrong password is refused kindly")
        await pg.fill("#pw", PASSWORD)
        await pg.click("#loginBtn")
        await pg.wait_for_selector("#app:not([hidden])", timeout=8000)
        await pg.wait_for_selector("#productList .row")
        rows = await pg.eval_on_selector_all("#productList .row", "n => n.length")
        check(rows == 4, "shop loads the 4 products from GitHub: %d" % rows)
        check("All live" in await text(pg, "#status"), "status says all live")
        await pg.screenshot(path=SHOTS + "shop_02_list.png")

        # 2. save with nothing filled -> friendly message
        await pg.click("#addProduct")
        await pg.wait_for_selector("#editor:not([hidden])")
        await pg.click("#edSave")
        check("title" in (await text(pg, "#edMsg")).lower(), "empty product asks for a title first")

        # 3. a new app with a tall picture
        await pg.click("#kinds button[data-kind='app']")
        await pg.fill("#fUrl", "gumroad.com/l/study-planner")
        await pg.click("#fTitle")  # leaves the link field -> https:// is added
        check(await pg.input_value("#fUrl") == "https://gumroad.com/l/study-planner", "link gets https:// added")
        await pg.set_input_files("#fFile", "/tmp/fw_cover.png")
        await wait_js(pg, "!document.getElementById('coverImg').hidden", 5000)
        fit = await pg.get_attribute("#fitSeg button[data-fit='fit']", "aria-checked")
        check(fit == "true", "tall picture is shown whole (Show it all)")
        await pg.fill("#fTitle", "Study Planner: a calm plan for exam week")
        await pg.fill("#fHook", "Exams soon? Get a calm plan in 1 minute.")
        await pg.fill("#fText", "Tell it your exam dates and it builds a gentle daily plan with breaks.")
        await pg.fill("#fKicker", "For students")
        await pg.fill("#fPrice", "₹299")
        await pg.fill("#fTag", "exam")
        await pg.press("#fTag", "Enter")
        await pg.fill("#fTag", "planner")
        await pg.press("#fTag", "Enter")
        tags = await pg.eval_on_selector_all("#tagBox .tag", "n => n.length")
        check(tags == 2, "search words become chips")
        await pg.click("label:has(#fFeatured)")
        prev = await text(pg, "#preview")
        check("Study Planner" in prev and "₹299" in prev and "Open the app" in prev, "live preview shows title, price and button")
        await pg.screenshot(path=SHOTS + "shop_03_editor_top.png")
        await pg.evaluate("document.getElementById('edBody').scrollTop = 900")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=SHOTS + "shop_04_editor_mid.png")
        await pg.click("#edSave")
        await pg.wait_for_selector("#editor", state="hidden", timeout=8000)
        rows = await pg.eval_on_selector_all("#productList .row", "n => n.length")
        check(rows == 5, "new product is in the list")
        first = await text(pg, "#productList .row:first-child")
        check("Study Planner" in first and "New" in first, "new product is at the top, marked New")
        check("1 change" in await text(pg, "#changeCount"), "publish bar counts 1 change")

        # 4. a YouTube video with its cover fetched automatically
        await pg.click("#addProduct")
        await pg.wait_for_selector("#editor:not([hidden])")
        await pg.fill("#fUrl", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        await pg.wait_for_selector("#ytBtn:not([hidden])")
        kind = await pg.get_attribute("#kinds button[data-kind='video']", "aria-checked")
        check(kind == "true" and await pg.is_checked("#fFree"), "YouTube link picks Video + Free by itself")
        await pg.click("#ytBtn")
        await wait_js(pg, "!document.getElementById('coverImg').hidden", 8000)
        check("YouTube" in await text(pg, "#coverHint"), "cover comes from YouTube")
        await pg.fill("#fTitle", "How I plan a focused study day")
        await pg.fill("#fText", "A short video with my simple daily study routine.")
        await pg.click("#edSave")
        await pg.wait_for_selector("#editor", state="hidden", timeout=8000)
        check("2 changes" in await text(pg, "#changeCount"), "2 changes now")

        # 5. hide the tax kit (students are the audience)
        cp = pg.locator("#productList .row", has_text="IRS letter saying")
        await cp.locator("button", has_text="Shown").click()
        check(await cp.locator("button", has_text="Hidden").count() == 1, "a product can be hidden with one tap")

        # 6. follow links
        await pg.click("#tabLinks")
        await pg.click("#addLink")
        await pg.wait_for_selector("#linkEditor:not([hidden])")
        await pg.fill("#lUrl", "https://www.instagram.com/focusworld")
        check(await pg.get_attribute("#platforms button[data-p='instagram']", "aria-checked") == "true", "link picks Instagram by itself")
        await pg.click("#leSave")
        await pg.click("#addLink")
        await pg.fill("#lUrl", "youtube.com/@golupaisa")
        await pg.fill("#lLabel", "Golu Paisa on YouTube")
        await pg.click("#leSave")
        await pg.wait_for_selector("#linkEditor", state="hidden")
        links = await pg.eval_on_selector_all("#linkList .row", "n => n.length")
        check(links == 2, "2 follow links added")
        await pg.screenshot(path=SHOTS + "shop_05_links.png")

        # 7. drafts survive a reload
        n_before = await text(pg, "#changeCount")
        await pg.reload()
        await pg.wait_for_selector("#productList .row")
        await pg.wait_for_timeout(500)
        check(await text(pg, "#changeCount") == n_before, "unpublished changes survive a reload: " + n_before)

        # 8. publish and watch it go live
        await pg.click("#publishBtn")
        await pg.wait_for_selector("#dialog:not([hidden])")
        dlg = await text(pg, "#dialog")
        check("Publish" in dlg and "Study Planner" in dlg, "publish asks first and lists the changes")
        await pg.screenshot(path=SHOTS + "shop_06_publish_ask.png")
        await pg.click("#dlgYes")
        await wait_js(pg, "document.querySelector('#status span').textContent.indexOf('Going live') >= 0", 10000)
        check(True, "status shows Going live")
        await pg.screenshot(path=SHOTS + "shop_07_going_live.png")
        await wait_js(pg, "document.querySelector('#status span').textContent.indexOf('Live now') >= 0", 40000)
        check(True, "status turns Live now when the rebuilt site is up")
        check(await pg.is_hidden("#publishBar"), "publish bar goes away")
        await pg.screenshot(path=SHOTS + "shop_08_live.png")

        # 9. the real site shows it
        site = await ctx.new_page()
        site.on("pageerror", lambda e: errs.append(str(e)))
        site.on("response", lambda r: errs.append("404 " + r.url) if r.status == 404 else None)
        await site.goto(BASE + "/")
        await site.wait_for_timeout(800)
        cfg = await site.evaluate("window.FW_CONFIG")
        titles = [x["title"] for x in cfg["shelf"]]
        check(any("Study Planner" in t for t in titles), "live site has the new product")
        check(any("focused study day" in t for t in titles), "live site has the YouTube video")
        check(not any("IRS letter saying" in t for t in titles), "hidden product is not on the live site")
        check(len(cfg["social"]) == 2, "live site has the 2 follow links")
        pic = next(x for x in cfg["shelf"] if "Study Planner" in x["title"])["image"]
        r = await site.request.get(BASE + "/" + pic)
        check(r.status == 200 and r.headers.get("content-type") == "image/jpeg", "new cover picture is served: " + pic)
        await site.click("#obBtns .btn.primary"); await site.click("#obBtns .btn.primary"); await site.click("#obBtns .btn.soft")
        await site.wait_for_timeout(500)
        await site.click("#toolsBtn")
        await site.wait_for_timeout(600)
        tool_text = await text(site, "#sheetTools")
        check("Study Planner" in tool_text and "say hi to the maker" in tool_text.lower() and "Golu Paisa on YouTube" in tool_text,
              "Toolshed shows the new product and the follow links")
        await site.screenshot(path=SHOTS + "shop_09_toolshed.png")
        await site.evaluate("document.querySelector('#sheetTools').scrollTop = 99999")
        await site.wait_for_timeout(300)
        await site.screenshot(path=SHOTS + "shop_10_toolshed_follow.png")

        # 10. log out
        await pg.click("#menuBtn")
        await pg.click("#logoutBtn")
        await pg.wait_for_selector("#login:not([hidden])")
        r = await pg.request.get(BASE + "/admin/api/catalog")
        check(r.status == 401, "after logout the shop is locked")

        # 11. desktop look
        desk = await b.new_page(viewport={"width": 1280, "height": 800})
        await desk.goto(BASE + "/admin/")
        await desk.wait_for_selector("#login:not([hidden])")
        await desk.fill("#pw", PASSWORD); await desk.click("#loginBtn")
        await desk.wait_for_selector("#productList .row")
        await desk.wait_for_timeout(600)
        await desk.screenshot(path=SHOTS + "shop_11_desktop.png")

        check(not errs, "no console errors: %s" % errs[:3])
        await b.close()
    print("passed: %d failed: %d" % (passed, failed))
    sys.exit(1 if failed else 0)

asyncio.run(main())
