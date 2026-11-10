/* Focus World — My Shop server (runs as a Cloudflare Pages Function at /admin/api/*).

   What it does:
     POST /admin/api/login    { password }      -> sets a signed login cookie (30 days)
     POST /admin/api/logout                     -> clears it
     GET  /admin/api/me                         -> is the login still good? is GitHub connected?
     GET  /admin/api/catalog                    -> the shop file from GitHub (+ its version id)
     POST /admin/api/image?name=slug            -> body: base64 picture; stores it on GitHub, returns its path
     POST /admin/api/publish  { catalog, baseSha, uploads, note } -> one commit on GitHub; Cloudflare rebuilds
     GET  /admin/api/yt?id=VIDEOID              -> the YouTube cover picture for a video link
     GET  /admin/api/leads                      -> visitors' details from the "Before you go" form (newest first)
     POST /admin/api/leads-delete { id } | { all: true } -> delete one, or all

   Settings (Cloudflare Pages -> Settings -> Variables and Secrets):
     ADMIN_PASSWORD  (secret)  the My Shop password, 12+ characters, chosen by the owner
     GITHUB_TOKEN    (secret)  a fine-grained GitHub token for this one repo, Contents: read and write
     GITHUB_REPO               owner/name of the repo
     GITHUB_BRANCH             optional, default "main"
     LEADS_DB        (D1 database binding) optional; needed for the Leads tab (see lib/leads.mjs)

   Safety: every change needs the login cookie; the cookie is HttpOnly + SameSite=Strict + Secure and
   signed with a key made from the password (changing the password logs every device out); every POST
   must come from this same site (Origin check); the catalog is checked with the same rules as the build. */

import { validateCatalog } from './catalog-rules.mjs';
import { listLeads, deleteLeads, LeadError } from './leads.mjs';

const COOKIE = 'fw_admin';
const SESSION_MS = 30 * 24 * 3600 * 1000;
const CATALOG_PATH = 'src/catalog.json';
const MAX_JSON = 300 * 1024;          // publish body
const MAX_IMAGE_B64 = 1100 * 1024;    // about 800 KB of picture
const UPLOAD_RE = /^shelf\/[a-z0-9]+(-[a-z0-9]+)*\.(jpg|png|webp)$/;
const enc = new TextEncoder();

class HttpError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

function json(data, status, headers) {
  const h = new Headers(headers || {});
  h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status: status || 200, headers: h });
}

// ---------- small crypto helpers ----------
function b64url(bytes) {
  let s = '';
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
async function hmac(key, text) { return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text))); }
function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
function randomId(n) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789', b = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (let i = 0; i < n; i++) s += abc[b[i] % abc.length];
  return s;
}
// The id git gives a file: sha1("blob <size>\0<bytes>"). Lets us return the new catalog's version id.
async function gitBlobSha(text) {
  const body = enc.encode(text), head = enc.encode('blob ' + body.length + '\0');
  const all = new Uint8Array(head.length + body.length);
  all.set(head, 0); all.set(body, head.length);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', all))).map((x) => x.toString(16).padStart(2, '0')).join('');
}
function decodeB64Utf8(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---------- login ----------
function passwordProblem(env) {
  const p = env.ADMIN_PASSWORD;
  if (!p) return 'The My Shop password is not set in Cloudflare yet (ADMIN_PASSWORD).';
  if (p.length < 12) return 'The My Shop password in Cloudflare is too short. Use at least 12 characters.';
  return '';
}
async function sessionKey(env) { return hmacKey('focusworld-session-v1:' + env.ADMIN_PASSWORD); }
async function makeSession(env, now) {
  const payload = 'v1.' + (now + SESSION_MS) + '.' + randomId(16);
  return payload + '.' + b64url(await hmac(await sessionKey(env), payload));
}
function readCookie(request, name) {
  const all = request.headers.get('Cookie') || '';
  const parts = all.split(';');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (p.indexOf(name + '=') === 0) return p.slice(name.length + 1);
  }
  return '';
}
async function sessionOk(request, env, now) {
  if (passwordProblem(env)) return false;
  const v = readCookie(request, COOKIE);
  const m = /^(v1\.(\d{10,16})\.[a-z0-9]{16})\.([A-Za-z0-9_-]{43})$/.exec(v);
  if (!m) return false;
  if (Number(m[2]) <= now) return false;
  const want = await hmac(await sessionKey(env), m[1]);
  return sameBytes(enc.encode(b64url(want)), enc.encode(m[3]));
}
function cookieHeader(value, maxAgeSec) {
  return COOKIE + '=' + value + '; Path=/admin; Max-Age=' + maxAgeSec + '; HttpOnly; Secure; SameSite=Strict';
}

async function readJson(request, max) {
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, 'too_big', 'That is too much to send at once.');
  try { return JSON.parse(text); } catch (e) { throw new HttpError(400, 'bad_json', 'The request was not readable.'); }
}

// ---------- GitHub ----------
function ghConfig(env) {
  const repo = env.GITHUB_REPO || '', token = env.GITHUB_TOKEN || '', branch = env.GITHUB_BRANCH || 'main';
  if (!token || !repo) throw new HttpError(503, 'setup', 'GitHub is not connected yet (GITHUB_TOKEN and GITHUB_REPO in Cloudflare).');
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) throw new HttpError(503, 'setup', 'GITHUB_REPO must look like owner/name.');
  if (!/^[A-Za-z0-9._/-]+$/.test(branch)) throw new HttpError(503, 'setup', 'GITHUB_BRANCH has odd characters.');
  return { repo: repo, token: token, branch: branch };
}
async function gh(cfg, fetchFn, method, path, body) {
  const res = await fetchFn('https://api.github.com/repos/' + cfg.repo + path, {
    method: method,
    headers: {
      'Authorization': 'Bearer ' + cfg.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'focusworld-my-shop',
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
  if (res.status === 401) throw new HttpError(502, 'github_key', 'Your GitHub key stopped working (maybe it expired). Make a new one and save it in Cloudflare as GITHUB_TOKEN.');
  if (res.status === 403 || res.status === 404) {
    // 404 also means "this token cannot see the repo".
    if (path.indexOf('/git/ref') === 0 || path.indexOf('/contents/') === 0) {
      throw new HttpError(502, 'github_access', 'GitHub says no. Check that GITHUB_REPO is right and the key can read and write this repo.');
    }
  }
  return res;
}
async function ghJson(cfg, fetchFn, method, path, body, okStatuses) {
  const res = await gh(cfg, fetchFn, method, path, body);
  if ((okStatuses || [200, 201]).indexOf(res.status) < 0) {
    if (res.status === 422 && method === 'PATCH') throw new HttpError(409, 'conflict', 'Your shop changed somewhere else. Reload to get the newest version.');
    throw new HttpError(502, 'github', 'GitHub had a problem (' + res.status + '). Try again in a minute.');
  }
  return res.json();
}

async function getCatalog(cfg, fetchFn) {
  const data = await ghJson(cfg, fetchFn, 'GET', '/contents/' + CATALOG_PATH + '?ref=' + encodeURIComponent(cfg.branch));
  if (!data || typeof data.content !== 'string' || !/^[0-9a-f]{40}$/.test(data.sha || '')) {
    throw new HttpError(502, 'github', 'Could not read the shop file from GitHub.');
  }
  let catalog;
  try { catalog = JSON.parse(decodeB64Utf8(data.content)); } catch (e) { throw new HttpError(502, 'github', 'The shop file on GitHub is not readable.'); }
  return { catalog: catalog, sha: data.sha };
}

// ---------- routes ----------
async function login(request, env, now) {
  const problem = passwordProblem(env);
  if (problem) throw new HttpError(503, 'setup', problem);
  const body = await readJson(request, 2048);
  const given = typeof body.password === 'string' ? body.password : '';
  // Compare fixed-size fingerprints so the time taken never hints at the password.
  const k = await hmacKey(randomId(32));
  const ok = given.length > 0 && sameBytes(await hmac(k, given), await hmac(k, env.ADMIN_PASSWORD));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 700)); // slows down guessing
    throw new HttpError(401, 'wrong_password', 'Hmm, that is not the right password.');
  }
  return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader(await makeSession(env, now), SESSION_MS / 1000) });
}

const MAGIC = [
  ['jpg', [0xff, 0xd8, 0xff]],
  ['png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]
];
async function uploadImage(request, url, cfg, fetchFn) {
  const name = url.searchParams.get('name') || '';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 40) throw new HttpError(400, 'bad_name', 'Picture name is not allowed.');
  const b64 = (await request.text()).trim();
  if (b64.length > MAX_IMAGE_B64) throw new HttpError(413, 'too_big', 'That picture is too big. Try a smaller one.');
  if (b64.length < 100 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) throw new HttpError(400, 'bad_image', 'That file is not a picture.');
  const head = atob(b64.slice(0, 16)), bytes = [];
  for (let i = 0; i < head.length; i++) bytes.push(head.charCodeAt(i));
  let ext = '';
  MAGIC.forEach(function (m) { if (m[1].every(function (v, i) { return bytes[i] === v; })) ext = m[0]; });
  if (!ext && head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP') ext = 'webp';
  if (!ext) throw new HttpError(400, 'bad_image', 'Only JPG, PNG or WebP pictures, please.');
  const blob = await ghJson(cfg, fetchFn, 'POST', '/git/blobs', '{"content":"' + b64 + '","encoding":"base64"}');
  if (!/^[0-9a-f]{40}$/.test(blob.sha || '')) throw new HttpError(502, 'github', 'GitHub did not keep the picture.');
  return json({ path: 'shelf/' + name + '-' + randomId(6) + '.' + ext, sha: blob.sha });
}

async function publish(request, cfg, fetchFn) {
  const body = await readJson(request, MAX_JSON);
  const catalog = body.catalog, baseSha = body.baseSha, uploads = Array.isArray(body.uploads) ? body.uploads : [];
  if (!/^[0-9a-f]{40}$/.test(baseSha || '')) throw new HttpError(400, 'bad_request', 'Missing the shop version. Reload and try again.');
  if (uploads.length > 60) throw new HttpError(400, 'bad_request', 'Too many pictures at once.');
  uploads.forEach(function (u) {
    if (!u || !UPLOAD_RE.test(u.path || '') || !/^[0-9a-f]{40}$/.test(u.sha || '')) throw new HttpError(400, 'bad_request', 'A picture upload is not readable.');
  });
  const check = validateCatalog(catalog);
  if (!check.ok) throw new HttpError(422, 'invalid', 'Some products need a fix before publishing.', check.errors.slice(0, 20));

  const ref = await ghJson(cfg, fetchFn, 'GET', '/git/ref/heads/' + cfg.branch);
  const head = ref && ref.object && ref.object.sha;
  const commit = await ghJson(cfg, fetchFn, 'GET', '/git/commits/' + head);
  const treeSha = commit && commit.tree && commit.tree.sha;
  const tree = await ghJson(cfg, fetchFn, 'GET', '/git/trees/' + treeSha + '?recursive=1');
  const files = {};
  (tree.tree || []).forEach(function (e) { if (e.type === 'blob') files[e.path] = e.sha; });
  if (tree.truncated) throw new HttpError(502, 'github', 'The repo is too big to check. Ask for help.');
  if (files[CATALOG_PATH] !== baseSha) throw new HttpError(409, 'conflict', 'Your shop changed somewhere else (maybe another tab). Reload to get the newest version.');

  const newPics = {};
  uploads.forEach(function (u) { newPics[u.path] = u.sha; });
  const used = {};
  const missing = [];
  catalog.items.forEach(function (it) {
    if (newPics[it.image]) used[it.image] = true;
    else if (!files['src/' + it.image]) missing.push({ where: it.id, field: 'image', msg: 'Cover picture is missing. Pick it again.' });
  });
  if (missing.length) throw new HttpError(422, 'invalid', 'Some cover pictures are missing.', missing);

  const text = JSON.stringify(catalog, null, 2) + '\n';
  const entries = [{ path: CATALOG_PATH, mode: '100644', type: 'blob', content: text }];
  Object.keys(used).forEach(function (p) { entries.push({ path: 'src/' + p, mode: '100644', type: 'blob', sha: newPics[p] }); });
  const newTree = await ghJson(cfg, fetchFn, 'POST', '/git/trees', { base_tree: treeSha, tree: entries });
  const note = typeof body.note === 'string' ? body.note.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 120) : '';
  const newCommit = await ghJson(cfg, fetchFn, 'POST', '/git/commits', {
    message: 'My Shop: ' + (note || 'update products'), tree: newTree.sha, parents: [head]
  });
  await ghJson(cfg, fetchFn, 'PATCH', '/git/refs/heads/' + cfg.branch, { sha: newCommit.sha, force: false });
  return json({ ok: true, commit: newCommit.sha, catalogSha: await gitBlobSha(text) });
}

async function youtubeCover(url, fetchFn) {
  const id = url.searchParams.get('id') || '';
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new HttpError(400, 'bad_id', 'That is not a YouTube video link.');
  const names = ['maxresdefault.jpg', 'hqdefault.jpg'];
  for (let i = 0; i < names.length; i++) {
    const res = await fetchFn('https://i.ytimg.com/vi/' + id + '/' + names[i]);
    const type = res.headers.get('Content-Type') || '';
    if (res.status === 200 && type.indexOf('image/') === 0) {
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 2 * 1024 * 1024) break;
      return new Response(buf, { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' } });
    }
  }
  throw new HttpError(404, 'no_cover', 'Could not find a cover for that video. Upload a picture instead.');
}

export async function handle(request, env, deps) {
  const fetchFn = (deps && deps.fetch) || fetch;
  const now = ((deps && deps.now) || Date.now)();
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/admin\/api\/?/, '');
  const method = request.method;
  try {
    if (method === 'POST') {
      const origin = request.headers.get('Origin');
      if (!origin || origin !== url.origin) throw new HttpError(403, 'origin', 'Please use My Shop from your own site.');
    }
    if (route === 'login' && method === 'POST') return await login(request, env, now);
    if (route === 'logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookieHeader('', 0) });
    if (!(await sessionOk(request, env, now))) {
      const problem = passwordProblem(env);
      if (problem) throw new HttpError(503, 'setup', problem);
      throw new HttpError(401, 'login', 'Please log in.');
    }
    if (route === 'me' && method === 'GET') {
      let github = 'ok';
      try { ghConfig(env); } catch (e) { github = e.message; }
      return json({ ok: true, github: github });
    }
    if (route === 'leads' || route === 'leads-delete') {
      if (!env.LEADS_DB) return json({ ok: true, setup: false, leads: [] });
      if (route === 'leads' && method === 'GET') return json({ ok: true, setup: true, leads: await listLeads(env.LEADS_DB, now) });
      if (route === 'leads-delete' && method === 'POST') {
        await deleteLeads(env.LEADS_DB, await readJson(request, 4096));
        return json({ ok: true });
      }
    }
    const cfg = ghConfig(env);
    if (route === 'catalog' && method === 'GET') return json(await getCatalog(cfg, fetchFn));
    if (route === 'image' && method === 'POST') return await uploadImage(request, url, cfg, fetchFn);
    if (route === 'publish' && method === 'POST') return await publish(request, cfg, fetchFn);
    if (route === 'yt' && method === 'GET') return await youtubeCover(url, fetchFn);
    throw new HttpError(404, 'not_found', 'Not found.');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code, message: e.message, details: e.details }, e.status);
    if (e instanceof LeadError) return json({ error: e.code, message: e.message }, e.status);
    // Unexpected: log for the owner (no secrets are in the message), answer kindly.
    console.error('My Shop error:', e && e.stack ? e.stack : String(e));
    return json({ error: 'server', message: 'Something went wrong on our side. Try again in a minute.' }, 500);
  }
}
