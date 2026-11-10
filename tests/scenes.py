import asyncio
from PIL import Image
from playwright.async_api import async_playwright
IDS = ['meadow','spring','rain','fog','windy','autumn','rainbow','tropical','fireflies','winter','clouds','stars']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 390, "height": 600})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("file:///home/claude/focusworld/tests/world_harness.html")
        for i, sid in enumerate(IDS):
            sky = 'day' if sid != 'fireflies' else 'sunset'
            await pg.evaluate(f"renderAt(2900, '{sky}', 390, 600, {{l:0,t:30,r:390,b:560}}, 0, null, 12.3, '{sid}')")
            await pg.screenshot(path=f"/home/claude/focusworld/tests/shots/scene_{sid}.png")
        await pg.evaluate("renderAt(2900, 'night', 390, 600, {l:0,t:30,r:390,b:560}, 0, null, 12.3, 'fireflies')")
        await pg.screenshot(path="/home/claude/focusworld/tests/shots/scene_fireflies_night.png")
        await b.close()
        print("errors:", errs)
    ims = [Image.open(f"/home/claude/focusworld/tests/shots/scene_{s}.png").convert("RGB") for s in IDS]
    w, h = ims[0].size; sc = 0.5; tw, th = int(w*sc), int(h*sc)
    sheet = Image.new("RGB", (tw*6, th*2))
    for i, im in enumerate(ims): sheet.paste(im.resize((tw, th)), ((i % 6)*tw, (i//6)*th))
    sheet.save("/home/claude/focusworld/tests/shots/scenes_sheet.png"); print(sheet.size)
asyncio.run(main())
