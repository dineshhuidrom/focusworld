"""Make 16:9 cover pictures for the Toolshed (960x540 JPEG)."""
import asyncio, os
from PIL import Image
from playwright.async_api import async_playwright

ROOT = "/home/claude/focusworld"
OUT = os.path.join(ROOT, "src", "shelf")
SHOTS = os.path.join(ROOT, "tools", "_shots")
os.makedirs(SHOTS, exist_ok=True)

COVERS = [
    {"id": "first-reply", "page": os.path.join(ROOT, "src/tools/first-reply.html"),
     "bg": "#131a2f", "accent": "#ffe066", "serif": True,
     "kicker": "Free tool · Paper Trail",
     "title": "Flagged by an AI detector?", "title2": "Send a calm first reply.",
     "sub": "What to say, and what not to say. In simple English.",
     "chips": ["Free", "No sign-up"]},
    {"id": "irs-letter-check", "page": os.path.join(ROOT, "src/tools/irs-letter-check.html"),
     "bg": "#111725", "accent": "#ffb547", "serif": False,
     "kicker": "Free check · CP2000 Rescue",
     "title": "Got an IRS letter?", "title2": "See where you stand.",
     "sub": "Your reply date, the likely cause and what to gather.",
     "chips": ["Free", "No sign-up", "Stays on your phone"]},
]

TPL = """<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box} body{margin:0;width:1280px;height:720px;background:%(bg)s;font-family:Inter,system-ui,sans-serif;color:#f7f3ea;overflow:hidden;position:relative}
.glow{position:absolute;right:-120px;top:-120px;width:720px;height:720px;border-radius:50%%;background:radial-gradient(%(accent)s33,transparent 65%%)}
.l{position:absolute;left:84px;top:110px;width:640px}
.k{color:%(accent)s;font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:20px}
h1{margin:26px 0 0;font-size:66px;line-height:1.05;font-weight:%(tw)s;font-family:%(tf)s}
h1 span{display:inline-block;margin-top:10px;background:%(accent)s;color:#141414;padding:2px 14px 6px;border-radius:6px}
p{font-size:26px;line-height:1.4;color:#d9d4c8;margin:34px 0 0;width:560px}
.c{display:flex;gap:12px;margin-top:40px}.c b{border:2px solid %(accent)s;color:%(accent)s;border-radius:999px;padding:10px 20px;font-size:19px;font-weight:700}
.ph{position:absolute;right:96px;top:70px;width:318px;height:660px;border-radius:44px;background:#05070d;padding:12px;box-shadow:0 40px 90px rgba(0,0,0,.55);transform:rotate(3deg)}
.ph img{width:100%%;height:100%%;object-fit:cover;object-position:top;border-radius:34px;display:block}
</style></head><body><div class="glow"></div><div class="l"><div class="k">%(kicker)s</div>
<h1>%(title)s<br><span>%(title2)s</span></h1><p>%(sub)s</p><div class="c">%(chips)s</div></div>
<div class="ph"><img src="file://%(shot)s"></div></body></html>"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        for c in COVERS:
            pg = await b.new_page(viewport={"width": 390, "height": 810}, device_scale_factor=2)
            await pg.goto("file://" + c["page"])
            await pg.wait_for_timeout(1500)
            shot = os.path.join(SHOTS, c["id"] + ".png")
            await pg.screenshot(path=shot)
            await pg.close()
            html = TPL % dict(c, shot=shot, chips="".join("<b>%s</b>" % x for x in c["chips"]),
                              tw="400" if c["serif"] else "800",
                              tf="'Instrument Serif','DejaVu Serif',Georgia,serif" if c["serif"] else "Inter,system-ui,sans-serif")
            hp = os.path.join(SHOTS, c["id"] + ".html")
            open(hp, "w").write(html)
            pg = await b.new_page(viewport={"width": 1280, "height": 720})
            await pg.goto("file://" + hp)
            await pg.wait_for_timeout(500)
            big = os.path.join(SHOTS, c["id"] + "-cover.png")
            await pg.screenshot(path=big)
            await pg.close()
            Image.open(big).convert("RGB").resize((960, 540), Image.LANCZOS).save(os.path.join(OUT, c["id"] + ".jpg"), "JPEG", quality=84, optimize=True, progressive=True)
        await b.close()
    Image.open("/home/claude/irs/store/out/CP2000-Rescue-Kit-Cover-1.png").convert("RGB").resize((960, 540), Image.LANCZOS) \
        .save(os.path.join(OUT, "cp2000-kit.jpg"), "JPEG", quality=84, optimize=True, progressive=True)
    print(sorted(os.listdir(OUT)))

asyncio.run(main())
