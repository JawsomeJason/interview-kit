import { expect, test } from 'vitest';
import { unlock } from '../../src/evidence/gate.js';
import { foldEvidence } from '../../src/evidence/reduce.js';
import { courseLog, foldAt, merge, timeline, timelineHtml } from '../../src/views/debrief.js';
import { foldShared } from '../../src/evidence/reduce.js';
import { DIVS, fixturePack, logOf, mark, open } from './fixture.js';

const pack = await fixturePack();
const role = pack.roles.find((r) => r.id === 'frontend-engineer');
const round = pack.rounds[0];
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
  const m = merge(unlock(held, 'a-jason'), held, { pack, role, round });
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

test('the merge reads a blank row out of scope at the minutes of the room being replayed, and a colleague who marked it still shows', () => {
  const put = (v) => ({ t: 'put', k: 'segment.minutes', seg: 'practical/review-a-teammate-s-pr', v });
  const short = {
    'a-jason': logOf([...jason.pub.slice(0, 3).map(({ n, h, ...e }) => e), put(35), put(15), mark('review-a-pr#divs', DIVS), { t: 'decide', choice: 'hire', level: 'mid', why: 'Yes.' }, { t: 'decided' }]),
    'a-alex': logOf([open('a-alex'), { t: 'name', name: 'Alex' }, mark('review-a-pr#typing', '**Typing in the field is broken.** Typing `15` leaves `1.00`, and Backspace cannot clear it.'),
      { t: 'decide', choice: 'hire', level: 'mid', why: 'Yes.' }, { t: 'decided' }], 0x0194c0de0000 + 500),
  };
  const u = unlock(short, 'a-jason');
  const cells = (at) => merge(u, short, { pack, role, round }, at).rows.map((r) => [r.ref, r.cells.map((c) => c.state)]);
  expect(cells()).toEqual([
    ['review-a-pr#divs', ['seen', 'not-marked']],
    ['review-a-pr#typing', ['out-of-scope', 'seen']],
    ['review-a-pr#error-link', ['not-marked', 'not-marked']],
    ['review-a-pr#mid.2', ['out-of-scope', 'out-of-scope']],
  ]);
  const before = short['a-jason'].pub.find((e) => e.t === 'put' && e.v === 35).h;
  expect(cells(before).find(([ref]) => ref === 'review-a-pr#mid.2')[1]).toEqual(['not-asked', 'not-marked']);
});

test('decisions show with their wording, level and reason, and a revision after seeing a colleague says so', () => {
  const [me, them] = merge(unlock(held, 'a-jason'), held, { pack, role, round }).columns.map((c) => c.decision);
  expect(me).toEqual({ label: 'Hire', level: 'Mid', why: 'Meets the bar, needed the nudge on keyboard.', revisions: [] });
  expect(them).toEqual({ label: 'No hire', level: 'Junior', why: 'Below the bar on accessibility.',
    revisions: [{ label: 'No hire', level: 'Mid', why: 'Mid after all, still no hire.', when: 'revised after seeing colleagues' }] });
});

test("each person's notes sit under their item", () => {
  expect(merge(unlock(held, 'a-jason'), held, { pack, role, round }).notes).toEqual([
    { scope: 'review-a-pr', title: "Review a teammate's PR", by: [{ name: 'Jason', text: 'Found tabbing only after the hint.' }, { name: 'Alex', text: 'Missed the error link.' }] },
  ]);
});

test('a colleague who has not decided is not in the merge', () => {
  const undecided = { 'a-jason': jason, 'a-alex': { pub: alex.pub.filter((e) => e.t !== 'decided'), prv: alex.prv } };
  expect(merge(unlock(undecided, 'a-jason'), undecided, { pack, role, round }).columns.map((c) => c.name)).toEqual(['Jason']);
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
  expect(() => merge(fake, held, { pack, role, round })).toThrow("Only the gate opens colleagues' evidence");
  expect(() => timeline(fake, held)).toThrow("Only the gate opens colleagues' evidence");
});

test('the timeline says in words which way an interviewer chose to mark', () => {
  const events = logOf([open('a-jason'), { t: 'marking', by: 'ai' }, { t: 'marking', by: 'self' }]).prv.map((e) => ({ author: 'a-jason', name: 'Jason', ch: 'prv', e }));
  expect(timelineHtml(events, 1, {}).match(/<b>Jason<\/b> [^<]+/g)).toEqual(['<b>Jason</b> left the marks to a second opinion', '<b>Jason</b> chose to tick the marks']);
});

// The course log: the planned path against the actual one, one line per step, with what happened inside each. Stamps
// are a second apart from the fixture start, so the test writes each time as its offset.
test('the course log sets each step against when it finished, with skips, amendments, bookmarks and pool changes under it', () => {
  const DD = 'practical/deep-dive';
  const log = logOf([
    open('a-jason'), { t: 'put', k: 'session.startedAt', v: (0x0194c0de0000).toString(16).padStart(12, '0') },
    { t: 'member', k: 'segment.pools', seg: DD, id: 'html', v: true },
    { t: 'segment.done', seg: 'practical/before-the-call' }, { t: 'segment.done', seg: 'practical/intro' },
    { t: 'skip', seg: 'practical/review-a-teammate-s-pr', reason: 'no-time' },
    { t: 'segment.start', seg: DD, cards: ['html-01'] }, { t: 'member', k: 'segment.asked', seg: DD, id: 'html-01', v: true },
    { t: 'bookmark', id: 'html-01', word: 'strong' }, { t: 'member', k: 'segment.pools', seg: DD, id: 'css', v: true },
    { t: 'segment.done', seg: DD, id: 'html-01' }, { t: 'amend', seg: 'practical/intro' }, { t: 'note', scope: 'practical/intro', text: 'Late.' },
  ]);
  const plan = foldShared({ 'a-jason': log.pub });
  const at = (t) => `+${Math.round(((typeof t === 'number' ? t : parseInt(t.slice(0, 12), 16)) - 0x0194c0de0000) / 1000)}s`;
  // A second opinion's file asks the same card in a session of its own, on the transcript's clock, earlier than the call.
  const ai = logOf([{ ...open('a-ai'), sid: 'ai-run' }, { t: 'member', k: 'segment.asked', seg: DD, id: 'html-01', v: true }, { t: 'decided' }], 0x0194c0de0000 - 3_600_000);
  const c = courseLog({ pack, role, round, plan, held: { 'a-jason': log, 'a-ai': ai }, me: 'a-jason', at });
  expect(c.rows.map((r) => [r.sub ? `  ${r.title}` : r.title, r.actual, r.state])).toEqual([
    ['Before the call', '+0s–+3s', 'Done +3s'],
    ['Intro', '+3s–+4s', 'Done +4s'],
    ['  Amended after Done', '+11s', 'Amend, original kept'],
    ["Review a teammate's PR", '+4s–+5s', 'Skipped · No time'],
    ['Q1 · Button or link?', '+7s–+10s', 'Done +10s'],
    ['  Bookmark: strong', '+8s', 'Bookmark'],
    ['  Pool added: CSS and layout, cards appended', '+9s', 'Pool change'],
    ['Q2 · Image pushes the text down', 'Not reached', 'Not reached'],
    ['Wrap-up', 'Not reached', 'Not reached'],
  ]);
  expect([c.totals, c.rows.find((r) => r.title.startsWith('Q2')).appended]).toEqual([{ done: 3, steps: 6, skipped: 1, amended: 1, bookmarks: 1 }, true]);
});
