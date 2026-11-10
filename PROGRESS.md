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
1. dinesh makes a private GitHub repo `focusworld` and tells Claude his GitHub username → Claude uploads the code.
2. dinesh creates the new Cloudflare account (new email) → connects it to the repo (SETUP.md Part C).
3. dinesh makes the GitHub key and saves the 4 settings (SETUP.md Part D) → My Shop works.
