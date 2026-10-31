import { itemsOf, observables } from './observables.js';

const key = (s) => `${s.kind}:${JSON.stringify(s.ref)}`;

// The minutes an activity gets when ticked on: the preset's own when it has some, else what the first of the role's
// rounds that runs it gives it, else its file's minutes.
function fullMinutes(pack, role, segment) {
  if (segment.minutes > 0) return segment.minutes;
  for (const id of role.rounds) {
    const same = pack.rounds.find((r) => r.id === id)?.segments.find((s) => key(s) === key(segment));
    if (same?.minutes > 0) return same.minutes;
  }
  return (Array.isArray(pack.libs[segment.kind]) ? pack.libs[segment.kind].find((it) => it.id === segment.ref)?.minutes : undefined) ?? segment.minutes;
}

// The preset round with every other activity the role runs added at 0 minutes, before its closing frames, so an
// interviewer can turn any of them on. Segment ids stay the preset's, so an interview saved before this keeps its
// keys; a borrowed segment whose id clashes carries its round's id in front.
export function composeRound(pack, role, round) {
  const own = round.segments.map((s) => (s.frame ? s : { ...s, optional: true, full: fullMinutes(pack, role, s) }));
  const have = new Set(own.map(key));
  const ids = new Set(own.map((s) => s.id));
  const borrowed = [];
  for (const id of role.rounds) {
    for (const s of pack.rounds.find((r) => r.id === id)?.segments ?? []) {
      if (s.frame || have.has(key(s))) continue;
      have.add(key(s));
      const segId = ids.has(s.id) ? `${id}-${s.id}` : s.id;
      ids.add(segId);
      borrowed.push({ ...s, id: segId, round: round.id, minutes: 0, optional: true, full: fullMinutes(pack, role, s) });
    }
  }
  let tail = own.length;
  while (tail > 0 && own[tail - 1].frame) tail -= 1;
  return { ...round, segments: [...own.slice(0, tail), ...borrowed, ...own.slice(tail)] };
}

// What the plan can give evidence for, per role competency: 'yes' when an activity that is on has a tagged row at
// the focus level or one below, in scope at its minutes; 'topics' when only a questions step could reach it; else
// 'none'. inScope(item, observable, minutes) narrows an activity's rows to those its minutes keep.
export function coverage(pack, role, steps, focus, inScope = () => true) {
  const items = itemsOf(pack);
  const at = pack.ladder.findIndex((l) => l.id === focus);
  const near = (o) => [at, at - 1].includes(pack.ladder.findIndex((l) => l.id === o.level));
  const on = steps.filter((s) => !s.frame && s.minutes > 0);
  const rows = (id, step) => observables(items.get(id)).filter((o) => near(o) && inScope(items.get(id), o, step.minutes));
  const direct = new Set(on.filter((s) => s.kind !== 'questions').flatMap((s) => rows(s.ref, s).flatMap((o) => o.competencies)));
  const cards = pack.libs.questions.cards;
  const topics = new Set(on.filter((s) => s.kind === 'questions')
    .flatMap((s) => cards.filter((c) => s.ref === 'all' || [s.ref].flat().includes(c.pool)).flatMap((c) => rows(c.id, s).flatMap((o) => o.competencies))));
  const order = role.competencies ?? pack.competencies.map((c) => c.id);
  return Object.fromEntries(order.map((id) => [id, direct.has(id) ? 'yes' : topics.has(id) ? 'topics' : 'none']));
}
