import { expect, test } from 'vitest';
import { summaryText } from '../src/components/copy-summary.js';
import { deepDivePage } from '../src/components/deep-dive-page.js';

const round = { name: 'Pair programming' };
const r1 = { id: 'r1', pool: 'react', poolName: 'React', title: 'Lifting state up', lookFor: ['Names the shared parent', 'Passes a setter down', 'Keeps one source of truth'] };
const c1 = { id: 'c1', pool: 'css', poolName: 'CSS', title: 'The cascade', lookFor: ['Specificity', 'Layers'] };

test('summary text for one scored and one unscored question', () => {
  expect(summaryText(round, { minutes: 25, pools: ['react', 'css'] }, [r1, c1], { r1: [0, 1] })).toBe([
    'Pair programming · deep dive 25 min',
    'React (main focus)',
    '  Lifting state up: Solid',
    '    [x] Names the shared parent',
    '    [x] Passes a setter down',
    '    [ ] Keeps one source of truth',
    'CSS',
    '  The cascade',
    '    [ ] Specificity',
    '    [ ] Layers',
  ].join('\n'));
});

test('pools come in picked order with the main focus marker only on the first', () => {
  const text = summaryText(round, { minutes: 25, pools: ['css', 'react'] }, [c1, r1], {});
  expect(text.split('\n').filter((line) => !line.startsWith(' '))).toEqual(['Pair programming · deep dive 25 min', 'CSS (main focus)', 'React']);
});

test('the deep dive page renders a Copy summary button', () => {
  expect(deepDivePage({ minutes: 25, pools: [] }, new Map(), [], [])).toContain('<button type="button" class="copy-summary">Copy summary</button>');
});

test('summary adds indented notes and a check for done questions, nothing for empty notes', () => {
  expect(summaryText(round, { minutes: 25, pools: ['react', 'css'] }, [r1, c1], { r1: [0, 1] }, { r1: 'Clear on data flow\nMissed the reset case', c1: '  ' }, ['r1'])).toBe([
    'Pair programming · deep dive 25 min',
    'React (main focus)',
    '  Lifting state up: Solid ✓',
    '    [x] Names the shared parent',
    '    [x] Passes a setter down',
    '    [ ] Keeps one source of truth',
    '    Notes: Clear on data flow',
    '    Missed the reset case',
    'CSS',
    '  The cascade',
    '    [ ] Specificity',
    '    [ ] Layers',
  ].join('\n'));
});

test('the summary starts with the candidate name', () => {
  expect(summaryText(round, { minutes: 25, pools: ['react'] }, [r1], {}, {}, [], 'Ada Lovelace').split('\n')[0])
    .toBe('Ada Lovelace · Pair programming · deep dive 25 min');
});
