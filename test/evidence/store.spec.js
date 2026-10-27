import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { build } from 'vite';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

const TEXT = {
  conflict: 'This interview changed in another window at the same moment. Reload to carry on. Nothing is lost.',
  unsaved: 'Not saved on this laptop. Keep going: your marks stay in this tab. Share my evidence as a file before you close it.',
  version: 'This copy of the kit is older than one already opened on this laptop. Open the newer copy.',
  readOnly: 'This interview is open in another window. Record there, or take over here.',
  tookOver: 'Another window took over this interview.',
};

// One kit per pack, each in its own folder and opened from disk, where every page shares one origin in all three
// engines (U1). The page does what the setup screen will: open the store, mount the status bar and the session list.
const dir = mkdtempSync(join(tmpdir(), 'ik-store-'));
const kit = {};
const contexts = [];
let browser;

beforeAll(async () => {
  const src = resolve('src');
  writeFileSync(join(dir, 'entry.js'), `
import { openStore } from ${JSON.stringify(`${src}/evidence/store.js`)};
import { bindSessionList, sessionList } from ${JSON.stringify(`${src}/components/session-list.js`)};
import { mountStatus } from ${JSON.stringify(`${src}/components/store-status.js`)};
window.kit = { openStore };
window.start = async (options) => {
  const bar = document.querySelector('#bar');
  const list = document.querySelector('#list');
  try { window.store = await openStore(window.PACK, options); } catch (e) { bar.hidden = false; bar.textContent = e.message; return; }
  const render = async () => { list.innerHTML = sessionList(await store.sessions()); };
  mountStatus(bar, store, { share() {} });
  bindSessionList(list, {
    open: async (sid) => store.claim(sid, (await store.session(sid)).author),
    keep: async (sid) => { await store.keep(sid); await render(); },
    remove: async (sid) => { await store.remove(sid); await render(); },
    share() {},
  });
  await render();
};`);
  await build({ configFile: false, logLevel: 'silent',
    build: { outDir: join(dir, 'out'), minify: false, lib: { entry: join(dir, 'entry.js'), formats: ['iife'], name: 'kit', fileName: () => 'kit.js', cssFileName: 'kit' } } });
  const js = readFileSync(join(dir, 'out/kit.js'), 'utf8');
  const css = readFileSync(join(dir, 'out/kit.css'), 'utf8');
  for (const pack of ['alpha', 'beta']) {
    mkdirSync(join(dir, pack));
    writeFileSync(join(dir, pack, 'index.html'), `<!doctype html><meta charset="utf-8"><style>${css}</style>
<div id="bar" hidden></div><div id="list"></div><script>window.PACK = ${JSON.stringify(pack)};</script><script>${js}</script>`);
    kit[pack] = pathToFileURL(join(dir, pack, 'index.html')).href;
  }
  browser = await chromium.launch();
}, 60_000);

afterEach(async () => { for (const c of contexts.splice(0)) await c.close(); });
afterAll(async () => { await browser?.close(); });

async function context(engine = browser) {
  const c = await engine.newContext();
  contexts.push(c);
  return c;
}

async function open(c, pack = 'alpha', options = {}) {
  const page = await c.newPage();
  await page.goto(kit[pack]);
  await page.evaluate((o) => start(o), options);
  return page;
}

const restart = async (page, options = {}) => { await page.reload(); await page.evaluate((o) => start(o), options); };
const bar = (page) => page.evaluate(() => { const b = document.querySelector('#bar'); return b.hidden ? '' : b.innerText.trim(); });
const rows = (page) => page.$$eval('#list li', (lis) => lis.map((li) => li.innerText.replace(/\s+/g, ' ').trim()));

// Writes a session as if it happened `ago` days back: my open, name and candidate, then optionally a recorded decision.
const seed = (page, { ago, candidate, decide = false, decided = decide }) => page.evaluate(async ({ ago, candidate, decide, decided }) => {
  const s = await kit.openStore(PACK, { now: () => Date.now() - ago * 86_400_000 });
  const { sid, author } = await s.create();
  const h = (i) => `0194c0de${(0x1000 + i).toString(16).padStart(4, '0')}.0000`;
  const pub = [{ t: 'open', v: 2, sid, author, role: 'r', round: 'p', pack: { id: PACK, version: '1', sha: 'a' } }, { t: 'name', name: 'Jason' },
    { t: 'put', k: 'session.candidate', v: candidate }];
  if (decided) pub.push({ t: 'decided' });
  for (const [n, e] of pub.entries()) await s.append(sid, author, 'pub', { n, h: h(n), ...e });
  if (decide) await s.append(sid, author, 'prv', { n: 0, h: h(9), t: 'decide', choice: 'hire', why: 'ok' });
  return { sid, author };
}, { ago, candidate, decide, decided });

const mine = (page, sid, author) => page.evaluate(async ({ sid, author }) => (await store.read(sid))[author], { sid, author });

test('a replayed identical append changes nothing; a different event at the same position stops the writer', async () => {
  const page = await open(await context());
  const out = await page.evaluate(async () => {
    const { sid, author } = await store.create();
    await store.claim(sid, author);
    const first = { n: 0, h: '0194c0de1000.0000', t: 'name', name: 'Jason' };
    const results = [await store.append(sid, author, 'pub', first), await store.append(sid, author, 'pub', { ...first })];
    const before = document.querySelector('#bar').hidden;
    results.push(await store.append(sid, author, 'pub', { ...first, name: 'Alex' }));
    results.push(await store.append(sid, author, 'pub', { n: 1, h: '0194c0de1001.0000', t: 'decided' }));
    return { results, before, pub: (await store.read(sid))[author].pub };
  });
  expect(out).toEqual({ results: ['saved', 'same', 'conflict', 'refused'], before: true, pub: [{ n: 0, h: '0194c0de1000.0000', t: 'name', name: 'Jason' }] });
  expect(await bar(page)).toBe(TEXT.conflict);
}, 30_000);

test('starting the kit closes a half-written decision, once', async () => {
  const page = await open(await context());
  const { sid, author } = await seed(page, { ago: 0, candidate: 'Sam Lee', decide: true, decided: false });
  await restart(page);
  await restart(page);
  const { pub } = await mine(page, sid, author);
  expect(pub.map((e) => `${e.n} ${e.t}`)).toEqual(['0 open', '1 name', '2 put', '3 decided']);
}, 30_000);

test('decided sessions go 30 days after their last change, warn for five days with Keep, and undecided ones stay', async () => {
  const page = await open(await context());
  await seed(page, { ago: 31, candidate: 'Thirty-one', decide: true });
  await seed(page, { ago: 29, candidate: 'Twenty-nine', decide: true });
  await seed(page, { ago: 26, candidate: 'Twenty-six', decide: true });
  await seed(page, { ago: 24, candidate: 'Twenty-four', decide: true });
  await seed(page, { ago: 40, candidate: 'Forty' });
  await restart(page);
  expect((await rows(page)).sort()).toEqual([
    'Forty No decision recorded. Kept until you delete it. Open Delete from this laptop',
    'Twenty-four Open Delete from this laptop',
    'Twenty-nine Deleted from this laptop in 1 day Open Keep Share my evidence Delete from this laptop',
    'Twenty-six Deleted from this laptop in 4 days Open Keep Share my evidence Delete from this laptop',
  ]);

  await page.locator('li', { hasText: 'Twenty-six' }).getByRole('button', { name: 'Keep' }).click();
  await page.locator('li', { hasText: 'Twenty-four' }).getByRole('button', { name: 'Delete from this laptop' }).click();
  await expect.poll(() => rows(page)).toHaveLength(3);
  await restart(page);
  expect((await rows(page)).sort()).toEqual([
    'Forty No decision recorded. Kept until you delete it. Open Delete from this laptop',
    'Twenty-nine Deleted from this laptop in 1 day Open Keep Share my evidence Delete from this laptop',
    'Twenty-six Open Delete from this laptop',
  ]);
}, 30_000);

test('a second window on the same interview is read-only until it takes over', async () => {
  const c = await context();
  const first = await open(c);
  const { sid, author } = await seed(first, { ago: 0, candidate: 'Sam Lee' });
  expect(await first.evaluate(({ sid, author }) => store.claim(sid, author), { sid, author })).toBe('writer');

  const second = await open(c);
  await second.getByRole('button', { name: 'Open' }).click();
  await expect.poll(() => bar(second)).toBe(`${TEXT.readOnly} Take over`);
  const mark = (n) => ({ n, h: `0194c0de200${n}.0000`, t: 'mark', o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen' });
  const append = (page, n) => page.evaluate(({ sid, author, e }) => store.append(sid, author, 'prv', e), { sid, author, e: mark(n) });
  expect(await append(second, 0)).toBe('refused');
  expect(await append(first, 0)).toBe('saved');

  await second.getByRole('button', { name: 'Take over' }).click();
  await expect.poll(() => bar(first)).toBe(TEXT.tookOver);
  await expect.poll(() => bar(second)).toBe('');
  expect([await append(first, 1), await append(second, 1)]).toEqual(['refused', 'saved']);
}, 30_000);

for (const [name, engine] of [['Chromium'], ['Firefox', firefox], ['WebKit', webkit]]) {
  test(`${name}: a second pack's kit opened from another folder sees neither the first pack's sessions nor its lock`, async () => {
    const launched = engine && await engine.launch();
    try {
      const c = await context(launched ?? browser);
      const alpha = await open(c, 'alpha');
      const { sid, author } = await seed(alpha, { ago: 0, candidate: 'Sam Lee' });
      await alpha.evaluate(({ sid, author }) => store.claim(sid, author), { sid, author });
      const beta = await open(c, 'beta');
      expect([await rows(beta), await beta.evaluate(({ sid, author }) => store.claim(sid, author), { sid, author }), await alpha.evaluate(() => store.sessions().then((s) => s.map((r) => r.candidate)))])
        .toEqual([[], 'writer', ['Sam Lee']]);
    } finally {
      await launched?.close();
    }
  }, 60_000);
}

test('a refused write keeps marking in memory with the warning bar, and flushes once writes work again', async () => {
  const page = await open(await context(), 'alpha', { retryMs: 100 });
  const { sid, author } = await seed(page, { ago: 0, candidate: 'Sam Lee' });
  // Chromium's quota override lets small writes through, so a full disk is played the way it arrives: the request
  // is accepted and its transaction then aborts.
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    window.unbreak = () => { IDBObjectStore.prototype.add = add; };
    IDBObjectStore.prototype.add = function (...args) { const r = add.apply(this, args); this.transaction.abort(); return r; };
  });
  const marks = [0, 1, 2].map((n) => ({ n, h: `0194c0de300${n}.0000`, t: 'mark', o: `css-04#mid.${n + 1}`, d: 'a1b2c3d4', s: 'seen' }));
  const results = await page.evaluate(async ({ sid, author, marks }) => {
    const out = [];
    for (const e of marks) out.push(await store.append(sid, author, 'prv', e));
    return out;
  }, { sid, author, marks });
  expect(results).toEqual(['held', 'held', 'held']);
  expect(await bar(page)).toBe(`${TEXT.unsaved} Share my evidence`);
  expect((await mine(page, sid, author)).prv).toEqual(marks);

  await page.evaluate(() => unbreak());
  await expect.poll(() => bar(page)).toBe('');
  await restart(page);
  expect((await mine(page, sid, author)).prv).toEqual(marks);
}, 30_000);

test('a newer copy of the kit already upgraded the database: the plain message, not a crash', async () => {
  const page = await (await context()).newPage();
  await page.goto(kit.alpha);
  await page.evaluate(() => new Promise((done) => { const r = indexedDB.open(`interview-kit:${PACK}`, 99); r.onsuccess = () => { r.result.close(); done(); }; }));
  await page.evaluate(() => start());
  expect(await bar(page)).toBe(TEXT.version);
}, 30_000);

test('the author id survives a reload', async () => {
  const page = await open(await context());
  const { sid, author } = await page.evaluate(() => store.create());
  await restart(page);
  expect([author.length > 2, await page.evaluate((sid) => store.session(sid).then((s) => s.author), sid)]).toEqual([true, author]);
}, 30_000);
