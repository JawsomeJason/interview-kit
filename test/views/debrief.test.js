import { expect, test } from 'vitest';
import { unlock } from '../../src/evidence/gate.js';
import { foldEvidence } from '../../src/evidence/reduce.js';
import { foldAt, merge, timeline } from '../../src/views/debrief.js';
import { DIVS, fixturePack, logOf, mark, open } from './fixture.js';

const pack = await fixturePack();
const role = pack.roles.find((r) => r.id === 'frontend-engineer');
const ERROR = '**The error is not linked to the field.** No `aria-invalid`, no `aria-describedby`, no live region.';

const jason = logOf([
  open('a-jason'), { t: 'name', name: 'Jason' }, { t: 'put', k: 'session.candidate', v: 'Sam Lee' },
  { t: 'prompt', p: 'review-a-pr#divs~nudge.1' }, mark('review-a-pr#divs', DIVS), mark('review-a-pr#error-link', ERROR),
  { t: 'note', scope: 'review-a-pr', text: 'Found tabbing only after the hint.' },
  { t: 'decide', choice: 'hire', level: 'mid', why: 'Meets the bar, needed the nudge on keyboard.' }, { t: 'decided' },
]);
const alex = logOf([
  open('a-alex'), { t: 'name', name: 'Alex' }, { t: 'focus', level: 'senior' },
  mark('review-a-pr#divs', DIVS), mark('review-a-pr#error-link', ERROR, 'unseen'),
  { t: 'note', scope: 'review-a-pr', text: 'Missed the error link.' },
  { t: 'decide', choice: 'no-hire', level: 'junior', why: 'Below the bar on accessibility.' }, { t: 'decided' },
  { t: 'peek', from: 'a-jason' }, { t: 'decide', choice: 'no-hire', level: 'mid', why: 'Mid after all, still no hire.' },
], 0x0194c0de0000 + 500);
const held = { 'a-jason': jason, 'a-alex': alex };

test('the merge puts rows where people saw different things first, under columns headed with each Evaluating at level', () => {
  const m = merge(unlock(held, 'a-jason'), held, { pack, role });
  expect(m.columns.map((c) => [c.name, c.focus])).toEqual([['Jason', 'Mid'], ['Alex', 'Senior']]);
  expect(m.rows.map((r) => [r.ref, r.differs, r.cells.map((c) => c.state)])).toEqual([
    ['review-a-pr#divs', true, ['seen-after-nudge', 'seen']],
    ['review-a-pr#error-link', true, ['seen', 'unseen']],
    ['review-a-pr#typing', false, ['not-marked', 'not-marked']],
    ['review-a-pr#mid.2', false, ['not-marked', 'not-marked']],
    ['review-a-pr#senior.1', false, ['not-marked', 'not-marked']],
    ['review-a-pr#senior.2', false, ['not-marked', 'not-marked']],
  ]);
});

test('decisions show with their wording, level and reason, and a revision after seeing a colleague says so', () => {
  const [me, them] = merge(unlock(held, 'a-jason'), held, { pack, role }).columns.map((c) => c.decision);
  expect(me).toEqual({ label: 'Hire', level: 'Mid', why: 'Meets the bar, needed the nudge on keyboard.', revisions: [] });
  expect(them).toEqual({ label: 'No hire', level: 'Junior', why: 'Below the bar on accessibility.',
    revisions: [{ label: 'No hire', level: 'Mid', why: 'Mid after all, still no hire.', when: 'revised after seeing colleagues' }] });
});

test("each person's notes sit under their item", () => {
  expect(merge(unlock(held, 'a-jason'), held, { pack, role }).notes).toEqual([
    { scope: 'review-a-pr', title: "Review a teammate's PR", by: [{ name: 'Jason', text: 'Found tabbing only after the hint.' }, { name: 'Alex', text: 'Missed the error link.' }] },
  ]);
});

test('a colleague who has not decided is not in the merge', () => {
  const undecided = { 'a-jason': jason, 'a-alex': { pub: alex.pub.filter((e) => e.t !== 'decided'), prv: alex.prv } };
  expect(merge(unlock(undecided, 'a-jason'), undecided, { pack, role }).columns.map((c) => c.name)).toEqual(['Jason']);
});

test('the timeline lists every released event by stamp, and the scrubber at a stamp equals the fold of events up to it', () => {
  const u = unlock(held, 'a-jason');
  const events = timeline(u, held);
  expect(events.slice(0, 4).map((x) => [x.name, x.e.t])).toEqual([['Jason', 'open'], ['Alex', 'open'], ['Jason', 'name'], ['Alex', 'name']]);
  expect(events.map((x) => x.e.h)).toEqual(events.map((x) => x.e.h).sort());
  const at = alex.prv.find((e) => e.t === 'mark' && e.s === 'unseen').h;
  const { participants } = foldAt(u, held, at);
  expect(participants.map((p) => [p.name, [...p.evidence.marks.keys()]])).toEqual([
    ['Jason', ['review-a-pr#divs']],
    ['Alex', ['review-a-pr#divs', 'review-a-pr#error-link']],
  ]);
  for (const p of participants) expect(p.evidence).toEqual(foldEvidence(held[p.author].prv.filter((e) => e.h <= at)));
});

test('every view refuses a hand-built unlock', () => {
  const fake = { me: 'a-jason', participants: [] };
  expect(() => merge(fake, held, { pack, role })).toThrow("Only the gate opens colleagues' evidence");
  expect(() => timeline(fake, held)).toThrow("Only the gate opens colleagues' evidence");
});
