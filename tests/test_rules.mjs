// The catalog rules exist twice: lib/catalog-rules.mjs (My Shop) and build.py (the build).
// This test feeds both the same good and bad catalogs and checks they agree on every problem.
// Run: node tests/test_rules.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateCatalog, slugify, youtubeId } from '../lib/catalog-rules.mjs';

const base = JSON.parse(readFileSync(new URL('../src/catalog.json', import.meta.url), 'utf8'));
const good = base.items[0];
function withItem(patch) { const c = JSON.parse(JSON.stringify(base)); c.items[0] = Object.assign({}, good, patch); return c; }
function without(key) { const c = JSON.parse(JSON.stringify(base)); delete c.items[0][key]; return c; }

const cases = {
  real: base,
  empty: { items: [] },
  notObject: [],
  noItems: { social: [] },
  unknownTop: Object.assign({}, base, { hack: 1 }),
  missingTitle: without('title'),
  missingPriceNotFree: without('price'),
  freeNoPrice: withItem({ free: true, price: undefined }),
  freeAsNumber: withItem({ free: 1 }),
  httpUrl: withItem({ url: 'http://example.com' }),
  jsUrl: withItem({ url: 'javascript:alert(1)' }),
  quoteUrl: withItem({ url: 'https://example.com/"onmouseover=x' }),
  spaceUrl: withItem({ url: 'https://exa mple.com' }),
  unicodeUrl: withItem({ url: 'https://example.com/पेज' }),
  bomUrl: withItem({ url: 'https://example.com/﻿' }),
  nelUrl: withItem({ url: 'https://example.com/\u0085' }),
  newlineEndUrl: withItem({ url: 'https://example.com/a\n' }),
  portUrl: withItem({ url: 'https://example.com:8443/x?y=1#z' }),
  noDotHost: withItem({ url: 'https://localhost/x' }),
  badId: withItem({ id: 'Hello World' }),
  dashId: withItem({ id: 'a--b' }),
  dupId: (() => { const c = JSON.parse(JSON.stringify(base)); c.items[1].id = c.items[0].id; return c; })(),
  badType: withItem({ type: 'nft' }),
  badImage: withItem({ image: '../secret.jpg' }),
  gifImage: withItem({ image: 'shelf/x.gif' }),
  badLocal: withItem({ local: 'tools/../x.html' }),
  longTitle: withItem({ title: 'x'.repeat(91) }),
  emojiTitleOk: withItem({ title: '😀'.repeat(45) }),
  emojiTitleLong: withItem({ title: '😀'.repeat(46) }),
  spacesTitle: withItem({ title: ' padded' }),
  nbspTitle: withItem({ title: 'padded ' }),
  ctrlText: withItem({ text: 'bad\u0007bell' }),
  tabOkInside: withItem({ text: 'a\tb' }),
  tagsNotList: withItem({ tags: 'a,b' }),
  tagEmpty: withItem({ tags: ['ok', '  '] }),
  tagBom: withItem({ tags: ['﻿'] }),
  tagFS: withItem({ tags: ['\u001c'] }),
  tooManyTags: withItem({ tags: Array.from({ length: 25 }, (_, i) => 't' + i) }),
  unknownField: withItem({ onclick: 'x' }),
  nullKicker: withItem({ kicker: null }),
  numberHook: withItem({ hook: 5 }),
  hiddenOk: withItem({ hidden: true }),
  hiddenBad: withItem({ hidden: 'yes' }),
  socialOk: Object.assign({}, base, { social: [{ platform: 'youtube', url: 'https://www.youtube.com/@x' }, { platform: 'website', url: 'https://a.co', label: 'My blog' }] }),
  socialBadPlatform: Object.assign({}, base, { social: [{ platform: 'myspace', url: 'https://a.co' }] }),
  socialBadUrl: Object.assign({}, base, { social: [{ platform: 'x', url: 'http://a.co' }] }),
  socialEmptyLabel: Object.assign({}, base, { social: [{ platform: 'x', url: 'https://a.co', label: ' ' }] }),
  socialNullLabel: Object.assign({}, base, { social: [{ platform: 'x', url: 'https://a.co', label: null }] }),
  socialExtra: Object.assign({}, base, { social: [{ platform: 'x', url: 'https://a.co', img: 'x' }] }),
  socialNotList: Object.assign({}, base, { social: {} }),
  tooManyItems: { items: Array.from({ length: 61 }, (_, i) => Object.assign({}, good, { id: 'p' + i })) },
  helpNumber: Object.assign({}, base, { _help: 5 })
};
// remove undefined keys (JSON has no undefined)
const fixtures = JSON.parse(JSON.stringify(cases));

const py = `
import json, sys, importlib.util
spec = importlib.util.spec_from_file_location("b", "build.py"); b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
data = json.load(sys.stdin)
print(json.dumps({k: sorted(set("%s|%s" % (e[0], e[1]) for e in b.validate_catalog(v))) for k, v in data.items()}))
`;
const root = new URL('..', import.meta.url).pathname;
const pyOut = JSON.parse(execFileSync('python3', ['-c', py], { cwd: root, input: JSON.stringify(fixtures) }).toString());

let passed = 0;
for (const name of Object.keys(fixtures)) {
  const js = [...new Set(validateCatalog(fixtures[name]).errors.map((e) => e.where + '|' + e.field))].sort();
  assert.deepEqual(js, pyOut[name], 'rules disagree on "' + name + '": js=' + JSON.stringify(js) + ' py=' + JSON.stringify(pyOut[name]));
  passed++;
}
// a few expectations, so "both wrong the same way" is caught too
const okNames = ['real', 'empty', 'freeNoPrice', 'portUrl', 'emojiTitleOk', 'tabOkInside', 'hiddenOk', 'socialOk', 'nullKicker'];
okNames.forEach((n) => assert.deepEqual(pyOut[n], [], n + ' should be fine'));
Object.keys(fixtures).filter((n) => okNames.indexOf(n) < 0).forEach((n) => assert.ok(pyOut[n].length > 0, n + ' should be refused'));

assert.equal(slugify('My Big Ebook!'), 'my-big-ebook');
assert.equal(slugify('Café — Guide 2026'), 'cafe-guide-2026');
assert.equal(slugify('???'), 'product');
assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ?si=abc'), 'dQw4w9WgXcQ');
assert.equal(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(youtubeId('https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
assert.equal(youtubeId('https://www.youtube.com/@golupaisa'), '');
assert.equal(youtubeId('https://evil.com/watch?v=dQw4w9WgXcQ'), '');
console.log('rules agree on', passed, 'catalogs; helpers ok');
