import { mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { startBroker } from './broker.js';
import { buildKit, serve } from './harness.js';

const SHOTS = process.env.SYNC_SHOTS;
const contexts = [];
let browser;
let kit;
let site;
let broker;

beforeAll(async () => {
  broker = await startBroker();
  kit = await buildKit([broker.url]);
  site = await serve(kit.html);
  browser = await chromium.launch({ args: ['--mute-audio'] });
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
}, 60_000);

afterAll(async () => { for (const c of contexts.splice(0)) await c.close(); await browser?.close(); await broker?.close(); site?.close(); }, 30_000);

// Every status line a page showed, in order, and a way to cut its sockets and keep them cut.
const WATCH = () => {
  window.__lines = [];
  window.__sockets = [];
  window.__cut = false;
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(...args) { if (window.__cut) throw new Error('cut'); super(...args); window.__sockets.push(this); }
  };
  new MutationObserver(() => {
    const t = document.querySelector('.sync-status')?.textContent ?? '';
    if (t && window.__lines.at(-1) !== t) window.__lines.push(t);
  }).observe(document, { subtree: true, childList: true, characterData: true });
};

async function laptop(url, init = {}) {
  const c = await browser.newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US', viewport: { width: 1280, height: 900 } });
  contexts.push(c);
  const page = await c.newPage();
  await page.addInitScript(WATCH);
  await page.addInitScript((vars) => Object.assign(window, vars), init);
  await page.goto(url);
  await page.evaluate(() => window.ready);
  return page;
}

const text = (page, selector, want, timeout = 15_000) => page.waitForFunction(([s, t]) => document.querySelector(s)?.textContent.trim() === t, [selector, want], { timeout })
  .catch(async () => { throw new Error(`${selector} never read "${want}"; it reads "${await page.evaluate((s) => document.querySelector(s)?.textContent.trim(), selector)}"`); });
const shot = (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });
const lines = (page) => page.evaluate(() => window.__lines);
const onPage = async (page, other) => page.waitForFunction((h) => location.hash === h, await other.evaluate(() => location.hash));
const names = (page) => page.locator('.sync-name-button').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
const run = (page) => page.getByRole('navigation', { name: 'Run of show' });

async function start(page, name, candidate = 'Sam Lee') {
  await page.locator('.start-name').fill(name);
  await page.getByLabel('Who are you meeting?').fill(candidate);
  await page.getByRole('button', { name: 'Start interview' }).click();
  await page.waitForSelector('.session-header');
}

async function invite(page) {
  await page.locator('.session-menu summary').click();
  await page.getByRole('button', { name: 'Invite' }).click();
  const dialog = page.locator('.sync-dialog');
  const out = { link: await dialog.locator('.sync-code').inputValue(), qr: await dialog.locator('.sync-qr').count(), words: await dialog.locator('p').first().innerText(),
    menuOpen: await page.locator('.session-menu').evaluate((d) => d.open) };
  await shot(page, 'invite-dialog');
  await dialog.getByRole('button', { name: 'Close' }).click();
  return out;
}

async function joinByLink(link, name, init) {
  const page = await laptop(link, init);
  await page.keyboard.type(name);
  await page.keyboard.press('Enter');
  return page;
}

test('join by link, presence, Follow, a drop, a reconnect and a reload all read in plain words', async () => {
  const jason = await laptop(site.url);
  await start(jason, 'Jason');
  const { link, qr, words, menuOpen } = await invite(jason);
  expect([link.startsWith(`${site.url}#join=`), link.endsWith('&from=Jason'), qr, menuOpen, words]).toEqual([true, true, 0, false,
    'Send this to your colleagues directly, not in a channel. They open the link, then type their name and Join.']);
  await text(jason, '.sync-status', 'Waiting for colleagues. Send them the invite link.');

  const alex = await laptop(link);
  expect([await alex.locator('.sync-join-invite').innerText(), await alex.evaluate(() => document.activeElement.className), await alex.evaluate(() => location.hash),
    await alex.getByRole('button', { name: 'Start interview' }).isVisible(), await alex.getByLabel('Who are you meeting?').isVisible()])
    .toEqual(['Jason invited you to their interview. Type your name above, then Join.', 'start-input start-name', '', false, false]);
  await shot(alex, 'joiner-arrives');
  await alex.keyboard.type('Alex');
  await alex.keyboard.press('Enter');
  await text(alex, '.sync-join-status', 'Waiting for Jason to let you in…');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await shot(jason, 'knock');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(jason, '.sync-status', 'Connected to Alex');
  await text(alex, '.sync-status', 'Connected to Jason');
  expect((await lines(jason)).slice(0, 3)).toEqual(['Connecting…', 'Waiting for colleagues. Send them the invite link.', 'Alex joined.']);
  expect(await alex.locator('.sync-join-status').count()).toBe(0);

  // Presence: Jason sees where Alex is and that Alex follows them.
  await jason.getByRole('link', { name: "Review a teammate's PR" }).click();
  await alex.getByRole('button', { name: 'Jason' }).click();
  await text(alex, '.sync-follow span', 'Following Jason.');
  await onPage(alex, jason);
  await jason.getByRole('button', { name: 'Alex' }).hover();
  await jason.waitForFunction(() => /^Alex is on Review a teammate's PR\. Following you\. Through the meeting point(, a little slower)?\.$/.test(document.querySelector('.sync-detail').textContent));
  await alex.waitForFunction(() => document.querySelector(`.session-nav a[href="${location.hash}"] .sync-here`)?.textContent === 'J');
  await shot(jason, 'presence-hover');
  await shot(alex, 'following');

  // Following moves my page; scrolling does not stop it; a personal page is not followed.
  await run(jason).getByRole('link', { name: 'Deep dive' }).click();
  await onPage(alex, jason);
  await alex.mouse.move(640, 600);
  await alex.mouse.wheel(0, 600);
  await alex.locator('main').focus();
  await alex.keyboard.press('PageDown');
  await text(alex, '.sync-follow span', 'Following Jason.');
  const deepDive = await alex.evaluate(() => location.hash);
  await run(jason).getByRole('link', { name: 'Decide' }).click();
  await text(alex, '.sync-follow span', 'Jason is on their Decide page.');
  expect(await alex.evaluate(() => location.hash)).toBe(deepDive);
  await shot(alex, 'follow-personal-page');

  // A follow loop is refused, and the note goes on its own.
  await jason.getByRole('button', { name: 'Alex' }).click();
  await text(jason, '.sync-follow span', "Alex is following you, so you can't follow them back.");
  await jason.waitForFunction(() => !document.querySelector('.sync-follow').textContent, null, { timeout: 5_000 });

  // Tab does not stop following; any other key press of mine does, and says so; so does a pointer press.
  await alex.keyboard.press('Tab');
  await text(alex, '.sync-follow span', 'Jason is on their Decide page.');
  await alex.keyboard.press('x');
  await text(alex, '.sync-follow span', 'Stopped following Jason.');
  await alex.getByRole('button', { name: 'Jason' }).click();
  await text(alex, '.sync-follow span', 'Jason is on their Decide page.');
  await run(alex).getByRole('link', { name: 'Intro' }).click();
  await text(alex, '.sync-follow span', 'Stopped following Jason.');
  await alex.waitForFunction(() => !document.querySelector('.sync-follow').textContent, null, { timeout: 5_000 });

  // The status line and the Follow bar are live regions, and the header passes axe.
  expect(await jason.locator('.sync-status, .sync-follow').evaluateAll((els) => els.map((e) => e.getAttribute('role')))).toEqual(['status', 'status']);
  expect((await new AxeBuilder({ page: jason }).include('.session-header').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map((v) => v.id)).toEqual([]);

  // A socket replaced within a second is not news; an outage says so, then catches up on its own.
  const before = (await lines(jason)).length;
  broker.drop();
  await jason.waitForTimeout(4_000);
  expect([(await lines(jason)).slice(before), await jason.locator('.sync-status').innerText()]).toEqual([[], 'Connected to Alex']);
  broker.refuse(8_000);
  await text(jason, '.sync-status', 'Reconnecting to the meeting point… Everything you record is saved and will catch up.');
  await text(alex, '.sync-status', 'Reconnecting to the meeting point… Everything you record is saved and will catch up.');
  await shot(jason, 'meeting-point-gone');
  await text(jason, '.sync-status', 'Connected to Alex', 25_000);
  expect((await lines(jason)).slice(before)).toContain('Back online. Catching up…');

  // Alex's network goes: Alex loses the meeting point, Jason loses Alex after 12 seconds, then both recover on their own.
  await alex.evaluate(() => { window.__cut = true; for (const s of window.__sockets) s.close(); });
  await text(alex, '.sync-status', 'Reconnecting to the meeting point… Everything you record is saved and will catch up.');
  await text(jason, '.sync-status', 'Lost Alex, reconnecting… What you record is saved and will catch up.', 20_000);
  expect(await names(jason)).toEqual(['Alex reconnecting']);
  await shot(jason, 'lost');
  await alex.evaluate(() => { window.__cut = false; window.dispatchEvent(new Event('online')); });
  await text(jason, '.sync-status', 'Connected to Alex');
  expect((await lines(jason)).slice(-2)).toEqual(['Reconnected to Alex. Caught up.', 'Connected to Alex']);

  // A reload rejoins from the stored room record, without knocking again.
  await alex.reload();
  await alex.evaluate(() => window.ready);
  await text(alex, '.sync-status', 'Connected to Jason');
  expect([await jason.locator('.sync-knock').count(), (await lines(alex))[0]]).toEqual([0, 'Connecting…']);

  // The link opened again in a new tab goes straight back in, without knocking.
  const tab = await alex.context().newPage();
  await tab.addInitScript(WATCH);
  await tab.goto(link);
  await tab.waitForSelector('.session-header', { timeout: 15_000 });
  await text(tab, '.sync-status', 'Connected to Jason');
  expect([await jason.locator('.sync-knock').count(), await names(jason)]).toEqual([0, ['Alex']]);
  await alex.close();

  // A knock shows inside an open Invite too; a colleague on another build of the pack gets a banner on every screen.
  await jason.locator('.session-menu summary').click();
  await jason.getByRole('button', { name: 'Invite' }).click();
  const kim = await joinByLink(link, 'Kim', { STAMP: { version: '1.0.1', sha: 'b0b0b0b' } });
  await text(jason, '.sync-dialog .sync-knock span', 'Kim wants to join.');
  await shot(jason, 'knock-in-invite');
  await jason.locator('.sync-dialog').getByRole('button', { name: 'Let in' }).click();
  await jason.locator('.sync-dialog').getByRole('button', { name: 'Close' }).click();
  await text(jason, '.sync-banner', 'Kim is using another version of this pack (1.0.1). Anchors that changed show as reworded.');
  await text(jason, '.sync-status', 'Connected to Alex and Kim', 20_000);
  // Alex saw the knock too, and it goes once Kim is in.
  await tab.waitForFunction(() => !document.querySelector('.sync-knock'), null, { timeout: 15_000 });
  await kim.waitForFunction(() => document.querySelector('.sync-banner')?.textContent.includes('Jason is using another version of this pack (1.0.0).'));
  await shot(jason, 'pack-banner');

  // Change the link with Kim unticked: Kim drops out of the room.
  await jason.locator('.session-menu summary').click();
  await jason.getByRole('button', { name: 'Change the link' }).click();
  await jason.locator('.sync-dialog').getByRole('checkbox', { name: 'Kim' }).uncheck();
  await shot(jason, 'change-the-link');
  await jason.locator('.sync-dialog').getByRole('button', { name: 'Change the link' }).click();
  await jason.locator('.sync-dialog').getByRole('button', { name: 'Close' }).click();
  await text(jason, '.sync-status', 'Connected to Alex');
  expect(await names(jason)).toEqual(['Alex']);

  // A colleague who closes the kit is named with the time they left.
  // Playwright tears a page down before its last socket frame leaves, so the page is told it is hiding instead.
  await tab.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await jason.waitForFunction(() => /^Alex left at \d{1,2}:\d{2} [AP]M\.$/.test(document.querySelector('.sync-status').textContent));
  await jason.locator('.session-menu summary').click();
  await jason.getByRole('button', { name: 'Change the link' }).click();
  const roster = await jason.locator('.sync-roster label').evaluateAll((els) => els.map((l) => [l.textContent.trim(), l.querySelector('input').checked]));
  expect([roster.length, roster[0][1], /^Alex \(left at \d{1,2}:\d{2} [AP]M\)$/.test(roster[0][0])]).toEqual([1, false, true]);
  await jason.locator('.sync-dialog').getByRole('button', { name: 'Cancel' }).click();

  // On a phone the names and the status take their own row, and nothing spills sideways.
  await jason.setViewportSize({ width: 400, height: 800 });
  await shot(jason, 'phone-header');
  expect(await jason.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(400);
}, 180_000);

test('failures say why and give one next step', async () => {
  const dead = { RELAYS: ['ws://127.0.0.1:9'] };
  const kim = await laptop(site.url, dead);
  await kim.getByRole('button', { name: 'Test connection' }).click();
  await text(kim, '.sync-test-result', "Not ready: the meeting point can't be reached from this network.", 12_000);
  expect(await kim.locator('[data-check="relay"]').innerText()).toBe("Meeting point. Can't reach the meeting point from this network. Try another network before the interview, or plan to share evidence as a file.");
  await shot(kim, 'test-connection-failed');

  const code = 'join=abcdef123456.AAAAAAAAAAAAAAAAAAAAAA&from=Jason';
  await kim.locator('.sync-join-code').fill(code);
  await kim.getByRole('button', { name: 'Join' }).click();
  await text(kim, '.sync-join-status', 'Type your name first, so your colleagues know who is knocking.');
  expect(await kim.evaluate(() => document.activeElement.className)).toBe('start-input start-name');
  await kim.locator('.start-name').fill('Kim');
  await kim.locator('.sync-join-code').fill('see you at 3');
  await kim.getByRole('button', { name: 'Join' }).click();
  await text(kim, '.sync-join-status', "That isn't an invite link or code. Ask for the link again, or paste all of it.");
  await kim.locator('.sync-join-code').fill(code);
  await kim.getByRole('button', { name: 'Join' }).click();
  await text(kim, '.sync-join-status', 'Connecting…');
  await text(kim, '.sync-join-status span', "Can't reach the meeting point from this network. Your notes save on this laptop either way. Try another network, or share your evidence as a file after the interview.", 12_000);
  expect(await kim.locator('.sync-join-status').getByRole('button').allInnerTexts()).toEqual(['Retry now']);

  await start(kim, 'Kim');
  await invite(kim);
  await text(kim, '.sync-status', 'Connecting…');
  await text(kim, '.sync-status span', "Can't reach the meeting point from this network. Your notes save on this laptop either way. Try another network, or share your evidence as a file after the interview.", 12_000);
  expect(await kim.locator('.sync-status').getByRole('button').allInnerTexts()).toEqual(['Retry now']);
  await shot(kim, 'no-meeting-point');

  const sam = await laptop(site.url);
  await sam.getByRole('button', { name: 'Test connection' }).click();
  await sam.waitForFunction(() => /^(Ready for the interview\.|Ready, through the meeting point\.)$/.test(document.querySelector('.sync-test-result').textContent), null, { timeout: 12_000 });
  expect(await sam.locator('[data-check="relay"]').innerText()).toBe('Meeting point. The meeting point is reachable.');
  await shot(sam, 'test-connection-ready');
}, 120_000);
