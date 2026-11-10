// Run: node tests/test_helper.js — checks Pip's helper answers the way we expect.
'use strict';
const assert = require('assert');
const H = require('../src/helper.js');
const L = require('../src/logic.js');
const products = require('../src/catalog.json').items.filter((p) => !p.hidden);
const ctx = { products, guides: [{ slug: '50-10-study-method', h1: 'The 50/10 study method' }], hasSocial: true };
let passed = 0;
function t(name, fn) {
  try { fn(); passed++; } catch (e) { console.error('FAIL', name); throw e; }
}

// What people might type -> the answer they should get.
const CASES = [
  ['hi', 'hello'], ['hello pip', 'hello'], ['help', 'menu'], ['what can you do', 'menu'], ['are you an AI?', 'menu'],
  ['i cant focus', 'focus'], ["I can't concentrate at all", 'focus'], ['my phone keeps distracting me', 'focus'],
  ['i keep scrolling reels', 'focus'], ['help me focus', 'focus'], ['dhyan nahi lagta', 'focus'], ['i cant concetrate', 'focus'],
  ['I keep procrastinating', 'procrastinate'], ['i procastinate a lot', 'procrastinate'], ['no motivation to study', 'procrastinate'],
  ['stop procrastinating', 'procrastinate'],
  ['exam tomorrow!!', 'exam'], ['I have a test tomorrow and I know nothing', 'exam'], ['kal exam hai', 'exam'], ['exam', 'exam'],
  ['make me a study plan', 'plan'], ['my exam is in 2 weeks', 'plan'], ['how to prepare for boards', 'plan'],
  ['how long should I study', 'howlong'], ['what is pomodoro', 'howlong'], ['is 50/10 good', 'howlong'],
  ['how many minutes should i study before a break', 'howlong'],
  ['I forget everything I read', 'memory'], ['how to memorize faster', 'memory'],
  ['i dont understand this chapter', 'reading'], ['how to take notes', 'reading'],
  ['my essay is due tomorrow', 'writing'], ['big assignment', 'writing'],
  ['im so sleepy', 'sleepy'], ['too tired to study', 'sleepy'],
  ['I am so stressed', 'stress'], ['exam anxiety', 'stress'], ['I feel overwhelmed', 'stress'],
  ['what music should i study with', 'music'], ['brown noise', 'music'],
  ['how does focus world work', 'what'], ['what is this', 'what'], ['how do i use this', 'what'],
  ['what can i unlock', 'grow'], ['when do i get the cottage', 'grow'], ['how many minutes have i focused', 'grow'],
  ['how do streaks work', 'streak'], ['I lost my streak', 'streak'], ["I don't understand streaks", 'streak'],
  ['how do i change the scene', 'scenes'], ['how to get the space garden', 'scenes'],
  ['how do i change the timer', 'timer'], ['can i set 2 hours', 'timer'],
  ['what happens if i stop early', 'stop'], ['my sprout drooped', 'stop'],
  ['what is phone free mode', 'phonefree'], ['how does phone-free mode work', 'phonefree'], ['how to stop using my phone', 'phonefree'],
  ['do i need an account', 'account'], ['how do i log in', 'account'],
  ['how do i move my island to a new phone', 'backup'], ['will i lose my progress if i clear my browser', 'backup'],
  ['my island disappeared', 'backup'], ['download backup', 'backup'],
  ['can i install it', 'install'], ['can I install it on my phone', 'install'], ['does it work offline', 'install'],
  ['can it notify me', 'notify'], ['my screen goes to sleep', 'notify'],
  ['calm mode', 'look'], ['it is laggy on my old phone', 'look'],
  ['how do i reset my island', 'reset'], ['share my island', 'share'],
  ['is it free', 'free'], ['do you have ads', 'free'], ['is my data safe', 'free'],
  ['hindi me baat karo', 'language'],
  ['what do you sell', 'shop'], ['something else is wrong', 'shop'], ['show me your products', 'shop'],
  ['who made this', 'maker'], ['the app is not working', 'maker'], ['instagram', 'follow'],
  ['thanks!', 'thanks'], ['bye', 'bye'],
  ['my teacher says I used ChatGPT', 'ai'], ['turnitin flagged my essay', 'ai'], ['professor thinks i used ai', 'ai'],
  ['accused of cheating with ai', 'ai'], ['my essay is ai according to my teacher', 'ai'],
  ['I got a letter from the IRS', 'tax'], ['cp2000 notice', 'tax'], ['irs says i owe more tax', 'tax'],
  ['asdfgh', 'unknown'], ['banana', 'unknown']
];

t('every typed message gets the right answer', () => {
  const wrong = [];
  for (const [text, want] of CASES) {
    const got = H.reply(text, ctx).id;
    if (got !== want) wrong.push(`"${text}" -> ${got} (want ${want})`);
  }
  assert.deepStrictEqual(wrong, []);
});

t('topics are well formed', () => {
  const ids = new Set();
  for (const tp of H.TOPICS) {
    assert.ok(!ids.has(tp.id), 'duplicate topic ' + tp.id); ids.add(tp.id);
    assert.ok(Array.isArray(tp.say) && tp.say.length, tp.id + ' has no answer');
    (tp.acts || []).forEach((a) => assert.ok(a === 'follow' || H.ACTIONS[a], tp.id + ': unknown action ' + a));
    const nx = tp.next === 'main' ? H.MAIN : (tp.next || []);
    nx.forEach((n) => assert.ok(H.TOPICS.some((x) => x.id === n && x.label), tp.id + ': next ' + n + ' has no button'));
    tp.say.forEach((line) => assert.ok(line.length <= 200, tp.id + ': line too long for a phone'));
  }
  H.MAIN.forEach((n) => assert.ok(H.TOPICS.some((x) => x.id === n && x.label)));
});

t('facts in the answers match the app', () => {
  const at = (name) => L.ITEMS.find((i) => i.name === name).at;
  assert.strictEqual(L.ITEMS.length, 31);
  assert.strictEqual(at('First sprout'), 2); assert.strictEqual(at('Apple tree'), 25); assert.strictEqual(at('Cottage'), 420);
  assert.strictEqual(at('Windmill'), 680); assert.strictEqual(at('Lighthouse'), 1450); assert.strictEqual(at('Friendly whale'), 8000);
  assert.strictEqual(L.SCENES.length, 20);
  const what = H.replyTopic('what', ctx).say.join(' ');
  assert.ok(what.includes(String(L.ITEMS.length) + ' things'));
  assert.ok(H.replyTopic('scenes', ctx).say.join(' ').includes(String(L.SCENES.length) + ' places'));
});

t('products are found from what people type, using My Shop tags', () => {
  const ai = H.reply('my teacher says I used ChatGPT', ctx);
  assert.deepStrictEqual(ai.products.map((p) => p.id).sort(), ['first-reply', 'paper-trail']);
  assert.ok(ai.pre);
  const tax = H.reply('I got a letter from the IRS', ctx);
  assert.deepStrictEqual(tax.products.map((p) => p.id).sort(), ['cp2000-kit', 'irs-letter-check']);
  // by product name
  assert.ok(H.reply('tell me about paper trail', ctx).products.some((p) => p.id === 'paper-trail'));
  // shop lists everything, in the My Shop order
  assert.deepStrictEqual(H.replyTopic('shop', ctx).products.map((p) => p.id), products.map((p) => p.id));
});

t('study questions do not push products', () => {
  for (const q of ['how do I write my essay faster', 'I am a student and cant focus', 'exam tomorrow', 'help me with my assignment',
    'my teacher gave too much homework', 'how to study for university exams']) {
    assert.deepStrictEqual(H.reply(q, ctx).products, [], q);
  }
});

t('a new product added in My Shop is found without code changes', () => {
  const extra = products.concat([{ id: 'calm-sleep-audio', type: 'video', title: 'Fall asleep fast before an exam',
    hook: 'Can’t sleep before exams?', tags: ['insomnia', 'cant sleep', 'sleep before exam'], url: 'https://youtube.com/watch?v=x', image: 'shelf/x.jpg' }]);
  const r = H.reply('I have insomnia', Object.assign({}, ctx, { products: extra }));
  assert.ok(r.products.some((p) => p.id === 'calm-sleep-audio'), JSON.stringify(r));
  const r2 = H.reply('i cant sleep before my exam', Object.assign({}, ctx, { products: extra }));
  assert.ok(r2.products.some((p) => p.id === 'calm-sleep-audio'));
});

t('someone in danger gets people to talk to, never products or tips', () => {
  for (const q of ['I want to die', 'i dont want to live anymore', 'thinking about suicide', 'I want to hurt myself',
    'i will kill myself if i fail', 'mar jaunga main']) {
    const r = H.reply(q, ctx);
    assert.strictEqual(r.id, 'crisis', q);
    assert.deepStrictEqual(r.products, []);
    assert.ok(r.say.join(' ').includes('14416'));
    assert.ok(r.acts.includes('helplines'));
  }
  // ordinary words that only look similar are not a crisis
  for (const q of ['this exam is killing me lol', 'my plant died', 'I am dying to know my score']) {
    assert.notStrictEqual(H.reply(q, ctx).id, 'crisis', q);
  }
});

t('personal numbers fill in, or the line is left out', () => {
  const g = H.replyTopic('grow', Object.assign({}, ctx, { total: '42 min', next: 'Berry bush, 1 min away' })).say.join(' ');
  assert.ok(g.includes('42 min') && g.includes('Berry bush'));
  const g2 = H.replyTopic('grow', ctx).say.join(' ');
  assert.ok(!g2.includes('{') && !g2.includes('so far'));
  assert.ok(H.replyTopic('streak', Object.assign({}, ctx, { streak: '3 days' })).say.join(' ').includes('3 days'));
});

t('buttons only show what exists', () => {
  assert.ok(!H.replyTopic('maker', Object.assign({}, ctx, { hasSocial: false })).acts.includes('follow'));
  assert.ok(H.replyTopic('maker', ctx).acts.includes('follow'));
  assert.deepStrictEqual(H.replyTopic('howlong', ctx).guides.map((g) => g.slug), ['50-10-study-method']);
  assert.deepStrictEqual(H.replyTopic('howlong', Object.assign({}, ctx, { guides: [] })).guides, []);
  const empty = H.replyTopic('shop', Object.assign({}, ctx, { products: [] }));
  assert.deepStrictEqual(empty.products, []);
  assert.ok(/stocked/.test(empty.say[0]));
});

t('two topics in one message: the second becomes the first button', () => {
  const r = H.reply('exam tomorrow and I cant focus', ctx);
  assert.ok(['exam', 'focus'].includes(r.id));
  assert.ok(['exam', 'focus'].includes(r.chips[0].topic) && r.chips[0].topic !== r.id);
});

t('empty or odd input is handled', () => {
  assert.strictEqual(H.reply('', ctx).id, 'welcome');
  assert.strictEqual(H.reply('   !!! ', ctx).id, 'welcome');
  assert.strictEqual(H.reply(null, ctx).id, 'welcome');
  // The bot never repeats what was typed, so markup in a message can't end up in an answer.
  assert.ok(!H.reply('<img src=x onerror=alert(1)>', ctx).say.join(' ').includes('<'));
  assert.ok(H.reply('x'.repeat(5000), ctx));
});

// ---------- categories from My Shop ----------
const catalog = require('../src/catalog.json');
const extra = [
  { id: 'speak-ahead-course', type: 'course', title: 'Speak English with confidence in 30 days', hook: 'Scared to speak English?',
    price: '\u20B9999', categories: ['english', 'jobs'], url: 'https://example.com/a', image: 'shelf/a.jpg' },
  { id: 'yt-growth', type: 'ebook', title: 'Grow your first channel', price: '$9', categories: ['content'], url: 'https://example.com/b', image: 'shelf/b.jpg' },
  { id: 'focus-planner', type: 'template', title: 'Daily planner', price: '$5', categories: ['focus', 'study'], url: 'https://example.com/c', image: 'shelf/c.jpg' },
  { id: 'calm-audio', type: 'video', title: 'Ten quiet minutes', free: true, categories: ['calm'], url: 'https://example.com/d', image: 'shelf/d.jpg' }
];
const cctx = { products: products.concat(extra), categories: catalog.categories, guides: [], hasSocial: true };
const ids = (r) => r.products.map((p) => p.id);

t('every starter category is well formed and has words', () => {
  assert.strictEqual(catalog.categories.length, 12);
  for (const c of catalog.categories) assert.ok(c.name && c.emoji && c.words.length >= 10, c.id);
});

t('typed problems find the products in that category', () => {
  const want = [
    ['how to speak english fluently', 'cat:english', ['speak-ahead-course']],
    ['i want to improve my english speaking', 'cat:english', ['speak-ahead-course']],
    ['public speaking tips', 'cat:english', ['speak-ahead-course']],
    ['resume tips', 'cat:jobs', ['speak-ahead-course']],
    ['how do i grow my youtube channel', 'cat:content', ['yt-growth']],
    ['hi, how can I improve my pronounciation', 'cat:english', ['speak-ahead-course']]   // typo still works
  ];
  for (const [q, id, prods] of want) {
    const r = H.reply(q, cctx);
    assert.strictEqual(r.id, id, q + ' -> ' + r.id);
    assert.deepStrictEqual(ids(r), prods, q);
  }
});

t('study tips stay, with just 1 product from the matching category', () => {
  for (const [q, id, prod] of [['i cant focus', 'focus', 'focus-planner'], ['exam tomorrow', 'exam', 'focus-planner'],
    ['I am so stressed', 'stress', 'calm-audio'], ['i cant sleep', 'sleepy', 'calm-audio'], ['i waste time on youtube', 'focus', 'focus-planner']]) {
    const r = H.reply(q, cctx);
    assert.strictEqual(r.id, id, q);
    assert.deepStrictEqual(ids(r), [prod], q);
    assert.strictEqual(r.pre, 'From the maker:');
  }
  // a clear category in the words beats the topic's own category
  assert.deepStrictEqual(ids(H.reply('I am nervous about my english speaking test', cctx)), ['speak-ahead-course']);
});

t('real-life problems still get their own advice and products', () => {
  assert.deepStrictEqual(ids(H.reply('my teacher says I used ChatGPT', cctx)).sort(), ['first-reply', 'paper-trail']);
  assert.deepStrictEqual(ids(H.reply('I got a letter from the IRS', cctx)).sort(), ['cp2000-kit', 'irs-letter-check']);
});

t('how-to questions about the app never show products', () => {
  for (const q of ['what can i unlock', 'how do i grow my island', 'how do streaks work', 'can i install it']) {
    assert.deepStrictEqual(ids(H.reply(q, cctx)), [], q);
  }
});

t('a category with no products yet gets an honest answer', () => {
  for (const q of ['learn korean', 'I want to learn French', 'hi i want to learn guitar']) {
    const r = H.reply(q, cctx);
    assert.ok(r.id.indexOf('cat-empty:') === 0, q + ' -> ' + r.id);
    assert.ok(/hasn.t made anything/.test(r.say[0]));
  }
});

t('"Something else is wrong" shows topic buttons for categories that have products', () => {
  const r = H.replyTopic('shop', cctx);
  const cats = r.chips.map((c) => c.cat);
  assert.deepStrictEqual(cats, ['study', 'english', 'school', 'jobs', 'money', 'content', 'focus', 'calm']);
  assert.deepStrictEqual(ids(r), []);           // 8 products: too many to list, the buttons lead to them
  const small = H.replyTopic('shop', Object.assign({}, cctx, { products }));
  assert.strictEqual(ids(small).length, 4);    // the real shop today: 4 products, all shown, plus buttons
  assert.deepStrictEqual(small.chips.map((c) => c.cat), ['school', 'money']);
  const c = H.replyCategory('english', cctx);
  assert.deepStrictEqual(ids(c), ['speak-ahead-course']);
  assert.ok(c.chips.every((x) => x.cat !== 'english'));
  assert.strictEqual(H.replyCategory('languages', cctx).id, 'shop');   // empty category button can't exist; falls back
});

t('safety answer never shows products, even with categories', () => {
  const r = H.reply('I am so stressed I want to die', cctx);
  assert.strictEqual(r.id, 'crisis');
  assert.deepStrictEqual(r.products, []);
});

console.log('helper tests passed:', passed);
