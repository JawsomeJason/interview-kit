import { expect, test } from 'vitest';
import { elapsed } from '../src/elapsed.js';

test('elapsed reads minutes and seconds, adding hours past the hour', () => {
  expect([elapsed(0, 0), elapsed(0, 760_400), elapsed(1000, 3_726_000)]).toEqual(['0:00', '12:40', '1:02:05']);
});

test('before the start the clock counts down with a minus sign, and from the start it counts up', () => {
  expect([elapsed(300_000, 0), elapsed(300_000, 1_000), elapsed(1_500, 1_000), elapsed(300_000, 300_000), elapsed(0, 300_000)])
    .toEqual(['−5:00', '−4:59', '−0:01', '0:00', '5:00']);
});
