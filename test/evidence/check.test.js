import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import fc from 'fast-check';
import { expect, test } from 'vitest';
import { checkEvent, checkPrv, checkPub } from '../../src/evidence/check.js';

const ajv = new Ajv2020({ strict: true }).compile(JSON.parse(readFileSync('src/evidence/event.schema.json', 'utf8')));
const H = '0194c0de1234.0001';
const ev = (t, rest = {}) => ({ n: 3, h: H, t, ...rest });

const CASES = [
  [ev('mark', { o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen' }), true, 'mark'],
  [ev('mark', { o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen', score: 4 }), false, 'a score field'],
  [ev('mark', { o: 'x', d: 'a1b2c3d4', s: 'prompted' }), false, 'prompted is derived, never written'],
  [ev('prompt', { p: 'review-a-pr#divs~nudge.1' }), true, 'prompt given'],
  [ev('prompt', { p: 'review-a-pr#divs~nudge.1', given: false }), true, 'prompt taken back'],
  [ev('decide', { choice: 'hire', why: 'solid' }), true, 'decide'],
  [ev('focus', { level: 'senior' }), true, 'focus'],
  [ev('note', { scope: 'css-04', text: 'x'.repeat(8001) }), false, 'note over 8,000 characters'],
  [ev('put', { k: 'segment.minutes', seg: 'practical/deep-dive', v: 20 }), true, 'put minutes'],
  [ev('put', { k: 'session.candidate', v: 'Sam Lee' }), true, 'put candidate'],
  [ev('put', { k: 'session.startedAt', v: '0194c0de1000' }), true, 'put start'],
  [ev('put', { k: 'session.length', v: 65 }), true, 'put planned length'],
  [ev('put', { k: 'session.length', v: 735 }), true, 'four activities at 180 minutes with their frames'],
  [ev('put', { k: 'session.length', v: 1440 }), true, 'a planned length of a whole day'],
  [ev('put', { k: 'session.length', v: 1441 }), false, 'a planned length over a day'],
  [ev('put', { k: 'session.focus', v: 'senior' }), false, 'focus is not shared'],
  [ev('member', { k: 'session.passions', id: 'accessibility', v: 'Accessibility' }), true, 'passion ticked'],
  [ev('member', { k: 'session.passions', id: 'p1', v: null }), true, 'passion unticked'],
  [ev('member', { k: 'segment.pools', seg: 'practical/deep-dive', id: 'css', v: true }), true, 'pool picked'],
  [ev('member', { k: 'segment.asked', seg: 'practical/deep-dive', id: 'css-04', v: true }), true, 'card asked'],
  [ev('put', { k: 'score.alex.css', v: 4 }), false, 'a score in a register'],
  [ev('put', { k: 'pr.ratings', v: { rating: 3 } }), false, 'a rating object in a register'],
  [ev('put', { k: 'candidate.score', v: 4 }), false, 'candidate.score'],
  [ev('member', { k: 'session.passions', id: 'p1', v: 3 }), false, 'a number as a set member'],
  [ev('member', { k: 'segment.pools', seg: 'practical/deep-dive', id: 'css', v: 5 }), false, 'a weight on a pool'],
  [ev('put', { k: 'segment.minutes', seg: 'practical/deep-dive', v: '20' }), false, 'minutes as text'],
  [ev('segment.start', { seg: 'practical/deep-dive', cards: ['css-01', 'html-02'] }), true, 'a segment started with its list'],
  [ev('segment.start', { seg: 'practical/deep-dive', cards: ['css-01', 'css-01'] }), false, 'a card listed twice'],
  [ev('segment.done', { seg: 'practical/intro' }), true, 'a segment done'],
  [ev('segment.done', { seg: 'practical/deep-dive', id: 'css-01' }), true, 'a question done'],
  [ev('skip', { seg: 'practical/deep-dive', id: 'css-01', reason: 'covered' }), true, 'a question skipped as covered'],
  [ev('skip', { seg: 'practical/outro', reason: 'no-time' }), true, 'a segment skipped for time'],
  [ev('skip', { seg: 'practical/deep-dive', id: 'css-01', reason: 'weak' }), false, 'a skip reason that judges'],
  [ev('amend', { seg: 'practical/deep-dive', id: 'css-01' }), true, 'an amendment to a finished question'],
  [ev('amend', { seg: 'practical/deep-dive', id: 'css-01', was: 'seen' }), false, 'an amendment carrying a mark'],
  [ev('mark', { o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen', src: 'self' }), true, 'a mark that names its own maker'],
  [ev('mark', { o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen', src: 'ai', quote: 'I would reach for grid here.', at: '12:04' }), true, 'a second opinion proposing a mark'],
  [ev('mark', { o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'unseen', src: 'accepted', quote: 'Not sure.', at: '1:02:09' }), true, 'a proposal accepted'],
  [ev('mark', { o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen', quote: 'I would reach for grid here.' }), false, 'a quote on my own mark'],
  [ev('mark', { o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen', src: 'self', at: '12:04' }), false, 'a transcript time on my own mark'],
  [ev('mark', { o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen', src: 'ai', at: '724' }), false, 'a transcript time as bare seconds'],
  [ev('mark', { o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen', src: 'model' }), false, 'an unknown maker'],
  [ev('bookmark'), true, 'a bare bookmark'],
  [ev('bookmark', { id: 'css-04', word: 'tradeoffs' }), true, 'a bookmark on a card with a word'],
  [ev('bookmark', { word: 'two words' }), false, 'a bookmark with more than one word'],
  [ev('feedback.round', { rating: 4, words: 'anything' }), true, 'a type from a newer kit, whatever it carries'],
  [ev('Feedback', { x: 1 }), false, 'a newer type outside the type pattern'],
  [{ t: 'feedback.round' }, false, 'a newer type with no position or stamp'],
  [ev('decide', { choice: 'hire' }), false, 'a known type that fails its shape never passes as newer'],
];

test('the hand-written check and Ajv agree on every planted case', () => {
  expect(CASES.map(([v, want, why]) => [why, ajv(v), checkEvent(v)])).toEqual(CASES.map(([, want, why]) => [why, want, want]));
});

test('each stream refuses the other stream\'s types', () => {
  const note = ev('note', { scope: 's', text: 'leans no' });
  const name = ev('name', { name: 'Alex' });
  expect([checkPub(note), checkPrv(note), checkPub(name), checkPrv(name), checkPub(null), checkPrv({ t: 'mark' })]).toEqual([false, true, true, false, false, false]);
});

const EVENTS = [
  ev('open', { v: 2, sid: 'k3x9q2', author: 'a1', role: 'frontend-engineer', round: 'practical', pack: { id: 'sample', version: '1.0.0', sha: 'e6854f1' } }),
  ev('name', { name: 'Alex' }), ev('put', { k: 'session.candidate', v: 'Sam' }), ev('put', { k: 'session.startedAt', v: '0194c0de1000' }),
  ev('put', { k: 'segment.minutes', seg: 'practical/deep-dive', v: 10 }), ev('put', { k: 'segment.fallback', seg: 'practical/review-a-pr', v: true }),
  ev('member', { k: 'session.passions', id: 'css', v: 'CSS' }), ev('member', { k: 'segment.pools', seg: 'practical/deep-dive', id: 'css', v: null }),
  ev('member', { k: 'segment.asked', seg: 'practical/deep-dive', id: 'css-04', v: true }), ev('decided'),
  ev('mark', { o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen' }), ev('prompt', { p: 'review-a-pr#divs~nudge.1', given: false }),
  ev('note', { scope: 'css-04', text: 'Found it after the hint.' }), ev('close', { item: 'css-04', closed: true }), ev('focus', { level: 'senior' }),
  ev('decide', { choice: 'hire', level: 'mid', why: 'Meets the bar.' }), ev('peek', { from: 'a2' }),
  ev('segment.start', { seg: 'practical/deep-dive', cards: ['css-01', 'html-02'] }), ev('segment.done', { seg: 'practical/deep-dive', id: 'css-01' }),
  ev('skip', { seg: 'practical/outro', reason: 'no-time' }), ev('amend', { seg: 'practical/deep-dive', id: 'css-01' }), ev('feedback.round', { words: 'x' }),
  ev('mark', { o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen', src: 'ai', quote: 'Grid.', at: '12:04' }), ev('bookmark', { id: 'css-04', word: 'tradeoffs' }),
];
const paths = (v, p = []) => (v && typeof v === 'object' ? [p, ...Object.entries(v).flatMap(([k, x]) => paths(x, [...p, k]))] : [p]);
const mutate = (value, pick, op, junk) => {
  const v = structuredClone(value);
  const all = paths(v);
  const path = all[pick % all.length];
  const parent = path.slice(0, -1).reduce((a, k) => a[k], v);
  const key = path.at(-1);
  if (op === 0 && key !== undefined) delete parent[key];
  else if (op === 1) { const tgt = path.reduce((a, k) => a[k], v); if (tgt && typeof tgt === 'object') tgt.score = junk; }
  else if (op === 2 && key !== undefined) parent[key] = junk;
  return v;
};

test('the hand-written check and Ajv agree on 20,000 random mutations of valid events', () => {
  let compared = 0;
  let valid = 0;
  fc.assert(fc.property(fc.nat(EVENTS.length - 1), fc.nat(), fc.nat(2), fc.jsonValue(), fc.boolean(), (i, pick, op, junk, raw) => {
    const v = raw ? EVENTS[i] : mutate(EVENTS[i], pick, op, junk);
    compared++;
    if (ajv(v)) valid++;
    return ajv(v) === checkEvent(v);
  }), { numRuns: 20_000, seed: 42 });
  expect([compared, valid > 5_000, valid < compared]).toEqual([20_000, true, true]);
}, 60_000);
