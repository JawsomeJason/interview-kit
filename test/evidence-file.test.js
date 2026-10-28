import { expect, test } from 'vitest';
import { sameCandidate } from '../src/components/evidence-file.js';

// Two laptops typed the candidate's name themselves: one may drop trailing words, but a word only matches a whole word.
test.each([
  ['Sam', 'Sam Lee', true],
  ['Sam Lee', 'Sam', true],
  ['Sam Lee', 'Sam Lee', true],
  [' sam   LEE ', 'Sam Lee', true],
  ['Álex', 'alex kim', true],
  ['José María', 'Jose Maria Ruiz', true],
  ['', 'Sam Lee', true],
  ['Al', 'Alice Smith', false],
  ['Chris', 'Christine Doe', false],
  ['Sam Lee', 'Sam Leeds', false],
  ['Jo', 'Jonathan', false],
  ['Jo', 'Jonathan Price', false],
  ['Lee', 'Sam Lee', false],
  ['Sam Kim', 'Sam Lee', false],
  ['Alex Kim', 'Sam Lee', false],
])('%j and %j match: %s', (a, b, same) => {
  expect(sameCandidate(a, b)).toBe(same);
});
