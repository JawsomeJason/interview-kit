import { chromium } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { startBroker } from './broker.js';
import { buildKit } from './harness.js';
import { fromMenu, knock, laptop, start, text } from './kit.js';

// Sync once Pop out has moved the app into its own window: knocks, Let in, Invite, Follow and presence all live there.
let browser;
let url;
let broker;

beforeAll(async () => {
  broker = await startBroker();
  url = (await buildKit([broker.url], [], { popout: true })).file;
  browser = await chromium.launch({ args: ['--mute-audio'] });
}, 60_000);

afterAll(async () => { await browser?.close(); await broker?.close(); }, 30_000);

test('in the Pop out window a knock shows and Let in works, Invite opens there, Follow stops on Escape, and colleagues see you present', async () => {
  const jason = await laptop(browser, url);
  await start(jason, 'Jason');
  const code = await fromMenu(jason, 'Invite');
  const alex = await laptop(browser, url);
  await knock(alex, code, 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');

  const [pip] = await Promise.all([jason.context().waitForEvent('page'), jason.getByRole('button', { name: 'Pop out' }).click()]);
  await pip.waitForSelector('.session-header');
  // The tab behind the window is hidden, as it is behind a fullscreen call.
  await jason.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await pip.getByRole('link', { name: "Review a teammate's PR" }).click();
  await alex.waitForFunction(() => /Jason is on Review a teammate's PR/.test(document.querySelector('.sync-detail')?.textContent), null, { timeout: 15_000 });
  expect(await alex.locator('.sync-name-button').innerText()).toBe('Jason');

  const kim = await laptop(browser, url);
  await knock(kim, code, 'Kim');
  await text(pip, '.sync-knock span', 'Kim wants to join.');
  await pip.getByRole('button', { name: 'Let in' }).click();
  await kim.waitForFunction(() => /^Connected to (Alex and Jason|Jason and Alex)$/.test(document.querySelector('.sync-status')?.textContent), null, { timeout: 20_000 });

  await pip.locator('.session-menu summary').click();
  await pip.getByRole('button', { name: 'Invite' }).click();
  expect([await pip.locator('.sync-dialog .sync-code').inputValue(), await jason.locator('.sync-dialog').count()]).toEqual([code, 0]);
  await pip.locator('.sync-dialog').getByRole('button', { name: 'Close' }).click();

  await pip.locator('.sync-name-button', { hasText: 'Alex' }).click();
  await text(pip, '.sync-follow span', 'Following Alex.');
  await pip.locator('main').press('Escape');
  await text(pip, '.sync-follow span', 'Stopped following Alex.');
}, 120_000);
