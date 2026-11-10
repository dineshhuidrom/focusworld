// Local stand-in for Cloudflare Pages + GitHub, to test My Shop end to end.
//   node tests/dev_server.mjs <port> <workdir>
// - copies the project into <workdir> and builds it (like Cloudflare does)
// - serves dist/site with the _headers rules applied
// - runs the real My Shop server code (lib/admin-core.mjs) for /admin/api/*, talking to a fake GitHub
// - when My Shop publishes, writes the commit's files into <workdir> and rebuilds after ~3 s (like Cloudflare)
// Test-only password: see PASSWORD below. Nothing here is used on the real site.
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { handle } from '../lib/admin-core.mjs';
import { makeFakeGitHub } from './fake_github.mjs';
import { handleLead } from '../lib/leads.mjs';
import { makeFakeD1 } from './fake_d1.mjs';

const PORT = Number(process.argv[2] || 8790);
const WORK = process.argv[3] || '/tmp/fw-dev';
const ROOT = new URL('..', import.meta.url).pathname;
const PASSWORD = 'test-password-for-local-only';
const ORIGIN = 'http://127.0.0.1:' + PORT;

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
for (const p of ['src', 'lib', 'functions', 'build.py']) cpSync(join(ROOT, p), join(WORK, p), { recursive: true });

function listFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const f = join(d, n);
      if (statSync(f).isDirectory()) walk(f); else out.push(relative(WORK, f));
    }
  })(dir);
  return out;
}
const files = {};
listFiles(join(WORK, 'src')).forEach((p) => { files[p] = readFileSync(join(WORK, p)); });
files['build.py'] = readFileSync(join(WORK, 'build.py'));

let building = Promise.resolve();
function build(commit) {
  execFileSync('python3', ['build.py', '--site'], { cwd: WORK, env: Object.assign({}, process.env, { CF_PAGES_COMMIT_SHA: commit, FW_SITE_URL: '' }), stdio: 'pipe' });
}
const fakeJpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), readFileSync(join(ROOT, 'src/shelf/paper-trail.jpg')).subarray(4)]);
const gh = makeFakeGitHub({
  repo: 'test/focusworld', branch: 'main', token: 'local-test-token', files,
  extra: async (u) => {
    if (u.origin !== 'https://i.ytimg.com') return null;
    if (u.pathname.endsWith('/maxresdefault.jpg') && u.pathname.indexOf('dQw4w9WgXcQ') > 0) return new Response(fakeJpg, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    return new Response('not found', { status: 404, headers: { 'Content-Type': 'text/html' } });
  },
  onCommit: (sha, map) => {
    // write every file of the new commit into the work folder, then rebuild a bit later
    for (const [path] of map) {
      const buf = gh.readFile(path);
      if (!buf) continue;
      mkdirSync(dirname(join(WORK, path)), { recursive: true });
      writeFileSync(join(WORK, path), buf);
    }
    building = building.then(() => new Promise((r) => setTimeout(r, 3000))).then(() => { build(sha); console.log('rebuilt for', sha.slice(0, 7)); });
  }
});
build(gh.head);
// LEADS_DB: an in-memory stand-in for the Cloudflare D1 database (set NO_LEADS_DB=1 to test "not set up yet").
const env = { ADMIN_PASSWORD: PASSWORD, GITHUB_TOKEN: 'local-test-token', GITHUB_REPO: 'test/focusworld',
  LEADS_DB: process.env.NO_LEADS_DB ? undefined : makeFakeD1() };

function parseHeaders(text) {
  const rules = []; let cur = null;
  text.split('\n').forEach((line) => {
    if (!line.trim()) return;
    if (!line.startsWith(' ')) { cur = [line.trim(), []]; rules.push(cur); } else cur[1].push(line.trim());
  });
  return rules;
}
function headersFor(path) {
  const rules = parseHeaders(readFileSync(join(WORK, 'dist/site/_headers'), 'utf8')), out = {};
  for (const [pat, lines] of rules) {
    const ok = pat.endsWith('*') ? path.startsWith(pat.slice(0, -1)) : path === pat;
    if (!ok) continue;
    for (const l of lines) {
      if (l.startsWith('!')) delete out[l.slice(1).trim().toLowerCase()];
      else { const i = l.indexOf(':'); out[l.slice(0, i).trim().toLowerCase()] = [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }
    }
  }
  return Object.values(out);
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.xml': 'application/xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  try {
    if (url.pathname.startsWith('/admin/api/') || url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      const request = new Request(ORIGIN + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
      const r = url.pathname.startsWith('/api/') ? await handleLead(request, env) : await handle(request, env, { fetch: gh.fetch });
      const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      // Browsers only keep Secure cookies on https or localhost; 127.0.0.1 is treated like localhost in Chrome.
      res.writeHead(r.status, h);
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p.includes('..')) { res.writeHead(400); res.end(); return; }
    let f = join(WORK, 'dist/site', p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    const h = { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' };
    headersFor(p).forEach(([k, v]) => { h[k] = v; });
    res.writeHead(200, h);
    res.end(readFileSync(f));
  } catch (e) {
    console.error(e); res.writeHead(500); res.end('error');
  }
}).listen(PORT, '127.0.0.1', () => console.log('dev server on', ORIGIN));
