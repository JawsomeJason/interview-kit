import { expect, test } from 'vitest';
import { createClock, wallOf } from '../../src/evidence/clock.js';

const T = 0x0194c0de1000;
const at = (wall, c = 0) => `${wall.toString(16).padStart(12, '0')}.${c.toString(16).padStart(4, '0')}`;

test('stamps in one wall millisecond count up, and the next millisecond resets the counter', () => {
  let p = T;
  const clock = createClock(() => p);
  const a = clock.now();
  const b = clock.now();
  p = T + 1;
  expect([a, b, clock.now()]).toEqual(['0194c0de1000.0000', '0194c0de1000.0001', '0194c0de1001.0000']);
});

test('a received stamp a little ahead puts my next stamp after it', () => {
  const clock = createClock(() => T);
  clock.receive(at(T + 30_000, 2));
  expect(clock.now()).toBe(at(T + 30_000, 3));
});

test('a received stamp an hour ahead advances my clock by at most 60 seconds', () => {
  const clock = createClock(() => T);
  clock.receive(at(T + 3_600_000));
  expect(wallOf(clock.now())).toBe(T + 60_000);
});

test('a received stamp behind me changes nothing', () => {
  const clock = createClock(() => T);
  clock.now();
  clock.receive(at(T - 5_000, 9));
  expect(clock.now()).toBe(at(T, 1));
});

test('stamps order as plain strings', () => {
  expect([at(T, 1) < at(T, 2), at(T, 0xffff) < at(T + 1, 0), wallOf(at(T + 7))]).toEqual([true, true, T + 7]);
});
