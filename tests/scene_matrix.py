import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page()
        await pg.goto("file:///home/claude/focusworld/tests/world_harness.html")
        res = await pg.evaluate("""() => {
          const scenes = FWLogic.SCENES.map(x => x.id);
          const skies = ['live','morning','day','sunset','night'];
          const sizes = [[150,95],[390,600],[1280,760]];
          const mins = [0, 300, 9000];
          let ok = 0, bad = [];
          const c = document.createElement('canvas');
          for (const sc of scenes) for (const sky of skies) for (const [W,H] of sizes) for (const m of mins) {
            c.width = W; c.height = H; const x = c.getContext('2d');
            try { FWWorld.renderStatic(x, W, H, {l:0,t:H*0.05,r:W,b:H*0.95}, {min:m, seed: 99, sky, rain: 0.5, calm: false, seedling: {f:0.5, wilted:false}, scene: sc}, 33.3); ok++; }
            catch (e) { bad.push([sc, sky, W, m, String(e)]); }
          }
          return {ok, bad: bad.slice(0, 5)};
        }""")
        print(res)
        await b.close()
asyncio.run(main())
