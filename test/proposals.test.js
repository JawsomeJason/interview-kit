import { expect, test } from 'vitest';
import { unlock } from '../src/evidence/gate.js';
import { foldEvidence, rowState } from '../src/evidence/reduce.js';
import { answer, proposals } from '../src/components/proposals.js';
import { logOf, open } from './views/fixture.js';

const say = { ref: (ref) => `row ${ref}`, item: (id) => `card ${id}` };
const ai = logOf([open('a-ai'), { t: 'name', name: 'Second opinion (AI)' }, { t: 'decided' },
  { t: 'mark', o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen', src: 'ai', quote: 'I would clip with overflow first.', at: '12:04' },
  { t: 'mark', o: 'css-04#mid.2', d: 'b1b2c3d4', s: 'unseen', src: 'ai', quote: 'Not sure what a stacking context is.', at: '13:10' },
  { t: 'mark', o: 'css-04#mid.3', d: 'c1b2c3d4', s: 'seen', src: 'ai' }], 0x0194c0de0000 + 500);
const mine = (...after) => logOf([open('a-me'), { t: 'mark', o: 'css-04#mid.3', d: 'c1b2c3d4', s: 'unseen' }, { t: 'bookmark', id: 'css-04', word: 'strong' },
  { t: 'decide', choice: 'hire', why: 'Yes.' }, { t: 'decided' }, ...after]);
const review = (log) => proposals(unlock({ 'a-me': log, 'a-ai': ai }, 'a-me'), log, say);

test('a second opinion\'s marks are proposals only after my decision, each with its quote, time and my bookmarks on the card', () => {
  const before = logOf([open('a-me'), { t: 'mark', o: 'css-04#mid.3', d: 'c1b2c3d4', s: 'unseen' }]);
  expect([proposals({ me: 'a-me', participants: [] }, before, say), review(mine()).map((p) => [p.ref, p.s, p.quote, p.at, p.had, p.outcome, p.bookmarks.map((b) => b.word)])]).toEqual([[], [
    ['css-04#mid.1', 'seen', 'I would clip with overflow first.', '12:04', 'clear', null, ['strong']],
    ['css-04#mid.2', 'unseen', 'Not sure what a stacking context is.', '13:10', 'clear', null, ['strong']],
    ['css-04#mid.3', 'seen', undefined, undefined, 'unseen', null, ['strong']],
  ]]);
});

test('Accept takes the AI\'s state as mine with its quote, Change takes the other one, and Reject keeps what the row held at my decision', () => {
  const list = review(mine());
  const answers = [answer(list[0], 'accept'), answer(list[1], 'change'), answer(list[2], 'reject')].flat();
  expect(answers).toEqual([
    { t: 'mark', o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen', src: 'accepted', quote: 'I would clip with overflow first.', at: '12:04' },
    { t: 'mark', o: 'css-04#mid.2', d: 'b1b2c3d4', s: 'seen', src: 'self' },
    { t: 'mark', o: 'css-04#mid.3', d: 'c1b2c3d4', s: 'unseen', src: 'self' },
  ]);
  expect(review(mine(...answers)).map((p) => [p.outcome, p.now])).toEqual([['accepted', 'seen'], ['changed', 'seen'], ['rejected', 'unseen']]);
});

test('a proposal the AI marked after a nudge reads as seen after a nudge, and Accept logs the nudge before the mark so my own summary reads it too', () => {
  const nudged = logOf([open('a-ai'), { t: 'name', name: 'Second opinion (AI)' }, { t: 'decided' }, { t: 'prompt', p: 'css-04#mid.1~nudge.1' },
    { t: 'mark', o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen', src: 'ai', quote: 'Only after I asked about overflow.', at: '12:04' }], 0x0194c0de0000 + 500);
  const read = (log) => proposals(unlock({ 'a-me': log, 'a-ai': nudged }, 'a-me'), log, say);
  const [p] = read(mine());
  expect([p.s, p.state, p.nudges]).toEqual(['seen', 'seen-after-nudge', ['css-04#mid.1~nudge.1']]);
  const accepted = answer(p, 'accept');
  expect(accepted).toEqual([{ t: 'prompt', p: 'css-04#mid.1~nudge.1' },
    { t: 'mark', o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen', src: 'accepted', quote: 'Only after I asked about overflow.', at: '12:04' }]);
  const after = mine(...accepted);
  expect([rowState(foldEvidence(after.prv), 'css-04#mid.1', true), read(after)[0].outcome]).toEqual(['seen-after-nudge', 'accepted']);
});
