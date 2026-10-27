import { expect, test } from 'vitest';
import { unlock } from '../src/evidence/gate.js';
import { foldShared } from '../src/evidence/reduce.js';
import { packetText } from '../src/plugins/ai/packet.js';
import { DIVS, fixturePack, logOf, mark, open } from './views/fixture.js';

const pack = await fixturePack();
const role = pack.roles.find((r) => r.id === 'frontend-engineer');
const round = pack.rounds[0];
const seg = 'practical/deep-dive';

const jason = logOf([
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
  { t: 'decide', choice: 'hire', level: 'mid', why: 'Meets the bar, needed the nudge on keyboard.' },
  { t: 'decided' },
]);
const alex = logOf([
  open('a-alex'),
  { t: 'name', name: 'Alex' },
  mark('review-a-pr#divs', DIVS, 'unseen'),
  { t: 'note', scope: 'review-a-pr', text: 'Leaning no, the basics were shaky.' },
  { t: 'decide', choice: 'no-hire', level: 'junior', why: 'Missed the divs.' },
  { t: 'decided' },
], 0x0194c0df0000);

const packet = (held, notes) => packetText({ pack, role, round, notes,
  plan: foldShared(Object.fromEntries(Object.entries(held).map(([a, l]) => [a, l.pub]))), unlocked: unlock(held, 'a-jason') });

const HEAD = `Says they specialize in: CSS and layout, Animation

Please give a second opinion on how the candidate did in a job interview. The interviewers' names, decisions and levels are left out, so your read is your own.
Role: Frontend engineer
Round: Practical round

For each competency below, say which level the evidence supports, or that there is too little to tell, and cite the rows you rely on (R1, R2). "Not asked" means nobody probed it, so it counts neither way. "Not marked" means it was asked and nothing was recorded.

Levels
  Junior: Delivers well-scoped work with guidance. Explains what they did, and asks when they are stuck.
  Mid: Delivers features on their own, edge cases included. States the assumption they are making, and names what their fix leaves behind.
  Senior: Fixes the class of problem, not the instance. Compares options with a cost for each, and brings other engineers along.

Competencies
  Craft: Builds interfaces that work for everyone who uses them.
    Junior: Reaches for the right HTML element, and checks the result in the browser.
    Mid: Handles keyboard, focus and error states without being asked.
    Senior: Sets the pattern other engineers copy.
  Judgment: Decides what matters, what to change, and what to leave alone.
    Mid: Orders problems by who they hurt.
    Senior: Names the cost of each option, and picks one for this context.
  Communication: Explains the problem so a teammate could act on it.

Interviewer 1
  Craft
    Junior
      R1 Seen after nudge 1: Plus and minus are divs, not buttons. No focus, no role, and the glyph is the name.
      R2 Not seen: Typing in the field is broken. Typing \`15\` leaves \`1.00\`, and Backspace cannot clear it.
      R3 Not asked: Names \`overflow: hidden\` on the card as what clips the menu
      R4 Not asked: Checks the rules in devtools instead of guessing
    Mid
      R5 Seen: The error is not linked to the field. No \`aria-invalid\`, no \`aria-describedby\`, no live region.
      R6 Not asked: Links go somewhere, buttons do something
      R7 Not asked: Names keyboard and screen reader differences
      R8 Not asked: Avoids a \`div\` with a click handler
      R9 Not asked: Explains the page's \`z-index\` creates a stacking context capping the menu
  Judgment
    Mid
      R10 Not marked: Rebuilds components the design system has. The field and button are hand-made, though \`src/ds\` has both.
      R11 Not asked: Moves the menu out of the clip, and names the trade-off
    Senior
      R12 Seen: Money held in floats. Halving shows \`0.13\` but places \`0.125\`.
  Communication
    Mid
      R13 Not asked: Says what the fix does to keyboard focus
  Other
    Mid
      R14 Not marked: Reserves space for the image before it loads
  Also asked: Page jumps while it loads
    Mid
      R15 Seen: Names the layout shift metric
  Stretch prompts not asked
    Review a teammate's PR: Product wants the quantity limited to the stock left. Where does that rule live, and who needs to know?`;

test('the packet opens with the passions, names no one, leaves out decisions and levels, and holds notes only when ticked', () => {
  expect(packet({ 'a-jason': jason }, false)).toBe(HEAD);
  expect(packet({ 'a-jason': jason }, true)).toBe(`${HEAD}
  Notes
    Review a teammate's PR: Found tabbing only after the hint.`);
});

test("a colleague's evidence goes in unnamed, and their notes, decision and level stay out even with the box ticked", () => {
  const text = packet({ 'a-jason': jason, 'a-alex': alex }, true);
  const second = text.slice(text.indexOf('\nInterviewer 2\n'));
  expect([second.split('\n').slice(1, 5), ['Jason', 'Alex', 'Sam Lee', 'Hire', 'hire', 'Missed the divs', 'Meets the bar', 'Leaning no', 'Evaluat']
    .filter((word) => text.includes(word)), text.includes('Found tabbing only after the hint.')])
    .toEqual([['Interviewer 2', '  Craft', '    Junior', '      R16 Not seen: Plus and minus are divs, not buttons. No focus, no role, and the glyph is the name.'], [], true]);
});

test('only evidence the gate opened makes a packet', () => {
  const forged = { me: 'a-jason', participants: [{ author: 'a-alex', name: 'Alex', evidence: {} }] };
  expect(() => packetText({ pack, role, round, plan: foldShared({}), unlocked: forged, notes: false })).toThrow("Only the gate opens colleagues' evidence");
});
