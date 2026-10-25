import { expect, test } from 'vitest';
import { tabTitle } from '../src/plugins/tab-timer/tab-timer.js';

test('the tab title leads with the elapsed time and the round, and falls back to the page title', () => {
  expect([
    tabTitle({ round: 'Pair programming', elapsed: '12:40' }, 'Interview kit'),
    tabTitle({ round: null, elapsed: '' }, 'Interview kit'),
    tabTitle({ round: 'Pair programming', elapsed: '' }, 'Interview kit'),
  ]).toEqual(['12:40 · Pair programming', 'Interview kit', 'Interview kit']);
});
