import { expect, test } from 'vitest';
import { foldEvidence, foldShared, hasDecided, nameOf, nudgesBefore, press, rowState } from '../../src/evidence/reduce.js';

const H = (i) => `0194c0de${(0x1000 + i).toString(16).padStart(4, '0')}.0000`;
const log = (...bodies) => bodies.map((body, n) => ({ n, h: H(n), ...body }));
const REF = 'css-04#mid.1';
const D = 'a1b2c3d4';
const mark = (s) => ({ t: 'mark', o: REF, d: D, s });
const nudge = (k, given) => ({ t: 'prompt', p: `${REF}~nudge.${k}`, ...(given === false ? { given } : {}) });

test('a press marks an unmarked row seen and clears a marked one', () => {
  const first = press(foldEvidence([]), REF, D);
  const seen = foldEvidence(log(first));
  const second = press(seen, REF, D);
  const cleared = foldEvidence(log(first, second));
  expect([first, rowState(seen, REF, true), second, rowState(cleared, REF, true)])
    .toEqual([mark('seen'), 'seen', mark('clear'), 'not-marked']);
});

test('a nudge given before the seen mark reads seen after a nudge, and names the nudge', () => {
  const ev = foldEvidence(log(nudge(1), mark('seen')));
  expect([rowState(ev, REF, true), nudgesBefore(ev, REF)]).toEqual(['seen-after-nudge', [`${REF}~nudge.1`]]);
});

test('a nudge given after the seen mark leaves the row seen', () => {
  const ev = foldEvidence(log(mark('seen'), nudge(1)));
  expect([rowState(ev, REF, true), nudgesBefore(ev, REF)]).toEqual(['seen', []]);
});

test('a taken-back nudge counts for nothing', () => {
  const ev = foldEvidence(log(nudge(1), nudge(1, false), mark('seen')));
  expect([rowState(ev, REF, true), nudgesBefore(ev, REF)]).toEqual(['seen', []]);
});

test('not seen is set only by its own event, and a press on it clears it', () => {
  const unseen = foldEvidence(log(mark('unseen')));
  const pressed = press(unseen, REF, D);
  const closed = foldEvidence(log({ t: 'close', item: 'css-04', closed: true }));
  expect([rowState(unseen, REF, true), pressed.s, rowState(foldEvidence(log(mark('unseen'), pressed)), REF, true), rowState(closed, REF, true)])
    .toEqual(['unseen', 'clear', 'not-marked', 'not-marked']);
});

test('closing an item changes no row', () => {
  const before = foldEvidence(log(mark('seen'), { t: 'mark', o: 'css-04#mid.2', d: D, s: 'unseen' }));
  const after = foldEvidence(log(mark('seen'), { t: 'mark', o: 'css-04#mid.2', d: D, s: 'unseen' }, { t: 'close', item: 'css-04', closed: true }));
  const rows = (ev) => [REF, 'css-04#mid.2', 'css-04#mid.3'].map((r) => rowState(ev, r, true));
  expect([rows(before), rows(after), after.closed.has('css-04')]).toEqual([['seen', 'unseen', 'not-marked'], ['seen', 'unseen', 'not-marked'], true]);
});

test('a row never opened is not asked, and an opened row left blank is not marked', () => {
  const ev = foldEvidence([]);
  expect([rowState(ev, REF, false), rowState(ev, REF, true)]).toEqual(['not-asked', 'not-marked']);
});

test('the first decide is the blind one and later ones are amendments', () => {
  const ev = foldEvidence(log({ t: 'decide', choice: 'hire', level: 'mid', why: 'Meets the bar.' }, { t: 'peek', from: 'a2' }, { t: 'decide', choice: 'no-hire', why: 'Changed my mind.' }));
  expect([ev.decision, ev.amendments, [...ev.peeks]]).toEqual([
    { choice: 'hire', level: 'mid', why: 'Meets the bar.', h: H(0) },
    [{ choice: 'no-hire', level: undefined, why: 'Changed my mind.', h: H(2) }],
    [['a2', H(1)]],
  ]);
});

test('the latest note per scope wins and the focus level is the last one set', () => {
  const ev = foldEvidence(log({ t: 'note', scope: 'css-04', text: 'first' }, { t: 'note', scope: 'pr', text: 'other' }, { t: 'note', scope: 'css-04', text: 'latest' }, { t: 'focus', level: 'senior' }));
  expect([[...ev.notes], ev.focus]).toEqual([[['css-04', 'latest'], ['pr', 'other']], 'senior']);
});

const pub = (author, ...bodies) => [{ n: 0, h: H(0), t: 'open', v: 2, sid: 's', author, role: 'r', round: 'p', pack: { id: 'x', version: '1', sha: 'a' } }, ...bodies.map((body, i) => ({ n: i + 1, ...body }))];
const SEG = 'practical/deep-dive';

test('the shared plan takes the later stamp per register and keeps every ticked set member in add order', () => {
  const streams = {
    a1: pub('a1', { h: H(1), t: 'put', k: 'session.candidate', v: 'Sam' }, { h: H(2), t: 'put', k: 'session.startedAt', v: '0194c0de1000' }, { h: H(5), t: 'put', k: 'segment.minutes', seg: SEG, v: 20 },
      { h: H(3), t: 'member', k: 'segment.pools', seg: SEG, id: 'css', v: true }, { h: H(7), t: 'member', k: 'session.passions', id: 'css', v: 'CSS' }, { h: H(9), t: 'member', k: 'segment.asked', seg: SEG, id: 'css-04', v: true }),
    a2: pub('a2', { h: H(4), t: 'put', k: 'session.candidate', v: 'Sam Lee' }, { h: H(6), t: 'put', k: 'segment.minutes', seg: SEG, v: 15 }, { h: H(8), t: 'put', k: 'segment.fallback', seg: SEG, v: true },
      { h: H(2), t: 'member', k: 'segment.pools', seg: SEG, id: 'html', v: true }, { h: H(10), t: 'member', k: 'segment.pools', seg: SEG, id: 'html', v: null }, { h: H(6), t: 'member', k: 'session.passions', id: 'x-animation', v: 'Animation' }),
  };
  const plan = foldShared(streams);
  expect(plan).toEqual({
    candidate: 'Sam Lee',
    startedAt: 0x0194c0de1000,
    passions: [{ id: 'x-animation', label: 'Animation' }, { id: 'css', label: 'CSS' }],
    segments: { [SEG]: { minutes: 15, fallback: true, pools: ['css'], asked: ['css-04'] } },
  });
  expect(foldShared({ a2: streams.a2, a1: streams.a1 })).toEqual(plan);
});

test('an equal stamp breaks the tie by author id', () => {
  const streams = { a1: pub('a1', { h: H(1), t: 'put', k: 'session.candidate', v: 'from a1' }), a2: pub('a2', { h: H(1), t: 'put', k: 'session.candidate', v: 'from a2' }) };
  expect([foldShared(streams).candidate, foldShared({ a2: streams.a2, a1: streams.a1 }).candidate]).toEqual(['from a2', 'from a2']);
});

test('a pub stream says whether its author decided and what they are called', () => {
  const quiet = pub('a1', { h: H(1), t: 'name', name: 'Jason' });
  const done = [...quiet, { n: 2, h: H(2), t: 'name', name: 'Jay' }, { n: 3, h: H(3), t: 'decided' }];
  expect([hasDecided(quiet), nameOf(quiet), hasDecided(done), nameOf(done), nameOf(pub('a1'))]).toEqual([false, 'Jason', true, 'Jay', undefined]);
});
