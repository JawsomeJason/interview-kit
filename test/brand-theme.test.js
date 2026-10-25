import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { expect, test } from 'vitest';

// The pack decides the theme: vite.config.js reads KIT_PACK when the build loads it.
async function builtHtml(pack) {
  const outDir = mkdtempSync(join(tmpdir(), 'ik-theme-'));
  const before = process.env.KIT_PACK;
  process.env.KIT_PACK = pack;
  try {
    await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  } finally {
    if (before === undefined) delete process.env.KIT_PACK;
    else process.env.KIT_PACK = before;
  }
  return readFileSync(join(outDir, 'index.html'), 'utf8');
}

test('a pack with no theme builds unthemed; a pack theme lands in theme.brand with its font inline', async () => {
  const plain = await builtHtml('sample-pack');
  expect([plain.includes('@layer theme.brand{'), plain.includes('Fixture Sans')]).toEqual([false, false]);
  const brand = await builtHtml('test/fixtures/themed-pack');
  expect([brand.includes('@layer theme.brand{'), brand.includes('Fixture Sans'), brand.includes('data:font/woff2;base64,')]).toEqual([true, true, true]);
}, 60_000);
