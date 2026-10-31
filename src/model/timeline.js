import { overlapIndex, pickQuestions } from '../kinds/questions/pick.js';

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
