// Seeded schedules for the chaos harness. A schedule is a member count and a list of actions a room of real browsers
// plays: appends, faults on a member's links, cuts, partitions, clock jumps that reach the slow status states, a
// closed direct link, a dropped or refused meeting point, a decision, an away tab, a reload, a browser taken offline,
// a press on Retry now. Every schedule ends with a heal, after which the runner waits for the room to converge.
export const OPS = ['pub', 'prv', 'faults', 'cut', 'partition', 'heal', 'jump', 'direct-close', 'relay-drop', 'relay-refuse', 'decide', 'away', 'reload', 'offline', 'retry'];
const JUMPS = [3_000, 10_000, 12_000, 60_000];

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Weights: appends dominate, as an interview does; the slow states come from a cut or partition followed by a jump.
const WEIGHTED = [
  ['pub', 10], ['prv', 8], ['faults', 4], ['cut', 3], ['partition', 2], ['heal', 4], ['jump', 5],
  ['direct-close', 2], ['relay-drop', 2], ['relay-refuse', 1], ['decide', 1], ['away', 1], ['reload', 1], ['offline', 2], ['retry', 1],
];
const TOTAL = WEIGHTED.reduce((n, [, w]) => n + w, 0);

export function schedules({ seed = 7, runs = 1000 } = {}) {
  const rnd = mulberry32(seed);
  const pick = (n) => Math.floor(rnd() * n);
  let members = 3 + pick(3);
  const out = [];
  for (let index = 0; index < runs; index++) {
    if (rnd() < 1 / 15) members = 3 + pick(3);
    const faults = { drop: rnd() * 0.4, dup: rnd() * 0.3, reorder: rnd() * 0.5, delay: rnd() < 0.5 ? 0 : 300 };
    const actions = [];
    const count = 3 + pick(8);
    for (let i = 0; i < count; i++) {
      let r = rnd() * TOTAL;
      const op = WEIGHTED.find(([, w]) => (r -= w) < 0)[0];
      const who = pick(members);
      if (op === 'pub' || op === 'prv') actions.push({ op, who, i: pick(1000) });
      else if (op === 'faults') actions.push({ op, who, faults: { ...faults, drop: rnd() < 0.3 ? 0 : faults.drop } });
      else if (op === 'cut' || op === 'direct-close' || op === 'decide' || op === 'reload' || op === 'offline' || op === 'retry') actions.push({ op, who });
      else if (op === 'partition') actions.push({ op, mask: 1 + pick((1 << members) - 2) });
      else if (op === 'jump') actions.push({ op, ms: JUMPS[pick(JUMPS.length)] });
      else if (op === 'relay-refuse') actions.push({ op, ms: 4_000 });
      else if (op === 'away') actions.push({ op, who, visible: rnd() < 0.5 });
      else actions.push({ op });
    }
    actions.push({ op: 'heal' });
    out.push({ index, seed: (seed * 1_000_003 + index) >>> 0, members, faults, actions });
  }
  return out;
}
