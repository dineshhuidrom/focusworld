"""Draw the picture at the top of each study guide with the real Focus World renderer.
Run on our machine (needs Playwright): python3 tools/make_guide_heroes.py
Each guide's <!--meta--> says which scene to use. Pictures go to src/static/guides/img/<slug>.jpg"""
import asyncio, base64, io, json, os, re
from PIL import Image
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GDIR = os.path.join(ROOT, "src", "guides")
OUT = os.path.join(ROOT, "src", "static", "guides", "img")
SKY = {"stars": "night", "fireflies": "sunset", "rooftop": "sunset", "space": "night"}


async def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = []
    for name in sorted(os.listdir(GDIR)):
        if name.endswith(".html") and not name.startswith("_"):
            meta = json.loads(re.match(r"\s*<!--meta\s*(\{.*?\})\s*-->", open(os.path.join(GDIR, name), encoding="utf-8").read(), re.S).group(1))
            jobs.append((name[:-5], meta["scene"]))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        pg = await b.new_page()
        await pg.goto("file://" + os.path.join(ROOT, "tests", "world_harness.html"))
        for slug, scene in jobs:
            data = await pg.evaluate("""([scene, sky]) => {
              const W = 1200, H = 520, c = document.createElement('canvas'); c.width = W; c.height = H;
              FWWorld.renderStatic(c.getContext('2d'), W, H, {l: 200, t: 20, r: 1000, b: 515},
                {min: 3400, seed: 20261110, sky, rain: 0, calm: true, seedling: null, scene}, 12.4);
              return c.toDataURL('image/png');
            }""", [scene, SKY.get(scene, "day")])
            im = Image.open(io.BytesIO(base64.b64decode(data.split(",", 1)[1]))).convert("RGB")
            path = os.path.join(OUT, slug + ".jpg")
            im.save(path, "JPEG", quality=82, optimize=True, progressive=True)
            print(slug, scene, os.path.getsize(path) // 1024, "KB")
        await b.close()

asyncio.run(main())
