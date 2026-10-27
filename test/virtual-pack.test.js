import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, createServer } from 'vite';
import { expect, test, vi } from 'vitest';
import pack from '../src/pack/vite-plugin.js';

const copy = () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ik-virtual-')), 'pack');
  cpSync('test/fixtures/packs/sample-pack', dir, { recursive: true });
  return dir;
};
const serve = (dir) => createServer({ configFile: false, logLevel: 'silent', plugins: [pack(dir)], server: { port: 0 } });

// A card flagged for review, with the editor's notes in its Review section.
const flagCard = (dir) => {
  const card = join(dir, 'pools/html/html-01-button-or-link.md');
  writeFileSync(card, `${readFileSync(card, 'utf8').replace('tier: core', 'tier: core\nreview: needs-check')}\n## Review\n\n**Check:** Editor notes stay out of the build.\n`);
};

test('the dev server serves the loaded pack as virtual:pack, review notes included', async () => {
  const dir = copy();
  flagCard(dir);
  const server = await serve(dir);
  try {
    const { default: model } = await server.ssrLoadModule('virtual:pack');
    const card = model.libs.questions.cards.find((c) => c.id === 'html-01');
    expect([model.roles.map((r) => r.id), card.review, card.reviewMd]).toEqual([
      ['frontend-engineer', 'senior-frontend-engineer'], 'needs-check', '**Check:** Editor notes stay out of the build.',
    ]);
  } finally {
    await server.close();
  }
});

test('the build carries the review flag but not the review notes', async () => {
  const dir = copy();
  flagCard(dir);
  const out = await build({ configFile: false, logLevel: 'silent', plugins: [pack(dir)], build: { write: false, rollupOptions: { input: 'virtual:pack', preserveEntrySignatures: 'strict' } } });
  const code = out.output.map((o) => o.code ?? '').join('');
  expect([code.includes('needs-check'), code.includes('Editor notes'), code.includes('reviewMd')]).toEqual([true, false, false]);
});

test('a pack with errors shows them, with file and line, where the dev server reports a failed module', async () => {
  const dir = copy();
  const round = join(dir, 'rounds/practical.md');
  writeFileSync(round, readFileSync(round, 'utf8').replace('exercise: review-a-pr', 'exercise: review-pr'));
  const server = await serve(dir);
  try {
    await expect(server.ssrLoadModule('virtual:pack')).rejects.toThrow('rounds/practical.md:7  run entry 3: exercise "review-pr" does not exist.\n  Exercises in this pack: review-a-pr.');
  } finally {
    await server.close();
  }
});

test("virtual:pack/theme imports the pack's theme CSS, and picks up a file added while serving", async () => {
  const dir = copy();
  mkdirSync(join(dir, 'theme/dev'), { recursive: true });
  writeFileSync(join(dir, 'theme/brand.css'), '.a { color: red; }\n');
  writeFileSync(join(dir, 'theme/dev/review.css'), '.b { color: blue; }\n');
  const server = await serve(dir);
  try {
    const imports = async (id) => [...(await server.transformRequest(id)).code.matchAll(/import "[^"]*\/(theme\/[^"?]+)/g)].map((m) => m[1]);
    expect([await imports('virtual:pack/theme'), await imports('virtual:pack/theme/dev')]).toEqual([['theme/brand.css'], ['theme/dev/review.css']]);
    // The watcher misses a file written before it is live, so write again until it reports one.
    let edits = 0;
    await vi.waitFor(async () => {
      writeFileSync(join(dir, 'theme/extra.css'), `.c${edits++} { color: green; }\n`);
      expect(await imports('virtual:pack/theme')).toEqual(['theme/brand.css', 'theme/extra.css']);
    }, { timeout: 15_000, interval: 250 });
  } finally {
    await server.close();
  }
}, 30_000);
