import { foldEvidence, hasDecided, nameOf } from './reduce.js';

export const PAGE_BYTES = 48 * 1024;
const bytes = (v) => new TextEncoder().encode(JSON.stringify(v)).length;
const decided = (held, author) => hasDecided(held[author]?.pub ?? []);

// Mutual blindness. A private stream crosses only when I, its author and the one asking have all decided, and every
// fact comes from replicated events, never from a flag in the request.
export const mayServePrivate = (held, me, author, requester) => decided(held, me) && decided(held, author) && decided(held, requester);

export function vector(held, me, receiver) {
  const v = {};
  for (const [author, log] of Object.entries(held)) {
    v[author] = { pub: log.pub.length };
    if (mayServePrivate(held, me, author, receiver)) v[author].prv = log.prv.length;
  }
  return v;
}

export function serve(held, me, { author, ch, since }, requester, budget = PAGE_BYTES) {
  if (ch === 'prv') {
    if (!decided(held, me)) return { deny: 'not-decided' };
    if (!mayServePrivate(held, me, author, requester)) return { deny: 'peer-not-decided' };
  }
  const rest = (held[author]?.[ch] ?? []).filter((e) => e.n >= since);
  const events = [];
  let size = 2;
  for (const e of rest) {
    const add = bytes(e) + 1;
    if (events.length && size + add > budget) break;
    events.push(e);
    size += add;
  }
  return { events, more: events.length < rest.length };
}

const opened = new WeakSet();

export function unlock(held, me) {
  if (!decided(held, me)) return null;
  const participants = Object.entries(held).filter(([author]) => decided(held, author))
    .map(([author, log]) => ({ author, name: nameOf(log.pub), evidence: foldEvidence(log.prv) }));
  const u = Object.freeze({ me, participants });
  opened.add(u);
  return u;
}

export function assertUnlocked(u) {
  if (!opened.has(u)) throw new TypeError("Only the gate opens colleagues' evidence");
  return u;
}
