import { clockTime } from '../../start-time.js';
import { statusOf } from './presence.js';

// Every phase that waits has a limit here, and every limit turns into words with one next step (design.md, section 6).
// A meeting point gone for less than `blip` is a socket being replaced, not news.
export const LIMIT = { relay: 10_000, letIn: 60_000, look: 15_000, catchUp: 10_000, reconnected: 3_000, note: 3_000, backOnline: 10_000, blip: 3_000, leftNews: 60_000 };
const NO_RELAY = "Can't reach the meeting point from this network. Your notes save on this laptop either way. Try another network, or share your evidence as a file after the interview.";
const OFFLINE = "You're offline. Everything you record is saved and will catch up.";
const RETRY = { retry: 'Retry now' };
const RELAY_LOST = 'Reconnecting to the meeting point… Everything you record is saved and will catch up.';

// One colleague, several, or "your colleagues" when a joiner's link carried no `from`.
function who(names) {
  const list = names.filter(Boolean);
  if (!list.length) return { n: 'your colleagues', N: 'Your colleagues', one: false, them: 'them', they: 'they' };
  const n = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0];
  const one = list.length === 1;
  return { n, N: n[0].toUpperCase() + n.slice(1), one, them: one ? n : 'them', they: one ? n : 'they' };
}
const line = ([text, tone, action = null]) => ({ text, tone, action });

const JOIN = {
  connecting: () => ['Connecting…', 'wait'],
  relayLost: () => ['Reconnecting to the meeting point…', 'wait'],
  noRelay: () => [NO_RELAY, 'fail', RETRY],
  knocking: (w) => [`Waiting for ${w.n} to let you in…`, 'wait'],
  late: (w) => [`${w.N} ${w.one ? "hasn't" : "haven't"} let you in yet. Ask ${w.them} to look at the kit.`, 'fail', { copy: `Copy a reminder for ${w.them}` }],
  refused: (w) => [`${w.N} didn't let you in. Ask ${w.them} to send a new link.`, 'fail'],
  wrong: () => ["That isn't an invite link or code. Ask for the link again, or paste all of it.", 'fail'],
  noName: () => ['Type your name first, so your colleagues know who is knocking.', 'fail'],
  foreign: (w) => [`This invite is for a role or round this kit doesn't have. Ask ${w.them} which kit they are using.`, 'fail'],
};

// j: { from, startedAt, lobbyUpAt, downAt: when the meeting point went, state: 'knocking' | 'refused' | 'wrong' | 'noName' | 'foreign' }
export function joinLine(j, at) {
  const down = j.downAt != null ? at - j.downAt : 0;
  const phase = j.state !== 'knocking' ? j.state
    : j.lobbyUpAt == null ? (at - j.startedAt < LIMIT.relay ? 'connecting' : 'noRelay')
    : down >= LIMIT.blip ? (down < LIMIT.relay ? 'relayLost' : 'noRelay')
    : at - j.lobbyUpAt < LIMIT.letIn ? 'knocking' : 'late';
  return line(JOIN[phase](who([j.from])));
}

// Colleagues grouped by what is happening with them, the ones that need something first.
const GROUPS = {
  newer: (w) => [`${w.N} ${w.one ? 'is' : 'are'} using a newer or older kit. ${w.one ? 'Both' : 'All'} of you reload the page to get the same version.`, 'fail'],
  unreachable: (w) => [`Can't reach ${w.n} from this network. ${w.N} may have closed the kit, or one of you lost the connection. Keep going: everything you record is saved and will catch up.`, 'fail', RETRY],
  notAnswering: (w) => [`${w.N} ${w.one ? "is here but their kit isn't" : "are here but their kits aren't"} answering. Ask ${w.them} to reload the page.`, 'fail'],
  lost: (w) => [`Lost ${w.n}, reconnecting… What you record is saved and will catch up.`, 'wait'],
  'catching-up': (w) => [`Catching up with ${w.n}…`, 'wait'],
  justLeft: (w, ps) => GROUPS.left(w, ps),
  reconnected: (w) => [`Reconnected to ${w.n}. Caught up.`, 'ok'],
  connected: (w) => [`Connected to ${w.n}`, 'ok'],
  left: (w, ps) => [ps.map((p) => `${p.name} left at ${clockTime(p.leftAt)}.`).join(' '), 'ok'],
};

function groupOf(p, at) {
  const s = statusOf(p, at);
  if (p.newer) return 'newer';
  if (s === 'catching-up') return at - (p.behindSince ?? p.firstAt) < LIMIT.catchUp ? s : 'notAnswering';
  if (s === 'connected' && p.backAt != null && at - p.backAt < LIMIT.reconnected) return 'reconnected';
  if (s === 'left') return at - p.leftAt < LIMIT.leftNews ? 'justLeft' : s;
  return s === 'away' ? 'connected' : s;
}

// r: { inviter, expect: names the room record knows, startedAt, online, relay: { upAt, downAt }, backAt, note: { text, at }, peers,
//   knocks: how many are waiting to be let in }
export function roomLine(r, at) {
  if (r.note && at - r.note.at < LIMIT.note) return line([r.note.text, 'ok']);
  if (!r.online) return line([OFFLINE, 'wait']);
  const down = r.relay.upAt == null && r.relay.downAt != null ? at - r.relay.downAt : null;
  if (down != null && down >= LIMIT.blip) return line(down < LIMIT.relay ? [RELAY_LOST, 'wait'] : [NO_RELAY, 'fail', RETRY]);
  if (r.relay.upAt == null && down == null) return line(at - r.startedAt < LIMIT.relay ? ['Connecting…', 'wait'] : [NO_RELAY, 'fail', RETRY]);
  const by = new Map();
  for (const p of r.peers) { const g = groupOf(p, at); by.set(g, [...by.get(g) ?? [], p]); }
  if (r.backAt != null && at - r.backAt < LIMIT.backOnline && r.peers.some((p) => p.heardAt < r.backAt && p.leftAt == null)) return line(['Back online. Catching up…', 'wait']);
  // The one group that matters most; the dots beside the names show everyone else.
  const g = Object.keys(GROUPS).find((k) => by.has(k));
  if (g && !(g === 'left' && r.knocks)) return line(GROUPS[g](who(by.get(g).map((p) => p.name)), by.get(g)));
  if (r.knocks) return line(['', 'ok']);
  if (r.inviter && !r.expect.length) return line(['Waiting for colleagues. Send them the invite link.', 'wait']);
  const w = who(r.expect);
  return line(at - Math.max(r.startedAt, r.relay.upAt) < LIMIT.look ? [`Looking for ${w.n}…`, 'wait']
    : [`${w.N} ${w.one ? "isn't" : "aren't"} here yet. You'll connect as soon as ${w.they} ${w.one ? 'opens' : 'open'} the interview.`, 'wait']);
}

export const banners = (peers, mine) => peers.filter((p) => p.pack && (p.pack.version !== mine.version || p.pack.sha !== mine.sha))
  .map((p) => `${p.name} is using another version of this pack (${p.pack.version === mine.version ? `${p.pack.version}, build ${p.pack.sha}` : p.pack.version}). Anchors that changed show as reworded.`);
