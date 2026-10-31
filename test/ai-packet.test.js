import { expect, test } from 'vitest';
import { unlock } from '../src/evidence/gate.js';
import { foldShared, nameOf } from '../src/evidence/reduce.js';
import { packetText } from '../src/plugins/ai/packet.js';
import { DIVS, fixturePack, logOf, mark, open } from './views/fixture.js';

const pack = await fixturePack();
// The parts of every interview that are not activities, set here so Activities below lists the exercise and the deep dive.
for (const script of pack.libs.script) script.frame = true;
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

const packet = (held, notes, more = {}) => packetText({ pack, role, round, notes,
  plan: foldShared(Object.fromEntries(Object.entries(held).map(([a, l]) => [a, l.pub]))), unlocked: unlock(held, 'a-jason'), interviewers: Object.values(held).map((l) => nameOf(l.pub)).filter(Boolean), ...more });

const HEAD = `Says they specialize in: CSS and layout, Animation

Please give a second opinion on how the candidate did in a job interview. The interviewers' decisions and levels are left out, so your read is your own. Their names and the candidate's are replaced where they are spelled as entered, but notes and a transcript can still name other people.
Role: Frontend engineer
Round: Practical round

For each competency below, give the highest level the evidence fully supports, or say there is too little to tell, how confident you are, and what evidence would change your read. Cite the rows you rely on (R1, R2).
A row under two competencies keeps one number, so R3 in both places is one row, not two pieces of evidence.
"Not asked" means nobody probed it, so it counts neither way. Asked is tracked per activity or question, not per row, so "Not marked" means the activity ran and nothing was recorded for that row, which may never have come up. "Out of scope" means it fell outside the time planned, so it counts neither way.
Rows above the levels shown are left out unless marked, so no row there does not mean nothing was asked. Rows below them show only under "Basics marked missing".

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

Activities
  Review a teammate's PR: 35 min planned, fallback off
    Brief: The candidate reviews a small PR that adds a quantity stepper to a shop's cart. It is typed, its tests pass, and its description claims it is "fully accessible". Watch what they notice, in what order, and whether they can show it in the running app.

      The findings are on the right. Mark what they find, and give a nudge only when they are stuck. A nudge you gave is recorded, so a finding that follows it reads as seen after a nudge.
    Run: 1. Ask them to keep AI tools off. Paste the sandbox link and ask them to share their screen.
      2. Say: "Don't fix it. Question what looks off, say why, and say who it hurts."
      3. After about 10 minutes ask: "Which would you block on, and why that one first?"
      4. Say: "Show me that in the running app." Ask what they expect to happen, then let them try.
      5. If time allows, ask the stretch prompts for the level you are evaluating at.
  Deep dive: 20 min planned

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
    Review a teammate's PR: Make the plus and minus controls work for keyboard users. What would you change?
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

const at = (minutes) => `${(0x0194c0de0000 + minutes * 60_000).toString(16).padStart(12, '0')}.0000`;
const decided = [{ t: 'decide', choice: 'hire', why: 'Meets the bar.' }, { t: 'decided' }];

test("Activities gives the minute range of each activity's marks from the start, and the fallback text when it was on", () => {
  const text = packet({ 'a-jason': logOf([
    open('a-jason'),
    { t: 'put', k: 'session.startedAt', v: at(0).slice(0, 12) },
    { t: 'put', k: 'segment.fallback', seg: 'practical/review-a-teammate-s-pr', v: true },
    { ...mark('review-a-pr#divs', DIVS), h: at(12.5) },
    { ...mark('review-a-pr#error-link', 'Anything'), h: at(31) },
    { t: 'member', k: 'segment.asked', seg: 'practical/deep-dive', id: 'css-10', v: true },
    { ...mark('css-10#mid.1', 'Names the layout shift metric'), h: at(40) },
    ...decided,
  ]) }, false);
  expect(text).toContain("\n  Review a teammate's PR: 35 min planned, fallback on, marks at minutes 12 to 31 from the start\n    Brief: The candidate reviews");
  expect(text).toContain('\n    Fallback: No running app, because the link is down or the credits ran out? Send `pr.diff` and say so up front.');
  expect(text).toContain('\n  Deep dive: 10 min planned, marks at minute 40 from the start\n\nInterviewer 1');
});

test('a mark before the start counts as minute 0, and with no start known Activities gives no minutes', () => {
  const early = logOf([open('a-jason'), { t: 'put', k: 'session.startedAt', v: at(5).slice(0, 12) }, mark('review-a-pr#divs', DIVS), ...decided]);
  expect(packet({ 'a-jason': early }, false)).toContain("\n  Review a teammate's PR: 35 min planned, fallback off, marks at minute 0 from the start\n");
  expect(packet({ 'a-jason': jason }, false)).toContain("\n  Review a teammate's PR: 35 min planned, fallback off\n");
});

test('an activity script lists its blocks, a questions segment only its time, and a frame part is left out', () => {
  const script = pack.libs.script.map((s) => ({ ...s, frame: s.id !== 'intro' }));
  const text = packet({ 'a-jason': jason }, false, { pack: { ...pack, libs: { ...pack.libs, script } } });
  expect(text.slice(text.indexOf('\nActivities\n'), text.indexOf("\n  Review a teammate's PR: 35"))).toBe(`
Activities
  Intro: 5 min planned
    Script: 1. Welcome them. Share names and roles.
      2. Walk through the plan for the session, and say there is time at the end for their questions.
      3. Say: "Docs and MDN are open, and asking for help is fine."`);
  expect(text).toContain('\n  Deep dive: 20 min planned\n\nInterviewer 1');
  expect(text).not.toContain('Before the call');
});

test('a row under two competencies shows the same R number in both, and the next row carries on from there', () => {
  const exercise = pack.libs.exercise.map((e) => ({ ...e, lookFor: e.lookFor.map((b) => (b.pin === 'error-link' ? { ...b, competencies: ['craft', 'judgment'] } : b)) }));
  const text = packet({ 'a-jason': jason }, false, { pack: { ...pack, libs: { ...pack.libs, exercise } } });
  const row = '      R5 Seen: The error is not linked to the field. No `aria-invalid`, no `aria-describedby`, no live region.';
  expect(text.split('\n').filter((line) => line.includes('The error is not linked to the field.'))).toEqual([row, row]);
  expect(text).toContain('\n      R10 Not marked: Rebuilds components the design system has.');
});

test('a pasted transcript goes last under its heading with the name replaced, and the packet asks for each row to be checked against it', () => {
  const text = packet({ 'a-jason': jason }, false, { transcript: `
00:01 Interviewer: Hi Sam, thanks for coming.
00:02 SAM LEE: Thanks. sam is fine, and Mr. Lee's my dad. Sam
Lee on a line break too.
00:03 Interviewer: Samantha and Leeds are not you.
` });
  expect(text.slice(text.indexOf('\n\nTranscript\n'))).toBe(`

Transcript
00:01 Interviewer: Hi the candidate, thanks for coming.
00:02 the candidate: Thanks. the candidate is fine, and Mr. the candidate's my dad. the candidate on a line break too.
00:03 Interviewer: Samantha and Leeds are not you.`);
  expect(text).toContain('\nA transcript follows the evidence. Check each row against it, quote the time where it shows one, and list every row where the transcript and the mark disagree.\n');
});

test('with no transcript, or only blanks, there is no Transcript heading and no ask about one', () => {
  expect(packet({ 'a-jason': jason }, false, { transcript: ' \n ' })).toBe(HEAD);
  expect(packet({ 'a-jason': jason }, false, { transcript: '' })).toBe(HEAD);
});

test('the name is replaced only in notes and the transcript, even when it reads like other words in the packet', () => {
  const log = logOf([open('a-jason'), { t: 'put', k: 'session.candidate', v: 'Review Craft-Lee' },
    { t: 'note', scope: 'review-a-pr', text: 'Review was calm. craft-lee and LEE too.' }, ...decided]);
  const text = packet({ 'a-jason': log }, true, { transcript: 'Craft-Lee, review (Review Craft-Lee).' });
  expect(text.endsWith(`  Notes
    Review a teammate's PR: the candidate was calm. the candidate and the candidate too.

Transcript
the candidate, the candidate (the candidate).`)).toBe(true);
  expect(text).toContain('\n  Craft: Builds interfaces');
  expect(text).toContain("\n  Review a teammate's PR: 35 min planned");
});

test('a name with regex characters is taken literally, and no name replaces nothing', () => {
  const named = logOf([open('a-jason'), { t: 'put', k: 'session.candidate', v: 'A.J. (Bo)' }, ...decided]);
  const text = packet({ 'a-jason': named }, false, { transcript: 'A.J. said AxJ and (bo) to Bob.' });
  expect(text.slice(text.indexOf('\nTranscript\n'))).toBe('\nTranscript\nthe candidate said AxJ and (the candidate) to Bob.');
  const unnamed = logOf([open('a-jason'), ...decided]);
  expect(packet({ 'a-jason': unnamed }, false, { transcript: 'Hello there.' }).endsWith('\nTranscript\nHello there.')).toBe(true);
});

test("every interviewer's name reads as the interviewer in notes and the transcript, by the candidate's rule, and a word they share with the candidate reads as the candidate", () => {
  const log = logOf([open('a-jason'), { t: 'name', name: 'Jason Reed-Ng' }, { t: 'put', k: 'session.candidate', v: 'Sam Lee' },
    { t: 'note', scope: 'review-a-pr', text: 'Alex and I agree. JASON is not Jasonic, Sam is calm.' }, ...decided]);
  const text = packet({ 'a-jason': log }, true, { interviewers: ['Jason Reed-Ng', 'Alex', 'Sam Park'], transcript: 'Jason Reed-Ng: Hi Sam Lee. reed and ng. Sam Park here, and Alexandra. Park.' });
  expect(text.endsWith(`  Notes
    Review a teammate's PR: the interviewer and I agree. the interviewer is not Jasonic, the candidate is calm.

Transcript
the interviewer: Hi the candidate. the interviewer and the interviewer. the interviewer here, and Alexandra. the interviewer.`)).toBe(true);
});
