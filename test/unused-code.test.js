import { execFileSync } from 'node:child_process';
import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

test('lint finds no unused imports or locals in any tracked script (unused exports are out of its reach)', async () => {
  const files = execFileSync('git', ['ls-files', '*.js', '*.mjs'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const results = await new ESLint().lintFiles(files);
  const found = results.flatMap((r) => r.messages.map((m) => `${r.filePath.replace(`${process.cwd()}/`, '')}:${m.line} ${m.message}`));
  expect(found).toEqual([]);
}, 60_000);
