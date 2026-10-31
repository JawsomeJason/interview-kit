import { wallOf } from '../../evidence/clock.js';
import { planned } from '../../model/observables.js';
import { runOfShow } from '../../model/timeline.js';
import { plain, stateWord, summaries } from '../../views/summary.js';

const ASK = `Please give a second opinion on how the candidate did in a job interview. The interviewers' decisions and levels are left out, so your read is your own. Their names and the candidate's are replaced where they are spelled as entered, but notes and a transcript can still name other people.`;
const HOW = ['For each competency below, give the highest level the evidence fully supports, or say there is too little to tell, how confident you are, and what evidence would change your read. Cite the rows you rely on (R1, R2).',
  'A row under two competencies keeps one number, so R3 in both places is one row, not two pieces of evidence.',
  '"Not asked" means nobody probed it, so it counts neither way. Asked is tracked per activity or question, not per row, so "Not marked" means the activity ran and nothing was recorded for that row, which may never have come up. "Out of scope" means it fell outside the time planned, so it counts neither way.',
  'Rows above the levels shown are left out unless marked, so no row there does not mean nothing was asked. Rows below them show only under "Basics marked missing".'];
const CHECK = 'A transcript follows the evidence. Check each row against it, quote the time where it shows one, and list every row where the transcript and the mark disagree.';
const indent = (text, pad) => plain(text).replace(/\n(?=[^\n])/g, `\n${pad}`);
const quote = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A name in free text: whole, and each part (a hyphen's sides too). A nickname in brackets counts as the word inside them.
function formsOf(name) {
  const words = name.split(/\s+/).map((w) => w.replace(/^[("'“‘]+|[)"'”’,]+$/g, '')).filter(Boolean);
  return words.length ? [words.join(' '), ...words.flatMap((w) => [w, ...w.split('-')]).filter(Boolean)] : [];
}
const fold = (form) => form.toLowerCase().replace(/\s+/g, ' ');

// Names in free text become who they are, as whole words in any case, longest first and all in one pass, so "Sam Lee's"
// is one replacement and "Samantha" none. A word an interviewer shares with the candidate reads as the candidate.
function scrubber(candidate = '', interviewers = []) {
  const theirs = formsOf(candidate);
  const others = interviewers.flatMap(formsOf);
  if (!theirs.length && !others.length) return (text) => text;
  const forms = [...theirs, ...others].sort((a, b) => b.length - a.length).map((f) => quote(f).replace(/ /g, '\\s+'));
  const names = new RegExp(`(?<![\\p{L}\\p{N}])(?:${forms.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  const candidates = new Set(theirs.map(fold));
  const interviewer = new Set(others.map(fold).filter((f) => !candidates.has(f)));
  return (text) => text.replace(names, (m) => (interviewer.has(fold(m)) ? 'the interviewer' : 'the candidate'));
}

// What each kind told the interviewer to do, so a row that never came up can be told from one that was missed.
const BLOCKS = {
  exercise: (ex, fallback) => [['Brief', ex.brief], ['Run', ex.run], ['Fallback', fallback && ex.fallback]],
  script: (script) => script.blocks.map((b) => [b.title, b.md]),
  questions: () => [],
};
const sourceOf = (pack, step) => (step.kind === 'questions' ? {} : pack.libs[step.kind].find((x) => x.id === step.ref));

// The minutes from the start between the first and last mark anyone made on an activity's items.
function markedAt(pack, step, plan, participants) {
  if (!plan.startedAt) return '';
  const ids = new Set(planned(pack, [step], plan));
  const at = participants.flatMap((p) => [...p.evidence.marks].filter(([ref]) => ids.has(ref.slice(0, ref.indexOf('#')))))
    .map(([, m]) => Math.max(0, Math.floor((wallOf(m.h) - plan.startedAt) / 60_000)));
  if (!at.length) return '';
  const [first, last] = [Math.min(...at), Math.max(...at)];
  return `, marks at ${first === last ? `minute ${first}` : `minutes ${first} to ${last}`} from the start`;
}

function activities({ pack, round, plan }, participants) {
  return runOfShow(round, plan).steps.flatMap((step) => {
    const source = sourceOf(pack, step);
    if (source.frame) return [];
    const fallback = plan.segments[step.seg]?.fallback;
    return [`  ${step.title}: ${step.minutes} min planned${source.fallback ? `, fallback ${fallback ? 'on' : 'off'}` : ''}${markedAt(pack, step, plan, participants)}`,
      ...BLOCKS[step.kind](source, fallback).filter(([, text]) => text).map(([title, text]) => `    ${title}: ${indent(text, '      ')}`)];
  });
}

// The text a person pastes into an AI assistant: the ladder and competencies to judge against, what each activity was,
// then each decided interviewer's summary with numbered rows, then a transcript if I pasted one. Built from the
// summaries only, so it carries no name, decision or level, and my notes go in only when I tick the box; a colleague's
// never do. Names are replaced in notes and the transcript, the two places free text comes in.
export function packetText({ pack, role, round, plan, unlocked, notes, transcript = '', interviewers }) {
  const read = summaries(unlocked, { pack, role, round, plan });
  const order = role.competencies ?? pack.competencies.map((c) => c.id);
  const scrub = scrubber(plan.candidate, interviewers);
  const heard = scrub(transcript.trim());
  let n = 0;
  const section = (title, lines) => (lines.length ? [`  ${title}`, ...lines] : []);
  const evidence = read.flatMap(({ mine, summary: s }, i) => {
    const numbers = new Map();
    const number = (r) => numbers.get(r.ref) ?? numbers.set(r.ref, ++n).get(r.ref);
    const levels = (ls, pad) => ls.flatMap((l) => [`${pad}${l.name}`, ...l.rows.map((r) => `${pad}  R${number(r)} ${stateWord(r)}: ${plain(r.text)}`)]);
    return ['', `Interviewer ${i + 1}`,
      ...s.groups.flatMap((g) => [`  ${g.name}`, ...levels(g.levels, '    ')]),
      ...s.also.flatMap((a) => [`  Also asked: ${a.title}`, ...levels(a.levels, '    ')]),
      ...section('Stretch prompts not asked', s.promptsNotAsked.map((p) => `    ${p.title}: ${plain(p.text)}`)),
      ...section('Basics marked missing', s.basicsMissing.map((b) => `    ${b.title}: ${plain(b.text)}`)),
      ...section('Notes', mine && notes ? s.notes.map((x) => `    ${x.title}: ${indent(scrub(x.text), '      ')}`) : [])];
  });
  return [
    ...(plan.passions.length ? [`Says they specialize in: ${plan.passions.map((p) => p.label).join(', ')}`, ''] : []),
    ASK, `Role: ${role.name}`, `Round: ${round.name}`, '', ...HOW, ...(heard ? [CHECK] : []), '',
    'Levels', ...pack.ladder.map((l) => `  ${l.name}: ${indent(l.summary ?? '', '    ')}`), '',
    'Competencies', ...order.map((id) => pack.competencies.find((c) => c.id === id)).filter(Boolean).flatMap((c) => [
      `  ${c.name}: ${indent(c.summary ?? '', '    ')}`,
      ...pack.ladder.filter((l) => c.expects?.[l.id]).map((l) => `    ${l.name}: ${indent(c.expects[l.id], '      ')}`)]), '',
    'Activities', ...activities({ pack, round, plan }, unlocked.participants),
    ...evidence,
    ...(heard ? ['', 'Transcript', heard] : []),
  ].join('\n');
}
