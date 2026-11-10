// A stand-in for a Cloudflare D1 database (same small API: prepare/bind/run/all/first/batch), backed by
// Node's built-in SQLite. Used by tests and tests/dev_server.mjs only.
import { DatabaseSync } from 'node:sqlite';

export function makeFakeD1() {
  const db = new DatabaseSync(':memory:');
  function stmt(sql, args) {
    return {
      bind(...a) { return stmt(sql, a); },
      async run() { db.prepare(sql).run(...args); return { success: true }; },
      async all() { return { results: db.prepare(sql).all(...args).map((r) => Object.assign({}, r)) }; },
      async first() { const r = db.prepare(sql).get(...args); return r ? Object.assign({}, r) : null; }
    };
  }
  return {
    prepare(sql) { return stmt(sql, []); },
    async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; },
    raw: db
  };
}
