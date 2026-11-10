# Focus World — Plan (version 1)

## What it is
A free website where people study or work. Every minute they focus grows their own little island:
grass, trees, a cottage, a windmill, a lighthouse and more. Calm sounds and lofi music are made by code.

## Who it is for
Students and desk workers anywhere in the world, on phone or laptop.

## Fixed rules
| Rule | Why |
|---|---|
| Free to use | So people come every day |
| No sign-up | No barrier. The world is saved on the person's own device |
| No ads (for now) | Ads distract, and they would compete with our own products |
| ₹0 to run | Plain website for visitors, no database. Hosted on Cloudflare Pages (free). Only My Shop's Publish runs a little code |
| Our products only in breaks | Selling never interrupts focus |

## Version 1 features
| Feature | What it does |
|---|---|
| Focus timer | 15 / 25 / 50 / 90 min or custom. Pause, stop. Correct even if the tab sleeps |
| Just 2 minutes | A tiny start button to beat procrastination |
| Growing world | 31 things unlock by total focus minutes. Live sky: morning, day, sunset, night |
| Session sprout | A sprout grows during each session |
| Phone-free mode (optional) | If you leave the page for more than 10 seconds, the sprout wilts |
| Keep screen on | The screen stays awake while focusing (where the browser allows) |
| Sounds | Rain, ocean, forest, fire, brown noise, lofi music — all made by code, no licence fees |
| Streak + progress | Today, streak, best streak, total hours, 7-day chart, collection |
| Share picture | A picture of your island with your stats, ready for Instagram/WhatsApp |
| Backup file | Save your world to a file and load it on another device |
| Calm mode | Less motion, saves battery on cheap phones |
| Guide character | Pip, a small sprout spirit, appears only at key moments |
| Toolshed | Our products with cover pictures, search and kinds; featured ones pop up during breaks; Follow links at the bottom |
| My Shop | dinesh's private page (`/admin/`) to add products, YouTube videos and follow links himself, then Publish |
| Works offline | After the first visit (when hosted on Cloudflare) |

## Not in version 1 (later)
- Live "people focusing now" counter (needs a small server)
- Weekly email report (optional, opt-in)
- Other sellers on the shelf + small commission
- Chrome extension (new-tab page)
- Notion widget
- Guide pages for Google search
- Portuguese and Spanish
- Daily plan and exam countdown, friend challenge link

## Business plan in one line
Free daily tool → people trust it → our products on the shelf during breaks → later other creators sell here too.

## Hosting note
Cloudflare now recommends Workers for new projects, but Pages is still fully supported. We use Pages (Git builds + Functions). We can move to Workers later with no change for visitors.

## Next projects (planned later, same Cloudflare account)
- Free job portal for Manipur and other states, maybe global. Build on what ManipurHire already has.

## Steps
| # | Step | Status |
|---|---|---|
| 1 | Plan | Done |
| 2 | Island scene + timer | Done |
| 3 | Sounds, music, streak, saving | Done |
| 4 | Growing world (all 31 stages) | Done |
| 5 | Share picture, shelf, backup, onboarding, Pip | Done |
| 6 | Testing on phone and laptop | Done (52 automatic checks pass) |
| 7 | Preview link + Cloudflare-ready folder | Done |
| 8 | Scenes + faraway places, cute words, Toolshed | Done |
| 9 | My Shop (add products yourself) | Done |
| 10 | Go live: GitHub repo → Cloudflare Pages → My Shop keys (see SETUP.md) | Waiting for dinesh |
