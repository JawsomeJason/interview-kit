import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { preview } from 'vite';

// Serves dist/ on `port` (or the next free one), unless the caller's env var already names a URL to test.
export const serve = async (envUrl, port) => {
  const server = envUrl ? null : await preview({ logLevel: 'silent', preview: { port, strictPort: false } });
  return { server, url: envUrl ?? server.resolvedUrls.local[0] };
};
export const desktop = { width: 1280, height: 800 };
export const phone = { width: 390, height: 844 };
const packJson = resolve(process.env.KIT_PACK ?? 'examples/sample-pack', 'pack.json');
export const pack = existsSync(packJson) ? JSON.parse(readFileSync(packJson, 'utf8')) : {};
// The theme the build applies: the pack's own, always on, or the default.
export const theme = pack.theme?.id ?? 'default';

// A route has rendered once main carries it.
export const rendered = (p) => p.waitForFunction(() => document.querySelector('main')?.dataset.route === location.hash);
export async function go(p, hash) {
  await p.evaluate((h) => { location.hash = h; }, hash);
  await rendered(p);
}

// Each segment of the run of show, as its sidebar link.
export const steps = (p) => p.locator('.session-run-step > .session-run-link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));

// The first segment whose page shows `selector`, opened.
export async function openStep(p, selector) {
  for (const hash of await steps(p)) {
    await go(p, hash);
    if (await p.locator(selector).count()) return hash;
  }
  throw new Error(`no segment shows ${selector}`);
}

// The deep dive picker with the first passion ticked, which picks its pool, then the first question it lists.
export async function openQuestion(p) {
  await openStep(p, '.picker');
  await p.locator('.picker-passion input').first().check();
  await p.locator('.picker-list .question-link').first().click();
  await rendered(p);
}

export async function openScreen(browser, { url, viewport, scheme, atStart, setup = async () => {} }) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  const p = await ctx.newPage();
  await p.goto(url);
  if (!atStart) {
    // A kit with sync asks for the interviewer's own name. The setup page draws after IndexedDB reads that can end
    // well after load, so look for the name box only after filling who you are meeting has waited for the page.
    await p.getByLabel('Who are you meeting?').fill('Ada Lovelace');
    if (await p.locator('.start-name').count()) await p.locator('.start-name').fill('Grace Hopper');
    await p.getByRole('button', { name: 'Start interview' }).click();
    await rendered(p);
  }
  await setup(p);
  await p.waitForTimeout(200);
  return { ctx, p };
}
