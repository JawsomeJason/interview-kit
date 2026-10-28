import { chromium } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { startBroker } from './broker.js';
import { buildKit } from './harness.js';
import { meet } from './kit.js';

let browser;
let url;
let broker;

beforeAll(async () => {
  broker = await startBroker();
  url = (await buildKit([broker.url])).file;
  browser = await chromium.launch({ args: ['--mute-audio'] });
}, 60_000);

afterAll(async () => { await browser?.close(); await broker?.close(); }, 30_000);

const SEG = 'practical/review-a-teammate-s-pr';
const asked = (page) => page.evaluate((s) => window.kit.view.plan().segments[s]?.asked ?? [], SEG);

// Opening a card records nothing; a card counts as asked at its first mark. So a card a colleague only looks at
// stays unasked, and so must the same card for whoever follows them there.
test('following a colleague onto a card they only opened does not mark it asked in the shared plan', async () => {
  const [jason, alex] = await meet(browser, url);
  await jason.getByRole('link', { name: "Review a teammate's PR" }).click();
  await alex.locator('.sync-name-button', { hasText: 'Jason' }).click();
  await alex.waitForFunction((h) => location.hash === h, `#/${SEG}`, { timeout: 15_000 });
  await alex.waitForTimeout(2_000);
  expect([await asked(jason), await asked(alex)]).toEqual([[], []]);
}, 90_000);
