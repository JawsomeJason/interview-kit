import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { expect, test } from 'vitest';

test('the built file carries none of the dev review tools', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'ik-dev-'));
  // Vitest sets NODE_ENV=test, which would build with import.meta.env.DEV on.
  process.env.NODE_ENV = 'production';
  await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  expect(['Questions for you', 'Right idea, reword', 'Your call', '__review', '__questions', 'guess:'].filter((s) => html.includes(s))).toEqual([]);
  // The dev form's styles stay out too; the quiet "Being reviewed" badge keeps its own.
  expect(html.match(/\.review-(alert|pair|change|label|before|check|options|feedback)[\w-]*\s*\{/g)).toBeNull();
  expect(html.replace(/\s+/g, '').includes('.review-badge{')).toBe(true);
}, 30_000);
