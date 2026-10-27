import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { build } from 'vite';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { loadPack } from '../../src/pack/load.js';
import highlight from '../../scripts/vite-highlight-plugin.js';

// The session with the real ai, popout, shortcuts and tab-timer plugins, opened from disk as the built kit is.
// SHOTS=<dir> also saves a screenshot of each screen there.
const READ_ONLY = 'This interview is open in another window. Record there, or take over here.';
const dir = mkdtempSync(join(tmpdir(), 'ik-plugins-ui-'));
const shots = process.env.SHOTS;
const contexts = [];
let browser;
let url;

beforeAll(async () => {
  const src = resolve('src');
  const { model } = await loadPack('test/fixtures/packs/sample-pack');
  const imp = (path) => JSON.stringify(`${src}/${path}`);
  writeFileSync(join(dir, 'entry.js'), `
import ${imp('style.css')};
import ${imp('themes/system.css')};
import ${imp('layouts/shell.css')};
import ${imp('layouts/phone.css')};
import { startSession } from ${imp('ui/session.js')};
import ai from ${imp('plugins/ai/index.js')};
import popout from ${imp('plugins/popout/index.js')};
import shortcuts from ${imp('plugins/shortcuts/index.js')};
import tabTimer from ${imp('plugins/tab-timer/index.js')};
window.ready = startSession(document.getElementById('root'), { pack: window.PACK, plugins: { ai, popout, shortcuts, tabTimer } }).then((kit) => { window.kit = kit; });`);
  await build({ configFile: false, logLevel: 'silent', root: resolve('.'),
    define: { __APP_VERSION__: '"0.0.0"', __GIT_SHA__: '"test"', __BUILD_DATE__: '"2026-10-26"' },
    plugins: [highlight(['test/fixtures/packs/sample-pack/**/*.md'])],
    build: { outDir: join(dir, 'out'), minify: false, lib: { entry: join(dir, 'entry.js'), formats: ['iife'], name: 'kit', fileName: () => 'kit.js', cssFileName: 'kit' } } });
  mkdirSync(join(dir, 'kit'));
  writeFileSync(join(dir, 'kit', 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Interview kit</title><style>${readFileSync(join(dir, 'out/kit.css'), 'utf8')}</style>
<div id="root" class="app"></div><script>window.PACK = ${JSON.stringify(model).replace(/</g, '\\u003c')};</script><script>${readFileSync(join(dir, 'out/kit.js'), 'utf8')}</script>`);
  url = pathToFileURL(join(dir, 'kit', 'index.html')).href;
  browser = await chromium.launch({ args: ['--mute-audio'] });
}, 60_000);

afterEach(async () => { for (const c of contexts.splice(0)) await c.close(); });
afterAll(async () => { await browser?.close(); });

// One interviewer's laptop at 4:58 PM in Los Angeles, with Copy recorded instead of reaching the clipboard.
async function laptop() {
  const c = await browser.newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US', viewport: { width: 1280, height: 900 } });
  contexts.push(c);
  const page = await c.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T16:58:00-07:00'));
  await page.addInitScript(() => { navigator.clipboard.writeText = async (text) => { window.copied = text; }; });
  await page.goto(url);
  await page.evaluate(() => window.ready);
  return page;
}

const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true }); };
const seenRefs = (page) => page.evaluate(() => [...window.kit.view.evidence().marks].filter(([, m]) => m.s === 'seen').map(([ref]) => ref));

async function start(page) {
  await page.getByLabel('Who are you meeting?').fill('Sam Lee');
  await page.getByRole('button', { name: 'Start interview' }).click();
  await page.waitForSelector('.session-header');
}

test('Pop out keeps the main window\'s lock: keys and marks work in the window, and a second tab stays read-only', async () => {
  const page = await laptop();
  await start(page);
  const [pip] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('button', { name: 'Pop out' }).click()]);
  await pip.setViewportSize({ width: 400, height: 700 });
  await pip.emulateMedia({ reducedMotion: 'reduce' });
  await pip.waitForSelector('.session-header');
  await pip.keyboard.press('j');
  await pip.keyboard.press('j');
  await page.waitForFunction(() => location.hash === '#/practical/review-a-teammate-s-pr');
  await pip.waitForSelector('main[data-route="#/practical/review-a-teammate-s-pr"]');
  await pip.keyboard.press('Digit1');
  await expect.poll(() => seenRefs(page)).toHaveLength(1);
  await pip.keyboard.press('Shift+Slash');
  expect(await pip.getByRole('heading', { name: 'Keyboard shortcuts' }).isVisible()).toBe(true);
  await shot(pip, 'popout-window');
  await pip.keyboard.press('Escape');

  const second = await page.context().newPage();
  await second.goto(url);
  await second.evaluate(() => window.ready);
  await second.getByRole('button', { name: 'Open' }).first().click();
  await second.waitForSelector('.session-header');
  expect([await second.locator('.store-status').innerText(), await pip.locator('.session-bar').isHidden()]).toEqual([`${READ_ONLY} Take over`, true]);
  await shot(second, 'popout-second-tab-read-only');

  await pip.close();
  await page.waitForSelector('#root .session-header');
  expect([await seenRefs(page), await page.locator('.popout-note').count()]).toEqual([await seenRefs(page), 0]);
  await page.keyboard.press('k');
  await page.waitForFunction(() => location.hash === '#/practical/intro');
}, 60_000);

test('the tab title shows the interview clock and the round', async () => {
  const page = await laptop();
  expect(await page.title()).toBe('Interview kit');
  await start(page);
  await expect.poll(() => page.title()).toBe('0:00 · Practical round');
}, 60_000);

test('Second opinion opens only after my decision, leaves my name and the candidate\'s out, and adds my notes when ticked', async () => {
  const page = await laptop();
  await start(page);
  await page.getByRole('link', { name: "Review a teammate's PR" }).click();
  await page.getByRole('textbox', { name: 'Notes' }).fill('Found tabbing only after the hint.');
  await page.getByRole('textbox', { name: 'Notes' }).blur();
  await page.getByRole('link', { name: 'Decide' }).click();
  expect(await page.getByText('Second opinion').count()).toBe(0);
  await page.getByRole('radio', { name: /^Hire/ }).check();
  await page.getByLabel('Level you would place them at').selectOption({ label: 'Mid' });
  await page.getByRole('textbox', { name: 'Reason' }).fill('Meets the bar.');
  await page.getByRole('button', { name: 'Record' }).click();
  await page.waitForSelector('.decide-recorded');
  await page.getByText('Second opinion', { exact: true }).click();
  const packet = page.getByRole('textbox', { name: 'Second opinion packet' });
  const without = await packet.inputValue();
  await page.getByRole('checkbox', { name: 'Include my notes (they may show my lean)' }).check();
  const withNotes = await packet.inputValue();
  await page.getByRole('button', { name: 'Copy the packet' }).click();
  await shot(page, 'second-opinion');
  expect([without.split('\n')[0], ['Sam Lee', 'Meets the bar', 'Hire'].filter((w) => withNotes.includes(w)),
    without.includes('Found tabbing'), withNotes.endsWith("Notes\n    Review a teammate's PR: Found tabbing only after the hint."),
    await page.evaluate(() => window.copied) === withNotes, await page.getByRole('button', { name: 'Copied' }).count()])
    .toEqual(['Please give a second opinion on how the candidate did in a job interview. The interviewers\' names, decisions and levels are left out, so your read is your own.',
      [], false, true, true, 1]);
}, 60_000);
