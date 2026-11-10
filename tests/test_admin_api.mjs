// Tests for My Shop's server part (lib/admin-core.mjs) against the fake GitHub.
// Run: node tests/test_admin_api.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle } from '../lib/admin-core.mjs';
import { makeFakeGitHub } from './fake_github.mjs';

const ORIGIN = 'https://focusworld.pages.dev';
const PASSWORD = 'sunny-mango-kite-river';
const TOKEN = 'fake-test-token-not-real';
const catalogText = readFileSync(new URL('../src/catalog.json', import.meta.url));
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300, 1)]);

function setup(over) {
  const files = { 'src/catalog.json': catalogText, 'build.py': Buffer.from('x') };
  JSON.parse(catalogText).items.forEach((it) => { files['src/' + it.image] = Buffer.from('pic-' + it.id); });
  const gh = makeFakeGitHub({
    repo: 'dinesh/focusworld', branch: 'main', token: TOKEN, files,
    extra: async (u) => {
      if (u.origin !== 'https://i.ytimg.com') return null;
      if (u.pathname === '/vi/dQw4w9WgXcQ/maxresdefault.jpg') return new Response(JPG, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
      if (u.pathname === '/vi/aaaaaaaaaaa/maxresdefault.jpg') return new Response('nope', { status: 404, headers: { 'Content-Type': 'text/html' } });
      if (u.pathname === '/vi/aaaaaaaaaaa/hqdefault.jpg') return new Response(JPG, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
      return new Response('nope', { status: 404, headers: { 'Content-Type': 'text/html' } });
    }
  });
  const env = Object.assign({ ADMIN_PASSWORD: PASSWORD, GITHUB_TOKEN: TOKEN, GITHUB_REPO: 'dinesh/focusworld' }, over || {});
  let clock = Date.UTC(2026, 10, 10, 12, 0, 0);
  let cookie = '';
  async function call(method, path, body, opts) {
    opts = opts || {};
    const headers = new Headers();
    if (method === 'POST') headers.set('Origin', opts.origin === undefined ? ORIGIN : opts.origin);
    if (opts.cookie !== undefined ? opts.cookie : cookie) headers.set('Cookie', 'fw_admin=' + (opts.cookie !== undefined ? opts.cookie : cookie));
    let payload;
    if (body !== undefined) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      headers.set('Content-Type', typeof body === 'string' ? 'text/plain' : 'application/json');
    }
    const res = await handle(new Request(ORIGIN + path, { method, headers, body: payload }), env, { fetch: gh.fetch, now: () => clock });
    const set = res.headers.get('Set-Cookie');
    if (set && opts.keepCookie !== false) {
      const m = /^fw_admin=([^;]*)/.exec(set);
      cookie = m ? m[1] : '';
    }
    const type = res.headers.get('Content-Type') || '';
    return { status: res.status, set, type, data: type.indexOf('json') >= 0 ? await res.json() : await res.arrayBuffer() };
  }
  return { gh, env, call, tick(ms) { clock += ms; }, get cookie() { return cookie; } };
}

let passed = 0;
async function t(name, fn) {
  try { await fn(); passed++; console.log('ok  -', name); }
  catch (e) { console.error('FAIL -', name); throw e; }
}

await t('login: wrong password is refused, slowly', async () => {
  const s = setup();
  const t0 = Date.now();
  const r = await s.call('POST', '/admin/api/login', { password: 'nope' });
  assert.equal(r.status, 401);
  assert.equal(r.data.error, 'wrong_password');
  assert.ok(Date.now() - t0 >= 650, 'waits before answering');
  assert.equal(r.set, null);
  assert.equal((await s.call('GET', '/admin/api/catalog')).status, 401, 'no cookie, no shop');
});

await t('login: right password gives a safe 30-day cookie', async () => {
  const s = setup();
  const r = await s.call('POST', '/admin/api/login', { password: PASSWORD });
  assert.equal(r.status, 200);
  assert.match(r.set, /^fw_admin=v1\.\d+\.[a-z0-9]{16}\.[A-Za-z0-9_-]{43}; Path=\/admin; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict$/);
  assert.equal((await s.call('GET', '/admin/api/me')).data.github, 'ok');
  s.tick(29 * 24 * 3600 * 1000);
  assert.equal((await s.call('GET', '/admin/api/me')).status, 200, 'still in after 29 days');
  s.tick(2 * 24 * 3600 * 1000);
  assert.equal((await s.call('GET', '/admin/api/me')).status, 401, 'logged out after 30 days');
});

await t('login: tampered cookie, other password, logout', async () => {
  const s = setup();
  await s.call('POST', '/admin/api/login', { password: PASSWORD });
  const good = s.cookie;
  const bad = good.slice(0, -2) + (good.slice(-2) === 'AA' ? 'BB' : 'AA');
  assert.equal((await s.call('GET', '/admin/api/me', undefined, { cookie: bad })).status, 401);
  const longer = good.replace(/^v1\.(\d+)/, (m, d) => 'v1.' + (Number(d) + 999999999));
  assert.equal((await s.call('GET', '/admin/api/me', undefined, { cookie: longer })).status, 401, 'cannot extend the date');
  s.env.ADMIN_PASSWORD = 'a-brand-new-password-123';
  assert.equal((await s.call('GET', '/admin/api/me')).status, 401, 'changing the password logs everyone out');
  s.env.ADMIN_PASSWORD = PASSWORD;
  const out = await s.call('POST', '/admin/api/logout');
  assert.match(out.set, /Max-Age=0/);
  assert.equal((await s.call('GET', '/admin/api/me')).status, 401);
});

await t('setup problems are explained, not hidden', async () => {
  let s = setup({ ADMIN_PASSWORD: '' });
  let r = await s.call('POST', '/admin/api/login', { password: 'x' });
  assert.equal(r.status, 503); assert.match(r.data.message, /not set/);
  s = setup({ ADMIN_PASSWORD: 'short' });
  r = await s.call('POST', '/admin/api/login', { password: 'short' });
  assert.equal(r.status, 503); assert.match(r.data.message, /too short/);
  s = setup({ GITHUB_TOKEN: '' });
  await s.call('POST', '/admin/api/login', { password: PASSWORD });
  assert.match((await s.call('GET', '/admin/api/me')).data.github, /not connected/);
  r = await s.call('GET', '/admin/api/catalog');
  assert.equal(r.status, 503); assert.equal(r.data.error, 'setup');
});

await t('POST from another site is refused (CSRF guard)', async () => {
  const s = setup();
  await s.call('POST', '/admin/api/login', { password: PASSWORD });
  const r = await s.call('POST', '/admin/api/publish', {}, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  assert.equal((await s.call('POST', '/admin/api/login', { password: PASSWORD }, { origin: '' })).status, 403);
});

await t('catalog: read from GitHub with its version id', async () => {
  const s = setup();
  await s.call('POST', '/admin/api/login', { password: PASSWORD });
  const r = await s.call('GET', '/admin/api/catalog');
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.catalog, JSON.parse(catalogText));
  assert.match(r.data.sha, /^[0-9a-f]{40}$/);
});

await t('image: pictures only, size and name checked', async () => {
  const s = setup();
  await s.call('POST', '/admin/api/login', { password: PASSWORD });
  let r = await s.call('POST', '/admin/api/image?name=my-ebook', JPG.toString('base64'));
  assert.equal(r.status, 200);
  assert.match(r.data.path, /^shelf\/my-ebook-[a-z0-9]{6}\.jpg$/);
  r = await s.call('POST', '/admin/api/image?name=my-app', PNG.toString('base64'));
  assert.match(r.data.path, /\.png$/);
  r = await s.call('POST', '/admin/api/image?name=x', Buffer.from('<html>hello world, not a picture at all, nope nope nope nope nope nope nope nope nope</html>').toString('base64'));
  assert.equal(r.status, 400);
  r = await s.call('POST', '/admin/api/image?name=../evil', JPG.toString('base64'));
  assert.equal(r.status, 400);
  r = await s.call('POST', '/admin/api/image?name=big', Buffer.concat([JPG, Buffer.alloc(900 * 1024)]).toString('base64'));
  assert.equal(r.status, 413);
});

function newItem(image) {
  return { id: 'study-planner', type: 'app', kicker: 'For students', title: 'A study planner that plans for you',
    hook: 'Exams soon? Get a calm plan in 1 minute.', text: 'Tell it your exam dates and it builds a gentle daily plan.',
    price: '₹299', cta: 'Open app', image, imageAlt: 'Study planner cover', url: 'https://example.com/planner', tags: ['exam', 'study'] };
}

await t('publish: one commit with the new product and its picture', async () => {
  const s = setup();
  await s.call('POST', '/admin/api/login', { password: PASSWORD });
  const { data: cur } = await s.call('GET', '/admin/api/catalog');
  const up = (await s.call('POST', '/admin/api/image?name=study-planner', JPG.toString('base64'))).data;
  const cat = cur.catalog;
  cat.items.unshift(newItem(up.path));
  cat.social = [{ platform: 'youtube', url: 'https://www.youtube.com/@golupaisa' }];
  const before = s.gh.head;
  const r = await s.call('POST', '/admin/api/publish', { catalog: cat, baseSha: cur.sha, uploads: [up], note: 'Added "Study planner"' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.notEqual(s.gh.head, before);
  assert.equal(r.data.commit, s.gh.head);
  const saved = JSON.parse(s.gh.readFile('src/catalog.json'));
  assert.equal(saved.items[0].id, 'study-planner');
  assert.equal(saved.social[0].platform, 'youtube');
  assert.deepEqual(s.gh.readFile('src/' + up.path), JPG, 'picture is in the commit');
  assert.equal(r.data.catalogSha, s.gh.files().get('src/catalog.json'), 'returns the new version id');
  // a second publish on top of the first works with the returned version id
  saved.items[0].hidden = true;
  const r2 = await s.call('POST', '/admin/api/publish', { catalog: saved, baseSha: r.data.catalogSha, uploads: [] });
  assert.equal(r2.status, 200);
  assert.equal(JSON.parse(s.gh.readFile('src/catalog.json')).items[0].hidden, true);
});

await t('publish: changed somewhere else -> conflict, nothing overwritten', async () => {
  const s = setup();
  await s.call('POST', '/admin/api/login', { password: PASSWORD });
  const { data: cur } = await s.call('GET', '/admin/api/catalog');
  const other = JSON.parse(catalogText); other.items[0].title = 'Changed in another tab';
  s.gh.commitFile('src/catalog.json', Buffer.from(JSON.stringify(other, null, 2) + '\n'));
  const r = await s.call('POST', '/admin/api/publish', { catalog: cur.catalog, baseSha: cur.sha, uploads: [] });
  assert.equal(r.status, 409);
  assert.equal(JSON.parse(s.gh.readFile('src/catalog.json')).items[0].title, 'Changed in another tab');
});

await t('publish: bad products and missing pictures are refused with reasons', async () => {
  const s = setup();
  await s.call('POST', '/admin/api/login', { password: PASSWORD });
  const { data: cur } = await s.call('GET', '/admin/api/catalog');
  let cat = JSON.parse(JSON.stringify(cur.catalog));
  cat.items.push(Object.assign(newItem('shelf/paper-trail.jpg'), { url: 'http://insecure.example.com', id: 'Bad ID' }));
  let r = await s.call('POST', '/admin/api/publish', { catalog: cat, baseSha: cur.sha, uploads: [] });
  assert.equal(r.status, 422);
  const fields = r.data.details.map((d) => d.field).sort();
  assert.deepEqual(fields, ['id', 'url']);
  cat = JSON.parse(JSON.stringify(cur.catalog));
  cat.items.push(newItem('shelf/never-uploaded.jpg'));
  r = await s.call('POST', '/admin/api/publish', { catalog: cat, baseSha: cur.sha, uploads: [] });
  assert.equal(r.status, 422); assert.equal(r.data.details[0].field, 'image');
  r = await s.call('POST', '/admin/api/publish', { catalog: cur.catalog, baseSha: cur.sha, uploads: [{ path: '../../etc', sha: 'a'.repeat(40) }] });
  assert.equal(r.status, 400);
  r = await s.call('POST', '/admin/api/publish', '{not json', {});
  assert.equal(r.status, 400);
});

await t('expired GitHub key is explained', async () => {
  const s = setup();
  await s.call('POST', '/admin/api/login', { password: PASSWORD });
  s.gh.breakToken();
  const r = await s.call('GET', '/admin/api/catalog');
  assert.equal(r.status, 502); assert.equal(r.data.error, 'github_key');
});

await t('YouTube cover: big one, then the smaller one, bad ids refused', async () => {
  const s = setup();
  assert.equal((await s.call('GET', '/admin/api/yt?id=dQw4w9WgXcQ')).status, 401, 'needs login');
  await s.call('POST', '/admin/api/login', { password: PASSWORD });
  let r = await s.call('GET', '/admin/api/yt?id=dQw4w9WgXcQ');
  assert.equal(r.status, 200); assert.equal(r.type, 'image/jpeg');
  r = await s.call('GET', '/admin/api/yt?id=aaaaaaaaaaa');
  assert.equal(r.status, 200, 'falls back to the smaller cover');
  r = await s.call('GET', '/admin/api/yt?id=bbbbbbbbbbb');
  assert.equal(r.status, 404);
  r = await s.call('GET', '/admin/api/yt?id=../../x');
  assert.equal(r.status, 400);
  assert.ok(!s.gh.calls.some((c) => c.indexOf('../') >= 0), 'never asks YouTube for odd paths');
});

await t('unknown routes are 404 and never leak details', async () => {
  const s = setup();
  await s.call('POST', '/admin/api/login', { password: PASSWORD });
  const r = await s.call('GET', '/admin/api/secrets');
  assert.equal(r.status, 404);
  assert.ok(!JSON.stringify(r.data).includes(TOKEN));
});

console.log('admin api tests passed:', passed);
