import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { loadPack } from '../../src/pack/load.js';
import highlight from '../../scripts/vite-highlight-plugin.js';

// Builds the kit once into dir with the sample pack and the sync plugin, the way room.spec.js does, and returns the
// file:// URL. A probe plugin puts the host on window.host, and window.kit holds the session once it starts.
export async function buildKit(dir, sync) {
  const src = resolve('src');
  const { model } = await loadPack('test/fixtures/packs/sample-pack');
  model.options.sync = sync;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'entry.js'), `
import ${JSON.stringify(`${src}/style.css`)};
import ${JSON.stringify(`${src}/themes/system.css`)};
import ${JSON.stringify(`${src}/layouts/shell.css`)};
import { startSession } from ${JSON.stringify(`${src}/ui/session.js`)};
import sync from ${JSON.stringify(`${src}/plugins/sync/index.js`)};
const probe = (api) => { window.host = api.host; };
window.ready = startSession(document.getElementById('root'), { pack: window.PACK, plugins: { sync, probe }, stamp: { version: '1.0.0', sha: 'e6854f1' } }).then((kit) => { window.kit = kit; });`);
  await build({ configFile: false, logLevel: 'silent', root: resolve('.'),
    define: { __APP_VERSION__: '"0.0.0"', __GIT_SHA__: '"test"', __BUILD_DATE__: '"2026-10-26"' },
    plugins: [highlight(['test/fixtures/packs/sample-pack/**/*.md'])],
    build: { outDir: join(dir, 'out'), minify: false, lib: { entry: join(dir, 'entry.js'), formats: ['iife'], name: 'kit', fileName: () => 'kit.js', cssFileName: 'kit' } } });
  mkdirSync(join(dir, 'kit'));
  writeFileSync(join(dir, 'kit', 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Interview kit</title><style>${readFileSync(join(dir, 'out/kit.css'), 'utf8')}</style>
<div id="root" class="app"></div><script>window.PACK = ${JSON.stringify(model).replace(/</g, '\\u003c')};</script><script>${readFileSync(join(dir, 'out/kit.js'), 'utf8')}</script>`);
  return pathToFileURL(join(dir, 'kit', 'index.html')).href;
}

export async function laptop(browser, url, { init, hash = '' } = {}) {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  if (init) await page.addInitScript(init);
  await page.goto(url + hash);
  await page.evaluate(() => window.ready);
  return page;
}

export const text = (page, selector, want, timeout = 15_000) => page.waitForFunction(([s, t]) => document.querySelector(s)?.textContent === t, [selector, want], { timeout });

export async function start(page, name, candidate = 'Sam Lee') {
  await page.locator('.start-name').fill(name);
  await page.getByLabel('Who are you meeting?').fill(candidate);
  await page.getByRole('button', { name: 'Start interview' }).click();
  await page.waitForSelector('.session-header');
}

export async function fromMenu(page, label) {
  await page.locator('.session-menu summary').click();
  await page.getByRole('button', { name: label }).click();
  const code = await page.locator('.sync-dialog .sync-code').inputValue();
  await page.locator('.sync-dialog').getByRole('button', { name: 'Close' }).click();
  return code;
}

export async function knock(page, code, name) {
  await page.locator('.start-name').fill(name);
  await page.locator('.sync-join-code').fill(code);
  await page.getByRole('button', { name: 'Join' }).click();
}

// Jason invites and lets Alex in; both see each other connected over the relay.
export async function meet(browser, url, init) {
  const jason = await laptop(browser, url, { init });
  await start(jason, 'Jason');
  const code = await fromMenu(jason, 'Invite');
  const alex = await laptop(browser, url, { init });
  await knock(alex, code, 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(jason, '.sync-status', 'Connected to Alex');
  await text(alex, '.sync-status', 'Connected to Jason');
  return [jason, alex];
}
