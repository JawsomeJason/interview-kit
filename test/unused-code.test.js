import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

test('no unused imports, variables or functions anywhere in the repo', async () => {
  const results = await new ESLint().lintFiles(['.']);
  const found = results.flatMap((r) => r.messages.map((m) => `${r.filePath.replace(`${process.cwd()}/`, '')}:${m.line} ${m.message}`));
  expect(found).toEqual([]);
}, 60_000);
