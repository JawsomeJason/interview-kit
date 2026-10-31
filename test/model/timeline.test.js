import { join } from 'node:path';
import { expect, test } from 'vitest';
import { loadPack } from '../../src/pack/load.js';
import { questionList, runOfShow } from '../../src/model/timeline.js';

const FIXTURES = 'test/fixtures/packs';
const noPlan = { passions: [], segments: {} };

test('each fixture round runs 60 minutes', async () => {
  const totals = {};
  for (const pack of ['sample-pack', 'designer-pack', 'sre-pack']) {
    const { model } = await loadPack(join(FIXTURES, pack));
    for (const round of model.rounds) totals[round.id] = runOfShow(round, noPlan).minutes;
  }
  expect(totals).toEqual({ practical: 60, screen: 60, 'portfolio-review': 60, incident: 60 });
});

test('the run of show starts each segment where the last ended, and takes the shared plan\'s minutes', async () => {
  const { model } = await loadPack(join(FIXTURES, 'sample-pack'));
  const plan = { passions: [], segments: { 'practical/deep-dive': { minutes: 15, pools: ['css'] } } };
  const show = runOfShow(model.rounds[0], plan);
  expect([show.minutes, show.steps.map((s) => [s.seg, s.start, s.minutes])]).toEqual([65, [
    ['practical/before-the-call', 0, 0],
    ['practical/intro', 0, 5],
    ['practical/review-a-teammate-s-pr', 5, 35],
    ['practical/deep-dive', 40, 15],
    ['practical/wrap-up', 55, 10],
  ]]);
});

const card = (id, pool, minutes, tier = 'core', overlaps) => ({ id, pool, minutes, tier, ...(overlaps && { overlaps }) });
const cards = [card('a1', 'a', 5), card('a2', 'a', 5), card('a3', 'a', 5, 'stretch'), card('b1', 'b', 5), card('b2', 'b', 4), card('x1', 'x', 6)];
const ids = (list) => list.map((q) => q.id);

test('with nothing asked, the list is the pick rule over the picked pools', () => {
  expect(ids(questionList(cards, { pools: ['a', 'b'] }, 20))).toEqual(['a1', 'a2', 'a3', 'b1']);
});

test('asked cards keep their place at the top when the minutes drop or a pool is unticked', () => {
  const asked = ['a2', 'x1'];
  expect({
    asked: ids(questionList(cards, { pools: ['a', 'b'], asked }, 20)),
    fewerMinutes: ids(questionList(cards, { pools: ['a', 'b'], asked }, 10)),
    poolUnticked: ids(questionList(cards, { pools: ['b'], asked }, 20)),
    noPools: ids(questionList(cards, { asked }, 20)),
  }).toEqual({
    asked: ['a2', 'x1', 'a1', 'b2'],
    fewerMinutes: ['a2', 'x1'],
    poolUnticked: ['a2', 'x1', 'b1', 'b2'],
    noPools: ['a2', 'x1'],
  });
});

test("a card opened from All questions stays asked even when its pool is not the segment's", () => {
  const segment = cards.filter((c) => c.pool !== 'x');
  expect([ids(questionList(segment, { pools: ['b'], asked: ['x1'] }, 20)), ids(questionList(segment, { pools: ['b'], asked: ['x1'] }, 20, cards))])
    .toEqual([['b1', 'b2'], ['x1', 'b1', 'b2']]);
});

test('the pick after the asked cards never adds one that covers the same ground', () => {
  const overlapping = [card('a1', 'a', 5), card('a2', 'a', 5, 'core', ['x1']), card('a3', 'a', 5), card('x1', 'x', 6)];
  expect(ids(questionList(overlapping, { pools: ['a'], asked: ['x1'] }, 20))).toEqual(['x1', 'a1', 'a3']);
});
