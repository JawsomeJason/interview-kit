import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { build } from 'vite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { loadPack } from '../../src/pack/load.js';
import highlight from '../../scripts/vite-highlight-plugin.js';
import { audit } from '../../scripts/clip.mjs';

const FIXTURES = 'test/fixtures/packs';
const PACKS = ['sample-pack', 'designer-pack', 'sre-pack'];
const SHOTS = process.env.SHOTS;
const dir = mkdtempSync(join(tmpdir(), 'ik-views-'));
const url = {};
let browser;

// One page per pack: the harness built once, with the pack's model inlined as loadPack makes it in Node.
beforeAll(async () => {
  await build({ configFile: false, logLevel: 'silent', root: resolve('.'),
    define: { __APP_VERSION__: '"0.0.0"', __GIT_SHA__: '"test"', __BUILD_DATE__: '"2026-10-26"' },
    plugins: [highlight(PACKS.map((p) => `${FIXTURES}/${p}/**/*.md`))],
    build: { outDir: join(dir, 'out'), minify: false, lib: { entry: resolve('test/kinds/harness.js'), formats: ['iife'], name: 'harness', fileName: () => 'kit.js', cssFileName: 'kit' } } });
  const js = readFileSync(join(dir, 'out/kit.js'), 'utf8');
  const css = readFileSync(join(dir, 'out/kit.css'), 'utf8');
  for (const pack of PACKS) {
    const { model } = await loadPack(join(FIXTURES, pack));
    mkdirSync(join(dir, pack));
    writeFileSync(join(dir, pack, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>${pack}</title><style>${css}
.harness { display: grid; grid-template-columns: minmax(0, 14rem) minmax(0, 1fr); gap: 2rem; padding: 1rem; }
@media (width < 60rem) { .harness { grid-template-columns: minmax(0, 1fr); } }
:root { scroll-padding-block: 1rem; }
.harness-main:focus { outline: none; }</style>
<script>window.PACK = ${JSON.stringify(model)};</script><script>${js}</script>`);
    url[pack] = pathToFileURL(join(dir, pack, 'index.html')).href;
  }
  browser = await chromium.launch({ args: ['--mute-audio'] });
}, 120_000);

afterAll(async () => { await browser?.close(); });

async function open(pack, { role, hash = '', scheme = 'light', viewport = { width: 1280, height: 900 }, tweak } = {}) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url[pack]}${hash}`);
  if (tweak) await page.evaluate(tweak);
  await page.evaluate((r) => window.startKit(window.PACK, r ?? window.PACK.roles[0].id), role);
  await rendered(page);
  return { page, errors, close: () => ctx.close() };
}

// A route change renders on hashchange, a task after the key that caused it.
const rendered = (page) => page.waitForFunction(() => document.querySelector('.harness-main')?.dataset.route === location.hash);
const press = async (page, key) => { await page.keyboard.press(key); await rendered(page); };

// The log as a reader checks it: stream positions, stamps and digests are the machinery, so they are checked apart.
const logged = (page) => page.evaluate(() => window.events.map(({ n, h, d, ...e }) => {
  if (!/^[0-9a-f]{12}\.[0-9a-f]{4}$/.test(h) || (d !== undefined && !/^[0-9a-f]{8}$/.test(d))) throw new Error(`bad stamp or digest: ${h} ${d}`);
  return e;
}));
const route = (page) => page.evaluate(() => location.hash);
// Disclosures open over 250 ms, so a shot waits for them to finish.
const shot = async (page, name) => { if (SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }); } };

test('the sample pack walks end to end with keys only, and every gesture logs exactly its event', async () => {
  const { page, errors, close } = await open('sample-pack');
  const routes = [await route(page)];
  const j = async () => { await press(page, 'j'); routes.push(await route(page)); };
  await j();
  await j();
  await page.keyboard.press('Shift+Digit1');
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Alt+Digit2');
  const before = (await logged(page)).length;
  await page.keyboard.press('h');
  expect((await logged(page)).length).toBe(before);
  await expect.poll(() => page.locator('.assess-more[open]').count()).toBe(6);
  await shot(page, 'exercise-marked-nudges-open');
  await page.keyboard.press('n');
  await page.keyboard.type('Needed a nudge on the error.');
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await j();
  await page.locator('.picker-passion input[value="css"]').focus();
  await page.keyboard.press('Space');
  await shot(page, 'picker-css-ticked');
  await j();
  await page.keyboard.press('Digit1');
  await shot(page, 'card-css-04-marked');
  await j();
  await j();
  await press(page, 'k');
  routes.push(await route(page));
  await page.keyboard.press('?');
  expect(await page.locator('#harness-keys').evaluate((el) => el.matches(':popover-open'))).toBe(true);

  expect(routes).toEqual(['#/practical/before-the-call', '#/practical/intro', '#/practical/review-a-teammate-s-pr', '#/practical/deep-dive',
    '#/practical/deep-dive/css-04', '#/practical/wrap-up', '#/practical/wrap-up', '#/practical/deep-dive/css-04']);
  const seg = 'practical/review-a-teammate-s-pr';
  expect(await logged(page)).toEqual([
    { t: 'member', k: 'segment.asked', seg, id: 'review-a-pr', v: true },
    { t: 'prompt', p: 'review-a-pr#error-link~nudge.1' },
    { t: 'mark', o: 'review-a-pr#error-link', s: 'seen' },
    { t: 'mark', o: 'review-a-pr#mid.2', s: 'unseen' },
    { t: 'note', scope: 'review-a-pr', text: 'Needed a nudge on the error.' },
    { t: 'close', item: 'review-a-pr', closed: true },
    { t: 'member', k: 'session.passions', id: 'css', v: 'CSS and layout' },
    { t: 'member', k: 'segment.pools', seg: 'practical/deep-dive', id: 'css', v: true },
    { t: 'member', k: 'segment.asked', seg: 'practical/deep-dive', id: 'css-04', v: true },
    { t: 'mark', o: 'css-04#mid.1', s: 'seen' },
  ]);
  expect(errors).toEqual([]);
  await close();
}, 60_000);

test.each([
  ['designer-pack', 'portfolio-walkthrough', 'portfolio-review/walk-through-two-projects', 'collaboration', 'Working together', 'portfolio-review/working-together', 'collab-01', 'designer'],
  ['sre-pack', 'checkout-latency', 'incident/checkout-latency-incident', 'operations', 'Operating practice', 'incident/operating-practice', 'ops-01', 'engineer'],
])('the %s walks every segment with keys only', async (pack, exercise, exSeg, pool, poolName, qSeg, card, level) => {
  const { page, errors, close } = await open(pack);
  const routes = [await route(page)];
  for (let i = 0; i < 6; i++) {
    if (await page.locator('.assess').count()) await page.keyboard.press('Digit1');
    if (await page.locator('.picker').count()) { await page.locator('.picker-passion input').first().focus(); await page.keyboard.press('Space'); }
    await press(page, 'j');
    routes.push(await route(page));
  }
  const steps = [...new Set(routes)];
  expect(steps).toHaveLength(5);
  expect(steps[3]).toBe(`#/${qSeg}/${card}`);
  expect(await logged(page)).toEqual([
    { t: 'member', k: 'segment.asked', seg: exSeg, id: exercise, v: true },
    { t: 'mark', o: `${exercise}#${level}.1`, s: 'seen' },
    { t: 'member', k: 'session.passions', id: pool, v: poolName },
    { t: 'member', k: 'segment.pools', seg: qSeg, id: pool, v: true },
    { t: 'member', k: 'segment.asked', seg: qSeg, id: card, v: true },
    { t: 'mark', o: `${card}#${level}.1`, s: 'seen' },
  ]);
  expect(errors).toEqual([]);
  await close();
}, 60_000);

test('a format 1 card migrated to one level has three rows on keys 1 2 3, and pressing 1 twice leaves the row unmarked', async () => {
  const { page, close } = await open('sample-pack', { hash: '#/practical/deep-dive/html-01' });
  expect(await page.locator('.assess-row').count()).toBe(3);
  expect(await page.locator('.assess-key').allTextContents()).toEqual(['1', '2', '3']);
  const box = page.locator('.assess-row').first().locator('.option-row-control');
  await page.keyboard.press('Digit1');
  expect(await box.isChecked()).toBe(true);
  await page.keyboard.press('Digit1');
  expect(await box.isChecked()).toBe(false);
  expect(await logged(page)).toEqual([
    { t: 'member', k: 'segment.asked', seg: 'practical/deep-dive', id: 'html-01', v: true },
    { t: 'mark', o: 'html-01#mid.1', s: 'seen' },
    { t: 'mark', o: 'html-01#mid.1', s: 'clear' },
  ]);
  await close();
}, 30_000);

test('reading a nudge logs nothing, Gave it logs it, and Take back undoes it', async () => {
  const { page, close } = await open('sample-pack', { hash: '#/practical/review-a-teammate-s-pr' });
  const row = page.locator('.assess-row[data-ref="review-a-pr#error-link"]');
  await row.locator('.assess-more-summary').click();
  await expect.poll(() => row.locator('.assess-nudge').allInnerTexts()).toEqual([
    'What does a screen reader announce when the error appears? Gave it',
    'Open the accessibility pane on the input. What does it say about the error? Gave it',
  ]);
  expect(await logged(page)).toHaveLength(1);
  await row.locator('[data-give="1"]').click();
  await expect.poll(() => row.locator('.assess-status').innerText()).toBe('Nudge 1 given Take back');
  await row.locator('[data-take-back]').click();
  await expect.poll(() => row.locator('.assess-status').isHidden()).toBe(true);
  expect((await logged(page)).slice(1)).toEqual([
    { t: 'prompt', p: 'review-a-pr#error-link~nudge.1' },
    { t: 'prompt', p: 'review-a-pr#error-link~nudge.1', given: false },
  ]);
  await close();
}, 30_000);

test('ticking a pool-backed passion picks its pool, and unticking it leaves the pool picked', async () => {
  const { page, close } = await open('sample-pack', { hash: '#/practical/deep-dive' });
  await page.locator('.picker-passion input[value="html"]').check();
  await expect.poll(() => page.locator('.picker-pool input[value="html"]').isChecked()).toBe(true);
  await page.locator('.picker-passion input[value="html"]').uncheck();
  await page.locator('.picker-add-text').fill('Animation');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.locator('.picker-passions').innerText()).toContain('Animation\nNo questions for this one. Search All questions.');
  expect(await page.locator('.picker-pool input[value="html"]').isChecked()).toBe(true);
  expect(await logged(page)).toEqual([
    { t: 'member', k: 'session.passions', id: 'html', v: 'HTML and accessibility' },
    { t: 'member', k: 'segment.pools', seg: 'practical/deep-dive', id: 'html', v: true },
    { t: 'member', k: 'session.passions', id: 'html', v: null },
    { t: 'member', k: 'session.passions', id: 'x-animation', v: 'Animation' },
  ]);
  await close();
}, 30_000);

test('a folded level says how many of its rows I marked seen, so moving Evaluating at keeps what I marked in view', async () => {
  const { page, close } = await open('sample-pack', { role: 'frontend-engineer', hash: '#/practical/deep-dive/css-04' });
  const folded = () => page.locator('details[data-key^="group:"] > summary').allInnerTexts();
  expect(await folded()).toEqual(['Senior, headroom']);
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Digit2');
  await page.locator('.assess-focus-select').selectOption('junior');
  await expect.poll(folded).toEqual(['Mid, headroom 2 of 3 seen', 'Senior, headroom']);
  await page.keyboard.press('Digit1');
  await page.locator('.assess-focus-select').selectOption('senior');
  await expect.poll(folded).toEqual(['Junior, basics 1 of 2 seen']);
  await page.locator('details[data-key^="group:"] > summary').click();
  await page.locator('[data-missing]').nth(1).click();
  await expect.poll(folded).toEqual(['Junior, basics 1 of 2 seen 1 missing']);
  await close();
}, 30_000);

test('a stretch prompt reads Ask this at its own level and every level above it, and folds under Other levels below it', async () => {
  const { page, close } = await open('sample-pack', { role: 'frontend-engineer', hash: '#/practical/deep-dive/css-04' });
  const asks = () => page.locator('.assess-stretch > .assess-prompts .assess-prompt').allInnerTexts();
  const shown = {};
  for (const level of ['junior', 'mid', 'senior']) {
    await page.locator('.assess-focus-select').selectOption(level);
    await expect.poll(() => page.locator('.assess-focus-select').inputValue()).toBe(level);
    shown[level] = (await asks()).map((t) => t.replace(/\s*Asked$/, ''));
  }
  expect(shown).toEqual({
    junior: [],
    mid: ['Ask this The menu now covers the page header. What would you check next?'],
    senior: ['Ask this The menu now covers the page header. What would you check next?',
      'Ask this This is the third bug like it this quarter. What would you change for the team?'],
  });
  await close();
}, 30_000);

const LONG_POOL = 'CSS and layout (a pack may name a pool at this length, brackets and all)';
const longPool = `window.PACK.libs.questions.pools.find((p) => p.id === 'css').name = ${JSON.stringify(LONG_POOL)}`;

test.each([1280, 1024, 400])('a long pool name leaves the pager on one line with its minutes in view at %ipx', async (width) => {
  const measure = async (tweak) => {
    const { page, close } = await open('sample-pack', { hash: '#/practical/deep-dive/css-04', viewport: { width, height: 900 }, tweak });
    const got = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const [prev, meta, next] = document.querySelector('.pager').children;
      const minutes = meta.querySelector('.pager-minutes');
      return { pager: box(document.querySelector('.pager')).height, prev: box(prev).height, next: box(next).height,
        minutes: minutes?.textContent, minutesFit: Boolean(minutes) && box(minutes).right <= box(meta).right + 0.5 && box(minutes).left >= box(meta).left,
        pool: meta.querySelector('.pager-pool')?.getAttribute('title') };
    });
    await close();
    return got;
  };
  const short = await measure();
  const long = await measure(longPool);
  expect(long).toEqual({ pager: short.pager, prev: short.prev, next: short.next, minutes: '8 min', minutesFit: true, pool: LONG_POOL });
}, 30_000);

// Each new screen in light and dark, on a desktop and a phone, with its disclosures open.
const SCREENS = [
  ['script', 'sample-pack', '#/practical/intro'],
  ['exercise, nudges open', 'sample-pack', '#/practical/review-a-teammate-s-pr', async (p) => { await p.keyboard.press('h'); }],
  ['exercise, row menu open', 'sample-pack', '#/practical/review-a-teammate-s-pr', async (p) => { await p.locator('.assess-menu-button').first().click(); }],
  ['picker', 'sample-pack', '#/practical/deep-dive', async (p) => { await p.locator('.picker-pool input[value="css"]').check(); }],
  ['card, read one level up, basics open', 'sample-pack', '#/practical/deep-dive/css-04', async (p) => {
    await p.locator('.assess-group summary').first().click();
    await p.locator('.assess-group [data-missing]').first().click();
  }, 'senior-frontend-engineer'],
  ['card, designer pack', 'designer-pack', '#/portfolio-review/working-together/collab-01'],
];

test('the new screens pass axe and keep every focus ring and pop inside its clip', async () => {
  const found = [];
  for (const scheme of ['light', 'dark']) {
    for (const [phone, viewport] of [[false, { width: 1280, height: 900 }], [true, { width: 390, height: 844 }]]) {
      for (const [name, pack, hash, setup = async () => {}, role] of SCREENS) {
        const { page, close } = await open(pack, { role, hash, scheme, viewport });
        await setup(page);
        const label = `${name}, ${scheme}${phone ? ', phone' : ''}`;
        await shot(page, label.replaceAll(/[ ,]+/g, '-'));
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .exclude('.harness-nav').analyze();
        found.push(...axe.violations.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`));
        // One key press so script focus counts as keyboard focus and shows the ring.
        await page.keyboard.press('Tab');
        const { rings, rows } = await page.evaluate(audit, [{ selector: '.assess .option-row-control', keyframes: 'assess-pop' }]);
        if (!rings) found.push(`${label}: no focus ring to measure`);
        found.push(...rows.map((c) => `${label}: ${c.kind} ${c.el} clipped by ${c.clip} (${c.sides})`));
        await close();
      }
    }
  }
  expect(found).toEqual([]);
}, 180_000);
