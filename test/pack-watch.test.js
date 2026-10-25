import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { expect, test, vi } from 'vitest';

// A pack repo's pack sits outside the app folder, where Vite does not watch on its own.
test('the dev server picks up a new card in a pack outside the app, with its code block highlighted', async () => {
  const pack = join(mkdtempSync(join(tmpdir(), 'ik-watch-')), 'pack');
  cpSync('sample-pack', pack, { recursive: true });
  const before = process.env.KIT_PACK;
  process.env.KIT_PACK = pack;
  const server = await createServer({ logLevel: 'silent', server: { port: 0 } });
  try {
    await server.listen();
    const get = async (path) => (await fetch(new URL(path, server.resolvedUrls.local[0]))).text();
    await Promise.all([get('/src/content.js'), get('/@id/__x00__virtual:highlighted')]);
    await new Promise((done) => setTimeout(done, 1000));
    const card = readFileSync(join(pack, 'pools/css/css-01-center-a-box.md'), 'utf8').replace('id: css-01', 'id: css-99')
      .replace('## Ask\n', '## Ask\n\n```js\nconst addedWhileServing = 1;\n```\n');
    writeFileSync(join(pack, 'pools/css/css-99-added.md'), card);
    const seen = async () => [(await get('/src/content.js')).includes('css-99-added.md'), (await get('/@id/__x00__virtual:highlighted')).includes('addedWhileServing')];
    await vi.waitFor(async () => expect(await seen()).toEqual([true, true]), { timeout: 10_000, interval: 250 });
  } finally {
    await server.close();
    if (before === undefined) delete process.env.KIT_PACK;
    else process.env.KIT_PACK = before;
  }
}, 30_000);
