import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { preview } from 'vite';

const given = { 'a11y.mjs': process.env.A11Y_URL, 'clip-audit.mjs': process.env.CLIP_URL }[basename(process.argv[1])];
export const server = given ? null : await preview({ logLevel: 'silent', preview: { port: 4173, strictPort: false } });
export const url = given ?? server.resolvedUrls.local[0];
export const desktop = { width: 1280, height: 800 };
export const phone = { width: 390, height: 844 };
export const HEADER_MENUS = { a: '.header-a-more', b: '.cockpit-menu-button', d: '.ctx-more-button' };
const packJson = resolve(process.env.KIT_PACK ?? 'sample-pack', 'pack.json');
export const pack = existsSync(packJson) ? JSON.parse(readFileSync(packJson, 'utf8')) : {};
export const themes = ['default', ...(pack.theme?.id ? [pack.theme.id] : [])];

export async function openQuestion(p) {
  await p.goto(`${url}#/deep-dive`);
  await p.locator('.pool-picker input:not(:disabled)').first().check();
  await p.locator('.picked-list .question-link').first().click();
  await p.locator('.question-body').waitFor();
}

export async function openScreen(browser, { viewport, scheme, prefs = {}, atPicker, setup = async () => {} }) {
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
