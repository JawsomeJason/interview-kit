const FIRST_POOL_SHARE = 0.6;
const coreFirst = (qs) => [...qs.filter((q) => q.tier === 'core'), ...qs.filter((q) => q.tier !== 'core')];

// Overlaps are symmetric: if A lists B, B overlaps A too.
export function overlapIndex(questions) {
  const index = new Map();
  const link = (a, b) => index.set(a, (index.get(a) ?? new Set()).add(b));
  for (const q of questions) for (const other of q.overlaps ?? []) { link(q.id, other); link(other, q.id); }
  return index;
}

export const overlapsIn = (questions, q, list) => list.filter((p) => overlapIndex(questions).get(q.id)?.has(p.id));

export function pickQuestions(questions, poolIds, minutes) {
  if (!poolIds.length) return [];
  const main = poolIds.length > 1 ? Math.round(minutes * FIRST_POOL_SHARE) : minutes;
  const byPool = Map.groupBy(questions, (q) => q.pool);
  const ordered = poolIds.map((id) => coreFirst(byPool.get(id) ?? []));
  const picked = new Set();
  let used = 0;
  const index = overlapIndex(questions);
  // Never pair two questions that cover the same ground.
  const clashes = (q) => [...picked].some((p) => index.get(q.id)?.has(p.id));
  const take = (q) => { picked.add(q); used += q.minutes; };
  ordered.forEach((qs, i) => {
    let left = i ? (minutes - main) / (poolIds.length - 1) : main;
    for (const q of qs) if (q.minutes <= left && !clashes(q)) { take(q); left -= q.minutes; }
  });
  for (const q of ordered.flat()) if (!picked.has(q) && used + q.minutes <= minutes && !clashes(q)) take(q);
  return ordered.flat().filter((q) => picked.has(q));
}

export const canAdd = (questions, poolIds, poolId, minutes) =>
  pickQuestions(questions, [...poolIds, poolId], minutes).some((q) => q.pool === poolId);

export function poolStatus(dd, pools, id) {
  const n = dd.pools.indexOf(id);
  if (n >= 0) return { order: n + 1 };
  const questions = [...pools.values()].flat();
  if (canAdd(questions, dd.pools, id, dd.minutes)) return {};
  for (let m = dd.minutes + 1; m <= 60; m++) if (canAdd(questions, dd.pools, id, m)) return { noRoom: true, minutesNeeded: m };
  return { noRoom: true, minutesNeeded: null };
}
