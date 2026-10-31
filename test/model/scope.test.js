import { expect, test } from 'vitest';
import { loadPack } from '../../src/pack/load.js';
import { itemsOf, observables } from '../../src/model/observables.js';
import { inScope } from '../../src/model/scope.js';

const { model: pack } = await loadPack('test/fixtures/packs/sample-pack');
const rows = (id, minutes) => {
  const item = itemsOf(pack).get(id);
  return observables(item).filter((o) => inScope(item, o, minutes)).map((o) => o.ref);
};

test('below coreBelow only the core rows are in scope; at it and above, every row is', () => {
  expect(rows('review-a-pr', 19)).toEqual(['review-a-pr#divs', 'review-a-pr#error-link']);
  expect(rows('review-a-pr', 20)).toEqual(['review-a-pr#divs', 'review-a-pr#typing', 'review-a-pr#error-link', 'review-a-pr#mid.2', 'review-a-pr#senior.1', 'review-a-pr#senior.2']);
});

test('an item with no coreBelow keeps every row in scope at any minutes', () => {
  expect(rows('html-01', 0)).toEqual(['html-01#mid.1', 'html-01#mid.2', 'html-01#mid.3']);
});
