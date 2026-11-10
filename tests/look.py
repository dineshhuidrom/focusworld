import asyncio, sys
from playwright.async_api import async_playwright
CASES = [(0,'day'),(30,'day'),(130,'morning'),(420,'sunset'),(1000,'day'),(2000,'night'),(5200,'night'),(9000,'day')]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width":390,"height":600})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto("file:///home/claude/focusworld/tests/world_harness.html")
        for mn, sky in CASES:
            await pg.evaluate(f"renderAt({mn}, '{sky}', 390, 600, {{l:0,t:40,r:390,b:560}})")
            await pg.screenshot(path=f"/home/claude/focusworld/tests/shots/look_{mn}_{sky}.png")
        await pg.set_viewport_size({"width":1280,"height":760})
        await pg.evaluate("renderAt(9000, 'sunset', 1280, 760, {l:0,t:60,r:860,b:740})")
        await pg.screenshot(path="/home/claude/focusworld/tests/shots/look_desktop.png")
        await b.close()
        print("errors:", errs)
asyncio.run(main())
