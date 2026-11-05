import { planned } from './observables.js';
import { runOfShow } from './timeline.js';

// The guided course: the run of show as one path of steps an interviewer walks with Done and Skip. A step is a card,
// keyed by its id, or a segment with no cards, keyed by its <round>/<segment>. Its finished state comes from the
// shared plan (segment.done and skip); where the interviewer is, and what they left unfinished, is the page's own.

export const REASONS = [['no-time', 'No time'], ['covered', 'Already asked'], ['not-relevant', 'Not relevant']];
const REASON = Object.fromEntries(REASONS);

// A questions segment is one step per card it lists, numbered Q1 on through the whole path.
export function coursePath(pack, round, plan) {
  const cards = new Map(pack.libs.questions.cards.map((c) => [c.id, c]));
  let q = 0;
  return runOfShow(round, plan).steps.flatMap((step) => {
    if (step.kind !== 'questions') return [{ key: step.seg, seg: step.seg, kind: step.kind, label: step.title, title: step.title, minutes: step.minutes, appended: false }];
    const started = plan.segments[step.seg]?.started;
    return planned(pack, [step], plan).map((id) => ({ key: id, seg: step.seg, id, kind: 'card', label: `Q${++q}`, title: cards.get(id).title,
      minutes: cards.get(id).minutes, appended: Boolean(started && !started.includes(id)) }));
  });
}

export const finishedOf = (plan, step) => plan.segments[step.seg]?.finished?.[step.key];

// here is the step on screen (null off the path), home the step the path is at, and left the steps left unfinished,
// each with the stamp it was left at. The step after home reads Up next while home is on screen.
export function courseStates(steps, { plan, evidence, here, home, left }) {
  const homeAt = steps.findIndex((s) => s.key === home);
  return steps.map((step, i) => {
    const fin = finishedOf(plan, step);
    const state = step.key === here ? 'current' : fin ? fin.s : left.has(step.key) ? 'resume' : homeAt >= 0 && i === homeAt + 1 && here === home ? 'next' : 'upcoming';
    return { ...step, state, fin, amended: evidence.amends.get(step.key) ?? [], leftAt: left.get(step.key) };
  });
}

// The words under each step on the rail. at(h) writes a stamp as a clock time.
export function stateLabel(st, at) {
  switch (st.state) {
    case 'current': return st.fin ? (st.fin.s === 'done' ? `Done ${at(st.fin.h)} · Here` : 'Skipped · Here') : 'Now';
    case 'done': return `Done ${at(st.fin.h)}`;
    case 'skipped': return `Skipped · ${REASON[st.fin.reason]}`;
    case 'resume': return `Left ${at(st.leftAt)}`;
    case 'next': return 'Up next';
    default: return `${st.minutes} min`;
  }
}

// What a screen reader hears for a step: its label, a card's title, its state and its last amendment.
export const stepName = (st, at) => `${st.label}${st.kind === 'card' ? `, ${st.title}` : ''}, ${stateLabel(st, at)}${st.amended.length ? `, amended at ${at(st.amended.at(-1))}` : ''}`;

// The first unfinished step after key, else the first one before it, else null.
export function nextAfter(steps, plan, key) {
  const i = steps.findIndex((s) => s.key === key);
  const open = (s) => !finishedOf(plan, s);
  return (steps.slice(i + 1).find(open) ?? steps.slice(0, Math.max(i, 0)).find(open))?.key ?? null;
}

// Where Done or Skip on `from` goes: the step a Skip jumps to, else back to home when the interviewer had stepped back
// from it, else the next unfinished step. The last step, or nothing left, goes to Decide (null).
export function moveOnTarget(steps, plan, { from, home, jump }) {
  if (steps.at(-1)?.key === from) return null;
  if (jump && !finishedOf(plan, steps.find((s) => s.key === jump) ?? {})) return jump;
  const back = home && home !== from && steps.find((s) => s.key === home);
  if (back && !finishedOf(plan, back)) return home;
  return nextAfter(steps, plan, from);
}
