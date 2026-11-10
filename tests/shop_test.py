"""Product pages for Google (/shop/ and /shop/<id>/): built from src/catalog.json.
Run: python3 tests/shop_test.py   (builds the site with the live address first)"""
import importlib.util, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE_URL = "https://focusworld-bj0.pages.dev"
fails = []


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        fails.append(msg)


subprocess.run([sys.executable, "build.py", "--site"], cwd=ROOT, check=True, capture_output=True,
               env=dict(os.environ, FW_SITE_URL=SITE_URL))
spec = importlib.util.spec_from_file_location("b", os.path.join(ROOT, "build.py"))
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
cat = json.load(open(os.path.join(ROOT, "src", "catalog.json"), encoding="utf-8"))
shown = [it for it in cat["items"] if not it.get("hidden")]
out = os.path.join(ROOT, "dist", "site")

# every visible product has its own page, listed in the sitemap and on /shop/
sitemap = open(os.path.join(out, "sitemap.xml")).read()
index = open(os.path.join(out, "shop", "index.html"), encoding="utf-8").read()
check(SITE_URL + "/shop/</loc>" in sitemap, "the Shop page is in the sitemap")
for it in shown:
    path = os.path.join(out, "shop", it["id"], "index.html")
    check(os.path.isfile(path), "page exists: /shop/%s/" % it["id"])
    page = open(path, encoding="utf-8").read()
    check("%s/shop/%s/</loc>" % (SITE_URL, it["id"]) in sitemap, "in the sitemap: %s" % it["id"])
    check('href="/shop/%s/"' % it["id"] in index, "on the Shop page: %s" % it["id"])
    check('<link rel="canonical" href="%s/shop/%s/">' % (SITE_URL, it["id"]) in page, "canonical address: %s" % it["id"])
    ld = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', page, re.S).group(1))
    thing = ld["@graph"][0]
    check(thing["@type"] in ("Product", "WebPage") and thing["url"].endswith("/shop/%s/" % it["id"]), "structured data: %s (%s)" % (it["id"], thing["@type"]))
    if it.get("noPrice"):
        check(thing["@type"] == "WebPage", "a link card is not claimed as a product with a price: " + it["id"])
    title = re.search(r"<title>(.*?)</title>", page).group(1)
    desc = re.search(r'<meta name="description" content="(.*?)">', page).group(1)
    check(title.endswith("| Focus World") and 10 < len(desc) <= 160, "title and description: %s (%d chars)" % (it["id"], len(desc)))
    words = len(re.sub(r"<[^>]+>", " ", re.search(r'<article class="body">(.*?)</article>', page, re.S).group(1)).split())
    check(words >= 60, "enough useful words for Google: %s (%d words)" % (it["id"], words))
    check(it["url"].startswith("https://") is False or b._e(it["url"]) in page or "/tools/%s/" % it["id"] in page, "the button goes to the product: " + it["id"])

# hidden products get no page
hidden = dict(cat["items"][1], id="secret-thing", hidden=True)
check(b.shelf_for([hidden], True) == [], "hidden products get no page")

# the owner's text is made safe (no HTML gets through), and simple formatting works
html = b.render_details('## What\'s <b>inside</b>\nLine one\nLine two\n\n- one <script>alert(1)</script>\n- two\n\nEnd "quote" & more')
check("<script" not in html and "&lt;script&gt;" in html and "&lt;b&gt;" in html, "details: HTML in the text is shown as text, never run")
check("<h2>What&#x27;s &lt;b&gt;inside&lt;/b&gt;</h2>" in html and "<p>Line one<br>Line two</p>" in html, "details: headings and line breaks")
check(html.count("<li>") == 2 and "<p>End &quot;quote&quot; &amp; more</p>" in html, "details: lists and paragraphs")

# prices for structured data
check(b._offer_price({"price": "$19"}) == ("19", "USD"), "price $19 -> 19 USD")
check(b._offer_price({"price": "₹499"}) == ("499", "INR"), "price ₹499 -> 499 INR")
check(b._offer_price({"price": "Rs. 1,299"}) == ("1299", "INR"), "price Rs. 1,299 -> 1299 INR")
check(b._offer_price({"free": True}) == ("0", "USD"), "free -> 0")
check(b._offer_price({"price": "ask me"}) is None, "an unreadable price is not claimed")

# a paid promotion tells Google the link is paid, and shows Ad
ad = dict(cat["items"][1], ad=True)
page = b.render_product(b.shelf_for([ad], True)[0], b.shelf_for([ad], True), cat["categories"], SITE_URL)
check('rel="noopener sponsored nofollow"' in page and "Paid promotion" in page, "paid promotion: rel=sponsored + Ad label")

# a product that asks for details first gets the form on its page too
asking = dict(cat["items"][1], ask=["name", "email"])
page = b.render_product(b.shelf_for([asking], True)[0], b.shelf_for([asking], True), cat["categories"], SITE_URL)
check('data-ask="name,email"' in page and 'id="leadForm"' in page and "/api/lead" in page, "details form on the page when the product asks")
plain_item = {k: v for k, v in cat["items"][1].items() if k != "ask"}   # the same product with the form switched off
plain = b.render_product(b.shelf_for([plain_item], True)[0], shown, cat["categories"], SITE_URL)
check('id="leadForm"' not in plain and "/api/lead" not in plain, "no form (and no script) when it doesn't ask")

print("\n%d problem(s)" % len(fails) if fails else "\nall shop page checks passed")
sys.exit(1 if fails else 0)
