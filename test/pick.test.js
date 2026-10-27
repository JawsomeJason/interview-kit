import { expect, test } from 'vitest';
import { canAdd, pickQuestions, poolStatus } from '../src/kinds/questions/pick.js';

const q = (id, minutes, tier = 'core') => ({ id, pool: id[0], minutes, tier });
const ids = (picked) => picked.map((p) => p.id);
const twos = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'c1', 'c2'].map((id) => q(id, 2));

test('no pools picks nothing', () => {
  expect(pickQuestions(twos, [], 30)).toEqual([]);
});

test('one pool gets the whole budget', () => {
  expect(ids(pickQuestions(twos, ['a'], 6))).toEqual(['a1', 'a2', 'a3']);
});

test('main focus gets 60% and the rest split evenly', () => {
  expect(ids(pickQuestions([q('a1', 6), q('b1', 4), q('b2', 1)], ['a', 'b'], 10))).toEqual(['a1', 'b1']);
  const qs = [q('a1', 6), q('a2', 6), q('b1', 4), q('b2', 4), q('c1', 2), q('c2', 2)];
  expect(ids(pickQuestions(qs, ['a', 'b', 'c'], 10))).toEqual(['a1', 'c1', 'c2']);
});

test('results are grouped in pool order, main focus first', () => {
  expect(ids(pickQuestions(twos, ['b', 'a'], 10))).toEqual(['b1', 'b2', 'b3', 'a1', 'a2']);
});

test('core comes before stretch', () => {
  const qs = [q('a1', 5, 'stretch'), q('a2', 5)];
  expect(ids(pickQuestions(qs, ['a'], 5))).toEqual(['a2']);
  expect(ids(pickQuestions(qs, ['a'], 10))).toEqual(['a2', 'a1']);
});

test('a question that does not fit its pool budget is skipped and scanning continues', () => {
  const qs = [q('a1', 7), q('a2', 3), q('a3', 2), q('b1', 9)];
  expect(ids(pickQuestions(qs, ['a', 'b'], 10))).toEqual(['a2', 'a3']);
});

test('the fill pass spends minutes another pool left unused', () => {
  const qs = [q('a1', 6), q('a2', 4), q('b1', 7)];
  expect(ids(pickQuestions(qs, ['a', 'b'], 10))).toEqual(['a1', 'a2']);
});

test('never exceeds the minutes', () => {
  const qs = [q('a1', 7), q('a2', 5, 'stretch'), q('a3', 4), q('b1', 6), q('b2', 8), q('c1', 5), q('c2', 3)];
  const over = [];
  for (let minutes = 5; minutes <= 60; minutes++) {
    for (const pools of [['a'], ['a', 'b'], ['c', 'a', 'b']]) {
      const total = pickQuestions(qs, pools, minutes).reduce((sum, p) => sum + p.minutes, 0);
      if (total > minutes) over.push(`${pools} ${minutes}: ${total}`);
    }
  }
  expect(over).toEqual([]);
});

const three = [q('a1', 6), q('b1', 2), q('c1', 3)];

test('canAdd is false when the pool would get none of its questions', () => {
  expect(canAdd(three, ['a', 'b'], 'c', 10)).toBe(false);
});

test('canAdd is true when the pool would get at least one question', () => {
  expect(canAdd(three, ['a', 'b'], 'c', 20)).toBe(true);
});

test('canAdd is true for any pool when none are selected and its shortest question fits', () => {
  expect(['a', 'b', 'c'].map((id) => canAdd(three, [], id, 6))).toEqual([true, true, true]);
});

test('poolStatus: main focus, order number, no room with the smallest total that fits, enabled', () => {
  const pools = Map.groupBy([q('a1', 12), q('b1', 4), q('c1', 6), q('c2', 5), q('d1', 4)], (p) => p.pool);
  expect(['a', 'b', 'c', 'd'].map((id) => poolStatus({ minutes: 20, pools: ['a', 'b'] }, pools, id))).toEqual([
    { order: 1 }, { order: 2 }, { noRoom: true, minutesNeeded: 21 }, {},
  ]);
});

test('the pick never returns both questions of an overlapping pair, whichever side declares it', () => {
  const pairs = (declare) => {
    const qs = [{ ...q('a1', 5), ...declare.a1 }, q('a2', 5), { ...q('b1', 5), ...declare.b1 }, q('b2', 5)];
    return ids(pickQuestions(qs, ['a', 'b'], 30));
  };
  expect([pairs({ a1: { overlaps: ['b1'] } }), pairs({ b1: { overlaps: ['a1'] } })]).toEqual([
    ['a1', 'a2', 'b2'], ['a1', 'a2', 'b2'],
  ]);
});
