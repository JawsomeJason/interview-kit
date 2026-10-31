import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { build } from 'vite';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { loadPack } from '../../src/pack/load.js';
import highlight from '../../scripts/vite-highlight-plugin.js';

// The session with the real ai, popout, shortcuts, sync and tab-timer plugins, opened from disk as the built kit is.
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
  model.options.sync = { turn: [], relays: [] };
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
import sync from ${imp('plugins/sync/index.js')};
import tabTimer from ${imp('plugins/tab-timer/index.js')};
window.ready = startSession(document.getElementById('root'), { pack: window.PACK, plugins: { ai, popout, shortcuts, sync, tabTimer } }).then((kit) => { window.kit = kit; });`);
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
  await page.locator('.start-name').fill('Jason');
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

test('Invite sits in Menu and, from a kit opened as a file, shows a code to paste once', async () => {
  const page = await laptop();
  await start(page);
  expect(await page.locator('.session-menu-items .sync-invite').allTextContents()).toEqual(['Invite']);
  await page.locator('.session-menu summary').click();
  await page.getByRole('button', { name: 'Invite' }).click();
  expect([await page.locator('.sync-dialog p').first().innerText(), await page.locator('.sync-dialog .sync-code').inputValue()])
    .toEqual(['Send this to your colleagues directly, not in a channel. They paste it once into Join an interview on their setup page.', expect.stringMatching(/^join=[a-f0-9]{12}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{22}&from=Jason$/)]);
  expect(await page.locator('.session-menu-items .sync-relink').allTextContents()).toEqual(['Change the link']);
});

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
  await page.getByRole('link', { name: 'Decide' }).click();
  expect(await page.getByText('Second opinion').count()).toBe(0);
  await page.getByRole('radio', { name: /^Hire/ }).check();
  await page.getByLabel('Level you would place them at').selectOption({ label: 'Mid' });
  await page.getByRole('textbox', { name: 'Reason' }).fill('Meets the bar.');
  await page.getByRole('button', { name: 'Record' }).click();
  await page.waitForSelector('.decide-recorded');
  const offer = page.getByRole('button', { name: 'Get a second opinion' });
  expect([await page.locator('.ai-why').innerText(), await offer.getAttribute('aria-expanded'), await page.getByRole('textbox', { name: 'Second opinion packet' }).count()])
    .toEqual(['A cold read after you decide can catch what your marks missed.', 'false', 0]);
  await shot(page, 'second-opinion-offer');
  await offer.click();
  const packet = page.getByRole('textbox', { name: 'Second opinion packet' });
  const without = await packet.inputValue();
  await page.getByRole('checkbox', { name: "Include my notes (they may show my lean; the candidate's name is replaced, pronouns are not)" }).check();
  const withNotes = await packet.inputValue();
  await page.getByRole('button', { name: 'Copy the packet' }).click();
  await shot(page, 'second-opinion');
  expect([await page.locator('.decide-recorded').innerText(), await page.locator('.ai-covers').innerText()])
    .toEqual(["Recorded at 4:58 PM. Colleagues' evidence opens once they have decided too.", 'Built from your evidence.']);
  expect([without.split('\n')[0], ['Sam Lee', 'Meets the bar', 'Hire'].filter((w) => withNotes.includes(w)),
    without.includes('Found tabbing'), withNotes.endsWith("Notes\n    Review a teammate's PR: Found tabbing only after the hint."),
    await page.evaluate(() => window.copied) === withNotes, await page.getByRole('button', { name: 'Copied' }).count()])
    .toEqual(['Please give a second opinion on how the candidate did in a job interview. The interviewers\' decisions and levels are left out, so your read is your own. Their names and the candidate\'s are replaced where they are spelled as entered, but notes and a transcript can still name other people.',
      [], false, true, true, 1]);
}, 60_000);

test("opening Second opinion with a colleague's evidence in it counts as seeing their evidence, and a closed panel does not", async () => {
  const page = await laptop();
  await start(page);
  const me = await page.evaluate(() => window.kit.host.me());
  const pub = [{ t: 'open', v: 2, sid: me.sid, author: 'a-bea', role: me.role, round: me.round, pack: me.pack }, { t: 'name', name: 'Bea' }, { t: 'decided' }];
  const prv = [{ t: 'decide', choice: 'hire', why: 'Solid.' }];
  await page.evaluate(([p, q]) => { window.kit.host.receive('a-bea', 'pub', p); window.kit.host.receive('a-bea', 'prv', q); },
    [pub, prv].map((events) => events.map((e, n) => ({ n, h: `0194c0de100${n}.0000`, ...e }))));
  await page.getByRole('link', { name: 'Decide' }).click();
  await page.getByRole('radio', { name: /^Hire/ }).check();
  await page.getByRole('textbox', { name: 'Reason' }).fill('Meets the bar.');
  await page.getByRole('button', { name: 'Record' }).click();
  await page.waitForSelector('.ai-covers', { state: 'attached' });
  const peeks = () => page.evaluate(() => [...window.kit.view.evidence().peeks.keys()]);
  expect([await page.locator('.ai-covers').textContent(), await peeks()]).toEqual(["Built from your evidence and 1 colleague's.", []]);
  await page.getByRole('button', { name: 'Get a second opinion' }).click();
  await expect.poll(peeks).toEqual(['a-bea']);
}, 60_000);

async function decideHere(page) {
  await page.getByRole('link', { name: 'Decide' }).click();
  await page.getByRole('radio', { name: /^Hire/ }).check();
  await page.getByRole('textbox', { name: 'Reason' }).fill('Meets the bar.');
  await page.getByRole('button', { name: 'Record' }).click();
  await page.waitForSelector('.decide-recorded');
}
const newInterview = async (page) => {
  await page.locator('.session-menu summary').click();
  await page.getByRole('button', { name: 'New interview' }).click();
  await page.waitForSelector('.start');
};
const TRANSCRIPT = '00:01 Sam Lee: I would use a button.';

test('a transcript goes in the packet with the name replaced, survives a colleague\'s redraw with focus, is never logged or stored, and stays with its interview', async () => {
  const page = await laptop();
  await start(page);
  await decideHere(page);
  await page.getByRole('button', { name: 'Get a second opinion' }).click();
  const box = page.getByRole('textbox', { name: 'Transcript, if you have one' });
  const packet = page.getByRole('textbox', { name: 'Second opinion packet' });
  await box.fill(TRANSCRIPT);
  await shot(page, 'second-opinion-transcript');
  expect((await packet.inputValue()).endsWith('\n\nTranscript\n00:01 the candidate: I would use a button.')).toBe(true);

  const me = await page.evaluate(() => window.kit.host.me());
  await page.evaluate((e) => window.kit.host.receive('a-bea', 'pub', [e]),
    { n: 0, h: '0194c0de1000.0000', t: 'open', v: 2, sid: me.sid, author: 'a-bea', role: me.role, round: me.round, pack: me.pack });
  await page.keyboard.type(' Then test it.');
  expect([await box.inputValue(), await page.evaluate(() => document.activeElement.className)]).toEqual([`${TRANSCRIPT} Then test it.`, 'ai-transcript']);
  expect((await packet.inputValue()).endsWith('I would use a button. Then test it.')).toBe(true);

  const stored = await page.evaluate(async () => {
    const seen = [JSON.stringify(localStorage), JSON.stringify(sessionStorage)];
    for (const { name } of await indexedDB.databases()) {
      const db = await new Promise((done) => { indexedDB.open(name).onsuccess = (e) => done(e.target.result); });
      for (const store of db.objectStoreNames) {
        seen.push(JSON.stringify(await new Promise((done) => { db.transaction(store).objectStore(store).getAll().onsuccess = (e) => done(e.target.result); })));
      }
      db.close();
    }
    return seen.join();
  });
  expect([stored.includes('Sam Lee'), stored.includes('I would use a button'), stored.includes('Then test it')]).toEqual([true, false, false]);

  await newInterview(page);
  await start(page);
  await decideHere(page);
  expect([await page.getByRole('button', { name: 'Get a second opinion' }).getAttribute('aria-expanded'), await page.getByRole('textbox', { name: 'Second opinion packet' }).count(),
    await page.locator('.ai-transcript').inputValue(), (await page.locator('.ai-packet').inputValue()).includes('Transcript\n')]).toEqual(['false', 0, '', false]);
}, 60_000);

test("the packet replaces the name of every interviewer in the room, a colleague who has not decided too, and the panel says what it leaves in", async () => {
  const page = await laptop();
  await start(page);
  const me = await page.evaluate(() => window.kit.host.me());
  await page.evaluate((events) => window.kit.host.receive('a-bea', 'pub', events), [{ t: 'open', v: 2, sid: me.sid, author: 'a-bea', role: me.role, round: me.round, pack: me.pack }, { t: 'name', name: 'Bea Ortiz' }]
    .map((e, n) => ({ n, h: `0194c0de100${n}.0000`, ...e })));
  await decideHere(page);
  await page.getByRole('button', { name: 'Get a second opinion' }).click();
  await page.locator('.ai-transcript').fill('Jason: Bea, go ahead. Ortiz: Sam, tell us about Priya.');
  expect((await page.locator('.ai-packet').inputValue()).endsWith('\n\nTranscript\nthe interviewer: the interviewer, go ahead. the interviewer: the candidate, tell us about Priya.')).toBe(true);
  expect([await page.locator('.ai-lead').innerText(), await page.locator('.ai-hint').innerText()]).toEqual([
    'Paste this into an AI assistant you trust. It leaves out every interviewer\'s decision and level, and replaces your names and the candidate\'s where they are spelled as entered. Notes and a transcript can still name other people. The kit sends it nowhere.',
    'It lets the AI check each row against what was said, and is gone when you reload or close this tab. Pronouns, other people\'s names and other spellings stay as they are, so read it before you paste.']);
}, 60_000);

test('the link after the packet opens Change my decision and focuses it', async () => {
  const page = await laptop();
  await start(page);
  await decideHere(page);
  await page.getByRole('button', { name: 'Get a second opinion' }).click();
  expect(await page.locator('.ai-amend').innerText()).toBe('If this changes your read, change your decision and reason.');
  await page.getByRole('link', { name: 'change your decision and reason' }).click();
  expect(await page.evaluate(() => [document.querySelector('.decide-change').open, document.activeElement.textContent, location.hash])).toEqual([true, 'Change my decision', '#/decide']);
}, 60_000);

const REMINDED = "Started a new interview. You haven't got a second opinion on that interview yet. Undo";
const PLAIN = 'Started a new interview. Undo';
const toast = (page) => page.locator('.undo-toast').innerText();

test('New interview reminds about an interview I decided and did not copy, never blocks, and Undo goes back to Decide with what I pasted', async () => {
  const page = await laptop();
  await start(page);
  await decideHere(page);
  await page.getByRole('button', { name: 'Get a second opinion' }).click();
  await page.locator('.ai-transcript').fill(TRANSCRIPT);
  await newInterview(page);
  expect([await toast(page), await page.getByRole('button', { name: 'Start interview' }).isEnabled()]).toEqual([REMINDED, true]);
  await shot(page, 'second-opinion-reminder');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForSelector('.decide-recorded');
  expect([await page.evaluate(() => location.hash), await page.locator('.ai-transcript').inputValue(), await page.locator('.ai-panel').isVisible()]).toEqual(['#/decide', TRANSCRIPT, true]);
}, 60_000);

test('New interview does not remind before I decide, or once I copied, and deleting the interview forgets the copy', async () => {
  const page = await laptop();
  await start(page);
  await newInterview(page);
  expect(await toast(page)).toBe(PLAIN);
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForSelector('.session-header');
  await decideHere(page);
  const { sid } = await page.evaluate(() => window.kit.host.me());
  const prefs = () => page.evaluate(() => localStorage.getItem('interview-kit-layout') ?? '');
  await page.getByRole('button', { name: 'Get a second opinion' }).click();
  await page.getByRole('button', { name: 'Copy the packet' }).click();
  await page.getByRole('button', { name: 'Copied' }).waitFor();
  expect(await prefs()).toContain(sid);
  await newInterview(page);
  expect(await toast(page)).toBe(PLAIN);
  await page.getByRole('button', { name: 'Delete from this laptop' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(prefs).not.toContain(sid);
}, 60_000);

// A finger or a wheel scrolls the page until the link sits on screen, then taps it where it is, with no help from
// Playwright's own scrolling.
async function scrollToAndTap(win, name) {
  const link = win.locator('.session-nav').getByRole('link', { name, exact: true });
  for (let i = 0; i < 40 && !(await link.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('a') === el;
  })); i++) {
    await win.mouse.move(200, 300);
    await win.mouse.wheel(0, 400);
    await win.waitForTimeout(50);
  }
  const box = await link.boundingBox();
  await win.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test('on a phone and in the Pop out window, scrolling down reaches the run of show and its links open', async () => {
  const page = await laptop();
  await page.setViewportSize({ width: 390, height: 700 });
  await start(page);
  await scrollToAndTap(page, 'Decide');
  await page.waitForFunction(() => location.hash === '#/decide');
  await shot(page, 'phone-run-of-show');
  await page.setViewportSize({ width: 1280, height: 900 });
  const [pip] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('button', { name: 'Pop out' }).click()]);
  await pip.setViewportSize({ width: 400, height: 700 });
  await pip.waitForSelector('.session-header');
  const uncovered = () => pip.locator('.session-menu summary').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [r.left + 2, r.right - 2].map((x) => document.elementFromPoint(x, r.top + r.height / 2)?.closest('summary') === el);
  });
  expect(await uncovered()).toEqual([true, true]);
  await scrollToAndTap(pip, 'Debrief');
  await page.waitForFunction(() => location.hash === '#/debrief');
  await shot(pip, 'popout-run-of-show');
}, 60_000);
