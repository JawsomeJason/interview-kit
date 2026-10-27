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
// The button that opens the header's menu (the phone drawer lists the same items flat).
export const HEADER_MENU = '.header-menu-button';
const packJson = resolve(process.env.KIT_PACK ?? 'examples/sample-pack', 'pack.json');
export const pack = existsSync(packJson) ? JSON.parse(readFileSync(packJson, 'utf8')) : {};
// The theme the build applies: the pack's own, always on, or the default.
export const theme = pack.theme?.id ?? 'default';

export async function openQuestion(p) {
  await p.goto(`${p.url().split('#')[0]}#/deep-dive`);
  await p.locator('.pool-picker input:not(:disabled)').first().check();
  await p.locator('.picked-list .question-link').first().click();
  await p.locator('.question-body').waitFor();
}

export async function openScreen(browser, { url, viewport, scheme, prefs = {}, atPicker, setup = async () => {} }) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  await ctx.addInitScript((seed) => { if (!localStorage.getItem('interview-kit-layout')) localStorage.setItem('interview-kit-layout', JSON.stringify(seed)); }, prefs);
  const p = await ctx.newPage();
  await p.goto(url);
  if (!atPicker) {
    await p.locator('.candidate-field').fill('Ada Lovelace');
    await p.locator('[data-round]').first().click();
    await p.waitForSelector('nav', { state: 'attached' });
  }
  await setup(p);
  await p.waitForTimeout(200);
  return { ctx, p };
}
