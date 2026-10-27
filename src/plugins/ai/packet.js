import { plain, stateWord, summaries } from '../../views/summary.js';

const ASK = `Please give a second opinion on how the candidate did in a job interview. The interviewers' names, decisions and levels are left out, so your read is your own.`;
const HOW = 'For each competency below, say which level the evidence supports, or that there is too little to tell, and cite the rows you rely on (R1, R2). '
  + '"Not asked" means nobody probed it, so it counts neither way. "Not marked" means it was asked and nothing was recorded.';
const indent = (text, pad) => plain(text).split('\n').join(`\n${pad}`);

// The text a person pastes into an AI assistant: the ladder and competencies to judge against, then each decided
// interviewer's summary with numbered rows. Built from the summaries only, so it carries no name, decision or level,
// and my notes go in only when I tick the box; a colleague's never do.
export function packetText({ pack, role, round, plan, unlocked, notes }) {
  const read = summaries(unlocked, { pack, role, round, plan });
  const order = role.competencies ?? pack.competencies.map((c) => c.id);
  let n = 0;
  const levels = (ls, pad) => ls.flatMap((l) => [`${pad}${l.name}`, ...l.rows.map((r) => `${pad}  R${++n} ${stateWord(r)}: ${plain(r.text)}`)]);
  const section = (title, lines) => (lines.length ? [`  ${title}`, ...lines] : []);
  const evidence = read.flatMap(({ mine, summary: s }, i) => ['', `Interviewer ${i + 1}`,
    ...s.groups.flatMap((g) => [`  ${g.name}`, ...levels(g.levels, '    ')]),
    ...s.also.flatMap((a) => [`  Also asked: ${a.title}`, ...levels(a.levels, '    ')]),
    ...section('Stretch prompts not asked', s.promptsNotAsked.map((p) => `    ${p.title}: ${plain(p.text)}`)),
    ...section('Basics marked missing', s.basicsMissing.map((b) => `    ${b.title}: ${plain(b.text)}`)),
    ...section('Notes', mine && notes ? s.notes.map((x) => `    ${x.title}: ${indent(x.text, '      ')}`) : [])]);
  return [
    ...(plan.passions.length ? [`Says they specialize in: ${plan.passions.map((p) => p.label).join(', ')}`, ''] : []),
    ASK, `Role: ${role.name}`, `Round: ${round.name}`, '', HOW, '',
    'Levels', ...pack.ladder.map((l) => `  ${l.name}: ${indent(l.summary ?? '', '    ')}`), '',
    'Competencies', ...order.map((id) => pack.competencies.find((c) => c.id === id)).filter(Boolean).flatMap((c) => [
      `  ${c.name}: ${indent(c.summary ?? '', '    ')}`,
      ...pack.ladder.filter((l) => c.expects?.[l.id]).map((l) => `    ${l.name}: ${indent(c.expects[l.id], '      ')}`)]),
    ...evidence,
  ].join('\n');
}
