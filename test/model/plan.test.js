import { expect, test } from 'vitest';
import { loadPack } from '../../src/pack/load.js';
import { foldShared } from '../../src/evidence/reduce.js';
import { composeRound, coverage } from '../../src/model/plan.js';
import { runOfShow } from '../../src/model/timeline.js';

const { model: pack } = await loadPack('test/fixtures/packs/sample-pack');
const senior = pack.roles.find((r) => r.id === 'senior-frontend-engineer');
const mid = pack.roles.find((r) => r.id === 'frontend-engineer');
const practical = pack.rounds.find((r) => r.id === 'practical');
const screen = pack.rounds.find((r) => r.id === 'screen');
const noPlan = { passions: [], segments: {} };
const plan = (segments) => ({ passions: [], segments });
const shape = (s) => [s.seg, s.minutes, s.optional ? `full ${s.full}` : 'frame'];

test('a frame script marks its round segment, so the start page offers it no checkbox', () => {
  expect(practical.segments.map((s) => [s.id, Boolean(s.frame)])).toEqual([
    ['before-the-call', true], ['intro', true], ['review-a-teammate-s-pr', false], ['deep-dive', false], ['wrap-up', true]]);
});

test("the composed round adds the role's other activities at 0 minutes before the closing frames, deduped, each with the minutes a tick gives it", () => {
  const show = runOfShow(composeRound(pack, senior, practical), noPlan);
  expect(show.all.map(shape)).toEqual([
    ['practical/before-the-call', 0, 'frame'],
    ['practical/intro', 5, 'frame'],
    ['practical/review-a-teammate-s-pr', 35, 'full 35'],
    ['practical/deep-dive', 10, 'full 10'],
    ['practical/walk-the-resume', 0, 'full 15'],
    ['practical/wrap-up', 10, 'frame'],
  ]);
  expect(runOfShow(composeRound(pack, senior, screen), noPlan).all.map(shape)).toEqual([
    ['screen/intro', 5, 'frame'],
    ['screen/walk-the-resume', 15, 'full 15'],
    ['screen/deep-dive', 30, 'full 30'],
    ['screen/review-a-teammate-s-pr', 0, 'full 35'],
    ['screen/wrap-up', 10, 'frame'],
  ]);
});

test('steps leave out an activity that is off until something is asked in it, and the minutes still add up', () => {
  const round = composeRound(pack, senior, practical);
  const off = runOfShow(round, plan({ 'practical/deep-dive': { minutes: 0 } }));
  const asked = runOfShow(round, plan({ 'practical/deep-dive': { minutes: 0, asked: ['css-04'] }, 'practical/walk-the-resume': { minutes: 15 } }));
  expect([off.steps.map((s) => s.seg), off.minutes, asked.steps.map((s) => [s.seg, s.start, s.minutes]), asked.minutes]).toEqual([
    ['practical/before-the-call', 'practical/intro', 'practical/review-a-teammate-s-pr', 'practical/wrap-up'], 50,
    [['practical/before-the-call', 0, 0], ['practical/intro', 0, 5], ['practical/review-a-teammate-s-pr', 5, 35], ['practical/deep-dive', 40, 0], ['practical/walk-the-resume', 40, 15], ['practical/wrap-up', 55, 10]], 65,
  ]);
});

test('a log from 1.0.2, with no planned length and no minutes puts, opens with the steps it had', () => {
  const log = [
    { n: 0, h: '0194c0de0000.0000', t: 'open', v: 2, sid: 'k3x9q2', author: 'a-jason', role: 'senior-frontend-engineer', round: 'practical', pack: { id: 'pack-6f39cc38', version: '1.0.2', sha: 'e6854f1' } },
    { n: 1, h: '0194c0de03e8.0000', t: 'put', k: 'session.candidate', v: 'Sam Lee' },
    { n: 2, h: '0194c0de07d0.0000', t: 'put', k: 'session.startedAt', v: '0194c0de0000' },
  ];
  const shared = foldShared({ 'a-jason': log });
  const was = runOfShow(practical, shared);
  const now = runOfShow(composeRound(pack, senior, practical), shared);
  expect([now.steps.map((s) => [s.seg, s.start, s.minutes]), now.minutes, shared.length]).toEqual([was.steps.map((s) => [s.seg, s.start, s.minutes]), 60, undefined]);
});

test('coverage says yes for a competency an activity that is on can show, topics when only a deep dive could, and none otherwise', () => {
  const round = composeRound(pack, mid, practical);
  const steps = (segments) => runOfShow(round, plan(segments)).steps;
  expect([
    coverage(pack, mid, steps({}), 'mid'),
    coverage(pack, mid, steps({ 'practical/review-a-teammate-s-pr': { minutes: 0 } }), 'mid'),
    coverage(pack, mid, steps({ 'practical/review-a-teammate-s-pr': { minutes: 0 }, 'practical/deep-dive': { minutes: 0 } }), 'mid'),
  ]).toEqual([
    { craft: 'yes', judgment: 'yes', communication: 'topics' },
    { craft: 'topics', judgment: 'topics', communication: 'topics' },
    { craft: 'none', judgment: 'none', communication: 'none' },
  ]);
});

test('coverage asks inScope about each row, so a row the minutes drop no longer counts', () => {
  const steps = runOfShow(composeRound(pack, mid, practical), noPlan).steps;
  const only = (want) => (item, o) => o.competencies.includes(want);
  expect(coverage(pack, mid, steps, 'mid', only('craft'))).toEqual({ craft: 'yes', judgment: 'none', communication: 'none' });
});
