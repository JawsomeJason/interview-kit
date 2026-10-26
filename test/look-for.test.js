import { expect, test } from 'vitest';
import { lookFor, tickFeedback } from '../src/components/look-for.js';
import { score } from '../src/components/copy-summary.js';

test('score words for 0..3 of 3 and 0..2 of 2', () => {
  expect([0, 1, 2, 3].map((n) => score(n, 3))).toEqual([null, 'Weak', 'Solid', 'Strong']);
  expect([0, 1, 2].map((n) => score(n, 2))).toEqual([null, 'Solid', 'Strong']);
});

test('one checkbox per bullet, checked per ticks, and no score word at any tick count', () => {
  const q = { id: 'x', lookFor: ['Runs it', 'Says *why*', 'Names a trade-off'] };
  const boxes = (html) => html.match(/<input type="checkbox"[^>]*>/g);
  expect(boxes(lookFor(q, [0, 2]))).toEqual([
    '<input type="checkbox" value="0" checked class="option-row-control">', '<input type="checkbox" value="1" class="option-row-control">', '<input type="checkbox" value="2" checked class="option-row-control">',
  ]);
  expect(lookFor(q, [0, 2])).toContain('<em>why</em>');
  // The ? icon and its popover talk about scoring in general; only the panel itself must stay free of score words.
  const panel = (t) => lookFor(q, t).replace(/<button [^>]*class="hint[\s\S]*?popover="hint">[\s\S]*?<\/span>/, '');
  expect([[], [0], [0, 2], [0, 1, 2]].map((t) => /score|Weak|Solid|Strong/.test(panel(t)))).toEqual([false, false, false, false]);
});

const fakeBox = (checked) => {
  const classes = new Set();
  return { checked, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) }, closest: () => fakeBox.row };
};

test('ticking pops the row and buzzes for 10ms, whichever item it is', () => {
  const buzzes = [];
  const row = fakeBox(false);
  fakeBox.row = row;
  tickFeedback(fakeBox(true), { vibrate: (ms) => buzzes.push(ms) });
  expect([row.classList.contains('look-for-pop'), buzzes]).toEqual([true, [10]]);
});

test('unticking gives no feedback, and a browser without vibrate still pops', () => {
  const buzzes = [];
  const row = fakeBox(false);
  fakeBox.row = row;
  tickFeedback(fakeBox(false), { vibrate: (ms) => buzzes.push(ms) });
  expect([row.classList.contains('look-for-pop'), buzzes]).toEqual([false, []]);
  tickFeedback(fakeBox(true), {});
  expect(row.classList.contains('look-for-pop')).toBe(true);
});
