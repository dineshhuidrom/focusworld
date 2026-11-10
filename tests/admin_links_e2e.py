# Link cards, "No price", "Recommended", and what happens on tap (open / ask details first / WhatsApp first),
# end to end: My Shop -> publish -> the live site -> the visitor form -> My Shop's Leads tab.
#   node tests/dev_server.mjs 8792 /tmp/fw-dev-links &   then   PORT=8792 python3 tests/admin_links_e2e.py
import asyncio, os, re
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright

PORT = int(os.environ.get("PORT", "8792"))
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


def picture(path):
    im = Image.new("RGB", (1280, 720), (60, 40, 120))
    d = ImageDraw.Draw(im)
    d.ellipse([480, 200, 800, 520], fill=(255, 200, 110))
    im.save(path)


async def add_product(pg, url, title, text_, extra=None):
    await pg.click("#addProduct")
    await pg.wait_for_selector("#editor:not([hidden])")
    await pg.fill("#fUrl", url)
    await pg.click("#fTitle")
    await pg.set_input_files("#fFile", "/tmp/fw_cover_wide.png")
    await wait_js(pg, "!document.getElementById('coverImg').hidden", 5000)
    await pg.fill("#fTitle", title)
    await pg.fill("#fText", text_)
    if extra:
        await extra()
    await pg.click("#edSave")
    await pg.wait_for_selector("#editor", state="hidden", timeout=8000)


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
    picture("/tmp/fw_cover_wide.png")
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, accept_downloads=True)
        # Other websites (WhatsApp, Instagram...) are not reachable here: answer them with a blank page.
        await ctx.route(re.compile(r"^https://"), lambda r: r.fulfill(status=200, content_type="text/html", body="<p>outside site</p>"))
        pg = await ctx.new_page()
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type in ("error", "warning") and "401" not in m.text else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))

        await wait_ready(pg)
        await pg.goto(BASE + "/admin/")
        await pg.wait_for_selector("#login:not([hidden])")
        await pg.fill("#pw", PASSWORD)
        await pg.click("#loginBtn")
        await pg.wait_for_selector("#productList .row")
        fit = await pg.evaluate("[...document.querySelectorAll('.tabs button')].every(b => b.scrollWidth <= b.clientWidth + 1)")
        check(fit, "phone: the tab names fit")

        # 1. a WhatsApp group: the link picks Group + Free by itself
        async def group_checks():
            k = await pg.get_attribute("#kinds button[data-kind='group']", "aria-checked")
            check(k == "true" and await pg.is_checked("#fFree"), "a WhatsApp group link picks Group + Free")
            check("Join the group" in await text(pg, "#preview"), "button words: Join the group")
        await add_product(pg, "https://chat.whatsapp.com/AbCdEf123456", "Join our study group", "Daily study tips and quiet focus hours.", group_checks)

        # 2. someone else's Instagram page, paid: Social page + No price + Ad, and ask for name + email first
        async def social_checks():
            k = await pg.get_attribute("#kinds button[data-kind='social']", "aria-checked")
            check(k == "true" and await pg.is_checked("#fNoPrice"), "an Instagram link picks Social page + No price")
            await pg.click("label:has(#fAd)")
            await pg.wait_for_timeout(200)
            prev = await pg.evaluate("document.getElementById('preview').textContent")   # the mini preview hides some parts
            check("Ad" in prev and "$" not in prev, "preview shows the Ad label and no price: " + prev.replace("\n", " | "))
            await pg.click("#gateSeg button[data-gate='form']")
            check(await pg.is_visible("#askBox"), "asking for details shows the boxes to pick")
            pressed = await pg.eval_on_selector_all("#askPick [aria-pressed='true']", "n => n.map(x => x.dataset.f)")
            check(pressed == ["name", "phone"], "it starts with Name + WhatsApp number: %s" % pressed)
            await pg.click("#askPick [data-f='email']")
            await pg.click("#askPick [data-f='phone']")
            await pg.click("#askPick [data-f='email']")   # removing the last way to reach them is refused
            check("Keep a WhatsApp number or an email" in await text(pg, "#gateHint"), "it keeps at least a number or an email")
            hint = await text(pg, "#gateHint")
            await pg.click("#askPick [data-f='name']"); await pg.click("#askPick [data-f='name']")
            check("Name + Email" in await text(pg, "#gateHint") and "Leads tab" in await text(pg, "#gateHint"), "the hint says what is asked and where it goes")
            await pg.locator("#gateSeg").scroll_into_view_if_needed()
            await pg.screenshot(path=SHOTS + "links_01_editor.png")
        await add_product(pg, "https://www.instagram.com/a.friend.teaches", "Learn English with a friend", "Short daily speaking tips on Instagram.", social_checks)
        row = await text(pg, "#productList .row:first-child")
        check("No price" in row and "Asks details" in row and "Ad" in row, "the list row shows No price, Asks details, Ad")

        # 3. an existing product asks for a WhatsApp number only
        await pg.locator("#productList .row", has_text="IRS letter saying").locator(".edit").click()
        await pg.wait_for_selector("#editor:not([hidden])")
        await pg.click("#gateSeg button[data-gate='form']")
        # set exactly "WhatsApp number" whatever the product asks today (dinesh can change it in My Shop):
        # switch on what we want first, then switch off the rest (the last way to reach someone can't be removed)
        for f, want in (("phone", True), ("name", False), ("email", False)):
            on = await pg.get_attribute("#askPick [data-f='%s']" % f, "aria-pressed") == "true"
            if on != want:
                await pg.click("#askPick [data-f='%s']" % f)
        await pg.click("#edSave")
        await pg.wait_for_selector("#editor", state="hidden", timeout=8000)

        # 4. no text-only links: the old small-links tab is gone
        check(not await pg.is_visible("#tabLinks"), "no text-only links tab")

        # 5. publish
        await pg.click("#publishBtn")
        await pg.wait_for_selector("#dialog:not([hidden])")
        check("Learn English with a friend" in await text(pg, "#dialog"), "publish lists the changes")
        await pg.click("#dlgYes")
        await wait_js(pg, "document.querySelector('#status span').textContent.indexOf('Live now') >= 0", 40000)
        check(True, "published and live")

        # 6. the live site
        site = await ctx.new_page()
        site.on("pageerror", lambda e: errs.append(str(e)))
        site.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await site.goto(BASE + "/")
        await site.wait_for_timeout(800)
        html = await site.content()
        check("no ads" not in html.lower(), "with a paid promotion on show, the site no longer says 'no ads'")
        await site.click("#obBtns .btn.primary"); await site.click("#obBtns .btn.primary"); await site.click("#obBtns .btn.soft")
        await site.click("#toolsBtn"); await site.wait_for_timeout(600)
        group = site.locator(".tool-card", has_text="Join our study group")
        check(await group.get_attribute("href") == "https://chat.whatsapp.com/AbCdEf123456", "group card opens the group directly")
        friend = site.locator(".tool-card", has_text="Learn English with a friend")
        ftext = await friend.inner_text()
        check("Ad" in ftext and "Follow" in ftext and "Recommended" not in ftext, "the paid card shows Ad and its button")
        sa = site.locator(".tool-card", has_text="Speak Ahead Academy")
        check(await sa.locator("img").count() == 1 and "Follow" in await sa.inner_text(), "Speak Ahead is a picture card with a Follow button")
        check(await site.evaluate("document.querySelectorAll('#sheetTools .follow-chip').length") == 0, "no text-only links anywhere")
        await friend.scroll_into_view_if_needed()
        await site.screenshot(path=SHOTS + "links_02_toolshed.png")

        # 7. the visitor form: name + email for the friend's page
        await friend.click()
        await site.wait_for_selector("#sheetLead:not([hidden])")
        check("Learn English with a friend" in await text(site, "#sheetLead"), "the form names the product")
        check(await site.is_visible("#leadName") and await site.is_visible("#leadEmail") and not await site.is_visible("#leadPhone"),
              "it shows only the boxes picked in My Shop (name + email)")
        await site.screenshot(path=SHOTS + "links_03_form.png")
        await site.fill("#leadName", "Asha Devi")
        await site.click("#sheetLead button[type='submit']")
        check("email" in (await text(site, "#leadMsg")).lower(), "an empty email is explained")
        await site.fill("#leadEmail", "asha@example")
        await site.click("#sheetLead button[type='submit']")
        check("look right" in await text(site, "#leadMsg"), "a wrong email is explained")
        await site.fill("#leadEmail", "Asha@Example.com")
        await site.click("#sheetLead button[type='submit']")
        check("tick" in await text(site, "#leadMsg"), "consent is asked, never assumed")
        await site.click("label:has(#leadOk)")
        async with ctx.expect_page() as newp:
            await site.click("#sheetLead button[type='submit']")
        opened = await newp.value
        await opened.wait_for_load_state()
        check(opened.url.startswith("https://www.instagram.com/a.friend.teaches"), "Continue opens the link: " + opened.url)
        await opened.close()
        await site.wait_for_selector("#sheetLead", state="hidden", timeout=3000)
        check(True, "the form closes")

        # the IRS card: WhatsApp number only
        await site.click("#toolsBtn"); await site.wait_for_timeout(500)
        await site.locator(".tool-card", has_text="IRS letter saying").click()
        await site.wait_for_selector("#sheetLead:not([hidden])")
        check(await site.is_visible("#leadPhone") and not await site.is_visible("#leadName") and not await site.is_visible("#leadEmail"),
              "another product asks only for a WhatsApp number")
        await site.fill("#leadPhone", "12345")
        await site.click("#sheetLead button[type='submit']")
        check("10-digit" in await text(site, "#leadMsg"), "a wrong number is explained simply")
        await site.fill("#leadPhone", "98123 45678")   # no +91: the site adds it (saved as +919812345678, checked below)
        await site.click("label:has(#leadOk)")
        async with ctx.expect_page() as newp3:
            await site.click("#sheetLead button[type='submit']")
        await (await newp3.value).close()

        # Skip: the link opens, nothing is saved; your details are pre-filled on your own device
        await site.click("#toolsBtn"); await site.wait_for_timeout(500)
        await site.locator(".tool-card", has_text="Learn English with a friend").click()
        await site.wait_for_selector("#sheetLead:not([hidden])")
        check(await site.input_value("#leadName") == "Asha Devi", "your own details are pre-filled next time (on your device)")
        check(not await site.is_checked("#leadOk"), "but the consent tick is asked again")
        async with ctx.expect_page() as newp2:
            await site.click("#leadSkip")
        o2 = await newp2.value
        await o2.close()
        check(True, "Skip opens the link")

        # 7b. each product has its own Google page; the form works there too
        pp = await ctx.new_page()
        pp.on("pageerror", lambda e: errs.append(str(e)))
        r = await pp.goto(BASE + "/shop/learn-english-with-a-friend/")
        html = await pp.content()
        check(r.status == 200 and 'rel="noopener sponsored nofollow"' in html and "Paid promotion" in html,
              "the paid product's page tells Google the link is paid, and shows Ad")
        await pp.goto(BASE + "/shop/cp2000-kit/")
        await pp.click("#getBtn")
        check(await pp.is_visible("#leadBox") and await pp.is_visible("#l_phone") and not await pp.is_visible("#l_email"),
              "the product page shows its form (WhatsApp number only)")
        await pp.fill("#l_phone", "+1 415 555 0123")
        await pp.click("label:has(#l_ok)")
        async with ctx.expect_page() as newp4:
            await pp.click("#leadForm button[type='submit']")
        await (await newp4.value).close()
        await pp.wait_for_selector("#l_done:not([hidden])", timeout=3000)
        check(True, "the page form sends the details and opens the link")
        await pp.screenshot(path=SHOTS + "links_06_product_page_form.png")
        await pp.close()

        # 7. My Shop: the Leads tab
        await pg.click("#tabLeads")
        await pg.wait_for_selector("#leadList .row", timeout=8000)
        await wait_js(pg, "document.querySelectorAll('#leadList .row').length === 3", 8000)
        rows = await pg.eval_on_selector_all("#leadList .row", "n => n.length")
        page_lead = await text(pg, "#leadList .row:nth-child(1)")
        check("+14155550123" in page_lead, "newest: the lead from the product page: " + page_lead.replace("\n", " | "))
        await pg.click("#leadList .row:nth-child(1) .tools button")
        await pg.wait_for_selector("#dialog:not([hidden])")
        await pg.click("#dlgYes")
        await wait_js(pg, "document.querySelectorAll('#leadList .row').length === 2", 5000)
        first = await text(pg, "#leadList .row:nth-child(1)")
        second = await text(pg, "#leadList .row:nth-child(2)")
        check(rows == 3, "3 leads show (Skip saved nothing)")
        check("+919812345678" in first and "IRS" in first and "No name" in first, "newest first: the number-only lead: " + first.replace("\n", " | "))
        check("Asha Devi" in second and "asha@example.com" in second and "Learn English" in second, "the email lead: " + second.replace("\n", " | "))
        href1 = await pg.get_attribute("#leadList .row:nth-child(1) .thumb", "href")
        href2 = await pg.get_attribute("#leadList .row:nth-child(2) .thumb", "href")
        check(href1 == "https://wa.me/919812345678" and href2 == "mailto:asha@example.com", "one tap: WhatsApp them, or email them")
        async with pg.expect_download() as dl:
            await pg.click("#leadsCsv")
        path = await (await dl.value).path()
        csv = open(path, encoding="utf-8-sig").read()
        check("Asha Devi" in csv and "asha@example.com" in csv and '"=""+919812345678"""' in csv, "download has both leads, number kept as text")
        await pg.screenshot(path=SHOTS + "links_04_leads.png")
        await pg.click("#leadList .row:nth-child(1) .tools button")
        await pg.wait_for_selector("#dialog:not([hidden])")
        await pg.click("#dlgYes")
        await wait_js(pg, "document.querySelectorAll('#leadList .row').length === 1", 5000)
        await pg.click("#leadList .row .tools button")
        await pg.wait_for_selector("#dialog:not([hidden])")
        await pg.click("#dlgYes")
        await wait_js(pg, "document.querySelectorAll('#leadList .row').length === 0", 5000)
        check(await pg.is_visible("#leadsEmpty"), "a lead can be deleted")

        # 8. privacy page
        pv = await ctx.new_page()
        r = await pv.goto(BASE + "/privacy/")
        body = await pv.inner_text("body")
        check(r.status == 200 and "12 months" in body and "Skip" in body and "email" in body and "maker" not in body.lower(),
              "privacy page explains what is kept and why")
        await pv.close()

        check(not [e for e in errs if "outside site" not in e], "no errors: %s" % errs[:3])
        await b.close()
    print("passed:", passed, "failed:", failed)
    raise SystemExit(1 if failed else 0)


asyncio.run(main())
