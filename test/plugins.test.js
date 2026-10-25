import { existsSync, globSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// src/plugins/index.js lists one plugin per line; main.js hands each one a small API and nothing else.
test('each plugin is one export line in src/plugins/index.js, pointing at <name>/<name>.js', () => {
  const lines = readFileSync('src/plugins/index.js', 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('//'));
  const bad = lines.filter((l) => {
    const name = l.match(/^export \{ default as (\w+) \} from '\.\/([\w-]+)\/\2\.js';$/)?.[2];
    return !name || !existsSync(`src/plugins/${name}/${name}.js`);
  });
  expect([lines.length > 0, bad]).toEqual([true, []]);
});

test('plugins import only files in their own folder', () => {
  const outside = globSync('src/plugins/*/**/*.js').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\bimport\b[^'"]*?['"]([^'"]+)['"]/g)]
    .filter((m) => !m[1].startsWith('./')).map((m) => `${f}: ${m[1]} (use the API main.js passes in)`));
  expect(outside).toEqual([]);
});
