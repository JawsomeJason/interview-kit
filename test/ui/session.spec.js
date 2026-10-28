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
const RECORDED = "Recorded at 4:58 PM. Colleagues' evidence opens once they have decided too.";
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
import shortcuts from ${JSON.stringify(`${src}/plugins/shortcuts/index.js`)};
// A stand-in plugin: it fills two slots and keeps the Host so a test can drive the seam sync uses.
const probe = (api) => {
  window.host = api.host;
  window.heard = [];
  api.host.onAppend((ch, e) => window.heard.push(ch + ' ' + e.t));
  api.host.onNavigate((route, byUser) => window.heard.push('route ' + route + ' ' + byUser));
  api.slot('header.presence', (el) => { el.textContent = 'Presence goes here'; });
  api.slot('decide.recorded', (el, ctx) => { el.innerHTML = '<p class="probe-second">Second opinion for ' + ctx.unlocked.participants.length + '</p>'; });
};
window.ready = startSession(document.getElementById('root'), { pack: window.PACK, plugins: { probe, shortcuts }, stamp: { version: '1.0.0', sha: 'e6854f1' } }).then((kit) => { window.kit = kit; });`);
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
  expect(await page.locator('.undo-toast').evaluate((el) => [el.textContent, getComputedStyle(el).position, getComputedStyle(el).right, getComputedStyle(el).borderStyle]))
    .toEqual(['Started a new interview. Undo', 'fixed', '16px', 'solid']);
  await page.locator('.undo-toast').evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await shot(page, '01b-undo');
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

test("Add a colleague's evidence refuses another candidate's file, and a file from another session leaves my candidate and plan alone", async () => {
  const [jason, alex, bea] = [await laptop(), await laptop(), await laptop()];
  await start(jason, 'Alex Kim');
  await start(alex, 'Sam Lee');
  await start(bea, 'alex kim');
  await log(bea, { t: 'member', k: 'session.passions', id: 'x-go', v: 'Go' });
  for (const [page, name] of [[alex, 'Alex'], [bea, 'Bea']]) {
    await page.getByRole('link', { name: 'Decide' }).click();
    await share(page, name, join(dir, `${name}-other.json`));
  }
  await jason.getByRole('link', { name: 'Decide' }).click();
  expect(await addFile(jason, join(dir, 'Alex-other.json'))).toBe('This file is for Sam Lee; this interview is with Alex Kim.');
  expect(await addFile(jason, join(dir, 'Bea-other.json'))).toBe("Added Bea's evidence. It opens once you have both decided.");
  expect([await jason.locator('.session-candidate').innerText(), await jason.locator('.summary-passions').count()]).toEqual(['Alex Kim', 0]);
}, 60_000);

test("a colleague's events arriving on Decide keep the choice, level and reason I was typing, an open Change my decision and focus", async () => {
  const page = await laptop();
  await start(page);
  const me = await page.evaluate(() => window.host.me());
  const bea = [{ t: 'open', v: 2, sid: me.sid, author: 'a-bea', role: me.role, round: me.round, pack: me.pack }, { t: 'name', name: 'Bea' }, { t: 'decided' }]
    .map((e, n) => ({ n, h: `0194c0de100${n}.0000`, ...e }));
  const receive = (events) => page.evaluate((es) => window.host.receive('a-bea', 'pub', es), events);
  const form = () => page.evaluate(() => {
    const f = document.querySelector('.decide-form');
    const a = document.activeElement;
    return [document.querySelector('.decide-change')?.open ?? null, f.choice.value, f.level.value, f.why.value, a.name, a.selectionStart, document.querySelector('.decide-others').textContent];
  });
  await page.getByRole('link', { name: 'Decide' }).click();
  await page.getByRole('radio', { name: /^Hire/ }).check();
  await page.getByLabel('Level you would place them at').selectOption({ label: 'Mid' });
  await page.getByRole('textbox', { name: 'Reason' }).fill('Strong on aria, weak on');
  await receive(bea.slice(0, 2));
  expect(await form()).toEqual([null, 'hire', 'mid', 'Strong on aria, weak on', 'why', 23, "Bea hasn't yet."]);

  await page.getByRole('textbox', { name: 'Reason' }).fill('Strong on aria.');
  await page.getByRole('button', { name: 'Record' }).click();
  await page.waitForSelector('.decide-recorded');
  expect(await form()).toEqual([false, '', '', '', undefined, undefined, "Bea hasn't yet."]);
  await page.getByText('Change my decision').click();
  await page.getByRole('radio', { name: /^No hire/ }).check();
  await page.getByRole('textbox', { name: 'Reason' }).fill('On reflection');
  await receive(bea.slice(2));
  expect(await form()).toEqual([true, 'no-hire', '', 'On reflection', 'why', 13, 'Bea has decided.']);
  expect(await page.getByRole('link', { name: 'Open the debrief' }).count()).toBe(1);

  await page.getByRole('link', { name: 'Open the debrief' }).click();
  await page.waitForSelector('.debrief-scrub');
  await page.getByLabel('Replay up to').press('Home');
  await receive([{ n: 3, h: '0194c0de1003.0000', t: 'name', name: 'Bea Bell' }]);
  expect(await page.evaluate(() => [document.activeElement.className, document.activeElement.value, document.querySelector('.debrief-at').textContent,
    document.querySelectorAll('.debrief-event:not(.is-later)').length])).toEqual(['debrief-scrub', '0', '1:36 AM', 1]);
}, 60_000);

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
  await jason.getByRole('link', { name: 'Deep dive' }).click();
  await jason.waitForSelector('.picker');
  expect(await jason.locator('.picker').innerText()).toContain(EVIL);
  await jason.getByRole('link', { name: 'Your decision' }).click();
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

test('a page served over plain http, with no Web Locks, says in the Saving check how to open the kit and keeps Start off', async () => {
  const page = await laptop(() => { Object.defineProperty(Navigator.prototype, 'locks', { get: () => undefined, configurable: true }); });
  await page.waitForFunction(() => !document.querySelector('.start-saving').textContent.startsWith('Checking'));
  expect([await page.locator('.start-saving').innerText(), await page.getByRole('button', { name: 'Start interview' }).isDisabled(), page.alerts])
    .toEqual(["Notes can't save on a page served over plain http. Open the kit from an https:// address, localhost or a file on this laptop.", true, []]);
}, 60_000);

test("the interview version 0.10 left in this browser is offered once as text, then deleted, since this version can't open it", async () => {
  const page = await laptop(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('interview-kit', JSON.stringify({ candidate: 'Sam Lee', notes: { 'css-01': 'Centered with grid.', 'html-02': '' }, ticks: { 'css-01': [0] }, done: [] }));
    }
    navigator.clipboard.writeText = async (text) => { window.copied = text; };
  });
  expect(await page.locator('.old-interview').innerText())
    .toBe("This browser still holds an interview with Sam Lee from version 0.10 of the kit, which this version can't open. Copy its notes if you need them, then delete it.");
  await page.getByRole('button', { name: 'Copy its notes' }).click();
  await expect.poll(() => page.evaluate(() => window.copied)).toBe('Interview with Sam Lee, from version 0.10 of the kit\ncss-01: Centered with grid.');
  await page.getByRole('button', { name: 'Delete it' }).click();
  expect([await page.locator('.old-interview').count(), await page.evaluate(() => localStorage.getItem('interview-kit'))]).toEqual([0, null]);
  await page.reload();
  await page.evaluate(() => window.ready);
  expect(await page.locator('.old-interview').count()).toBe(0);
}, 60_000);

test('plugins fill their slots, the second opinion slot opens only after my decision, and the Host applies the gate', async () => {
  const page = await laptop();
  await start(page);
  expect(await page.locator('[data-slot="header.presence"]').innerText()).toBe('Presence goes here');
  const me = await page.evaluate(() => window.host.me());
  expect(me).toMatchObject({ name: undefined, pack: { id: 'pack-6f39cc38', version: '1.0.0', sha: 'e6854f1' }, role: 'frontend-engineer', round: 'practical' });
  await mark(page, [[DIVS, 'seen']]);
  // Events reach the probe once they are on disk, so they and the routes keep their own order.
  await page.waitForFunction(() => window.heard.includes('prv mark'));
  const heard = await page.evaluate(() => window.heard);
  expect([heard.filter((h) => !h.startsWith('route')), heard.filter((h) => h.startsWith('route'))]).toEqual([['pub open', 'pub put', 'pub put', 'pub member', 'prv mark'],
    ['route #/practical/before-the-call false', 'route #/practical/review-a-teammate-s-pr true']]);
  expect(await page.evaluate((a) => [window.host.vector('a-alex'), window.host.serve({ author: a, ch: 'prv', since: 0 }, 'a-alex')], me.author))
    .toEqual([{ [me.author]: { pub: 4 } }, { deny: 'not-decided' }]);
  expect(await page.evaluate(() => window.host.receive('a-alex', 'pub', [{ n: 3, h: '0194c0de1000.0000', t: 'decided' }]))).toEqual({ gapFrom: 0 });
  await page.getByRole('link', { name: 'Decide' }).click();
  expect(await page.locator('.probe-second').count()).toBe(0);
  await decide(page, 'Hire', 'Mid', 'Meets the bar.');
  expect(await page.locator('.probe-second').innerText()).toBe('Second opinion for 1');
  expect(await page.evaluate((a) => window.host.serve({ author: a, ch: 'prv', since: 0 }, 'a-alex'), me.author)).toEqual({ deny: 'peer-not-decided' });
}, 60_000);

test('sync hears of an event once it is on disk, so a mark the browser could not save yet is not sent until it is', async () => {
  const page = await laptop();
  await start(page);
  await page.waitForFunction(() => window.heard.includes('route #/practical/before-the-call false'));
  // A full disk, played the way it arrives: the request is accepted and its transaction then aborts.
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    window.unbreak = () => { IDBObjectStore.prototype.add = add; };
    IDBObjectStore.prototype.add = function (...args) { const r = add.apply(this, args); this.transaction.abort(); return r; };
  });
  await mark(page, [[DIVS, 'seen']]);
  await page.waitForTimeout(500);
  expect((await page.evaluate(() => window.heard)).filter((h) => !h.startsWith('route'))).toEqual(['pub open', 'pub put', 'pub put']);
  await page.evaluate(() => unbreak());
  await page.waitForFunction(() => window.heard.includes('prv mark'), null, { timeout: 15_000 });
  expect((await page.evaluate(() => window.heard)).filter((h) => !h.startsWith('route'))).toEqual(['pub open', 'pub put', 'pub put', 'pub member', 'prv mark']);
}, 60_000);

// A second window on this laptop's interview, opened from Recent interviews: read-only while the first one writes.
async function secondWindow(first) {
  const page = await first.context().newPage();
  await page.goto(url);
  await page.evaluate(() => window.ready);
  await page.getByRole('button', { name: 'Open' }).click();
  await page.waitForSelector('.session-header');
  await expect.poll(() => barText(page)).toBe('This interview is open in another window. Record there, or take over here. Take over');
  return page;
}
const barText = (page) => page.evaluate(() => { const b = document.querySelector('.session-bar'); return b.hidden ? '' : b.textContent.trim(); });
const note = (page, scope, text) => log(page, { t: 'note', scope, text });
const notes = (page) => page.evaluate(() => Object.fromEntries(window.kit.view.evidence().notes));
const saved = (page, count) => page.waitForFunction((n) => window.heard.filter((h) => h === 'prv note').length === n, count);

for (const how of ['takes over', 'is left open when the first window closes']) {
  test(`a read-only window that ${how} records after everything the first window wrote, and keeps it through a reload`, async () => {
    const first = await laptop();
    await start(first);
    await note(first, 'one', 'one');
    const second = await secondWindow(first);
    await note(first, 'two', 'two');
    await note(first, 'three', 'three');
    await saved(first, 3);
    if (how === 'takes over') await second.getByRole('button', { name: 'Take over' }).click();
    else await first.close();
    await expect.poll(() => barText(second)).toBe('');
    expect(await notes(second)).toEqual({ one: 'one', two: 'two', three: 'three' });
    expect(await note(second, 'four', 'four')).toBe(true);
    await saved(second, 1);
    expect(await barText(second)).toBe('');
    await second.reload();
    await second.evaluate(() => window.ready);
    expect(await notes(second)).toEqual({ one: 'one', two: 'two', three: 'three', four: 'four' });
  }, 60_000);
}

test('a change another window already wrote at the same place is taken back off the page, and the bar says it was not saved', async () => {
  const page = await laptop();
  await start(page);
  await page.evaluate(() => new Promise((ok) => {
    const { sid, author } = window.host.me();
    indexedDB.open(`interview-kit:${window.PACK.id}`).onsuccess = ({ target }) => {
      const tx = target.result.transaction('events', 'readwrite');
      tx.objectStore('events').add({ n: 0, h: '0194c0de1000.0000', t: 'note', scope: 'elsewhere', text: 'other window' }, [sid, author, 'prv', 0]);
      tx.oncomplete = ok;
    };
  }));
  expect(await note(page, 'here', 'mine')).toBe(true);
  await expect.poll(() => barText(page)).toBe('This interview changed in another window at the same moment, so your last change was not saved. Reload to carry on.');
  expect([await notes(page), await note(page, 'here', 'again')]).toEqual([{}, false]);
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

test('a run-of-show link clicked straight after typing a note opens on that click, and the note is kept', async () => {
  const page = await laptop();
  await start(page);
  await page.getByRole('link', { name: "Review a teammate's PR" }).click();
  await page.getByRole('textbox', { name: 'Notes' }).fill('Found tabbing only after the hint.');
  await page.getByRole('link', { name: 'Decide' }).click();
  await expect.poll(() => page.evaluate(() => location.hash), { timeout: 2000 }).toBe('#/decide');
  expect(await page.evaluate(() => Object.fromEntries(window.kit.view.evidence().notes))).toEqual({ 'review-a-pr': 'Found tabbing only after the hint.' });
}, 60_000);

for (const leave of ['reload', 'hide the tab']) {
  test(`a note typed just before you ${leave} is kept, without waiting for the pause that saves it`, async () => {
    const page = await laptop();
    await start(page);
    await page.getByRole('link', { name: "Review a teammate's PR" }).click();
    await page.getByRole('textbox', { name: 'Notes' }).fill('Found tabbing only after the hint.');
    if (leave === 'reload') {
      await page.reload();
      await page.evaluate(() => window.ready);
    } else {
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }
    expect(await notes(page)).toEqual({ 'review-a-pr': 'Found tabbing only after the hint.' });
  }, 60_000);
}

test('More in Help in a help popup opens that Help entry, and setup links to What\'s new and Help', async () => {
  const page = await laptop();
  expect(await page.locator('.start').getByRole('link').allInnerTexts()).toEqual(expect.arrayContaining(["What's new ●", 'Help']));
  await page.locator('.start').getByRole('link', { name: 'Help' }).click();
  await page.waitForSelector('.help');
  await shot(page, '12-help-from-setup');
  await page.getByRole('link', { name: 'Back to setup' }).click();
  await page.waitForSelector('.start');
  await page.getByRole('link', { name: /^What's new/ }).click();
  expect(await page.locator('.whats-new h1').innerText()).toBe("What's new");
  await page.getByRole('link', { name: 'Back to setup' }).click();
  await start(page);
  await page.getByRole('link', { name: 'Deep dive' }).click();
  await page.getByRole('button', { name: 'How does the kit choose questions?' }).click();
  await page.getByRole('link', { name: 'More in Help' }).click();
  await page.waitForFunction(() => location.hash === '#/help/pick');
  await page.waitForSelector('#faq-pick');
  expect(await page.evaluate(() => [document.activeElement.id, document.querySelector('.session-nav') !== null])).toEqual(['faq-pick', true]);
  await shot(page, '13-help-entry-in-session');
}, 60_000);

test("Menu's Colors picks Light, Dark or Auto, and the pick outlives a reload", async () => {
  const page = await laptop();
  await start(page);
  await page.locator('.session-menu summary').click();
  const colors = page.getByRole('group', { name: 'Color scheme' });
  const pressed = async () => (await colors.waitFor(), colors.getByRole('button').evaluateAll((bs) => bs.map((b) => `${b.getAttribute('aria-label')} ${b.getAttribute('aria-pressed')}`)));
  expect(await pressed()).toEqual(['Light false', 'Dark false', 'Auto true']);
  await colors.getByRole('button', { name: 'Dark' }).click();
  expect([await page.evaluate(() => document.documentElement.style.colorScheme), await pressed()]).toEqual(['dark', ['Light false', 'Dark true', 'Auto false']]);
  await shot(page, '14-colors-dark');
  expect(await axe(page)).toEqual([]);
  await page.reload();
  await page.evaluate(() => window.ready);
  await page.locator('.session-menu summary').click();
  expect([await page.evaluate(() => document.documentElement.style.colorScheme), await pressed()]).toEqual(['dark', ['Light false', 'Dark true', 'Auto false']]);
  await colors.getByRole('button', { name: 'Auto' }).click();
  expect(await page.evaluate(() => [document.documentElement.style.colorScheme, JSON.parse(localStorage.getItem('interview-kit-layout')).scheme])).toEqual(['light dark', 'auto']);
}, 60_000);

test('setup picks when the interview starts: Now, a quarter hour ahead, or another time a day back to a week ahead, and the clock counts down to it', async () => {
  const page = await laptop();
  const group = page.getByRole('group', { name: 'When does it start?' });
  expect(await group.getByRole('radio').evaluateAll((rs) => rs.map((r) => `${r.closest('label').innerText.replace(/\s+/g, ' ').trim()}${r.checked ? ' ✓' : ''}`)))
    .toEqual(['Now ✓', '5:00 PM in 2 min', '5:15 PM in 17 min', '5:30 PM in 32 min', '5:45 PM in 47 min', 'Other time…']);
  await group.getByRole('radio', { name: 'Other time…' }).check();
  const other = page.getByLabel('Start date and time');
  expect(await other.evaluate((el) => [el.value, el.min, el.max])).toEqual(['2026-10-26T17:00', '2026-10-25T16:58', '2026-11-02T16:58']);
  await other.fill('2026-11-03T09:00');
  await page.getByLabel('Who are you meeting?').fill('Sam Lee');
  await page.getByRole('button', { name: 'Start interview' }).click();
  expect([await other.evaluate((el) => el.validationMessage), await page.locator('.session-header').count()]).toEqual(['Pick a start time from a day ago to a week ahead.', 0]);
  await shot(page, '15-start-other');
  await group.getByRole('radio', { name: /5:15 PM/ }).check();
  await shot(page, '16-start-slot');
  expect(await axe(page)).toEqual([]);
  await page.getByRole('button', { name: 'Start interview' }).click();
  await page.waitForSelector('.session-header');
  expect([await page.locator('.session-clock').innerText(), await page.evaluate(() => window.kit.view.plan().startedAt)])
    .toEqual(['−17:00', new Date('2026-10-26T17:15:00-07:00').getTime()]);
}, 60_000);

test('the time meter under the run of show adds up the minutes against the round, and warns once the plan runs over', async () => {
  const page = await laptop();
  await start(page);
  const meter = () => page.locator('.session-nav').evaluate((nav) => [nav.querySelector('.session-run-total').textContent,
    nav.querySelector('.session-run-total').classList.contains('is-over'), nav.querySelector('meter').value, nav.querySelector('meter').max, nav.querySelector('meter').getAttribute('aria-label')]);
  expect(await meter()).toEqual(['60 of 60 min', false, 60, 60, 'Planned minutes']);
  await log(page, { t: 'put', k: 'segment.minutes', seg: 'practical/deep-dive', v: 20 });
  expect(await meter()).toEqual(['70 of 60 min · 10 over', true, 70, 70, 'Planned minutes']);
  await shot(page, '17-time-meter-over');
  await page.locator('.session-nav').getByRole('button', { name: 'Why is there a time meter?' }).click();
  await page.getByRole('link', { name: 'More in Help' }).click();
  await page.waitForSelector('#faq-time-meter');
  expect(await page.evaluate(() => document.activeElement.id)).toBe('faq-time-meter');
}, 60_000);

test('All questions browses every pack question by pool; Enter opens one to look at, which joins the plan as asked only once you record on it, and Escape clears, then closes and hands focus back', async () => {
  const page = await laptop();
  await start(page);
  await log(page, { t: 'member', k: 'session.passions', id: 'x-rust', v: 'Rust' });
  await page.getByRole('link', { name: 'Deep dive' }).click();
  await page.waitForSelector('.picker');
  expect(await page.locator('.picker-passions .picker-note').innerText()).toBe('No questions for this one.');
  const browse = page.getByRole('button', { name: 'Browse all questions' });
  await browse.click();
  const dialog = page.getByRole('dialog', { name: 'All questions' });
  const box = dialog.getByRole('combobox', { name: 'Search questions by title or pool' });
  const options = () => dialog.locator('.question-search-option:not([hidden])').evaluateAll((os) => os.map((o) => `${o.querySelector('.question-search-name').textContent} | ${o.querySelector('.question-search-tag').textContent}`));
  expect([await dialog.locator('.question-search-pool').allInnerTexts(), await options(), await box.evaluate((el) => el === document.activeElement)])
    .toEqual([['CSS AND LAYOUT', 'HTML AND ACCESSIBILITY'], ['Menu cut off by its card | 8 min', 'Button or link? | 5 min'], true]);
  // The dialog fades in; axe reads contrast once it has.
  await dialog.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await shot(page, '18-all-questions');
  expect(await axe(page)).toEqual([]);
  await box.fill('html');
  expect([await options(), await dialog.locator('.question-search-count').innerText()]).toEqual([['Button or link? | 5 min'], '1 question']);
  await shot(page, '19-all-questions-search');
  await box.press('Escape');
  expect([await box.inputValue(), (await options()).length, await dialog.isVisible()]).toEqual(['', 2, true]);
  await box.press('Escape');
  await expect.poll(() => dialog.isVisible()).toBe(false);
  expect(await browse.evaluate((el) => el === document.activeElement)).toBe(true);
  await browse.click();
  await box.press('ArrowDown');
  await box.press('Enter');
  await page.waitForFunction(() => document.querySelector('main').dataset.route === '#/practical/deep-dive/html-01');
  await expect.poll(() => dialog.isVisible()).toBe(false);
  const plan = async () => [await page.locator('.session-run-items').allInnerTexts(), await page.evaluate(() => window.kit.view.plan().segments['practical/deep-dive']?.asked ?? null)];
  expect(await plan()).toEqual([[], null]);
  await page.getByRole('link', { name: 'Deep dive' }).click();
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('main').dataset.route === '#/practical/deep-dive/html-01');
  expect(await plan()).toEqual([[], null]);
  await page.keyboard.press('Digit1');
  expect(await plan()).toEqual([['Button or link?'], ['html-01']]);
  await browse.click();
  expect(await options()).toEqual(['Menu cut off by its card | 8 min', 'Button or link? | 5 min · in plan']);
}, 60_000);

test('Your hour lays out the round at clock times from the start picked, leaves out 0-minute parts, names the day when it is not today, and says when it ends', async () => {
  const page = await laptop();
  const hour = page.getByRole('region', { name: 'Your hour' });
  const read = () => hour.evaluate((el) => [el.querySelector('.start-plan-day')?.textContent ?? '',
    [...el.querySelectorAll('.start-plan-step')].map((s) => [...s.children].map((c) => c.textContent).join(' | ')),
    el.querySelector('.start-plan-end')?.textContent ?? el.querySelector('.start-plan-wait')?.textContent]);
  expect(await read()).toEqual(['', ['4:58 PM | Intro | 5 min', "5:03 PM | Review a teammate's PR | 35 min",
    '5:38 PM | Deep dive | 10 min', '5:48 PM | Wrap-up | 10 min'], 'Ends at 5:58 PM']);
  await shot(page, '23-your-hour');
  await page.getByRole('radio', { name: /5:15 PM/ }).check();
  expect((await read())[2]).toBe('Ends at 6:15 PM');
  await page.getByRole('radio', { name: 'Other time…' }).check();
  await page.getByLabel('Start date and time').fill('2026-10-27T09:00');
  expect(await read()).toEqual(['Tuesday, October 27', ['9:00 AM | Intro | 5 min', "9:05 AM | Review a teammate's PR | 35 min",
    '9:40 AM | Deep dive | 10 min', '9:50 AM | Wrap-up | 10 min'], 'Ends at 10:00 AM']);
  await shot(page, '24-your-hour-other-day');
  expect(await axe(page)).toEqual([]);
  await page.getByLabel('Start date and time').fill('2026-11-09T09:00');
  expect(await read()).toEqual(['', [], 'Set a start time to see the hour.']);
}, 60_000);
