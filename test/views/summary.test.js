import { expect, test } from 'vitest';
import { foldEvidence, foldShared } from '../../src/evidence/reduce.js';
import { summarize, summaryText } from '../../src/views/summary.js';
import { DIVS, fixturePack, logOf, mark, open } from './fixture.js';

const pack = await fixturePack();
const role = pack.roles.find((r) => r.id === 'frontend-engineer');
const round = pack.rounds[0];
const seg = 'practical/deep-dive';

const log = logOf([
  open('a-jason'),
  { t: 'name', name: 'Jason' },
  { t: 'put', k: 'session.candidate', v: 'Sam Lee' },
  { t: 'member', k: 'session.passions', id: 'css', v: 'CSS and layout' },
  { t: 'member', k: 'session.passions', id: 'x-animation', v: 'Animation' },
  { t: 'put', k: 'segment.minutes', seg, v: 20 },
  { t: 'member', k: 'segment.pools', seg, id: 'html', v: true },
  { t: 'member', k: 'segment.pools', seg, id: 'css', v: true },
  { t: 'member', k: 'segment.asked', seg, id: 'css-09', v: true },
  { t: 'prompt', p: 'review-a-pr#divs~nudge.1' },
  mark('review-a-pr#divs', DIVS),
  mark('review-a-pr#typing', '**Typing in the field is broken.** Typing `15` leaves `1.00`, and Backspace cannot clear it.', 'unseen'),
  mark('review-a-pr#error-link', '**The error is not linked to the field.** No `aria-invalid`, no `aria-describedby`, no live region.'),
  mark('review-a-pr#senior.2', '**Money held in floats.** Halving shows `0.13` but places `0.125`.'),
  mark('css-10#mid.1', 'Names the layout shift metric'),
  { t: 'note', scope: 'review-a-pr', text: 'Found tabbing only after the hint.' },
]);

const summary = (l = log) => summarize({ pack, role, round, plan: foldShared({ 'a-jason': l.pub }), evidence: foldEvidence(l.prv) });

test('the summary opens with the passions, groups rows by competency then level, and names every row state', () => {
  expect(summaryText(summary())).toBe(`Sam Lee
Frontend engineer, Practical round
Says they specialize in: CSS and layout, Animation
● seen  ◐ seen after a nudge  ○ not seen  · not marked  – not asked  ◌ out of scope

Craft
  Junior  ◐○––
    Seen after nudge 1: Plus and minus are divs, not buttons. No focus, no role, and the glyph is the name.
    Not seen: Typing in the field is broken. Typing \`15\` leaves \`1.00\`, and Backspace cannot clear it.
    Not asked: Names \`overflow: hidden\` on the card as what clips the menu
    Not asked: Checks the rules in devtools instead of guessing
  Mid  ●––––
    Seen: The error is not linked to the field. No \`aria-invalid\`, no \`aria-describedby\`, no live region.
    Not asked: Links go somewhere, buttons do something
    Not asked: Names keyboard and screen reader differences
    Not asked: Avoids a \`div\` with a click handler
    Not asked: Explains the page's \`z-index\` creates a stacking context capping the menu
Judgment
  Mid  ·–
    Not marked: Rebuilds components the design system has. The field and button are hand-made, though \`src/ds\` has both.
    Not asked: Moves the menu out of the clip, and names the trade-off
  Senior  ●
    Seen: Money held in floats. Halving shows \`0.13\` but places \`0.125\`.
Communication
  Mid  –
    Not asked: Says what the fix does to keyboard focus
Other
  Mid  ·
    Not marked: Reserves space for the image before it loads

Also asked
  Page jumps while it loads
    Mid  ●
      Seen: Names the layout shift metric

Stretch prompts not asked
  Review a teammate's PR: Make the plus and minus controls work for keyboard users. What would you change?
  Review a teammate's PR: Product wants the quantity limited to the stock left. Where does that rule live, and who needs to know?

Notes
  Review a teammate's PR: Found tabbing only after the hint.`);
});

test('a mark finds its bullet by digest after the list was reordered, and a reworded bullet says so', () => {
  const moved = logOf([open('a-jason'), mark('review-a-pr#junior.9', DIVS), mark('review-a-pr#mid.2', 'Rebuilds components the old way')]);
  const rows = summary(moved).groups.flatMap((g) => g.levels.flatMap((l) => l.rows)).filter((r) => r.state === 'seen');
  expect(rows.map((r) => [r.ref, r.state, r.reworded])).toEqual([['review-a-pr#divs', 'seen', false], ['review-a-pr#mid.2', 'seen', true]]);
});

test('a basics row marked missing is listed apart, and no row carries a number', () => {
  const senior = pack.roles.find((r) => r.id === 'senior-frontend-engineer');
  const missing = logOf([open('a-jason'), mark('css-04#junior.1', 'Names `overflow: hidden` on the card as what clips the menu', 'unseen')]);
  const s = summarize({ pack, role: senior, round, plan: foldShared({ 'a-jason': missing.pub }), evidence: foldEvidence(missing.prv) });
  expect(s.basicsMissing).toEqual([{ item: 'css-04', title: 'Menu cut off by its card', text: 'Names `overflow: hidden` on the card as what clips the menu' }]);
  expect(summaryText(s)).not.toMatch(/\d+ (of|out of|\/) \d+|%|score|weak|solid|strong/i);
});

const REVIEW = 'practical/review-a-teammate-s-pr';
const craftAndJudgment = (s) => s.groups.filter((g) => ['craft', 'judgment'].includes(g.id)).flatMap((g) => g.levels.flatMap((l) => l.rows))
  .filter((r) => r.item === 'review-a-pr').map((r) => [r.ref, r.state]);

test('below coreBelow a blank row that is not core reads Out of scope, while core rows, marked rows and question cards read as they did', () => {
  const short = (minutes, ...marks) => logOf([open('a-jason'), { t: 'put', k: 'segment.minutes', seg: REVIEW, v: minutes },
    { t: 'member', k: 'segment.asked', seg, id: 'css-09', v: true }, ...marks]);
  const typing = mark('review-a-pr#typing', '**Typing in the field is broken.** Typing `15` leaves `1.00`, and Backspace cannot clear it.', 'unseen');
  expect(craftAndJudgment(summary(short(15)))).toEqual([
    ['review-a-pr#divs', 'not-asked'],
    ['review-a-pr#typing', 'out-of-scope'],
    ['review-a-pr#error-link', 'not-asked'],
    ['review-a-pr#mid.2', 'out-of-scope'],
  ]);
  expect(craftAndJudgment(summary(short(15, typing)))).toEqual([
    ['review-a-pr#divs', 'not-marked'],
    ['review-a-pr#typing', 'unseen'],
    ['review-a-pr#error-link', 'not-marked'],
    ['review-a-pr#mid.2', 'out-of-scope'],
  ]);
  expect(craftAndJudgment(summary(short(20, typing)))).toEqual([
    ['review-a-pr#divs', 'not-marked'],
    ['review-a-pr#typing', 'unseen'],
    ['review-a-pr#error-link', 'not-marked'],
    ['review-a-pr#mid.2', 'not-marked'],
  ]);
  const text = summaryText(summary(short(15, typing)));
  expect(text).toContain('Judgment\n  Mid  ◌\n    Out of scope: Rebuilds components the design system has.');
  expect(summary(short(15)).groups.flatMap((g) => g.levels.flatMap((l) => l.rows)).filter((r) => r.item === 'css-09').map((r) => r.state)).toEqual(['not-marked']);
});

test('a row out of scope that was given a nudge was probed, so it reads Not marked', () => {
  const pr = `practical/${round.segments.find((s) => s.ref === 'review-a-pr').id}`;
  const asked = { t: 'member', k: 'segment.asked', seg: pr, id: 'review-a-pr', v: true };
  const below = (...more) => logOf([open('a-jason'), { t: 'put', k: 'segment.minutes', seg: pr, v: 15 }, asked, ...more]);
  const state = (l) => summary(l).groups.flatMap((g) => g.levels.flatMap((x) => x.rows)).find((r) => r.ref === 'review-a-pr#typing').state;
  expect([state(below()), state(below({ t: 'prompt', p: 'review-a-pr#typing~nudge.1' }))]).toEqual(['out-of-scope', 'not-marked']);
});

test('a row of an activity set to 0 minutes reads as its panel shows it, not out of scope', () => {
  const pr = `practical/${round.segments.find((s) => s.ref === 'review-a-pr').id}`;
  const l = logOf([open('a-jason'), { t: 'put', k: 'segment.minutes', seg: pr, v: 0 }, { t: 'member', k: 'segment.asked', seg: pr, id: 'review-a-pr', v: true }]);
  expect(summary(l).groups.flatMap((g) => g.levels.flatMap((x) => x.rows)).find((r) => r.ref === 'review-a-pr#typing').state).toBe('not-marked');
});
