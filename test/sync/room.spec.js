import { chromium } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { parsePackets, publishOf, RELAYS } from '../../src/plugins/sync/link-relay.js';
import { startBroker } from './broker.js';
import { buildKit } from './harness.js';

const PUBLIC = process.env.IK_RELAYS === 'public';
const DIVS = 'review-a-pr#divs';
const contexts = [];
let browser;
let url;
let broker;

beforeAll(async () => {
  broker = PUBLIC ? null : await startBroker();
  url = (await buildKit(PUBLIC ? RELAYS : [broker.url])).file;
  browser = await chromium.launch({ args: ['--mute-audio'] });
}, 60_000);

afterAll(async () => { for (const c of contexts.splice(0)) await c.close(); await browser?.close(); await broker?.close(); });

const CAPTURE = () => {
  const Native = window.WebSocket;
  window.__frames = [];
  window.WebSocket = class extends Native {
    constructor(...args) { super(...args); this.addEventListener('message', (e) => window.__frames.push([...new Uint8Array(e.data)])); }
    send(data) { window.__frames.push([...new Uint8Array(data)]); return super.send(data); }
  };
};

async function laptop(hash = '') {
  const c = await browser.newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US', viewport: { width: 1280, height: 900 } });
  contexts.push(c);
  const page = await c.newPage();
  await page.clock.setFixedTime(new Date('2026-10-26T16:58:00-07:00'));
  await page.addInitScript(CAPTURE);
  await page.goto(url + hash);
  await page.evaluate(() => window.ready);
  return page;
}

const text = (page, selector, want, timeout = 15_000) => page.waitForFunction(([s, t]) => document.querySelector(s)?.textContent === t, [selector, want], { timeout });
const log = (page, event) => page.evaluate((e) => window.kit.view.log(e), event);
const plan = (page, fn) => page.waitForFunction(fn, null, { timeout: 15_000 });
const digestFor = (page, ref) => page.evaluate((r) => {
  const t = (window.PACK.libs.exercise[0].lookFor.find((b) => `review-a-pr#${b.pin}` === r) ?? {}).text;
  let h = 0x811c9dc5;
  for (const ch of t) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}, ref);

async function start(page, name, candidate = 'Sam Lee') {
  await page.locator('.start-name').fill(name);
  await page.getByLabel('Who are you meeting?').fill(candidate);
  await page.getByRole('button', { name: 'Start interview' }).click();
  await page.waitForSelector('.session-header');
}

async function fromMenu(page, label, inDialog) {
  await page.locator('.session-menu summary').click();
  await page.getByRole('button', { name: label }).click();
  if (inDialog) await inDialog(page.locator('.sync-dialog'));
  const code = await page.locator('.sync-dialog .sync-code').inputValue();
  await page.locator('.sync-dialog').getByRole('button', { name: 'Close' }).click();
  return code;
}

async function knock(page, code, name) {
  await page.locator('.start-name').fill(name);
  await page.locator('.sync-join-code').fill(code);
  await page.getByRole('button', { name: 'Join' }).click();
}

async function decide(page, choice, level, why) {
  await page.getByRole('navigation', { name: 'Run of show' }).getByRole('link', { name: 'Decide' }).click();
  await page.getByRole('radio', { name: new RegExp(`^${choice}`) }).check();
  await page.getByLabel('Level you would place them at').selectOption({ label: level });
  await page.getByRole('textbox', { name: 'Reason' }).fill(why);
  await page.getByRole('button', { name: 'Record' }).click();
  await page.waitForSelector('.decide-recorded');
}

const author = (page) => page.evaluate(() => window.host.me().author);
const vectorKeys = (page) => page.evaluate(() => {
  const me = window.host.me().author;
  return Object.entries(window.host.vector(me)).map(([a, c]) => [a === me ? 'me' : 'other', Object.keys(c).sort()]).sort();
});

test('two laptops meet through the relay, a third with only the link gets nowhere, and the relay sees no plaintext', async () => {
  const jason = await laptop();
  await start(jason, 'Jason');
  const code = await fromMenu(jason, 'Invite');
  expect(code).toMatch(/^join=[a-f0-9]{12}\.[A-Za-z0-9_-]{22}&from=Jason$/);

  const alex = await laptop();
  await knock(alex, code, 'Alex');
  await text(alex, '.sync-join-status', 'Waiting for Jason to let you in…');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await alex.waitForSelector('.session-header', { timeout: 15_000 });
  await text(alex, '.session-candidate', 'Sam Lee');
  await text(jason, '.sync-status', 'Connected to Alex');
  await text(alex, '.sync-status', 'Connected to Jason');
  expect(await alex.locator('.session-round').innerText()).toBe('Frontend engineer, Practical round');

  await jason.getByRole('link', { name: "Review a teammate's PR" }).click();
  await plan(alex, () => window.kit.view.plan().segments['practical/review-a-teammate-s-pr']?.asked?.includes('review-a-pr'));
  await log(alex, { t: 'member', k: 'session.passions', id: 'css', v: 'CSS and layout' });
  await plan(jason, () => window.kit.view.plan().passions.some((p) => p.id === 'css'));
  expect(await jason.evaluate(() => window.kit.view.plan().segments['practical/review-a-teammate-s-pr'].asked)).toEqual(['review-a-pr']);

  await log(jason, { t: 'mark', o: DIVS, d: await digestFor(jason, DIVS), s: 'seen' });
  await log(alex, { t: 'mark', o: DIVS, d: await digestFor(alex, DIVS), s: 'unseen' });
  await jason.getByRole('link', { name: 'Debrief', exact: true }).click();
  expect(await jason.locator('.debrief-wait').innerText()).toMatch(/^The debrief opens once you have decided\./);
  expect([await vectorKeys(jason), await vectorKeys(alex)]).toEqual([[['me', ['pub']], ['other', ['pub']]], [['me', ['pub']], ['other', ['pub']]]]);

  await decide(jason, 'Hire', 'Mid', 'Meets the bar.');
  await jason.getByRole('link', { name: 'Debrief', exact: true }).click();
  expect(await jason.locator('.debrief-wait').innerText()).toMatch(/^Nobody else's evidence is here yet\./);
  expect(await vectorKeys(alex)).toEqual([['me', ['pub']], ['other', ['pub']]]);
  await decide(alex, 'No hire', 'Junior', 'Missed the error link.');
  // The private page and the decided event ride three relays at once and may land in either order.
  await jason.waitForSelector('.debrief-table', { timeout: 15_000 });
  expect(await jason.locator('.debrief-table thead th').allInnerTexts()).toEqual(['What to look for', 'Jason\nevaluated at Mid', 'Alex\nevaluated at Mid']);
  await jason.waitForFunction(() => [...document.querySelectorAll('.debrief-table tbody tr.is-differs td')].map((td) => td.textContent.trim()).join() === 'Seen,Not seen', null, { timeout: 15_000 });
  await alex.getByRole('link', { name: 'Debrief', exact: true }).click();
  await alex.waitForSelector('.debrief-table', { timeout: 15_000 });
  expect(await alex.locator('.debrief-table thead th').allInnerTexts()).toEqual(['What to look for', 'Alex\nevaluated at Mid', 'Jason\nevaluated at Mid']);

  const mallory = await laptop(`#${code}`);
  expect([await mallory.locator('.sync-join-code').inputValue(), await mallory.evaluate(() => location.hash)]).toEqual([code, '']);
  await knock(mallory, code, 'Mallory');
  await text(mallory, '.sync-join-status', 'Waiting for Jason to let you in…');
  await text(jason, '.sync-knock span', 'Mallory wants to join.');
  await jason.getByRole('button', { name: 'Not now' }).click();
  await text(mallory, '.sync-join-status', "Jason didn't let you in. Ask Jason to send a new link.");
  expect((await mallory.locator('body').innerText()).includes('Sam Lee')).toBe(false);

  const newCode = await fromMenu(jason, 'Change the link', async (dialog) => {
    expect(await dialog.getByRole('checkbox').evaluateAll((els) => els.map((i) => [i.labels[0].textContent.trim(), i.checked]))).toEqual([['Alex', true]]);
    await dialog.getByRole('button', { name: 'Change the link' }).click();
  });
  expect([newCode === code, /^join=[a-f0-9]{12}\.[A-Za-z0-9_-]{22}&from=Jason$/.test(newCode)]).toEqual([false, true]);
  await log(jason, { t: 'member', k: 'session.passions', id: 'a11y', v: 'Accessibility' });
  await plan(alex, () => window.kit.view.plan().passions.some((p) => p.id === 'a11y'));
  await knock(mallory, code, 'Mallory');
  await text(mallory, '.sync-join-status', 'Waiting for Jason to let you in…');
  await mallory.waitForTimeout(7_000);
  expect([await jason.locator('.sync-knock').count(), await mallory.locator('.sync-join-status').innerText()]).toEqual([0, 'Waiting for Jason to let you in…']);

  const pages = [jason, alex, mallory];
  const frames = (await Promise.all(pages.map((p) => p.evaluate(() => window.__frames)))).flat();
  const carried = [...frames.flatMap((f) => parsePackets(Uint8Array.from(f)).filter((p) => p.type === 3).map(publishOf)), ...(broker?.log ?? [])];
  const words = ['Sam Lee', 'Jason', 'Alex', 'Mallory', 'hello', 'knock', 'admit', 'rekey', '"t"', 'review-a-pr', 'CSS and layout', 'Accessibility', 'Meets the bar', ...await Promise.all([author(jason), author(alex)])];
  const leaks = carried.flatMap(({ payload }) => { const s = Buffer.from(payload).toString('latin1'); return words.filter((w) => s.includes(w)); });
  expect({ frames: carried.length > 20, topics: carried.every(({ topic }) => /^ik2\/[0-9a-f]{32}$/.test(topic)), topicsLobbyRoomAndRoomAfterChange: new Set(carried.map(({ topic }) => topic)).size, leaks })
    .toEqual({ frames: true, topics: true, topicsLobbyRoomAndRoomAfterChange: 3, leaks: [] });
}, PUBLIC ? 240_000 : 120_000);
