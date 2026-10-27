import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { loadPack } from '../../src/pack/load.js';

// Each pack built with the real CLI, opened from disk as an interviewer opens it, and walked from Start to Decide
// with the keyboard. The SRE pack leaves sync out until the new sync plugin replaces the old one.
const PACKS = {
  sample: ['examples/sample-pack'],
  designer: ['test/fixtures/packs/designer-pack'],
  sre: ['test/fixtures/packs/sre-pack', '--without', 'sync'],
  demo: ['capture/demo-pack'],
};
const root = mkdtempSync(join(tmpdir(), 'ik-packs-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_ENV' && !k.startsWith('VITEST')));
const url = {};
let browser;

// One build at a time, so the suite's other browser tests keep their CPU.
beforeAll(async () => {
  for (const [name, [pack, ...flags]] of Object.entries(PACKS)) {
    await promisify(execFile)(process.execPath, ['bin/interview-kit.js', 'build', '--pack', pack, '--outDir', join(root, name), ...flags], { env: { ...env, KIT_BUILD_DATE: '2026-10-26' } });
    url[name] = pathToFileURL(join(root, name, 'index.html')).href;
  }
  browser = await chromium.launch({ args: ['--mute-audio'] });
}, 180_000);

afterAll(async () => {
  await browser?.close();
  rmSync(root, { recursive: true });
}, 30_000);

// Start, then on each page of the run of show press 1 to mark the first row seen, tick the first passion on a
// picker, and press j; then record a decision. Returns each page's route and heading, the rows the summary shows as
// seen, the role's decisions and the recorded line.
async function walk(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'America/Los_Angeles', locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-26T16:58:00-07:00'));
  await page.goto(url[name]);
  await page.getByLabel('Who are you meeting?').fill('Sam Lee');
  await page.getByRole('button', { name: 'Start interview' }).click();
  await page.waitForSelector('.session-header');
  const at = (route) => page.waitForFunction((r) => document.querySelector('main')?.dataset.route === (r ?? location.hash), route);
  const pages = [];
  for (;;) {
    await at();
    const here = await page.evaluate(() => [location.hash, document.querySelector('main h1')?.textContent.trim()]);
    if (pages.at(-1)?.[0] === here[0]) break;
    pages.push(here);
    const passion = page.locator('.picker-passion input').first();
    if (await passion.count()) await passion.check();
    await page.keyboard.press('1');
    await page.keyboard.press('j');
  }
  await page.getByRole('link', { name: 'Decide' }).click();
  await at('#/decide');
  const choices = await page.locator('.decide-option b').allTextContents();
  const seen = await page.locator('.summary-row.is-seen').evaluateAll((els) => els.map((el) => el.textContent.trim()));
  await page.locator('.decide-option input').first().check();
  await page.getByRole('textbox', { name: 'Reason' }).fill('Clear on the basics.');
  await page.getByRole('button', { name: 'Record' }).click();
  const recorded = await page.locator('.decide-recorded').textContent();
  await ctx.close();
  return { pages, seen, choices, recorded, errors };
}

test('the sample pack builds and walks its practical round', async () => {
  expect(await walk('sample')).toEqual({
    pages: [
      ['#/practical/before-the-call', 'Before the call'],
      ['#/practical/intro', 'Intro'],
      ['#/practical/review-a-teammate-s-pr', "Review a teammate's PR"],
      ['#/practical/deep-dive', 'Deep dive'],
      ['#/practical/deep-dive/css-01', 'Center a box'],
      ['#/practical/deep-dive/css-02', 'Specificity clash'],
      ['#/practical/wrap-up', 'Wrap-up'],
    ],
    seen: [
      'Seen: The error is not linked to the field. No aria-invalid, no aria-describedby, no live region.',
      'Seen: Explains why margin: auto centers horizontally but not vertically',
      'Seen: Explains specificity before source order, with this example',
    ],
    choices: ['Hire', 'No hire'],
    recorded: "Recorded at 4:58 PM. Colleagues' evidence and the second opinion open once they have decided too.",
    errors: [],
  });
});

test('the designer pack builds and walks its portfolio review', async () => {
  expect(await walk('designer')).toEqual({
    pages: [
      ['#/portfolio-review/intro', 'Intro'],
      ['#/portfolio-review/walk-through-two-projects', 'Walk through two projects'],
      ['#/portfolio-review/working-together', 'Working together'],
      ['#/portfolio-review/working-together/collab-01', 'Disagreeing with an engineer'],
      ['#/portfolio-review/their-questions', 'Their questions'],
    ],
    seen: [
      'Seen: Shows an option they dropped, and why. An earlier direction, with the reason it lost.',
      'Seen: Shows an option they dropped, and why. An earlier direction, with the reason it lost.',
      'Seen: Names what they changed, and what they held firm on',
    ],
    choices: ['Hire', 'No hire'],
    recorded: "Recorded at 4:58 PM. Colleagues' evidence and the second opinion open once they have decided too.",
    errors: [],
  });
});

test('the SRE pack builds and walks its incident walkthrough', async () => {
  expect(await walk('sre')).toEqual({
    pages: [
      ['#/incident/intro', 'Intro'],
      ['#/incident/checkout-latency-incident', 'Checkout latency incident'],
      ['#/incident/operating-practice', 'Operating practice'],
      ['#/incident/operating-practice/ops-01', 'The alert you would delete'],
      ['#/incident/their-questions', 'Their questions'],
    ],
    seen: [
      "Seen: Follows the growing queue to another team's job. Uses the flat database graph to rule out the deploy.",
      'Seen: Names a signal that never led to action',
    ],
    choices: ['Hire', 'No hire'],
    recorded: "Recorded at 4:58 PM. Colleagues' evidence and the second opinion open once they have decided too.",
    errors: [],
  });
});

test('the migrated demo pack builds and walks its round', async () => {
  expect(await walk('demo')).toEqual({
    pages: [
      ['#/sample/intro', 'Intro'],
      ['#/sample/sample-round', 'Sample round'],
      ['#/sample/deep-dive', 'Deep dive'],
      ['#/sample/deep-dive/css-01', 'Center a box'],
      ['#/sample/deep-dive/css-02', 'Specificity clash'],
      ['#/sample/deep-dive/css-03', 'Dark mode colors'],
      ['#/sample/outro', 'Outro'],
    ],
    seen: [
      'Seen: Uses grid place-items or flex with both alignments',
      'Seen: Opens the computed styles in dev tools',
      'Seen: Uses color-scheme and prefers-color-scheme',
    ],
    choices: ['Hire', 'No hire'],
    recorded: "Recorded at 4:58 PM. Colleagues' evidence and the second opinion open once they have decided too.",
    errors: [],
  });
});

test('no role, round, item, pool or competency id from the designer or SRE pack appears anywhere in src/', async () => {
  const ids = [];
  for (const pack of ['designer-pack', 'sre-pack']) {
    const { model } = await loadPack(`test/fixtures/packs/${pack}`);
    ids.push(...model.roles.map((r) => r.id), ...model.rounds.map((r) => r.id), ...model.libs.exercise.map((e) => e.id),
      ...model.libs.questions.pools.map((p) => p.id), ...model.libs.questions.cards.map((c) => c.id), ...model.competencies.map((c) => c.id));
  }
  const files = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const found = files.flatMap((f) => ids.filter((id) => new RegExp(`\\b${id}\\b`).test(readFileSync(f, 'utf8'))).map((id) => `${f}: ${id}`));
  expect([ids.length, found]).toEqual([16, []]);
});
