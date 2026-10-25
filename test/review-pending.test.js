import { expect, test } from 'vitest';
import { pending } from '../scripts/review-pending.mjs';

test('pending lists the latest feedback for cards still flagged and not marked done', () => {
  const lines = [
    { id: 'a', choice: 'change', text: 'x' },
    { id: 'b', choice: 'clear' },
    { id: 'a', done: true },
    { id: 'd', choice: 'remove' },
    { id: 'b', choice: 'change', text: 'y' },
  ];
  expect(pending(lines, new Set(['card:a', 'card:b', 'card:c'])).map((l) => [l.id, l.choice, l.text])).toEqual([['b', 'change', 'y']]);
});

test('help and question answers stay pending, apart from cards of the same id, until applied or marked done', () => {
  const lines = [
    { kind: 'help', id: 'overlaps', choice: 'Cut it', notes: '' },
    { id: 'overlaps', choice: 'clear' },
    { kind: 'question', id: 'capture-kit', choice: 'Go', notes: 'now' },
    { kind: 'help', id: 'motion', choice: 'Right as written', notes: '' },
    { kind: 'help', id: 'motion', done: true },
  ];
  expect(pending(lines, new Set(['help:overlaps', 'help:motion', 'question:capture-kit'])).map((l) => [l.kind, l.id, l.choice]))
    .toEqual([['help', 'overlaps', 'Cut it'], ['question', 'capture-kit', 'Go']]);
});
