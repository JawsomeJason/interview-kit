import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { expect, test } from 'vitest';

// What's new (CHANGELOG.md) and Help (HELP.md) share src/media/; each names a file as media/<file>.
const named = [...new Set(['CHANGELOG.md', 'HELP.md'].flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\]\(media\/([^)\s]+)\)/g)].map((m) => m[1])))];

test('every media file is named in CHANGELOG.md or HELP.md and every media path there is a file, so the single file carries no dead weight', () => {
  const posters = named.filter((f) => f.endsWith('.mp4')).map((f) => f.replace(/\.mp4$/, '.webp'));
  expect(readdirSync('src/media').sort()).toEqual([...new Set([...named, ...posters])].sort());
});

test('the build inlines each media file once as a data URL, even when both pages show it', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'ik-media-'));
  await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  const inlined = readFileSync(join(outDir, 'index.html'), 'utf8').match(/"data:(?:image\/webp|video\/mp4);base64,/g).length;
  expect([readdirSync(outDir), inlined]).toEqual([['index.html'], readdirSync('src/media').length]);
}, 30_000);

// Layout needs a real browser (QA's w3 script measures it); this keeps the fix. At 100% wide, a content-box border
// pushed each clip 2 border widths past its column.
test('media boxes count their border inside their width, so a full-width clip fits its column', () => {
  expect(readFileSync('src/components/media.css', 'utf8').match(/\.media \{[^}]*\}/)[0]).toContain('box-sizing: border-box;');
});
