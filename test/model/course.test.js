import { expect, test } from 'vitest';
import { foldEvidence, foldShared } from '../../src/evidence/reduce.js';
import { loadPack } from '../../src/pack/load.js';
import { courseStates, coursePath, moveOnTarget, nextAfter, stateLabel, stepName } from '../../src/model/course.js';

const { model: pack } = await loadPack('examples/sample-pack');
const round = pack.rounds.find((r) => r.id === 'practical');
const DD = 'practical/deep-dive';
const H = (i) => `0194c0de${(0x1000 + i).toString(16).padStart(4, '0')}.0000`;
const at = (h) => `t${parseInt(h.slice(8, 12), 16) - 0x1000}`;
const open = { n: 0, h: H(0), t: 'open', v: 2, sid: 's', author: 'a1', role: 'frontend-engineer', round: 'practical', pack: { id: 'x', version: '1', sha: 'a' } };
const planOf = (...bodies) => foldShared({ a1: [open, ...bodies.map((b, i) => ({ n: i + 1, h: H(i + 1), ...b }))] });
const pools = (...ids) => ids.map((id) => ({ t: 'member', k: 'segment.pools', seg: DD, id, v: true }));
const keys = (steps) => steps.map((s) => [s.key, s.label]);

test('the path is every step of the run of show in order, with a questions segment as one step per card it lists', () => {
  expect(keys(coursePath(pack, round, planOf()))).toEqual([
    ['practical/before-the-call', 'Before the call'], ['practical/intro', 'Intro'], ['practical/review-a-teammate-s-pr', "Review a teammate's PR"], ['practical/wrap-up', 'Wrap-up'],
  ]);
  const path = coursePath(pack, round, planOf(...pools('html')));
  expect(path.filter((s) => s.kind === 'card').map((s) => [s.key, s.label, s.title, s.minutes, s.appended]))
    .toEqual([['html-01', 'Q1', 'Button or link?', 5, false], ['html-02', 'Q2', 'Label a form field', 5, false]]);
});

test('a card added by a pool change after the segment started is marked as added, after the cards listed at the start', () => {
  const plan = planOf(...pools('html'), { t: 'segment.start', seg: DD, cards: ['html-01', 'html-02'] }, { t: 'put', k: 'segment.minutes', seg: DD, v: 20 }, ...pools('css'));
  expect(coursePath(pack, round, plan).filter((s) => s.kind === 'card').map((s) => [s.key, s.appended]))
    .toEqual([['html-01', false], ['html-02', false], ['html-03', true], ['css-01', true]]);
});

test('each step reads current, done, skipped, left, up next or upcoming, with its amendments', () => {
  const plan = planOf(...pools('html'), { t: 'segment.done', seg: 'practical/before-the-call' }, { t: 'segment.done', seg: 'practical/intro' },
    { t: 'skip', seg: 'practical/review-a-teammate-s-pr', reason: 'no-time' });
  const evidence = foldEvidence([{ n: 0, h: H(9), t: 'amend', seg: 'practical/intro' }]);
  const steps = coursePath(pack, round, plan);
  const states = courseStates(steps, { plan, evidence, here: 'html-01', home: 'html-01', left: new Map() });
  expect(states.map((s) => [s.key, s.state, s.amended.length])).toEqual([
    ['practical/before-the-call', 'done', 0], ['practical/intro', 'done', 1], ['practical/review-a-teammate-s-pr', 'skipped', 0],
    ['html-01', 'current', 0], ['html-02', 'next', 0], ['practical/wrap-up', 'upcoming', 0],
  ]);
  const back = courseStates(steps, { plan, evidence, here: 'practical/intro', home: 'html-01', left: new Map([['html-01', H(10)]]) });
  expect(back.map((s) => s.state)).toEqual(['done', 'current', 'skipped', 'resume', 'upcoming', 'upcoming']);
});

test('each state has words of its own, so it never rests on color or an icon alone', () => {
  const plan = planOf(...pools('html'), { t: 'segment.done', seg: 'practical/intro' }, { t: 'skip', seg: DD, id: 'html-02', reason: 'covered' });
  const evidence = foldEvidence([{ n: 0, h: H(5), t: 'amend', seg: 'practical/intro' }]);
  const steps = coursePath(pack, round, plan);
  const states = courseStates(steps, { plan, evidence, here: 'practical/intro', home: 'html-01', left: new Map([['html-01', H(4)]]) });
  expect(states.map((s) => [stateLabel(s, at), stepName(s, at)])).toEqual([
    ['0 min', 'Before the call, 0 min'],
    ['Done t2 · Here', 'Intro, Done t2 · Here, amended at t5'],
    ['35 min', "Review a teammate's PR, 35 min"],
    ['Left t4', 'Q1, Button or link?, Left t4'],
    ['Skipped · Already asked', 'Q2, Label a form field, Skipped · Already asked'],
    ['10 min', 'Wrap-up, 10 min'],
  ]);
  const now = courseStates(steps, { plan, evidence, here: 'html-01', home: 'html-01', left: new Map() });
  expect(stateLabel(now.find((s) => s.key === 'html-01'), at)).toBe('Now');
});

test('Complete goes to the step left behind, then the next unfinished step, and from the last step to Decide', () => {
  const plan = planOf(...pools('html'), { t: 'segment.done', seg: 'practical/before-the-call' }, { t: 'segment.done', seg: 'practical/intro' });
  const steps = coursePath(pack, round, plan);
  expect([
    nextAfter(steps, plan, 'practical/intro'),
    moveOnTarget(steps, plan, { from: 'practical/review-a-teammate-s-pr', home: 'practical/review-a-teammate-s-pr' }),
    moveOnTarget(steps, plan, { from: 'practical/intro', home: 'html-01' }),
    moveOnTarget(steps, plan, { from: 'html-01', home: 'html-01', jump: 'practical/wrap-up' }),
    moveOnTarget(steps, plan, { from: 'practical/wrap-up', home: 'practical/wrap-up' }),
  ]).toEqual(['practical/review-a-teammate-s-pr', 'html-01', 'html-01', 'practical/wrap-up', null]);
  const allDone = planOf(...steps.map((s) => ({ t: 'segment.done', seg: s.seg, ...(s.id && { id: s.id }) })));
  expect(nextAfter(steps, allDone, 'html-01')).toBe(null);
});
