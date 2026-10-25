import { expect, test } from 'vitest';
import { deadLinks } from '../scripts/check-doc-links.mjs';

test('every backticked repo path in the Markdown docs exists', () => {
  expect(deadLinks()).toEqual([]);
});
