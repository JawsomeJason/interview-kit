import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { loadPack } from '../../src/pack/load.js';
import highlight from '../../scripts/vite-highlight-plugin.js';

// The sample pack with the core and the sync plugin, built once into one HTML file. A page can set window.RELAYS and
// window.STAMP before it loads to point at other relays or play another build of the pack.
export async function buildKit(relays) {
  const dir = mkdtempSync(join(tmpdir(), 'ik-room-'));
  const src = resolve('src');
  const { model } = await loadPack('test/fixtures/packs/sample-pack');
  model.options.sync = { turn: [], relays };
  writeFileSync(join(dir, 'entry.js'), `
import ${JSON.stringify(`${src}/style.css`)};
import ${JSON.stringify(`${src}/themes/system.css`)};
import ${JSON.stringify(`${src}/layouts/shell.css`)};
import { startSession } from ${JSON.stringify(`${src}/ui/session.js`)};
import sync from ${JSON.stringify(`${src}/plugins/sync/index.js`)};
const probe = (api) => { window.host = api.host; };
if (window.RELAYS) window.PACK.options.sync.relays = window.RELAYS;
window.ready = startSession(document.getElementById('root'), { pack: window.PACK, plugins: { sync, probe }, stamp: window.STAMP ?? { version: '1.0.0', sha: 'e6854f1' } }).then((kit) => { window.kit = kit; });`);
  await build({ configFile: false, logLevel: 'silent', root: resolve('.'),
    define: { __APP_VERSION__: '"0.0.0"', __GIT_SHA__: '"test"', __BUILD_DATE__: '"2026-10-26"' },
    plugins: [highlight(['test/fixtures/packs/sample-pack/**/*.md'])],
    build: { outDir: join(dir, 'out'), minify: false, lib: { entry: join(dir, 'entry.js'), formats: ['iife'], name: 'kit', fileName: () => 'kit.js', cssFileName: 'kit' } } });
  mkdirSync(join(dir, 'kit'));
  const html = join(dir, 'kit', 'index.html');
  writeFileSync(html, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Interview kit</title><style>${readFileSync(join(dir, 'out/kit.css'), 'utf8')}</style>
<div id="root" class="app"></div><script>window.PACK = ${JSON.stringify(model).replace(/</g, '\\u003c')};</script><script>${readFileSync(join(dir, 'out/kit.js'), 'utf8')}</script>`);
  return { file: pathToFileURL(html).href, html };
}

// Serves the built file over http, so Invite makes a link instead of a code.
export function serve(html) {
  const server = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(readFileSync(html)); });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() })));
}
