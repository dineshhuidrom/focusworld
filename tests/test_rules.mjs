// The catalog rules exist twice: lib/catalog-rules.mjs (My Shop) and build.py (the build).
// This test feeds both the same good and bad catalogs and checks they agree on every problem.
// Run: node tests/test_rules.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { validateCatalog, slugify, youtubeId } from '../lib/catalog-rules.mjs';

const base = JSON.parse(readFileSync(new URL('../src/catalog.json', import.meta.url), 'utf8'));
// the first product with a price (the shop may start with a link card that has no price)
const gi = base.items.findIndex((i) => typeof i.price === 'string');
const good = base.items[gi];
function withItem(patch) { const c = JSON.parse(JSON.stringify(base)); c.items[gi] = Object.assign({}, good, patch); return c; }
function without(key) { const c = JSON.parse(JSON.stringify(base)); delete c.items[gi][key]; return c; }

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
  helpNumber: Object.assign({}, base, { _help: 5 }),
  // categories (Ask Pip recommends products by category)
  catsOk: withItem({ categories: ['school', 'study', 'english'] }),
  catsTooMany: withItem({ categories: ['school', 'study', 'english', 'jobs'] }),
  catsUnknown: withItem({ categories: ['cooking'] }),
  catsInherited: withItem({ categories: ['constructor'] }),
  catsTwice: withItem({ categories: ['school', 'school'] }),
  catsNotList: withItem({ categories: 'school' }),
  catsNull: withItem({ categories: null }),
  catsEmptyOk: withItem({ categories: [] }),
  itemIdConstructor: withItem({ id: 'constructor' }),
  catListNotList: Object.assign({}, base, { categories: {} }),
  catListNone: (() => { const c = JSON.parse(JSON.stringify(base)); delete c.categories; c.items.forEach((i) => delete i.categories); return c; })(),
  catListMissingButUsed: (() => { const c = JSON.parse(JSON.stringify(base)); delete c.categories; return c; })(),
  catNew: Object.assign({}, base, { categories: base.categories.concat([{ id: 'cooking', name: 'Cooking', emoji: '🍳', words: ['cook', 'recipe'] }]) }),
  catNoEmojiOk: Object.assign({}, base, { categories: base.categories.concat([{ id: 'cooking', name: 'Cooking', words: ['cook'] }]) }),
  catBadId: Object.assign({}, base, { categories: base.categories.concat([{ id: 'Cook Ing', name: 'Cooking', words: ['cook'] }]) }),
  catDupId: Object.assign({}, base, { categories: base.categories.concat([{ id: 'study', name: 'Again', words: ['x'] }]) }),
  catLongId: Object.assign({}, base, { categories: base.categories.concat([{ id: 'a'.repeat(33), name: 'Long', words: ['x'] }]) }),
  catNoName: Object.assign({}, base, { categories: base.categories.concat([{ id: 'x1', name: ' ', words: ['x'] }]) }),
  catPaddedName: Object.assign({}, base, { categories: base.categories.concat([{ id: 'x1', name: 'Cook ', words: ['x'] }]) }),
  catLongName: Object.assign({}, base, { categories: base.categories.concat([{ id: 'x1', name: 'x'.repeat(31), words: ['x'] }]) }),
  catEmojiLong: Object.assign({}, base, { categories: base.categories.concat([{ id: 'x1', name: 'X', emoji: '😀😀😀😀😀', words: ['x'] }]) }),
  catEmojiOk: Object.assign({}, base, { categories: base.categories.concat([{ id: 'x1', name: 'X', emoji: '😀😀😀😀', words: ['x'] }]) }),
  catEmojiCtrl: Object.assign({}, base, { categories: base.categories.concat([{ id: 'x1', name: 'X', emoji: '\u0007', words: ['x'] }]) }),
  catNoWords: Object.assign({}, base, { categories: base.categories.concat([{ id: 'x1', name: 'X', words: [] }]) }),
  catWordsNotList: Object.assign({}, base, { categories: base.categories.concat([{ id: 'x1', name: 'X', words: 'a,b' }]) }),
  catWordEmpty: Object.assign({}, base, { categories: base.categories.concat([{ id: 'x1', name: 'X', words: ['ok', ''] }]) }),
  catWordLong: Object.assign({}, base, { categories: base.categories.concat([{ id: 'x1', name: 'X', words: ['x'.repeat(41)] }]) }),
  catTooManyWords: Object.assign({}, base, { categories: base.categories.concat([{ id: 'x1', name: 'X', words: Array.from({ length: 61 }, (_, i) => 'w' + i) }]) }),
  catExtraField: Object.assign({}, base, { categories: base.categories.concat([{ id: 'x1', name: 'X', words: ['x'], color: 'red' }]) }),
  catNotObject: Object.assign({}, base, { categories: base.categories.concat(['study']) }),
  catTooMany: Object.assign({}, base, { categories: Array.from({ length: 41 }, (_, i) => ({ id: 'c' + i, name: 'C' + i, words: ['w'] })).concat(base.categories) }),
  // link cards, no price, paid promotions, friends' links, and the "Before you go" form
  groupOk: withItem({ type: 'group', free: true, price: undefined }),
  socialNoPriceOk: withItem({ type: 'social', noPrice: true, price: undefined, ad: true }),
  noPriceWithPrice: withItem({ noPrice: true }),
  freeAndNoPrice: withItem({ free: true, noPrice: true, price: undefined }),
  noPriceString: withItem({ noPrice: 'yes', price: undefined }),
  adBad: withItem({ ad: 1 }),
  askOk: withItem({ ask: ['name', 'phone', 'email'] }),
  askEmailOnlyOk: withItem({ ask: ['email'] }),
  askNameOnly: withItem({ ask: ['name'] }),
  askEmpty: withItem({ ask: [] }),
  askUnknown: withItem({ ask: ['name', 'address'] }),
  askTwice: withItem({ ask: ['phone', 'phone'] }),
  askTooMany: withItem({ ask: ['name', 'phone', 'email', 'name'] }),
  askNotList: withItem({ ask: 'phone' }),
  askInherited: withItem({ ask: ['toString', 'phone'] }),
  oldGate: withItem({ gate: 'form' }),
  oldPartner: withItem({ partner: true }),
  oldWhatsapp: Object.assign({}, base, { whatsapp: '919812345678' }),
  friendLinkOk: Object.assign({}, base, { social: [{ platform: 'instagram', url: 'https://instagram.com/a', label: 'A friend', friend: true, ad: true }] }),
  friendLinkBad: Object.assign({}, base, { social: [{ platform: 'instagram', url: 'https://instagram.com/a', friend: 'yes' }] }),
  adLinkBad: Object.assign({}, base, { social: [{ platform: 'instagram', url: 'https://instagram.com/a', ad: null }] }),
  // longer text for the product's own Google page
  detailsOk: withItem({ details: 'Who it is for.\n\n- point one\n- point two\n\n## What is inside\nA plan.' }),
  detailsLong: withItem({ details: 'x'.repeat(3001) }),
  detailsPadded: withItem({ details: 'text\n' }),
  detailsCtrl: withItem({ details: 'a\u0007b' }),
  detailsNumber: withItem({ details: 5 })
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
const okNames = ['real', 'empty', 'freeNoPrice', 'portUrl', 'emojiTitleOk', 'tabOkInside', 'hiddenOk', 'socialOk', 'nullKicker',
  'catsOk', 'catsEmptyOk', 'itemIdConstructor', 'catListNone', 'catNew', 'catNoEmojiOk', 'catEmojiOk',
  'groupOk', 'socialNoPriceOk', 'askOk', 'askEmailOnlyOk', 'friendLinkOk', 'detailsOk'];
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
