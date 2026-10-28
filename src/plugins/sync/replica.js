import { checkWire } from './wire-check.js';

// A sealed frame is base64 of a 12-byte IV, the plaintext and a 16-byte tag, so this is the plaintext a 64 KiB frame holds.
const PLAINTEXT_BYTES = Math.floor(64 * 1024 * 3 / 4) - 28;
const utf8 = new TextEncoder();
const bytes = (v) => utf8.encode(JSON.stringify(v)).length;
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
const pubOnly = (have) => Object.fromEntries(Object.entries(have).map(([a, c]) => [a, { pub: c.pub }]));
const isOpen = (link) => link.state === 'open';

// Replication over any Link: a pure state machine over hello, pull, events, deny and bye. What I hold, what crosses
// the gate and what gets ingested all stay in the host; this knows only who holds how much and which link reaches whom.
export function createReplica(host) {
  const { sid, author: me, pack, role, round } = host.me();
  const links = new Set();
  const detach = new Map();
  const peers = new Map();
  const inflight = new Map();
  const avoid = new Map();
  const owed = new Map();
  let ticks = 0;
  const mine = (author, ch) => host.vector(me)[author]?.[ch] ?? 0;
  const envelope = (body, to) => ({ v: 2, id: randomId(), from: me, ...(to && { to }), sid, pack, body });
  // Heard this tick or the last one on a link that is still open; a bye or two quiet ticks ends it.
  const connected = (author) => { const p = peers.get(author); return !!p && ticks - p.heard <= 1 && [...p.links].some(isOpen); };
  // The links that reach a member, the direct one first; a link whose send returns false is dead and the next one carries the message.
  const reaching = (to) => [...[...links].filter((l) => isOpen(l) && l.peer === to), ...[...links].filter((l) => isOpen(l) && !l.peer)];
  const opened = (author) => 'prv' in (host.vector(me)[author] ?? {});
  const serves = (peer, author) => 'prv' in (host.vector(peer)[author] ?? {});

  function sendTo(to, body) {
    const m = envelope(body, to);
    for (const l of reaching(to)) if (l.send(m) !== false) return;
  }

  // A broadcast cannot honor a per-receiver gate, so only a point-to-point hello carries private counts.
  function hello(link) {
    link.send(envelope({ t: 'hello', role, round, have: link.peer ? host.vector(link.peer) : pubOnly(host.vector(me)) }));
  }

  // The author themselves when connected, else whoever caught up with them most and, for a private stream, may serve it.
  // A member who left a pull unanswered is tried last.
  function target(author, ch, not) {
    if (connected(author) && author !== not) return author;
    let best = null;
    let most = -1;
    for (const [p, { have }] of peers) {
      if (p === not || !connected(p) || (ch === 'prv' && !opened(p))) continue;
      if ((have[author]?.pub ?? -1) > most) { most = have[author].pub; best = p; }
    }
    return best ?? (not && connected(not) && (ch === 'pub' || opened(not)) ? not : null);
  }

  function pull(author, ch) {
    const key = `${author}/${ch}`;
    const to = target(author, ch, avoid.get(key));
    if (author === me || inflight.has(key) || !to) return;
    inflight.set(key, to);
    sendTo(to, { t: 'pull', author, ch, since: mine(author, ch) });
  }

  // A page of a stream, sized so the sealed frame stays under the cap, to a member who may hold it. A denied private
  // pull is owed, and served as soon as a decision opens the gate on this side.
  function page(requester, author, ch, since) {
    const shell = bytes(envelope({ t: 'events', author, ch, more: false, events: [] }, requester)) - 2;
    const reply = host.serve({ author, ch, since }, requester, PLAINTEXT_BYTES - shell);
    if ('deny' in reply) owed.set(`${requester}/${author}`, { requester, author, since });
    sendTo(requester, 'deny' in reply ? { t: 'deny', author, ch, why: reply.deny } : { t: 'events', author, ch, ...reply });
    return reply;
  }

  function settle() {
    for (const [key, { requester, author, since }] of owed) if (serves(requester, author)) { owed.delete(key); page(requester, author, 'prv', since); }
  }

  function push(peer, ch) {
    const { pushed } = peers.get(peer);
    const reply = page(peer, me, ch, pushed[ch]);
    if ('events' in reply) pushed[ch] += reply.events.length;
  }

  const ON = {
    hello(from, body, link) {
      if (body.role !== role || body.round !== round) return;
      const known = peers.get(from);
      const peer = known ?? { have: {}, links: new Set(), pushed: { pub: 0, prv: 0 }, heard: ticks };
      peer.have = body.have;
      peer.links.add(link);
      for (const ch of ['pub', 'prv']) peer.pushed[ch] = Math.max(peer.pushed[ch], body.have[me]?.[ch] ?? 0);
      peers.set(from, peer);
      // A hello back tells a new, reloaded or reconnected member what I hold: once per tick for the same claim, so
      // the copy that arrives on a second link gets no second reply, while a member who lost my events since
      // claims less and is answered at once.
      const claim = `${body.have[me]?.pub ?? 0}/${body.have[me]?.prv ?? 0}`;
      const behind = ['pub', 'prv'].some((ch) => (body.have[me]?.[ch] ?? 0) < mine(me, ch));
      if (!known || (behind && (peer.backAt !== ticks || peer.backClaim !== claim))) { peer.backAt = ticks; peer.backClaim = claim; hello(link); }
      if (!known && opened(from) && !mine(from, 'prv')) pull(from, 'prv');
      for (const [author, c] of Object.entries(body.have)) {
        if (c.pub > mine(author, 'pub')) pull(author, 'pub');
        if (c.prv > mine(author, 'prv')) pull(author, 'prv');
      }
    },
    pull(from, body) {
      page(from, body.author, body.ch, body.since);
    },
    events(from, body) {
      const { author, ch, events, more } = body;
      if (author === me) return;
      const key = `${author}/${ch}`;
      inflight.delete(key);
      avoid.delete(key);
      const before = mine(author, ch);
      const r = host.receive(author, ch, events);
      if (r && 'mismatch' in r) return;
      // A page the host refused makes no progress and is not asked for again until the timer.
      if ((r && 'gapFrom' in r) || (more && mine(author, ch) > before)) pull(author, ch);
      if (ch !== 'pub' || !events.some((e) => e.t === 'decided')) return;
      // A colleague's decision opens the gate both ways: their private page came ahead of it unless it was lost.
      settle();
      if (opened(author) && !mine(author, 'prv')) pull(author, 'prv');
    },
    deny(from, body) {
      inflight.delete(`${body.author}/${body.ch}`);
    },
    bye(from) {
      peers.delete(from);
    },
  };

  function onMessage(msg, link) {
    if (msg && typeof msg === 'object' && msg.v !== 2) {
      const { from, to, body } = msg;
      if (typeof from === 'string' && from && from.length <= 200 && (!to || to === me) && body?.t !== 'unsupported') sendTo(from, { t: 'unsupported' });
      return;
    }
    if (!checkWire(msg) || msg.sid !== sid || msg.from === me || (msg.to && msg.to !== me)) return;
    const peer = peers.get(msg.from);
    if (peer) peer.heard = ticks;
    ON[msg.body.t]?.(msg.from, msg.body, link);
  }

  // Live sync: my own appends go straight to every connected member who may hold them. My decision pushes my private
  // page ahead of the decided event, pulls every colleague who decided before me, and pays what I owed them.
  const offAppend = host.onAppend((ch, e) => {
    const live = [...peers.keys()].filter(connected);
    if (ch === 'prv' || e.t === 'decided') for (const p of live) if (serves(p, me)) push(p, 'prv');
    if (ch === 'pub') for (const p of live) push(p, 'pub');
    if (e.t === 'decided') { settle(); for (const author of Object.keys(host.vector(me))) if (opened(author)) pull(author, 'prv'); }
  });

  return {
    attach(link) {
      links.add(link);
      const off = link.onMessage((msg) => onMessage(msg, link));
      detach.set(link, () => { links.delete(link); detach.delete(link); off?.(); for (const p of peers.values()) p.links.delete(link); });
      // Every open and reopen starts with a hello, and a reopen forgets the pulls the drop may have lost, so a link
      // that comes back repairs at once, not on the timer.
      if (isOpen(link)) hello(link);
      link.onOpen?.(() => { inflight.clear(); hello(link); });
      return detach.get(link);
    },
    // The 10-second timer: a hello on every link repairs what a quiet drop lost, a pull nobody answered moves to
    // another member, and every private stream the gate has opened is asked for again.
    tick() {
      ticks++;
      for (const [key, to] of inflight) avoid.set(key, to);
      inflight.clear();
      for (const link of links) if (isOpen(link)) hello(link);
      for (const author of Object.keys(host.vector(me))) if (opened(author)) pull(author, 'prv');
    },
    bye() {
      for (const link of links) if (isOpen(link)) link.send(envelope({ t: 'bye' }));
    },
    stop() {
      offAppend();
      for (const off of [...detach.values()]) off();
    },
  };
}
