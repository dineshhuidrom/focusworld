# Renders the 8 places (day, night, few minutes and many minutes) into contact sheets.
import asyncio
from PIL import Image
from playwright.async_api import async_playwright
PLACES = ['valley', 'desert', 'rooftop', 'forest', 'zen', 'underwater', 'peaks', 'space']
OUT = "/home/claude/focusworld/tests/shots/"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 390, "height": 600})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto("file:///home/claude/focusworld/tests/world_harness.html")
        for sky, mins in (('day', 2900), ('night', 2900), ('day', 30)):
            for sid in PLACES:
                await pg.evaluate(f"renderAt({mins}, '{sky}', 390, 600, {{l:0,t:30,r:390,b:560}}, 0, null, 12.3, '{sid}')")
                await pg.screenshot(path=f"{OUT}place_{sid}_{sky}_{mins}.png")
        # wide desktop layout too
        await pg.set_viewport_size({"width": 1280, "height": 760})
        for sid in PLACES:
            await pg.evaluate(f"renderAt(2900, 'sunset', 1280, 760, {{l:0,t:60,r:860,b:760}}, 0, null, 12.3, '{sid}')")
            await pg.screenshot(path=f"{OUT}place_{sid}_wide.png")
        await b.close()
        print("errors:", errs)
    for tag in ('day_2900', 'night_2900', 'day_30'):
        ims = [Image.open(f"{OUT}place_{s}_{tag}.png").convert("RGB") for s in PLACES]
        w, h = ims[0].size; sc = 0.5; tw, th = int(w * sc), int(h * sc)
        sheet = Image.new("RGB", (tw * 4, th * 2))
        for i, im in enumerate(ims): sheet.paste(im.resize((tw, th)), ((i % 4) * tw, (i // 4) * th))
        sheet.save(f"{OUT}places_{tag}.png")
    ims = [Image.open(f"{OUT}place_{s}_wide.png").convert("RGB") for s in PLACES]
    sheet = Image.new("RGB", (640 * 2, 380 * 4))
    for i, im in enumerate(ims): sheet.paste(im.resize((640, 380)), ((i % 2) * 640, (i // 2) * 380))
    sheet.save(f"{OUT}places_wide.png")
    print("done")
asyncio.run(main())
