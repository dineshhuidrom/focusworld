/* A small in-memory GitHub that answers the few API calls My Shop uses.
   Used by the server tests and by the local test server (tests/dev_server.mjs).
   Blob ids are real git ids (sha1 of "blob <size>\0<bytes>"), so version checks behave like the real thing. */
import { createHash } from 'node:crypto';

function sha1(buf) { return createHash('sha1').update(buf).digest('hex'); }
function blobSha(buf) { return sha1(Buffer.concat([Buffer.from('blob ' + buf.length + '\0'), buf])); }

export function makeFakeGitHub(opts) {
  const repo = opts.repo, branch = opts.branch || 'main', token = opts.token;
  const blobs = new Map();     // sha -> Buffer
  const trees = new Map();     // sha -> Map(path -> blob sha)
  const commits = new Map();   // sha -> { tree, parents, message }
  const calls = [];
  let n = 0;
  function putBlob(buf) { const s = blobSha(buf); blobs.set(s, buf); return s; }
  function putTree(map) { const s = sha1(Buffer.from('tree' + (n++) + JSON.stringify([...map.entries()]))); trees.set(s, map); return s; }
  function putCommit(c) { const s = sha1(Buffer.from('commit' + (n++) + JSON.stringify(c))); commits.set(s, c); return s; }

  const first = new Map();
  Object.keys(opts.files).forEach((p) => first.set(p, putBlob(opts.files[p])));
  let head = putCommit({ tree: putTree(first), parents: [], message: 'start' });

  function res(status, data, headers) {
    return new Response(data === undefined ? null : (Buffer.isBuffer(data) ? data : JSON.stringify(data)),
      { status, headers: headers || { 'Content-Type': 'application/json' } });
  }
  function filesAt(commitSha) { return trees.get(commits.get(commitSha).tree); }

  const api = {
    calls,
    get head() { return head; },
    readFile(path) { const s = filesAt(head).get(path); return s ? blobs.get(s) : null; },
    files() { return filesAt(head); },
    // Simulate a change made somewhere else (another tab, or a code push).
    commitFile(path, buf, message) {
      const map = new Map(filesAt(head));
      map.set(path, putBlob(buf));
      head = putCommit({ tree: putTree(map), parents: [head], message: message || 'other change' });
      if (opts.onCommit) opts.onCommit(head, map, message);
    },
    breakToken() { opts.token = token + 'x'; },
    async fetch(url, init) {
      init = init || {};
      const method = (init.method || 'GET').toUpperCase();
      const u = new URL(url);
      calls.push(method + ' ' + u.pathname + u.search);
      if (opts.extra) { const r = await opts.extra(u, init); if (r) return r; }
      if (u.origin !== 'https://api.github.com') return res(404, { message: 'Not Found' });
      const auth = (init.headers && (init.headers.Authorization || init.headers.authorization)) || '';
      if (auth !== 'Bearer ' + opts.token) return res(401, { message: 'Bad credentials' });
      const base = '/repos/' + repo;
      if (u.pathname.indexOf(base + '/') !== 0) return res(404, { message: 'Not Found' });
      const p = u.pathname.slice(base.length);
      const body = init.body ? JSON.parse(init.body) : null;
      let m;
      if (method === 'GET' && (m = /^\/contents\/(.+)$/.exec(p))) {
        if ((u.searchParams.get('ref') || branch) !== branch) return res(404, { message: 'No ref' });
        const s = filesAt(head).get(decodeURIComponent(m[1]));
        if (!s) return res(404, { message: 'Not Found' });
        const b64 = blobs.get(s).toString('base64').replace(/(.{60})/g, '$1\n');
        return res(200, { sha: s, content: b64, encoding: 'base64' });
      }
      if (method === 'GET' && p === '/git/ref/heads/' + branch) return res(200, { object: { sha: head, type: 'commit' } });
      if (method === 'GET' && (m = /^\/git\/commits\/([0-9a-f]{40})$/.exec(p))) {
        const c = commits.get(m[1]);
        return c ? res(200, { sha: m[1], tree: { sha: c.tree } }) : res(404, { message: 'Not Found' });
      }
      if (method === 'GET' && (m = /^\/git\/trees\/([0-9a-f]{40})$/.exec(p))) {
        const t = trees.get(m[1]);
        if (!t) return res(404, { message: 'Not Found' });
        return res(200, { sha: m[1], truncated: false, tree: [...t.entries()].map(([path, sha]) => ({ path, type: 'blob', sha, mode: '100644' })) });
      }
      if (method === 'POST' && p === '/git/blobs') {
        if (body.encoding !== 'base64') return res(422, { message: 'encoding' });
        return res(201, { sha: putBlob(Buffer.from(body.content, 'base64')) });
      }
      if (method === 'POST' && p === '/git/trees') {
        const t = trees.get(body.base_tree);
        if (!t) return res(422, { message: 'base_tree' });
        const map = new Map(t);
        for (const e of body.tree) {
          if (e.content !== undefined) map.set(e.path, putBlob(Buffer.from(e.content, 'utf8')));
          else if (e.sha === null) map.delete(e.path);
          else if (blobs.has(e.sha)) map.set(e.path, e.sha);
          else return res(422, { message: 'unknown blob ' + e.sha });
        }
        return res(201, { sha: putTree(map) });
      }
      if (method === 'POST' && p === '/git/commits') {
        if (!trees.has(body.tree)) return res(422, { message: 'tree' });
        return res(201, { sha: putCommit({ tree: body.tree, parents: body.parents, message: body.message }) });
      }
      if (method === 'PATCH' && p === '/git/refs/heads/' + branch) {
        const c = commits.get(body.sha);
        if (!c) return res(422, { message: 'Object does not exist' });
        if (c.parents[0] !== head) return res(422, { message: 'Update is not a fast forward' });
        head = body.sha;
        if (opts.onCommit) opts.onCommit(head, filesAt(head), c.message);
        return res(200, { object: { sha: head } });
      }
      return res(404, { message: 'Not Found: ' + method + ' ' + p });
    }
  };
  return api;
}
