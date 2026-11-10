# My Shop categories, end to end: edit categories, pick them on a product, publish, and Ask Pip uses them.
#   node tests/dev_server.mjs 8791 /tmp/fw-dev-cats &   then   PORT=8791 python3 tests/admin_cats_e2e.py
import asyncio, json, os
from playwright.async_api import async_playwright

PORT = int(os.environ.get("PORT", "8791"))
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


async def wait_js(pg, expr, timeout=5000):
    for _ in range(int(timeout / 150)):
        if await pg.evaluate("() => !!(" + expr + ")"):
            return
        await pg.wait_for_timeout(150)
    raise AssertionError("timed out waiting for: " + expr)


async def text(pg, sel):
    return (await pg.inner_text(sel)).strip()


async def wait_ready(pg):
    # the local stand-in builds the whole site first; wait for it (up to 90 s) instead of failing on a slow start
    for _ in range(90):
        try:
            r = await pg.request.get(BASE + "/admin/")
            if r.status == 200:
                return
        except Exception:
            pass
        await pg.wait_for_timeout(1000)


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        pg = await ctx.new_page()
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") and "401" not in m.text else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("response", lambda r: errs.append("404 " + r.url) if r.status == 404 else None)

        await wait_ready(pg)
        await pg.goto(BASE + "/admin/")
        await pg.wait_for_selector("#login:not([hidden])")
        await pg.fill("#pw", PASSWORD)
        await pg.click("#loginBtn")
        await pg.wait_for_selector("#productList .row")

        # 1. the Categories tab
        tabs_fit = await pg.evaluate("""() => [...document.querySelectorAll('.tabs button')].every(b => b.scrollWidth <= b.clientWidth + 1)""")
        check(tabs_fit, "phone: the 3 tab names fit")
        await pg.click("#tabCats")
        rows = await pg.eval_on_selector_all("#catList .row", "n => n.length")
        check(rows == 12 and await text(pg, "#countCats") == "12", "12 starter categories show")
        school = await pg.inner_text("#catList .row:nth-child(3)")
        check("School" in school and "2 products" in school, "a category shows how many products use it")
        await pg.screenshot(path=SHOTS + "cats_01_tab.png")

        # 2. test words with Pip, then cancel
        await pg.click("#catList .row:nth-child(2) .edit")
        await pg.wait_for_selector("#catEditor:not([hidden])")
        await pg.fill("#cTry", "I'm scared to speak english in class")
        check("would pick" in await text(pg, "#cTryRes"), "the Pip test says English speaking matches")
        await pg.fill("#cTry", "how do i cook rice")
        res = await text(pg, "#cTryRes")
        check("No match" in res and ("cook" in res or "rice" in res), "a sentence that doesn't match gets a word tip: " + res)
        await pg.screenshot(path=SHOTS + "cats_02_editor.png")
        await pg.click("#ceCancel")
        await pg.wait_for_selector("#catEditor", state="hidden")

        # 3. add a new category
        await pg.click("#addCat")
        await pg.wait_for_selector("#catEditor:not([hidden])")
        await pg.click("#ceSave")
        check("name" in await text(pg, "#ceMsg"), "saving without a name asks for one")
        await pg.fill("#cName", "Cooking")
        await pg.click("#emojiPick button[aria-label='Use 🍳']")
        check(await pg.input_value("#cEmoji") == "🍳", "tapping an emoji fills it in")
        for w in ["cook", "recipe", "cooking", "kitchen"]:
            await pg.fill("#cWord", w)
            await pg.press("#cWord", "Enter")
        check(await pg.eval_on_selector_all("#cWordBox .tag", "n => n.length") == 4, "4 words added as chips")
        await pg.fill("#cTry", "easy recipes for dinner")
        check("would pick" in await text(pg, "#cTryRes"), "the new words match a test sentence")
        await pg.screenshot(path=SHOTS + "cats_03_new.png")
        await pg.click("#ceSave")
        await pg.wait_for_selector("#catEditor", state="hidden")
        check(await text(pg, "#countCats") == "13", "the new category is in the list")
        check("Categories" in await text(pg, "#changeCount") or await pg.is_visible("#publishBar"), "it counts as a change to publish")

        # 4. pick categories on a product (up to 3)
        await pg.click("#tabProducts")
        await pg.locator("#productList .row", has_text="Flagged by an AI detector").locator(".edit").click()
        await pg.wait_for_selector("#editor:not([hidden])")
        pressed = await pg.eval_on_selector_all("#catPick .cat-chip[aria-pressed='true']", "n => n.map(x => x.textContent)")
        check(pressed == ["🎓School & college problems"], "the product shows its current category: %s" % pressed)
        await pg.click("#catPick .cat-chip:has-text('English speaking')")
        await pg.click("#catPick .cat-chip:has-text('Cooking')")
        n = await pg.eval_on_selector_all("#catPick .cat-chip[aria-pressed='true']", "n => n.length")
        check(n == 3, "3 categories picked")
        await pg.click("#catPick .cat-chip:has-text('Study & exams')", force=True)  # looks disabled, still tappable to explain why
        check("3 already" in await text(pg, "#catHint"), "a 4th category is refused kindly")
        check(await pg.eval_on_selector_all("#catPick .cat-chip[aria-pressed='true']", "n => n.length") == 3, "still 3")
        await pg.locator("#catPick").scroll_into_view_if_needed()
        await pg.screenshot(path=SHOTS + "cats_04_pick.png")
        await pg.click("#edSave")
        await pg.wait_for_selector("#editor", state="hidden")
        meta = await pg.locator("#productList .row", has_text="Flagged by an AI detector").locator(".meta i.cats").get_attribute("aria-label")
        check(meta and "English speaking" in meta and "Cooking" in meta, "the product row shows its categories: %s" % meta)

        # 5. delete a category that a product uses -> removed from the product too
        await pg.click("#tabCats")
        await pg.click("#catList .row:nth-child(13) .edit")
        await pg.wait_for_selector("#catEditor:not([hidden])")
        await pg.click("#ceDelete")
        await pg.wait_for_selector("#dialog:not([hidden])")
        check("1 product" in await text(pg, "#dialog"), "deleting warns it is used by 1 product")
        await pg.click("#dlgYes")
        await pg.wait_for_selector("#catEditor", state="hidden")
        check(await text(pg, "#countCats") == "12", "category deleted")
        cats = await pg.evaluate("""() => JSON.parse(localStorage.getItem('fw-myshop-draft-v1')).catalog.items.find(i => i.id === 'paper-trail').categories""")
        check(cats == ["school", "english"], "and removed from the product: %s" % cats)

        # 6. publish, then Ask Pip on the live site uses the new category
        await pg.click("#publishBtn")
        await pg.wait_for_selector("#dialog:not([hidden])")
        await pg.click("#dlgYes")
        await wait_js(pg, "document.querySelector('#status span').textContent.indexOf('Live now') >= 0", 40000)
        check(True, "published and live")
        site = await ctx.new_page()
        site.on("pageerror", lambda e: errs.append(str(e)))
        await site.goto(BASE + "/")
        await site.wait_for_timeout(800)
        cfg = await site.evaluate("window.FW_CONFIG")
        first = next(x for x in cfg["shelf"] if x["id"] == "paper-trail")
        check(first.get("categories") == ["school", "english"] and len(cfg["categories"]) == 12, "live site has the categories")
        await site.click("#obBtns .btn.primary"); await site.click("#obBtns .btn.primary"); await site.click("#obBtns .btn.soft")
        await site.wait_for_timeout(300)
        await site.click("#askBtn"); await site.wait_for_timeout(500)
        await site.fill("#askInput", "how can I speak english fluently")
        await site.press("#askInput", "Enter")
        await site.wait_for_timeout(1200)
        bubble = await site.evaluate("""() => { const b = [...document.querySelectorAll('#askLog .msg.bot .bubble')].pop();
          return { text: b.innerText, cards: b.querySelectorAll('.chat-card').length }; }""")
        check("English speaking" in bubble["text"] and bubble["cards"] == 2, "Ask Pip recommends products by the new category (Speak Ahead + the edited one)")
        await site.locator("#askLog .chat-chips button", has_text="School").click()
        await site.wait_for_timeout(1200)
        n = await site.evaluate("[...document.querySelectorAll('#askLog .msg.bot .bubble')].pop().querySelectorAll('.chat-card').length")
        check(n == 2, "tapping a category button shows its products (%d)" % n)
        await site.screenshot(path=SHOTS + "cats_05_pip.png")

        check(not errs, "no errors: %s" % errs[:3])
        await b.close()
    print("passed:", passed, "failed:", failed)
    raise SystemExit(1 if failed else 0)


asyncio.run(main())
