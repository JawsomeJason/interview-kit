import { expect, test } from 'vitest';
import { pickedList } from '../src/components/picked-list.js';
import { pickedLinks } from '../src/components/nav.js';

const q = (id) => ({ id, title: id, poolName: 'React', minutes: 5, lookFor: ['a', 'b', 'c'] });

test('picked list shows the score word for a scored question only', () => {
  const items = pickedList([q('r1'), q('r2')], 10, { r1: [0, 1, 2] }).match(/<li>[\s\S]*?<\/li>/g);
  expect(items.map((li) => li.match(/class="score-label">([^<]*)/)?.[1] ?? null)).toEqual(['Strong', null]);
});

test('sidebar and picked list mute a done question with a check, others unchanged', () => {
  const qs = [{ ...q('r1'), pool: 'react' }, { ...q('r2'), pool: 'react' }];
  expect(pickedLinks(qs, ['r1'])).toContain('<span class="done-mark is-done"><a href="#/q/r1" class="question-link">r1 (5 min)</a>&nbsp;<span class="done-mark-check">✓</span></span>'
    + '<span class="done-mark"><a href="#/q/r2" class="question-link">r2 (5 min)</a>&nbsp;<span class="done-mark-check">✓</span></span>');
  const items = pickedList(qs, 10, {}, ['r1']).match(/<li>[\s\S]*?<\/li>/g);
  expect(items.map((li) => li.includes('class="done-mark is-done"'))).toEqual([true, false]);
});
