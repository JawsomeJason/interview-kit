import { itemsOf, observables } from './observables.js';
import { inScope, underFloor } from './scope.js';

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

// Where a borrowed activity goes among a preset's own segments: before the first frame after its last activity that
// closes this round or another of the role's, a frame being closing when it follows an activity. A preset of frames
// alone says nothing itself, so its order comes from the others, else the activities go before its last frame.
function insertAt(own, rounds) {
  const closing = new Set(rounds.flatMap((r) => r.segments.filter((s, i) => s.frame && r.segments.slice(0, i).some((x) => !x.frame)).map(key)));
  const lastActivity = own.findLastIndex((s) => !s.frame);
  const first = own.findIndex((s, i) => i > lastActivity && closing.has(key(s)));
  if (first >= 0) return first;
  return lastActivity >= 0 ? own.length : Math.max(own.length - 1, 0);
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
  const at = insertAt(own, [round, ...role.rounds.map((id) => pack.rounds.find((r) => r.id === id)).filter(Boolean)]);
  return { ...round, segments: [...own.slice(0, at), ...borrowed, ...own.slice(at)] };
}

// What the plan can give evidence for, per role competency: 'yes' when an activity that is on has a tagged row at
// the focus level or one below, in scope at its minutes; 'topics' when only a questions step could reach it; 'little'
// when only activities under their floor have one; else 'none'.
export function coverage(pack, role, steps, focus) {
  const items = itemsOf(pack);
  const at = pack.ladder.findIndex((l) => l.id === focus);
  const near = (o) => [at, at - 1].includes(pack.ladder.findIndex((l) => l.id === o.level));
  const on = steps.filter((s) => !s.frame && s.minutes > 0);
  const rows = (id, step) => observables(items.get(id)).filter((o) => near(o) && inScope(items.get(id), o, step.minutes));
  const tagged = (list) => new Set(list.flatMap((s) => rows(s.ref, s).flatMap((o) => o.competencies)));
  const activities = on.filter((s) => s.kind !== 'questions');
  const direct = tagged(activities.filter((s) => !underFloor(items.get(s.ref), s.minutes)));
  const little = tagged(activities.filter((s) => underFloor(items.get(s.ref), s.minutes)));
  const cards = pack.libs.questions.cards;
  const topics = new Set(on.filter((s) => s.kind === 'questions')
    .flatMap((s) => cards.filter((c) => s.ref === 'all' || [s.ref].flat().includes(c.pool)).flatMap((c) => rows(c.id, s).flatMap((o) => o.competencies))));
  const order = role.competencies ?? pack.competencies.map((c) => c.id);
  const reach = (id) => (direct.has(id) ? 'yes' : topics.has(id) ? 'topics' : little.has(id) ? 'little' : 'none');
  return Object.fromEntries(order.map((id) => [id, reach(id)]));
}
