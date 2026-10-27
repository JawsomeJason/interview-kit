import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { build } from 'vite';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { loadPack } from '../../src/pack/load.js';
import highlight from '../../scripts/vite-highlight-plugin.js';

// The session's screens in a real browser, opened from disk as the built kit is. Each context is one interviewer's
// laptop; files pass between them the way Share my evidence and Add a colleague's evidence do.
// SHOTS=<dir> also saves a screenshot of each screen there.
const SHARE = 'This file holds your marks, notes and decision for Sam Lee. Send it straight to your colleague, not to a channel.';
const RECORDED = "Recorded at 4:58 PM. Colleagues' evidence and the second opinion open once they have decided too.";
const EVIL = '<img src=x onerror=alert(1)>';
const DIVS = 'review-a-pr#divs';
const dir = mkdtempSync(join(tmpdir(), 'ik-session-'));
const shots = process.env.SHOTS;
const contexts = [];
let browser;
let url;

beforeAll(async () => {
  const src = resolve('src');
  const { model } = await loadPack('test/fixtures/packs/sample-pack');
  writeFileSync(join(dir, 'entry.js'), `
import ${JSON.stringify(`${src}/style.css`)};
import ${JSON.stringify(`${src}/themes/system.css`)};
import ${JSON.stringify(`${src}/layouts/shell.css`)};
import { startSession } from ${JSON.stringify(`${src}/ui/session.js`)};
// A stand-in plugin: it fills two slots and keeps the Host so a test can drive the seam sync uses.
const probe = (api) => {
  window.host = api.host;
  window.heard = [];
  api.host.onAppend((ch, e) => window.heard.push(ch + ' ' + e.t));
  api.host.onNavigate((route, byUser) => window.heard.push('route ' + route + ' ' + byUser));
  api.slot('header.presence', (el) => { el.textContent = 'Presence goes here'; });
  api.slot('decide.recorded', (el, ctx) => { el.innerHTML = '<p class="probe-second">Second opinion for ' + ctx.unlocked.participants.length + '</p>'; });
};
window.ready = startSession(document.getElementById('root'), { pack: window.PACK, plugins: { probe }, stamp: { version: '1.0.0', sha: 'e6854f1' } }).then((kit) => { window.kit = kit; });`);
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

// One interviewer's laptop at 4:58 PM in Los Angeles, with every alert() recorded. `before` runs ahead of the kit.
async function laptop(before) {
  const c = await browser.newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US', viewport: { width: 1280, height: 900 } });
  contexts.push(c);
  const page = await c.newPage();
  page.alerts = [];
  page.on('dialog', (d) => { page.alerts.push(d.message()); d.dismiss(); });
  await page.clock.setFixedTime(new Date('2026-10-26T16:58:00-07:00'));
  if (before) await page.addInitScript(before);
  await page.goto(url);
  await page.evaluate(() => window.ready);
  return page;
}

const axe = async (page) => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze())
  .violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
const shot = async (page, name) => { if (shots) await page.screenshot({ path: join(shots, `${name}.png`), fullPage: true }); };
const log = (page, event) => page.evaluate((e) => window.kit.view.log(e), event);

async function start(page, candidate = 'Sam Lee') {
  await page.getByLabel('Who are you meeting?').fill(candidate);
  await page.getByRole('button', { name: 'Start interview' }).click();
  await page.waitForSelector('.session-header');
}

// Opens the exercise, then marks through the same api a kind's view uses.
async function mark(page, rows) {
  await page.getByRole('link', { name: "Review a teammate's PR" }).click();
  await page.waitForFunction(() => location.hash === '#/practical/review-a-teammate-s-pr');
  for (const [ref, s] of rows) {
    if (s === 'after-nudge') await log(page, { t: 'prompt', p: `${ref}~nudge.1` });
    await log(page, { t: 'mark', o: ref, d: await digestFor(page, ref), s: s === 'after-nudge' ? 'seen' : s });
  }
}

// The digest of a finding's text, read the way the core reads it: from the observables the kit derived.
const digestFor = (page, ref) => page.evaluate((r) => {
  const text = (window.PACK.libs.exercise[0].lookFor.find((b) => `review-a-pr#${b.pin}` === r) ?? {}).text;
  let h = 0x811c9dc5;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}, ref);

async function decide(page, choice, level, why) {
  await page.getByRole('link', { name: 'Decide' }).click();
  await page.getByRole('radio', { name: new RegExp(`^${choice}`) }).check();
  await page.getByLabel('Level you would place them at').selectOption({ label: level });
  await page.getByRole('textbox', { name: 'Reason' }).fill(why);
  await page.getByRole('button', { name: 'Record' }).click();
  await page.waitForSelector('.decide-recorded');
}

async function share(page, name, path) {
  await page.getByRole('button', { name: 'Share my evidence' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share my evidence' });
  const text = await dialog.locator('.evidence-dialog-what').innerText();
  if (name) await dialog.getByLabel('Your name, so colleagues know whose evidence this is').fill(name);
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Save the file' }).click()]);
  await download.saveAs(path);
  return text;
}

const addFile = async (page, path) => {
  await page.locator('.evidence-add-input').setInputFiles(path);
  await page.waitForFunction(() => document.querySelector('.evidence-status')?.textContent);
  return page.locator('.evidence-status').innerText();
};

test('setup shows the Saving check, starts an interview, and lists it under Recent interviews with a date', async () => {
  const page = await laptop();
  expect(await page.locator('.start-saving').innerText()).toMatch(/^Notes save on this laptop\./);
  await shot(page, '01-setup');
  expect(await axe(page)).toEqual([]);
  await start(page);
  expect(await page.locator('.session-candidate').innerText()).toBe('Sam Lee');
  await page.locator('.session-menu summary').click();
  await page.getByRole('button', { name: 'New interview' }).click();
  await page.waitForSelector('.start');
  expect(await page.locator('.session-list-item').innerText()).toMatch(/^Sam Lee\s+Mon, Oct 26, 4:58 PM\s+Open\s+Delete from this laptop$/);
  await page.getByRole('button', { name: 'Delete from this laptop' }).click();
  expect(await page.getByRole('alert').innerText()).toBe('Delete Sam Lee from this laptop? Colleagues keep what they received.');
  await shot(page, '02-delete-confirm');
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await page.locator('.session-list-item').count()).toBe(1);
}, 60_000);

test('Decide shows the role options with meanings and none picked, then the exact Recorded at line', async () => {
  const page = await laptop();
  await start(page);
  await mark(page, [[DIVS, 'seen']]);
  await shot(page, '03-segment');
  await page.getByRole('link', { name: 'Decide' }).click();
  const options = await page.locator('.decide-option').evaluateAll((els) => els.map((el) => [el.querySelector('b').textContent, el.querySelector('.decide-means').textContent, el.querySelector('input').checked]));
  expect(options).toEqual([
    ['Hire', 'The evidence meets the bar for the hiring level, and nothing I saw worries me.', false],
    ['No hire', 'The evidence does not meet the bar for the hiring level, or something I saw worries me. Say which in your reason.', false],
  ]);
  expect(await page.getByLabel('Level you would place them at').evaluate((s) => [s.selectedOptions[0].text, [...s.options].map((o) => o.text)])).toEqual(['Not sure', ['Not sure', 'Junior', 'Mid', 'Senior']]);
  expect(await page.locator('.summary-row.is-seen').innerText()).toBe('Seen: Plus and minus are divs, not buttons. No focus, no role, and the glyph is the name.');
  await shot(page, '04-decide');
  expect(await axe(page)).toEqual([]);
  await decide(page, 'Hire', 'Mid', 'Meets the bar.');
  expect(await page.locator('.decide-recorded').innerText()).toBe(RECORDED);
  await shot(page, '05-recorded');
}, 60_000);

test('two logs exchanged as files merge only after both decide, differs rows first, each column at its Evaluating at level', async () => {
  const jason = await laptop();
  const alex = await laptop();
  await start(jason);
  await mark(jason, [[DIVS, 'after-nudge'], ['review-a-pr#error-link', 'seen']]);
  await start(alex);
  await log(alex, { t: 'focus', level: 'senior' });
  await mark(alex, [[DIVS, 'seen'], ['review-a-pr#error-link', 'unseen']]);

  await alex.getByRole('link', { name: 'Decide' }).click();
  expect(await share(alex, 'Alex', join(dir, 'alex-early.json'))).toBe("You haven't decided yet, so this file holds the plan for Sam Lee but not your marks or notes. Record your decision to include them.");
  await decide(jason, 'Hire', 'Mid', 'Meets the bar.');
  expect(await share(jason, 'Jason', join(dir, 'jason.json'))).toBe(SHARE);
  expect(await addFile(jason, join(dir, 'alex-early.json'))).toBe("Added Alex's evidence. It opens once you have both decided.");
  expect(await jason.locator('.decide-others').innerText()).toBe("Alex hasn't yet.");
  await jason.getByRole('link', { name: 'Debrief' }).click();
  expect(await jason.locator('.debrief-wait').innerText()).toMatch(/^Nobody else's evidence is here yet\./);

  await decide(alex, 'No hire', 'Junior', 'Missed the error link.');
  await shot(alex, '06-share-before');
  expect(await share(alex, '', join(dir, 'alex.json'))).toBe(SHARE);
  await jason.getByRole('link', { name: 'Your decision' }).click();
  expect(await addFile(jason, join(dir, 'alex.json'))).toBe("Added Alex's evidence.");
  expect(await jason.locator('.decide-others').innerText()).toBe('Alex has decided.');
  await jason.getByRole('link', { name: 'Open the debrief' }).click();
  await jason.waitForSelector('.debrief-table');
  expect(await jason.locator('.debrief-table thead th').allInnerTexts()).toEqual(['What to look for', 'Jason\nevaluated at Mid', 'Alex\nevaluated at Senior']);
  const rows = await jason.locator('.debrief-table tbody tr').evaluateAll((trs) => trs.map((tr) => [tr.classList.contains('is-differs'), ...[...tr.querySelectorAll('td')].map((td) => td.textContent.trim())]));
  expect(rows.slice(0, 2)).toEqual([[true, 'Seen after nudge 1', 'Seen'], [true, 'Seen', 'Not seen']]);
  expect(rows.slice(2).every(([differs]) => !differs)).toBe(true);
  await shot(jason, '07-debrief');
  expect(await axe(jason)).toEqual([]);
  const scrub = jason.getByLabel('Replay up to');
  await scrub.press('Home');
  expect(await jason.locator('.debrief-table tbody tr').count()).toBe(0);
  // Both laptops ran on one frozen clock, so the two opens share a stamp and either may come first.
  expect(await jason.locator('.debrief-event:not(.is-later)').allInnerTexts()).toEqual([expect.stringMatching(/^4:58 PM (Jason|Alex) opened the interview$/)]);
  await scrub.press('End');
  expect(await jason.locator('.debrief-table tbody tr').count()).toBe(rows.length);
  await scrub.press('PageDown');
  await shot(jason, '08-timeline');

  await alex.getByRole('link', { name: 'Your decision' }).click();
  expect(await addFile(alex, join(dir, 'jason.json'))).toBe("Added Jason's evidence.");
  await alex.getByRole('link', { name: 'Open the debrief' }).click();
  expect(await alex.locator('.debrief-table thead th').allInnerTexts()).toEqual(['What to look for', 'Alex\nevaluated at Senior', 'Jason\nevaluated at Mid']);
}, 90_000);

test('names, the candidate, passions, notes and reasons render as text on every screen, never as elements', async () => {
  const pages = [await laptop(), await laptop()];
  for (const page of pages) {
    await page.evaluate(() => {
      window.made = [];
      new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
        if (n.nodeType === 1 && (n.matches('img') || n.querySelector('img'))) window.made.push(n.outerHTML.slice(0, 80));
      }))).observe(document, { subtree: true, childList: true });
    });
  }
  const [jason, alex] = pages;
  for (const [page, file] of [[alex, 'evil-alex.json'], [jason, 'evil-jason.json']]) {
    await start(page, EVIL);
    await log(page, { t: 'member', k: 'session.passions', id: 'x-evil', v: EVIL });
    await mark(page, [[DIVS, 'seen']]);
    await log(page, { t: 'note', scope: 'review-a-pr', text: EVIL });
    await decide(page, 'Hire', 'Mid', EVIL);
    expect(await share(page, EVIL, join(dir, file))).toBe(SHARE.replace('Sam Lee', EVIL));
  }
  expect(await jason.locator('.session-candidate').innerText()).toBe(EVIL);
  expect(await jason.locator('.summary-passions').innerText()).toBe(`Says they specialize in: ${EVIL}`);
  expect(await jason.locator('.decide-mine').innerText()).toBe(`Hire, at Mid. ${EVIL}`);
  await addFile(jason, join(dir, 'evil-alex.json'));
  await jason.getByRole('link', { name: 'Open the debrief' }).click();
  await jason.waitForSelector('.debrief-table');
  expect(await jason.locator('.debrief-table thead th').allInnerTexts()).toEqual(['What to look for', `${EVIL}\nevaluated at Mid`, `${EVIL}\nevaluated at Mid`]);
  expect(await jason.locator('.debrief-notes li').allInnerTexts()).toEqual([`${EVIL}: ${EVIL}`, `${EVIL}: ${EVIL}`]);
  expect(await jason.locator('.debrief-why').allInnerTexts()).toEqual([EVIL, EVIL]);
  await jason.getByLabel('Replay up to').press('Home');
  await shot(jason, '09-escaped');
  await jason.locator('.session-menu summary').click();
  await jason.getByRole('button', { name: 'New interview' }).click();
  await jason.waitForSelector('.start');
  expect(await jason.locator('.session-list-name').allInnerTexts()).toEqual([EVIL]);
  for (const page of pages) expect([await page.evaluate(() => window.made), page.alerts]).toEqual([[], []]);
}, 90_000);

test('the Saving check passes when the browser keeps storage, and fails and blocks Start when it refuses', async () => {
  const kept = await laptop(() => { navigator.storage.persist = async () => true; });
  expect(await kept.locator('.start-saving').innerText()).toBe('Notes save on this laptop.');
  const refused = await laptop(() => { indexedDB.open = () => { throw new DOMException('The user denied permission to access the database.', 'SecurityError'); }; });
  await refused.waitForFunction(() => !document.querySelector('.start-saving').textContent.startsWith('Checking'));
  expect(await refused.locator('.start-saving').innerText()).toBe("This browser won't save notes, often because of a private window. Open the kit in a normal window before the interview.");
  expect(await refused.getByRole('button', { name: 'Start interview' }).isDisabled()).toBe(true);
  await shot(refused, '10-saving-refused');
}, 60_000);

test('plugins fill their slots, the second opinion slot opens only after my decision, and the Host applies the gate', async () => {
  const page = await laptop();
  await start(page);
  expect(await page.locator('[data-slot="header.presence"]').innerText()).toBe('Presence goes here');
  const me = await page.evaluate(() => window.host.me());
  expect(me).toMatchObject({ name: undefined, pack: { id: 'pack-6f39cc38', version: '1.0.0', sha: 'e6854f1' }, role: 'frontend-engineer', round: 'practical' });
  await mark(page, [[DIVS, 'seen']]);
  expect(await page.evaluate(() => window.heard)).toEqual(['pub open', 'pub put', 'pub put', 'route #/practical/before-the-call false',
    'route #/practical/review-a-teammate-s-pr true', 'pub member', 'prv mark']);
  expect(await page.evaluate((a) => [window.host.vector('a-alex'), window.host.serve({ author: a, ch: 'prv', since: 0 }, 'a-alex')], me.author))
    .toEqual([{ [me.author]: { pub: 4 } }, { deny: 'not-decided' }]);
  expect(await page.evaluate(() => window.host.receive('a-alex', 'pub', [{ n: 3, h: '0194c0de1000.0000', t: 'decided' }]))).toEqual({ gapFrom: 0 });
  await page.getByRole('link', { name: 'Decide' }).click();
  expect(await page.locator('.probe-second').count()).toBe(0);
  await decide(page, 'Hire', 'Mid', 'Meets the bar.');
  expect(await page.locator('.probe-second').innerText()).toBe('Second opinion for 1');
  expect(await page.evaluate((a) => window.host.serve({ author: a, ch: 'prv', since: 0 }, 'a-alex'), me.author)).toEqual({ deny: 'peer-not-decided' });
}, 60_000);

test('j and k step through the run of show, a number key marks a row and focus stays on it, and ? lists the keys', async () => {
  const page = await laptop();
  await start(page);
  expect(await page.evaluate(() => location.hash)).toBe('#/practical/before-the-call');
  const step = async (key, hash) => { await page.keyboard.press(key); await page.waitForFunction((h) => document.querySelector('main').dataset.route === h, hash); };
  await step('j', '#/practical/intro');
  await step('j', '#/practical/review-a-teammate-s-pr');
  await step('k', '#/practical/intro');
  await step('j', '#/practical/review-a-teammate-s-pr');
  const control = page.locator('.assess-row').filter({ has: page.locator('.assess-key', { hasText: /^1$/ }) }).locator('.option-row-control');
  await control.focus();
  const ref = await control.evaluate((el) => el.closest('.assess-row').dataset.ref);
  await page.keyboard.press('Digit1');
  await expect.poll(() => control.isChecked()).toBe(true);
  expect(await page.evaluate(() => [document.activeElement.closest('.assess-row')?.dataset.ref, document.activeElement.matches('.option-row-control')])).toEqual([ref, true]);
  expect(await page.evaluate((r) => window.kit.view.evidence().marks.get(r)?.s, ref)).toBe('seen');
  expect(await page.locator('.session-run-link[aria-current="page"]').innerText()).toBe("Review a teammate's PR 35 min");
  await page.keyboard.press('Shift+Slash');
  expect(await page.getByRole('heading', { name: 'Keyboard shortcuts' }).isVisible()).toBe(true);
  await shot(page, '11-keys');
}, 60_000);
