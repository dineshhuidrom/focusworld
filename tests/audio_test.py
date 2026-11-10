import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto("file:///home/claude/focusworld/tests/audio_harness.html")
        for n in ["rain","ocean","forest","fire","brown","lofi"]:
            r = await pg.evaluate(f"testSound('{n}', 20)")
            print(r)
        print("chime peak", await pg.evaluate("testChime()"))
        print("errors:", errs)
        await b.close()
asyncio.run(main())
