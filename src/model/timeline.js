import { overlapIndex, pickQuestions } from '../kinds/questions/pick.js';
import { fitPlan } from './fit.js';

// Each segment with its start minute and length, where the shared plan's minutes override the round's. `all` holds
// every segment; `steps` leaves out an optional one that is off (0 minutes) and has had nothing asked in it.
export function runOfShow(round, plan) {
  let minutes = 0;
  const all = round.segments.map((segment) => {
    const seg = `${round.id}/${segment.id}`;
    const step = { ...segment, seg, start: minutes, minutes: plan.segments[seg]?.minutes ?? segment.minutes };
    minutes += step.minutes;
    return step;
  });
  const steps = all.filter((s) => !(s.optional && s.minutes === 0 && !plan.segments[s.seg]?.asked?.length));
  return { steps, minutes, all };
}

// How long the plan may run: the length set at the start, else the preset's own total for an interview from before.
export const limitOf = (round, plan) => plan.length ?? round.segments.reduce((sum, s) => sum + s.minutes, 0);

// The minutes that change when one segment is set to `v` partway through the call, `at` minutes in: the activities
// that have not started yet absorb it, so the plan still fits `length`. Ones already started keep their minutes, and
// when the rest are at their least the changed one gives way. `floorOf(ref)` is the least an item can run.
export function fitAhead(round, plan, floorOf, seg, v, length, at) {
  const { all } = runOfShow(round, plan);
  const segments = all.map((s) => ({ seg: s.seg, minutes: s.seg === seg ? v : s.minutes, frame: s.frame, floor: floorOf(s.ref) }));
  const pinned = all.filter((s) => s.start < at && s.seg !== seg).map((s) => s.seg);
  const { minutes } = fitPlan(segments, length, { changed: seg, pinned });
  return Object.fromEntries(all.filter((s) => minutes[s.seg] !== s.minutes).map((s) => [s.seg, minutes[s.seg]]));
}

// Cards already asked stay first, in the order they were opened, so a colleague's edit to the minutes or
// pools only changes what comes after them. The rest is the pick rule over the minutes left. An asked card is found
// among `all`, so one opened from All questions stays even when its pool is not this segment's.
export function questionList(cards, { pools = [], asked = [] } = {}, minutes, all = cards) {
  const kept = asked.map((id) => all.find((c) => c.id === id)).filter(Boolean);
  const overlaps = overlapIndex(cards);
  const free = cards.filter((c) => !asked.includes(c.id) && !asked.some((id) => overlaps.get(id)?.has(c.id)));
  const left = minutes - kept.reduce((sum, c) => sum + c.minutes, 0);
  return [...kept, ...pickQuestions(free, pools, Math.max(left, 0))];
}
