/* Focus World — visitor details ("leads") for products set to "Ask for their details first".

   POST /api/lead  { product, title, name, phone, email, ok: true, website: '' }   (public, from the "Before you go" form)
   Each product chooses its boxes (name, WhatsApp number, email); a lead needs a number or an email.

   Stored in a free Cloudflare D1 database bound to the Pages project as LEADS_DB
   (Workers Free plan: 100,000 saves a day; above that saving stops for the day, it never charges).
   My Shop reads and deletes them through lib/admin-core.mjs (login needed).

   Privacy: only what the visitor typed, the product, and the time are kept. The visitor's network address is
   never stored: a daily-changing keyed fingerprint of it is kept only to stop one person flooding the list
   (max 5 a day). Leads older than 12 months are deleted automatically. */

const MAX_BODY = 2048;
const PER_DAY = 5;
const KEEP_MS = 365 * 24 * 3600 * 1000;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// A WhatsApp number as people really type it. No "+" means an Indian number: 98123 45678, 098123 45678 and
// 91 98123 45678 all become +919812345678. Other countries start with + (or 00) and their code.
// Returns '' when empty, null when it can't be a phone number. (Same rule in src/app.js and src/shop/shop.js.)
export function cleanPhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const intl = s.charAt(0) === '+' || /^00/.test(s);
  let d = s.replace(/[^0-9]/g, '');
  if (intl) { if (/^00/.test(s)) d = d.slice(2); return d.length >= 8 && d.length <= 15 ? '+' + d : null; }
  if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
  else if (d.length === 12 && d.slice(0, 2) === '91') d = d.slice(2);
  return /^[6-9][0-9]{9}$/.test(d) ? '+91' + d : null;
}
// A plain, sensible email check (no spaces or quotes, one @, a dot in the part after it).
const EMAIL_RE = /^[^\s@"'<>(),;:]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)+$/;
const CTRL_RE = /[\u0000-\u001f\u007f\u2028\u2029]/;
const enc = new TextEncoder();

export class LeadError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

let ready = null;   // the table is created once per running copy of the server
export function ensureTable(db) {
  if (!ready) {
    ready = db.batch([
      db.prepare('CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, ' +
        'product TEXT NOT NULL, title TEXT NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL, fp TEXT NOT NULL)'),
      db.prepare('CREATE INDEX IF NOT EXISTS leads_fp ON leads (fp, at)'),
      db.prepare('CREATE INDEX IF NOT EXISTS leads_at ON leads (at)')
    ]).catch(function (e) { ready = null; throw e; });
  }
  return ready;
}
export function resetForTests() { ready = null; }

function clean(s, max) {
  if (typeof s !== 'string') return '';
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max || CTRL_RE.test(t) ? '' : t;
}

// Checks what the form sent. Returns the clean lead or throws a friendly LeadError.
export function checkLead(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new LeadError(400, 'bad_request', 'Not readable.');
  const product = typeof body.product === 'string' && body.product.length <= 48 && ID_RE.test(body.product) ? body.product : '';
  const title = clean(body.title, 90);
  const rawName = typeof body.name === 'string' ? body.name : '';
  const name = clean(rawName, 60);
  const phone = typeof body.phone === 'string' && body.phone.length <= 30 ? cleanPhone(body.phone) : (body.phone ? null : '');
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!product || !title) throw new LeadError(400, 'bad_request', 'Which product was this?');
  if (rawName.trim() && !name) throw new LeadError(400, 'name', 'That name is too long.');
  if (phone === null) throw new LeadError(400, 'phone', 'That number doesn\u2019t look right.');
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) throw new LeadError(400, 'email', 'That email doesn\u2019t look right.');
  if (!phone && !email) throw new LeadError(400, 'contact', 'Please add your WhatsApp number or email.');
  if (body.ok !== true) throw new LeadError(400, 'consent', 'Please tick the box first.');
  return { product: product, title: title, name: name, phone: phone, email: email };
}

async function fingerprint(secret, ip, day) {
  const key = await crypto.subtle.importKey('raw', enc.encode('lead-limit|' + (secret || 'focus-world')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(ip + '|' + day)));
  let hex = '';
  for (let i = 0; i < 12; i++) hex += sig[i].toString(16).padStart(2, '0');
  return hex;
}

function reply(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function handleLead(request, env, deps) {
  const now = ((deps && deps.now) || Date.now)();
  const url = new URL(request.url);
  try {
    if (url.pathname !== '/api/lead') throw new LeadError(404, 'not_found', 'Not found.');
    if (request.method !== 'POST') throw new LeadError(405, 'method', 'Use POST.');
    const origin = request.headers.get('Origin');
    if (!origin || origin !== url.origin) throw new LeadError(403, 'origin', 'Please use the form on the site.');
    if ((request.headers.get('Content-Type') || '').indexOf('application/json') !== 0) throw new LeadError(415, 'type', 'Not readable.');
    const text = await request.text();
    if (text.length > MAX_BODY) throw new LeadError(413, 'too_big', 'Too long.');
    let body;
    try { body = JSON.parse(text); } catch (e) { throw new LeadError(400, 'bad_request', 'Not readable.'); }
    // A hidden field people never see: robots fill it in. Pretend it worked and keep nothing.
    if (body && typeof body.website === 'string' && body.website.trim()) return reply({ ok: true });
    const lead = checkLead(body);
    const db = env.LEADS_DB;
    if (!db) throw new LeadError(503, 'setup', 'Not set up yet.');
    await ensureTable(db);
    const day = new Date(now).toISOString().slice(0, 10);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const fp = await fingerprint(env.ADMIN_PASSWORD, ip, day);
    const since = Date.parse(day + 'T00:00:00Z');
    const row = await db.prepare('SELECT COUNT(*) AS n FROM leads WHERE fp = ? AND at >= ?').bind(fp, since).first();
    if (row && row.n >= PER_DAY) throw new LeadError(429, 'too_many', 'Thanks! We already have your details for today.');
    await db.prepare('INSERT INTO leads (at, product, title, name, phone, email, fp) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(now, lead.product, lead.title, lead.name, lead.phone, lead.email, fp).run();
    return reply({ ok: true });
  } catch (e) {
    if (e instanceof LeadError) return reply({ error: e.code, message: e.message }, e.status);
    console.error('Lead error:', e && e.stack ? e.stack : String(e));
    return reply({ error: 'server', message: 'Could not save. The link still opens.' }, 500);
  }
}

// ---------- for My Shop (login is checked by admin-core before these run) ----------
export async function listLeads(db, now) {
  await ensureTable(db);
  await db.prepare('DELETE FROM leads WHERE at < ?').bind(now - KEEP_MS).run();   // 12 months, then gone
  const res = await db.prepare('SELECT id, at, product, title, name, phone, email FROM leads ORDER BY at DESC, id DESC LIMIT 2000').all();
  return res.results || [];
}
export async function deleteLeads(db, body) {
  await ensureTable(db);
  if (body && body.all === true) { await db.prepare('DELETE FROM leads').run(); return; }
  const id = body && body.id;
  if (!Number.isInteger(id) || id < 1) throw new LeadError(400, 'bad_request', 'Which one?');
  await db.prepare('DELETE FROM leads WHERE id = ?').bind(id).run();
}
