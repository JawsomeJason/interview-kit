const sum = (list, of) => list.reduce((total, s) => total + of(s), 0);
const floorOf = (s) => s.floor ?? 1;

// `free` whole minutes shared among `pool` in proportion to what each holds now, none below its floor.
function share(pool, free) {
  const out = {};
  let open = pool;
  let left = free;
  for (;;) {
    const total = sum(open, (s) => s.minutes);
    const under = open.filter((s) => (left * s.minutes) / total < floorOf(s));
    if (!under.length) break;
    for (const s of under) out[s.seg] = floorOf(s);
    left -= sum(under, floorOf);
    open = open.filter((s) => !under.includes(s));
  }
  const total = sum(open, (s) => s.minutes);
  const exact = open.map((s) => ({ seg: s.seg, m: (left * s.minutes) / total }));
  for (const e of exact) out[e.seg] = Math.floor(e.m);
  // The minutes that flooring dropped go to the largest remainders, so the shares add up exactly.
  const byRemainder = [...exact].sort((a, b) => (b.m % 1) - (a.m % 1));
  for (let i = 0; i < left - sum(exact, (e) => Math.floor(e.m)); i += 1) out[byRemainder[i].seg] += 1;
  return out;
}

// The plan's minutes made to fit `budget`. Frames, pinned segments, activities that are off and the one just
// `changed` hold their minutes; every other activity absorbs the difference. When their floors leave no room the
// changed one gives way, down to its own floor, and `short` is what still does not fit. `spare` is time nothing takes.
export function fit(segments, budget, { changed, pinned = [] } = {}) {
  const minutes = Object.fromEntries(segments.map((s) => [s.seg, s.minutes]));
  const flex = segments.filter((s) => !s.frame && s.minutes > 0 && s.seg !== changed && !pinned.includes(s.seg));
  const mine = segments.find((s) => s.seg === changed);
  const free = budget - sum(segments, (s) => s.minutes) + sum(flex, (s) => s.minutes);
  const need = sum(flex, floorOf);
  if (free >= need && flex.length) return { minutes: { ...minutes, ...share(flex, free) }, spare: 0, short: 0 };
  for (const s of flex) minutes[s.seg] = floorOf(s);
  const over = need - free;
  const give = mine ? Math.max(Math.min(over, mine.minutes - Math.min(mine.minutes, floorOf(mine))), 0) : 0;
  if (mine) minutes[mine.seg] -= give;
  return { minutes, spare: Math.max(-over, 0), short: Math.max(over - give, 0) };
}
