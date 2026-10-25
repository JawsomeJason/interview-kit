import { expect, test } from 'vitest';
import { canUndo, commit, commitUndoable, newInterview, undo } from '../src/undo.js';

const prev = () => ({ round: 'sample', deepDive: { minutes: 25, pools: ['css'] }, ticks: { 'css-01': [0, 1] }, notes: { 'css-01': 'ok' }, done: ['css-01'], candidate: 'Ada Lovelace' });

test('newInterview clears the interview and keeps only the round, to preselect on the setup page', () => {
  expect([newInterview({ ...prev(), startedAt: 1000 }), newInterview({ lastRound: 'sample' })]).toEqual([{ lastRound: 'sample' }, { lastRound: 'sample' }]);
});

test('undo after New interview restores round, deep dive, ticks and the route', () => {
  commitUndoable(prev(), newInterview(prev()), '#/q/css-01', () => {});
  expect(undo()).toEqual({
    state: { round: 'sample', deepDive: { minutes: 25, pools: ['css'] }, ticks: { 'css-01': [0, 1] }, notes: { 'css-01': 'ok' }, done: ['css-01'], candidate: 'Ada Lovelace' },
    route: '#/q/css-01',
  });
});

test('a new tick drops the undo', () => {
  commitUndoable(prev(), newInterview(prev()), '#/deep-dive', () => {});
  commit({ ...prev(), ticks: { 'css-02': [0] } });
  expect(canUndo()).toBe(false);
});
