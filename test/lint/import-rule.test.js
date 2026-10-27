import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

// A file planted at `path` with one import line, linted with the repo's own config.
const lint = async (path, source) => {
  const [result] = await new ESLint().lintText(`import x from '${source}';\nexport default x;\n`, { filePath: path });
  return result.messages.map((m) => m.ruleId);
};

test('a kind cannot import the store, the gate or sync internals', async () => {
  expect(await lint('src/kinds/questions/planted.js', '../../evidence/store.js')).toEqual(['no-restricted-imports']);
  expect(await lint('src/kinds/questions/planted.js', '../../evidence/gate.js')).toEqual(['no-restricted-imports']);
  expect(await lint('src/kinds/exercise/planted.js', '../../plugins/sync/replica.js')).toEqual(['no-restricted-imports']);
});

test('a plugin cannot import the store, the gate or sync internals, and sync may import its own files', async () => {
  expect(await lint('src/plugins/ai/planted.js', '../../evidence/store.js')).toEqual(['no-restricted-imports']);
  expect(await lint('src/plugins/ai/planted.js', '../sync/seal.js')).toEqual(['no-restricted-imports']);
  expect(await lint('src/plugins/sync/planted.js', '../../evidence/gate.js')).toEqual(['no-restricted-imports']);
  expect(await lint('src/plugins/sync/planted.js', './seal.js')).toEqual([]);
});

test('a kind may import the folds, and the core may import the store', async () => {
  expect(await lint('src/kinds/questions/planted.js', '../../evidence/reduce.js')).toEqual([]);
  expect(await lint('src/ui/planted.js', '../evidence/store.js')).toEqual([]);
});
