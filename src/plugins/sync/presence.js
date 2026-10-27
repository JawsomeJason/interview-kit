import { clockTime } from '../../start-time.js';

export const WHERE_EVERY = 2_000;
const QUIET = 6_000;
// A hidden tab's timers run about once a minute, so an away colleague gets 90 seconds before they count as lost.
const LOST = { visible: 12_000, away: 90_000 };
const GONE = 60_000;
const DIRECT_WITHIN = 15_000;
export const PERSONAL = { '#/decide': 'their Decide page', '#/debrief': 'their Debrief page' };
export const followable = (route) => /^#\/[a-z0-9-]+\/[a-z0-9-]+(\/[a-z0-9-]+)?$/.test(route);

// A colleague as last heard on any link: facts with times, never a stored status, so every limit is a comparison
// against `at`. { author, name, firstAt, heardAt, backAt, leftAt, behindSince, caughtUpAt, have, route, following,
// visible, via, pack, newer }
export function hear(peers, author, at, patch = {}) {
  let p = peers.get(author);
  if (!p) {
    p = { author, name: '', firstAt: at, heardAt: at, backAt: null, leftAt: null, behindSince: null, caughtUpAt: null, have: null,
      route: '', following: null, visible: true, via: 'relay', pack: null, newer: false };
    peers.set(author, p);
  } else if (['lost', 'unreachable', 'left'].includes(statusOf(p, at))) p.backAt = at;
  Object.assign(p, { heardAt: at, leftAt: null }, patch);
  return p;
}

export function statusOf(p, at) {
  if (p.leftAt != null) return 'left';
  const limit = p.visible ? LOST.visible : LOST.away;
  const quiet = at - p.heardAt;
  if (quiet >= limit + GONE) return 'unreachable';
  if (quiet >= limit) return 'lost';
  if (!p.visible) return 'away';
  if (!p.have || p.behindSince != null) return 'catching-up';
  return 'connected';
}

export const placeOf = (p, titleOf) => PERSONAL[p.route] ?? (followable(p.route) ? titleOf?.(p.route) ?? null : null);

export function detailOf(p, at, { titleOf, nameOf } = {}) {
  const status = statusOf(p, at);
  if (status === 'unreachable') return [`Offline since ${clockTime(p.heardAt)}`];
  if (status === 'lost') return ['Reconnecting'];
  if (status === 'left') return [`Left at ${clockTime(p.leftAt)}`];
  const quiet = Math.floor((at - p.heardAt) / 1000);
  const place = placeOf(p, titleOf);
  const via = p.via !== 'relay' ? 'Direct connection' : at - (p.caughtUpAt ?? at) < DIRECT_WITHIN ? 'Through the meeting point' : 'Through the meeting point, a little slower';
  return [
    status === 'away' && 'Away',
    place && `${p.name} is on ${place}`,
    (quiet >= QUIET || status === 'away' || !place) && `Synced ${quiet} s ago`,
    p.following && nameOf?.(p.following) && `Following ${nameOf(p.following)}`,
    status !== 'away' && place && via,
  ].filter(Boolean);
}

export function labels(members) {
  const count = new Map();
  for (const m of members) count.set(m.name, (count.get(m.name) ?? 0) + 1);
  const seen = new Map();
  return new Map(members.map((m) => {
    if (count.get(m.name) === 1) return [m.author, m.name];
    seen.set(m.name, (seen.get(m.name) ?? 0) + 1);
    return [m.author, `${m.name} ${seen.get(m.name)}`];
  }));
}
