# Focus World: go live and use My Shop

**Live site:** https://focusworld-bj0.pages.dev · **My Shop:** https://focusworld-bj0.pages.dev/admin/

This file explains how the site goes live and how you add products yourself.
Read it on your phone anytime. Each part says **who** does it.

---

## How it works (the big picture)

| Piece | What it is | Cost |
|---|---|---|
| **GitHub** (private folder) | Keeps all the code and your product list (`src/catalog.json`). Saves every version. | Free |
| **Cloudflare Pages** | Builds the site from GitHub and shows it to the world at `yourname.pages.dev`. | Free |
| **My Shop** (`/admin/`) | Your private page to add, edit, hide and delete products and follow links. | Free |

When you tap **Publish** in My Shop:

1. My Shop saves your product list to GitHub (one "commit" = one saved version).
2. Cloudflare sees the new version and rebuilds the site (about 1–2 minutes).
3. My Shop watches and says **Live now! 🎉** when visitors can see it.

Visitors only download plain files, so 1 lakh visitors a day costs nothing.
Only your Publish taps run code (free limit: 500 publishes a month).

---

## Part A: GitHub folder (you, 3 minutes)

1. Open GitHub in your Chrome and log in.
2. Tap **+** (top right) → **New repository**.
3. Name: `focusworld`. Choose **Private**. Leave everything else empty (no README).
4. Tap **Create repository**.
5. Tell Claude: "repo made", plus your GitHub username. Claude uploads the code.

## Part B: Cloudflare account (you, 3 minutes)

1. Sign up at Cloudflare with your **new email** (not the Speak Ahead one).
2. Open the email from Cloudflare and verify it.
3. No card is needed for anything we use.

## Part C: Put the site online (you click, Claude guides, 5 minutes)

1. Cloudflare → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick **GitHub**. GitHub asks which folders Cloudflare may see. Choose **Only select repositories** → `focusworld` → **Install**.
3. Settings for the build:

   | Box | Type this |
   |---|---|
   | Project name | `focusworld` (this becomes `focusworld.pages.dev` if free) |
   | Production branch | `main` |
   | Framework preset | `None` |
   | Build command | `python3 build.py --site` |
   | Build output directory | `dist/site` |

4. Tap **Save and Deploy**. Wait about 1 minute. The site is live. 🎉
5. Note your site address (for example `https://focusworld.pages.dev`).

## Part D: Unlock My Shop (you, 8 minutes)

### D1. Make a GitHub key (only for this one folder)

1. GitHub → your photo → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. Name: `Focus World My Shop`. Expiration: the longest it offers.
3. Repository access: **Only select repositories** → `focusworld`.
4. Permissions → Repository permissions → **Contents: Read and write**. Nothing else.
5. **Generate token** and copy it. (GitHub shows it only once.)

Why so narrow? If the key ever leaked, it could only touch this one folder.

### D2. Save 4 settings in Cloudflare

Cloudflare → your project → **Settings** → **Variables and Secrets** → **Add**:

| Name | Type | Value |
|---|---|---|
| `FW_SITE_URL` | Text | your site address, like `https://focusworld.pages.dev` (no `/` at the end) |
| `GITHUB_REPO` | Text | `yourGitHubName/focusworld` |
| `GITHUB_TOKEN` | **Secret** | the key from D1 |
| `ADMIN_PASSWORD` | **Secret** | your My Shop password (see below) |

**Your My Shop password:** at least 12 characters. Easy and strong: 4 random words, like `mango-river-kite-sunday`.
Save it in your phone's password manager. Claude never sees it.

### D3. Rebuild once

Cloudflare → your project → **Deployments** → latest one → **⋯** → **Retry deployment**.
Settings only take effect on a new build.

### D4. Open My Shop

Go to `https://your-site.pages.dev/admin/` → type your password → **Open my shop**.
You stay logged in on that phone for 30 days.

---

## Using My Shop

| To do this | Tap this |
|---|---|
| Add a product | **+ Add a product** → pick the kind → paste the link → pick a cover → write the words → **Save** |
| Add a YouTube video | Paste the YouTube link. It picks "YouTube video" and "Free" by itself. Tap **Use the YouTube video's cover**. |
| Use a phone screenshot or book cover | Pick it. Tall pictures are shown whole on a soft blurred background (**Show it all**). |
| Hide a product for now | **👁️ Shown** → becomes **🙈 Hidden** (it stays in your list) |
| Show on the break card | **☆ Feature** → **⭐ Featured** |
| Change the order | **↑** / **↓** |
| Add your YouTube, Instagram… | **Follow links** tab → **+ Add a follow link** |
| Let Ask Pip recommend a product | Edit the product → step 6 **Problems it solves** → tap up to 3 categories → **Save** |
| Add a new category | **Categories** tab → **+ Add a category** → name, emoji, **words people type** (press Enter after each) → **Test it with Pip** → **Save** |
| Teach Pip more words | **Categories** tab → **Edit** → add words → test a sentence → **Save** |
| Make it live | **Publish** (bottom bar) → wait for **Live now! 🎉** |
| Changed your mind before publishing | **Undo all** |

Your changes stay on your phone until you tap **Publish**, even if you close the page.

**How Ask Pip picks products:** each category has a list of words. When a visitor's message contains those words,
Pip shows the products in that category. Good words are the ones people really type: *"can't sleep"*, *"speak English"*,
*"resume"*. Test them in the **Test it with Pip** box before saving. Pip is not an AI and does not learn by itself;
it only knows the words in your categories (plus each product's search words).

---

## If something goes wrong

| My Shop says | What to do |
|---|---|
| "The My Shop password is not set in Cloudflare yet" | Do Part D2 (`ADMIN_PASSWORD`), then D3. |
| "…password in Cloudflare is too short" | Use 12+ characters, then D3. |
| "GitHub is not connected yet" | Add `GITHUB_TOKEN` and `GITHUB_REPO` (D2), then D3. |
| "Your GitHub key stopped working" | The key expired. Make a new one (D1), replace `GITHUB_TOKEN` (D2), then D3. |
| "GitHub says no" | Check `GITHUB_REPO` is exactly `name/focusworld`, and the key has Contents: Read and write. |
| "Your shop changed somewhere else" | Another tab published first. Choose **Publish mine** or **Load newest**. |
| "Still building… tap to check" | Open Cloudflare → Deployments to see if the build failed. If it did, ask Claude and share the build log. |

Safety built in: a broken product list can never go live. The build checks every product first,
and if anything is wrong it stops and the old site stays up.

---

## For Claude / developers

| Command | What it does |
|---|---|
| `python3 build.py` | Builds `dist/preview.html` |
| `FW_SITE_URL=https://x.pages.dev python3 build.py --site` | Builds the live site into `dist/site` (plain Python, no extra packages) |
| `python3 build.py --icons` | Redraws icons and the link picture into `src/static/` (needs Playwright + Pillow) |
| `node tests/test_logic.js` | Focus timer, streaks, scenes |
| `node tests/test_helper.js` | Ask Pip: typed messages get the right answer and products |
| `python3 build.py --site` then `python3 tests/ask_test.py` | Ask Pip in a real browser (phone and laptop sizes) |
| `node tests/dev_server.mjs 8791 /tmp/fw-dev-cats` then `PORT=8791 python3 tests/admin_cats_e2e.py` | My Shop categories → publish → Ask Pip uses them (run one My Shop test at a time) |
| `node tests/test_rules.mjs` | Product rules: JavaScript and Python copies agree |
| `node tests/test_admin_api.mjs` | My Shop server: login, upload, publish, conflicts |
| `node tests/dev_server.mjs 8790 /tmp/fw-dev` then `python3 tests/admin_e2e.py` | Full My Shop test with a fake GitHub that rebuilds on publish |
| `python3 tests/e2e.py`, `tests/site_test.py`, `tests/scene_matrix.py` | Main app, live-site headers, all scenes |

Files: `lib/catalog-rules.mjs` (product rules), `lib/admin-core.mjs` (My Shop server),
`functions/admin/api/[[path]].js` (Cloudflare entry), `src/admin/` (My Shop page), `src/catalog.json` (your products).
