import { expect, test } from 'vitest';
import { pickedList } from '../src/components/deep-dive-page.js';

const q = (id) => ({ id, title: id, poolName: 'React', minutes: 5, lookFor: ['a', 'b', 'c'] });

test('picked list shows the score word for a scored question only', () => {
  const items = pickedList([q('r1'), q('r2')], 10, { r1: [0, 1, 2] }).match(/<li>[\s\S]*?<\/li>/g);
  expect(items.map((li) => li.match(/class="score-label">([^<]*)/)?.[1] ?? null)).toEqual(['Strong', null]);
});

test('the picked list mutes a done question with a check, others unchanged', () => {
  const qs = [{ ...q('r1'), pool: 'react' }, { ...q('r2'), pool: 'react' }];
  const items = pickedList(qs, 10, {}, ['r1']).match(/<li>[\s\S]*?<\/li>/g);
  expect(items.map((li) => li.includes('class="done-mark is-done"'))).toEqual([true, false]);
});
