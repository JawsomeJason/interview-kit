import { expect, test } from 'vitest';
import { describe, loadPack } from '../../src/pack/load.js';

// The pack a repo runs this against, checked the way "interview-kit check" checks it: every error with its file and line.
test('the pack loads with no errors', async () => {
  const { problems } = await loadPack(process.env.KIT_PACK ?? 'examples/sample-pack');
  expect(problems.filter((p) => p.level === 'error').map(describe)).toEqual([]);
});
