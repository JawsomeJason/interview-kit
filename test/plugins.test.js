import { globSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('plugins import only files in their own folder', () => {
  const outside = globSync('src/plugins/*/**/*.js').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\bimport\b[^'"]*?['"]([^'"]+)['"]/g)]
    .filter((m) => !m[1].startsWith('./')).map((m) => `${f}: ${m[1]} (use the API main.js passes in)`));
  expect(outside).toEqual([]);
});
