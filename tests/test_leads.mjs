// Tests for the "Before you go" form's server part (lib/leads.mjs) and My Shop's Leads routes.
// Run: node --no-warnings tests/test_leads.mjs
import assert from 'node:assert/strict';
import { handleLead, resetForTests, ensureTable, cleanPhone } from '../lib/leads.mjs';
import { readFileSync } from 'node:fs';
import { handle } from '../lib/admin-core.mjs';
import { makeFakeD1 } from './fake_d1.mjs';

const ORIGIN = 'https://focusworld.pages.dev';
const PASSWORD = 'sunny-mango-kite-river';
let passed = 0;
async function t(name, fn) {
  try { resetForTests(); await fn(); passed++; console.log('ok  -', name); } catch (e) { console.error('FAIL -', name); throw e; }
}
const good = { product: 'paper-trail', title: 'Paper Trail kit', name: 'Asha Devi', phone: '+91 98123-45678', ok: true, website: '' };

function setup(over) {
  const db = makeFakeD1();
  const env = Object.assign({ ADMIN_PASSWORD: PASSWORD, LEADS_DB: db }, over || {});
  let clock = Date.UTC(2026, 10, 10, 12, 0, 0);
  async function post(body, opts) {
    opts = opts || {};
    const headers = new Headers({ 'Content-Type': opts.type || 'application/json', 'CF-Connecting-IP': opts.ip || '203.0.113.7' });
    if (opts.origin !== null) headers.set('Origin', opts.origin || ORIGIN);
    const res = await handleLead(new Request(ORIGIN + (opts.path || '/api/lead'), { method: opts.method || 'POST', headers,
      body: (opts.method || 'POST') === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined }), env, { now: () => clock });
    return { status: res.status, data: await res.json() };
  }
  async function rows() { await ensureTable(db); return (await db.prepare('SELECT * FROM leads ORDER BY id').all()).results; }
  return { db, env, post, rows, tick(ms) { clock += ms; }, get now() { return clock; } };
}

await t('a visitor\'s details are saved, tidy', async () => {
  const s = setup();
  const r = await s.post(good);
  assert.equal(r.status, 200);
  const all = await s.rows();
  assert.equal(all.length, 1);
  assert.equal(all[0].name, 'Asha Devi');
  assert.equal(all[0].phone, '+919812345678');
  assert.equal(all[0].product, 'paper-trail');
  assert.ok(!JSON.stringify(all[0]).includes('203.0.113.7'), 'the network address is never stored');
});

await t('bad or missing details are refused kindly', async () => {
  const s = setup();
  for (const [patch, code] of [[{ phone: '12345' }, 'phone'], [{ phone: '+12' }, 'phone'], [{ phone: '4155550123' }, 'phone'], [{ phone: 'call me' }, 'phone'],
    [{ name: 'x'.repeat(61) }, 'name'], [{ name: 'a\u0007b' }, 'name'], [{ ok: false }, 'consent'], [{ ok: 'yes' }, 'consent'],
    [{ email: 'not-an-email' }, 'email'], [{ email: 'a b@x.com' }, 'email'], [{ email: 'a@x' }, 'email'],
    [{ phone: '', email: '' }, 'contact'], [{ phone: undefined }, 'contact'],
    [{ product: 'Bad Id' }, 'bad_request'], [{ title: '' }, 'bad_request']]) {
    const r = await s.post(Object.assign({}, good, patch));
    assert.equal(r.status, 400, JSON.stringify(patch));
    assert.equal(r.data.error, code, JSON.stringify(patch));
  }
  assert.equal((await s.rows()).length, 0);
});

await t('a number OR an email is enough; the name can be left out when the product does not ask for it', async () => {
  const s = setup();
  assert.equal((await s.post(Object.assign({}, good, { phone: '', email: 'Asha@Example.com ' }))).status, 200);
  assert.equal((await s.post(Object.assign({}, good, { name: '', phone: '+14155550123' }), { ip: '198.51.100.2' })).status, 200);
  const all = await s.rows();
  assert.equal(all[0].email, 'asha@example.com');
  assert.equal(all[0].phone, '');
  assert.equal(all[1].name, '');
});

await t('only from the site itself, only JSON, only small', async () => {
  const s = setup();
  assert.equal((await s.post(good, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await s.post(good, { origin: null })).status, 403);
  assert.equal((await s.post(good, { type: 'text/plain' })).status, 415);
  assert.equal((await s.post(Object.assign({}, good, { title: 'x'.repeat(3000) }))).status, 413);
  assert.equal((await s.post('{oops')).status, 400);
  assert.equal((await s.post(good, { method: 'GET' })).status, 405);
  assert.equal((await s.post(good, { path: '/api/other' })).status, 404);
});

await t('robots that fill the hidden field get "ok" but nothing is saved', async () => {
  const s = setup();
  const r = await s.post(Object.assign({}, good, { website: 'http://spam.example' }));
  assert.equal(r.status, 200);
  assert.equal((await s.post(good)).status, 200);
  assert.equal((await s.rows()).length, 1);
});

await t('one person can send at most 5 a day', async () => {
  const s = setup();
  for (let i = 0; i < 5; i++) assert.equal((await s.post(good)).status, 200);
  assert.equal((await s.post(good)).status, 429);
  assert.equal((await s.post(good, { ip: '198.51.100.9' })).status, 200, 'someone else is fine');
  s.tick(24 * 3600 * 1000);
  assert.equal((await s.post(good)).status, 200, 'the next day is fine again');
});

await t('without the database set up, the form says so (and the link still opens in the app)', async () => {
  const s = setup({ LEADS_DB: undefined });
  const r = await s.post(good);
  assert.equal(r.status, 503);
  assert.equal(r.data.error, 'setup');
});

// ---------- My Shop: Leads tab ----------
async function adminCall(env, method, path, body, cookie, now) {
  const headers = new Headers();
  if (method === 'POST') { headers.set('Origin', ORIGIN); headers.set('Content-Type', 'application/json'); }
  if (cookie) headers.set('Cookie', 'fw_admin=' + cookie);
  const res = await handle(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, { now: () => now });
  const set = res.headers.get('Set-Cookie');
  return { status: res.status, data: await res.json(), cookie: set ? (/^fw_admin=([^;]*)/.exec(set) || [])[1] : null };
}

await t('My Shop: leads need the login, list newest first, delete one or all', async () => {
  const s = setup();
  await s.post(good);
  s.tick(60000);
  await s.post(Object.assign({}, good, { name: 'Ravi', product: 'first-reply', title: 'Free First Reply' }), { ip: '198.51.100.1' });
  assert.equal((await adminCall(s.env, 'GET', '/admin/api/leads', undefined, '', s.now)).status, 401);
  const login = await adminCall(s.env, 'POST', '/admin/api/login', { password: PASSWORD }, '', s.now);
  const c = login.cookie;
  assert.ok(c);
  const list = await adminCall(s.env, 'GET', '/admin/api/leads', undefined, c, s.now);
  assert.equal(list.status, 200);
  assert.equal(list.data.setup, true);
  assert.deepEqual(list.data.leads.map((l) => l.name), ['Ravi', 'Asha Devi']);
  assert.ok(!('fp' in list.data.leads[0]), 'the spam fingerprint is not shown');
  const id = list.data.leads[0].id;
  assert.equal((await adminCall(s.env, 'POST', '/admin/api/leads-delete', { id }, c, s.now)).status, 200);
  assert.deepEqual((await adminCall(s.env, 'GET', '/admin/api/leads', undefined, c, s.now)).data.leads.map((l) => l.name), ['Asha Devi']);
  assert.equal((await adminCall(s.env, 'POST', '/admin/api/leads-delete', { id: 'x' }, c, s.now)).status, 400);
  assert.equal((await adminCall(s.env, 'POST', '/admin/api/leads-delete', { all: true }, c, s.now)).status, 200);
  assert.deepEqual((await adminCall(s.env, 'GET', '/admin/api/leads', undefined, c, s.now)).data.leads, []);
});

await t('My Shop: leads older than 12 months are deleted by themselves', async () => {
  const s = setup();
  await s.post(good);
  s.tick(366 * 24 * 3600 * 1000);
  const c = (await adminCall(s.env, 'POST', '/admin/api/login', { password: PASSWORD }, '', s.now)).cookie;
  assert.deepEqual((await adminCall(s.env, 'GET', '/admin/api/leads', undefined, c, s.now)).data.leads, []);
});

await t('My Shop: without the database, the Leads tab is told to set it up', async () => {
  const s = setup({ LEADS_DB: undefined });
  const c = (await adminCall(s.env, 'POST', '/admin/api/login', { password: PASSWORD }, '', s.now)).cookie;
  const r = await adminCall(s.env, 'GET', '/admin/api/leads', undefined, c, s.now);
  assert.equal(r.status, 200);
  assert.equal(r.data.setup, false);
});

await t('WhatsApp numbers: no +91 needed, and the site forms use the same rule', async () => {
  const cases = [['98123 45678', '+919812345678'], ['9812345678', '+919812345678'], ['098123-45678', '+919812345678'],
    ['91 98123 45678', '+919812345678'], ['+91 98123 45678', '+919812345678'], ['0091 98123 45678', '+919812345678'],
    ['(981) 234-5678', '+919812345678'], ['+1 415 555 0123', '+14155550123'], ['+44 7700 900123', '+447700900123'],
    ['', ''], ['   ', ''], ['12345', null], ['4155550123', null], ['5812345678', null], ['981234567', null],
    ['98123456789', null], ['+12', null], ['call me', null], ['+1234567890123456', null]];
  const copies = { 'lib/leads.mjs': cleanPhone };
  for (const f of ['src/app.js', 'src/shop/shop.js']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const m = src.match(/function cleanPhone\(raw\) \{[\s\S]*?\n  \}\n/);
    assert.ok(m, 'cleanPhone found in ' + f);
    copies[f] = new Function(m[0] + '; return cleanPhone;')();
  }
  for (const [input, want] of cases) for (const [f, fn] of Object.entries(copies)) assert.equal(fn(input), want, f + ': ' + JSON.stringify(input));
  const s = setup();
  const r = await s.post(Object.assign({}, good, { phone: '98123 45678' }));
  assert.equal(r.status, 200);
  assert.equal((await s.rows())[0].phone, '+919812345678');
});

console.log('lead tests passed:', passed);
