# Focus World — Progress log

## 10 Nov 2026 — Version 1 built
| What | Result |
|---|---|
| Logic tests (timer, streak, unlocks, backup checks) | 12 / 12 pass |
| Browser tests (phone 390px + laptop 1280px, every flow) | 40 / 40 pass, 0 errors |
| Sounds (6 sounds rendered and measured) | All play, none clip |
| Cloudflare version with security rules on | Loads, no errors, all files found |
| Preview link | https://claude.ai/artifact/RR18EGXmLQT53HZCK5Fo1c (private) |

### Known limits (honest)
- In the preview link, "Save backup" and "Save picture" do nothing (the preview viewer blocks downloads). They work on the real site.
- iPhone: sound and the end alarm may stop when the screen locks (browser rule). "Keep screen on" reduces this.
- Phone-free mode cannot tell "locked my phone to study" from "opened Instagram". Both count as leaving. That is why it is optional.
- The world is saved on one device only. The backup file moves it.

### Files
| File | What it is |
|---|---|
| src/logic.js | Timer, streak, unlocks, safe loading of saved data |
| src/world.js, src/items.js | The island drawings and sky |
| src/audio.js | Rain, ocean, forest, fire, brown noise, lofi music |
| src/app.js | Screens and buttons |
| src/index.html, src/style.css | Page and design |
| build.py | Makes dist/preview.html and dist/site (Cloudflare folder) |
| tests/ | All tests |

## 10 Nov 2026 — v1.1 (dinesh: "no sound", "show my product with its cover")
| Change | Why |
|---|---|
| First session starts lofi + soft rain, with a note "change it in Sounds" | Sounds were off by default, so nothing played |
| iPhone fix: sound plays even with the silent switch on | iPhones mute website sound with the silent switch |
| New "Tools" page in the bottom bar: product cards with cover picture, price and button | Showcase, not just a link |
| Break card: cover picture + title + price, shown 1.5 s into each break, never on top of Pip, closable | Breaks are the only time we sell |
| Tests | Logic 12/12, browser 47/47, Cloudflare version: no errors |

To add a product later: put its cover in src/shelf/ and add one entry to SHELF in build.py.

## 10 Nov 2026 — v1.2 (dinesh: "cuter, warmer words" + "a shop for many kinds of products, with search")
| Change | Detail |
|---|---|
| Warmer, playful words everywhere | Buttons, Pip, onboarding, toasts, settings, Toolshed |
| Tools became **The Toolshed** | Search box, type filters (Kits, Ebooks, Apps, Video courses, Videos, Websites, Templates, Tools, Free stuff), cover cards with type badges, play icon on video items, friendly empty result |
| Catalog file | src/catalog.json: one entry per product. Covers go in src/shelf/ (16:9) |
| Now in the Toolshed | Paper Trail ($19), Free First Reply, CP2000 Rescue Kit ($39), Free IRS Letter Check |
| Free tools on our own site | /tools/first-reply/ and /tools/irs-letter-check/ (no Claude account needed). The preview still links to the claude.ai versions |
| Break card | Rotates the "featured" items, short hook line, "Psst… from the maker" |
| Tests | Logic 12/12, browser 52/52, Cloudflare version + both free tools: no errors |

## 10 Nov 2026 — v1.3 Scenes (dinesh: "new scenery every day so it never gets boring")
| Change | Detail |
|---|---|
| 12 scenes | Sunny Meadow, Cherry Spring, Cozy Rain, Misty Morning, Windy Kite Day, Golden Autumn, Rainbow Day, Tropical Lagoon, Firefly Meadow, Snowy Winter, Cloud Kingdom (floating island), Starry Wishes |
| New scene every day | Different for each island, never the same 2 days in a row. A toast says "Today's scene" on the first visit of the day |
| Or after every session | Option in the Scenes page |
| Unlock by minutes | 4 at start; then 45, 90, 180, 300, 450, 650, 900, 1300 minutes. Pip celebrates each new one |
| Pick a favourite | Scenes page with live mini previews; locked ones show minutes to go |
| Time of day still works | Morning / day / sunset / night on top of every scene |
| Safety | If any drawing ever fails, the app falls back to the meadow instead of a blank screen |
| Tests | Logic 14/14, browser 58/58, 540 scene/sky/size combinations with no errors |

## 10 Nov 2026 — v1.4 Faraway places (dinesh: "the land is still the same — make truly different places")
| Change | Detail |
|---|---|
| 8 new places | Mountain Valley, Desert Oasis, City Rooftop (open at start); Enchanted Forest 60 min; Zen Garden 150; Underwater Dome 300; Snowy Peaks 500; Space Garden 800 |
| Each place is its own land | Own background, own ground, own front decorations (river, dunes + camels + oasis, skyline + deck + string lights, light shafts + mushrooms, raked gravel + bamboo + tea house, fish + kelp + glass dome, snow mountains + pines, nebula + ringed planet + rocket + floating rock). No island edge in these places |
| Garden travels along | Everything the person grew moves with them; sea-only things (boat, whale, little island, dock) stay home |
| Daily rotation | Places go round in shuffled cycles: never the same place two days in a row, every place returns within ~2 weeks |
| Every session option | Next session goes to a different place |
| Scenes page | Two groups: "Faraway places" and "Island moods" (the 12 old scenes) |
| Bug fixed | "New scene unlocked" now checks the minutes passed, not list position |
| Code | New src/places.js; world.js calls it; tests/places.py makes contact sheets |
| Tests | Logic 14/14 (400 days x 4 seeds x 4 levels, no repeat place), browser 58/58, 900 renders with no errors, site + free tools clean |

## 10 Nov 2026 — v1.5 My Shop (dinesh: "a screen only for me to add my products, videos, YouTube and social links myself")
| Change | Detail |
|---|---|
| My Shop page | Private page at `/admin/`. Add, edit, hide, feature, reorder, delete products. Live card preview while typing |
| Kinds | Ebook, App, Website, Video course, YouTube video, Template, Tool, Kit |
| Cover pictures | Pick any picture; it becomes a small 960x540 JPEG on the phone. Tall pictures are shown whole on a blurred background. YouTube links can fetch the video's cover |
| Follow links | YouTube, Instagram, Facebook, X, Threads, LinkedIn, TikTok, Telegram, WhatsApp, Pinterest, Website. Shown in the Toolshed as "Say hi to the maker" |
| Login | One password (12+ characters) that dinesh saves in Cloudflare himself. No card needed (Cloudflare's email-code login needs a card). Safe 30-day cookie; changing the password logs every device out |
| Publish | One GitHub commit per Publish → Cloudflare rebuilds → "Live now!" in about 2 minutes. Changes wait as a draft on the phone until Publish |
| Safety | Same product rules in My Shop, its server and the build (tested to agree on 52 cases). A bad list can never go live. Only `/admin/api/*` runs code; everything else is plain files |
| Build | `build.py --site` needs only plain Python now (icons are pre-drawn in `src/static/`), so Cloudflare can build on every publish |
| Fixes | Offline helper no longer stores /tools or /admin pages as the home page; new covers get new names so phones never show an old cover |
| Tests | Logic 14/14, rules 52/52, My Shop server 13/13, My Shop in a browser 31/31 (login → add → YouTube → links → hide → publish → live site), main app 58/58, site + free tools clean, 900 scene renders, and My Shop's server checked inside Cloudflare's own runtime |
| Guide | SETUP.md: go-live steps and how to use My Shop |

### Next
1. ~~dinesh makes a private GitHub repo `focusworld` → Claude uploads the code.~~ Done 10 Nov (github.com/dineshhuidrom/focusworld).
2. ~~dinesh creates the new Cloudflare account (new email) → connects it to the repo.~~ Done 10 Nov. Live at https://focusworld-bj0.pages.dev
3. ~~dinesh makes the GitHub key (no expiry, focusworld only) and saves the 4 settings.~~ Done 10 Nov.
4. ~~Test My Shop live.~~ Done 10 Nov 18:05: dinesh logged in, added an Instagram follow link, Published → "Live now!" ✅

## 🚀 LAUNCHED — 10 Nov 2026
Focus World is live at https://focusworld-bj0.pages.dev. dinesh adds products himself at /admin/ (see SETUP.md).

## 10 Nov 2026 — Getting found on Google (step 1 and 2)
| Done | Detail |
|---|---|
| Google Search Console | Focus World added (same Google account as Speak Ahead, separate property). Ownership verified with the file `src/static/googlef5947e8e96c6c51d.html`. **Never delete this file.** Sitemap submitted |
| Logo for Google | Real icon files: `/favicon.ico`, `/favicon.svg`, `/favicon-96.png` (Google shows them after its next visit) |
| Words for Google | Hidden main heading, an "About & help" page (⋯ menu → About & help, 8 questions), structured data saying "free web app", sitemap now lists the 2 free tool pages too |

### Next (search)
1. 11 Nov: Search Console → URL inspection → `https://focusworld-bj0.pages.dev/` → Request indexing (today said "quota exceeded").
2. Guide pages (5 approved 10 Nov): ✅ 1. The 50/10 study method (live) · 2. How long to study before a break · 3. The 52/17 rule · 4. Pomodoro timer with lofi music · 5. Pomodoro vs 50/10 vs 52/17. Files: `src/guides/<name>.html`; pictures: `python3 tools/make_guide_heroes.py`. Guide links like `/?focus=50&break=10` open the timer pre-set.
3. Bing Webmaster Tools: import from Google Search Console.
4. Share the link on Instagram, YouTube Shorts, study communities.


## 10 Nov 2026 — v1.6 Ask Pip, a free helper chat (dinesh: "recommend my products for the situation people are in, help them use Focus World, help students study. No AI, a helper bot is enough")
| What | How |
|---|---|
| Where | 5th button in the bottom bar (**Ask Pip**), plus links in the Toolshed and in About & help. Hidden while a focus session runs |
| Brain | `src/helper.js`: written answers, no AI, ₹0, works offline, nothing typed leaves the device. ~40 topics: study (can't focus, putting it off, exam soon, study plan, how long to study, remembering, understanding, big assignments, sleepy, stressed, failed a test, study music), using Focus World (unlocks, streaks, places, timer, stopping, phone-free mode, backup, install, alerts, calm mode, free/privacy…), and real-life problems (accused of using AI, IRS letter) |
| Your products | Found by their **tags** from My Shop (and words in the title). A new product with good tags is recommended automatically; no code change. Study questions don't push products |
| Buttons in answers | Start 2/15/25 min, set 25+5 / 50+10 / 90+15, open Sounds/Settings/Progress/Places/Toolshed, save a backup, open a study guide, follow links |
| Safety | Messages about self-harm get a caring answer with 112, Tele-MANAS 14416 (India) and findahelpline.com, never products |
| Tests | `node tests/test_helper.js` (95 typed messages plus product and safety checks), `python3 tests/ask_test.py` (browser, phone 320/360/390 px and laptop) |

Tip for dinesh: in My Shop, give each product tags in the words people use ("teacher says I used AI", "scary tax letter"), so Pip can find it.

## 10 Nov 2026 — v1.7 Categories (dinesh: "when I upload a product I select a category, and the bot recommends products by category")
| What | How |
|---|---|
| Categories | 12 starter categories in `src/catalog.json` (Study & exams, English speaking, School & college problems, Jobs & careers, Money & taxes, Business & selling, YouTube & content, Apps & tech, Focus & habits, Calm & sleep, Other languages, Creative skills). Each has a name, emoji and **words people type** |
| My Shop | New **Categories** tab: see how many products use each, edit words, add your own category (name + emoji + words), **Test it with Pip** box, delete (also removes it from products). Product editor step 6 **Problems it solves**: pick up to 3 |
| Ask Pip | Typed words → best category → its products. Study tips keep their answer and show 1 product from the matching category. Real-life problems (AI accusation, IRS) show up to 2. App how-to questions show none. "Something else is wrong" shows category buttons. A category with no products gets an honest "nothing yet" |
| Already set | Paper Trail + First Reply → School & college problems; CP2000 kit + IRS check → Money & taxes (change any time in My Shop) |
| Rules | Same rules in `lib/catalog-rules.mjs` and `build.py`, checked by `tests/test_rules.mjs` (83 cases agree) |
| Tests | `test_helper.js` (19), `ask_test.py`, `admin_cats_e2e.py` (24), all older tests still pass |

## 10 Nov 2026 — v1.8 Link cards, paid promotions, small links, details form, Leads (dinesh: "show my WhatsApp group / YouTube / app links, promote other people's pages, and get name + number before they buy")
| What | How |
|---|---|
| Every link is a picture card | dinesh (10 Nov): "only text, I don't like it". The small text-links tab is hidden; Speak Ahead Academy moved from a text link to a big card (Social page, "Follow", temporary picture `src/shelf/speak-ahead-academy.jpg` until he uploads his logo). Pip's "follow / contact" answers show these page cards. New product kinds **Group** and **Social page**; a pasted link picks the kind by itself. **No price** option |
| Other people's things | Small links: **Whose page is it?** Mine → "Follow Focus World", someone else's → "Worth a follow". **Paid promotion** switch (products and small links) shows **Ad**. Only paid ones are labelled (dinesh's choice) |
| Honest wording | "The maker" replaced by "Focus World" / neutral words. While any Ad is shown, the build removes every "no ads" promise (`ads_wording` in build.py; the build stops if one is missed). Note: the link-preview picture `og.jpg` still says "No ads"; redraw it (`build.py --icons`) if paid promotions become regular |
| "Before you go" form | Per product: **Ask for their details first** + which boxes (Name, WhatsApp number, Email). Visitors give a number or an email, tick consent, or Skip. The link opens in the same tap. Spam guard: hidden field + max 5 a day per visitor |
| Leads tab | My Shop → **Leads**: newest first, 💬 WhatsApp / ✉️ email in one tap, delete one or all, download a spreadsheet (CSV). Auto-deleted after 12 months. Stored in a free Cloudflare D1 database: **needs Part F of SETUP.md once** |
| Privacy | New page `/privacy/` (what is kept, why, who sees it, how long, how to delete; paid promotions say Ad). Linked from the form and About |
| Tests | `test_leads.mjs` (10), `admin_links_e2e.py` (39), rules agree on 104 cases, all older tests pass |

## 10 Nov 2026 — v1.9 A Google page for every product (dinesh: "people should find my digital products on Google by their keywords")
| What | How |
|---|---|
| Product pages | Every shown product gets its own page `/shop/<id>/` with a Google-friendly title and description, the picture, price, the button, and the "Before you go" form when it is switched on. `/shop/` lists them all. Both are in the sitemap; the Shop link is in the guide and page footers |
| Google data | Each page tells Google what it is (Product with price when there is one, otherwise a normal page) plus the breadcrumb. Paid promotions keep **Ad** and their links are marked sponsored |
| More details for Google | New box in My Shop (step 4, up to 3000 letters) with a live "how it may look on Google" preview. Claude wrote the text for the 5 current products; dinesh writes it for new ones |
| Check | Speak Ahead Academy's page says Zoom classes, a practice app and help in Manipuri; dinesh to confirm these are right before it goes live |
| Tests | `shop_test.py` (new), `admin_e2e.py` (32), `admin_links_e2e.py` (42), `admin_cats_e2e.py` (24), rules agree on 109 cases, all older tests pass. My Shop browser tests now wait for the local server to finish building |


## 🚀 LIVE — 10 Nov 2026, 21:15
v1.6 to v1.9 are live: Ask Pip, categories, picture cards, Ad label, details form, Leads tab, product pages (`/shop/`). Checked on the live site: Speak Ahead page and sitemap (12 pages).

### Next
- dinesh: add the full Speak Ahead details (one-on-one practice, tongue twisters…) and his logo in My Shop
- ✅ Part F done 10 Nov 21:45: D1 `focusworld-leads` made, `LEADS_DB` connected, Leads tab shows "No leads yet"
- Search Console: send the sitemap again so Google finds the new product pages

## 10 Nov 2026 — v1.9.1 Numbers without +91 (dinesh: "people shouldn't have to add +91, just type the number")
| What | How |
|---|---|
| Rule | No "+" means an Indian number: `98123 45678`, `098123 45678`, `91 98123 45678` all save as `+919812345678`. Other countries type + and their code. A wrong number gets a simple message ("Type your 10-digit number") |
| Where | Same rule in the site form (`src/app.js`), the product page form (`src/shop/shop.js`) and the server (`lib/leads.mjs`); a test checks the three copies agree. "with country code" removed from the forms |
| Tests | `test_leads.mjs` 11 (19 number cases), `admin_links_e2e.py` 42, all others pass |

## 10 Nov 2026 — v1.10 Calm, smooth sounds (dinesh: "the music plays non-stop, stops for 1–2 seconds again and again, too many sound effects, no way to stop it")
| What | How |
|---|---|
| Measured first | Recorded the music with code: about every 3 seconds it fell to near silence for 0.5–1.8 s (each chord faded before the next one). On phone speakers the deep bass and drums can't be heard, so it sounded like the music stopping |
| Smooth music | Chords now hold until the next chord. Bass has a soft higher layer so phone speakers hear it. Record crackle clicks and hiss removed; bells rarer and softer. Measured after: no gaps, no clicks |
| No stutter in long sessions | Before, every chord stayed wired to the "tape wobble" forever, so the phone did a bit more work each bar. Now one wobble for all. Notes are booked 1 s ahead (was 0.35 s), and if the phone freezes for a moment, the missed beats are skipped instead of all playing at once |
| Sounds follow the timer | Play while focusing, fade out when the timer ends or on Stop, quiet on Pause, quiet when idle. The Sounds panel plays them while it is open, so people hear what they pick |
| Breaks | Quiet by default (dinesh chose A). Visitors choose: 🔊 button on the break screen, or "Play during breaks" in Sounds. Remembered |
| 🔊 button | Beside Pause and Stop: one tap stops all sounds, one tap plays them again (crossed out when off). Toast on the first session says "Tap 🔊 to stop it". Pip and the FAQ explain it |
| Tests | New `sound_test.py` (26 checks, incl. a 40-second recording with no gaps/clicks). Tests that counted today's products/categories now read them from the shop, so dinesh's My Shop edits don't break them. All suites pass |
| Not live yet | Waiting for dinesh's yes (the +91 fix went live at 21:57) |

