import { codeOf, fingerprint, joinFragment, makeKeys, makePair, makeSigner, memberText, parseJoin, rekeyText, sign, signedBy, unwrap, wrap } from './admit.js';
import { createRelays, RELAYS, relayLink } from './link-relay.js';
import { createRtcLinks, STUN } from './link-rtc.js';
import { detailOf, followable, hear, labels, PERSONAL, placeOf, statusOf, UNNAMED, WHERE_EVERY } from './presence.js';
import { createReplica } from './replica.js';
import { openRooms } from './rooms.js';
import { b64 } from './seal.js';
import { banners, joinLine, LIMIT, roomLine } from './status.js';
import { mountUi } from './ui.js';
import { checkWire } from './wire-check.js';
import './sync.css';

const KNOCK_EVERY = 5_000;
// A joiner knocks every 5 seconds; one not heard for three knocks was let in by someone else, or gave up.
const KNOCK_FRESH = 3 * KNOCK_EVERY;
// Enough for a knock each time Join is pressed, not a flood.
const KNOCK_GAP = 2_000;
const KNOCK_MAX = 8;
const TICK = 10_000;
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
// Keys that scroll the page when nothing interactive has focus; scrolling does not stop Follow.
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' ']);
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);
const INTERACTIVE = 'input, textarea, select, button, a, [contenteditable], [role]';

export default function sync(api) {
  const { host, pack, stamp } = api;
  // The app can move to another document (Pop out), so every page lookup asks for the current one; the clocks,
  // storage, address and sockets stay with the tab.
  const doc = () => api.doc();
  const win = doc().defaultView;
  // Limits run on the monotonic clock, anchored once to the wall clock for the times the words show.
  const origin = Date.now() - win.performance.now();
  const now = () => origin + win.performance.now();
  const urls = pack.options.sync?.relays ?? RELAYS;
  const relays = createRelays(urls, { win });
  const rooms = openRooms(pack.id, { indexedDB: win.indexedDB });
  const envelope = (from, sid, body, to) => ({ v: 2, id: hex(8), from, ...(to && { to }), sid, pack: { id: pack.id, ...stamp }, body });
  // A link opens the kit wherever the pack is served, or this page when it is served at all; from disk it is a code.
  const base = pack.options.url || (/^https?:$/.test(win.location.protocol) ? win.location.origin + win.location.pathname : '');
  // Test seam: the chaos harness wraps every link the room opens in a faulty one. Production passes nothing.
  const faulty = api.links ?? ((l) => l);
  const inviteText = (r) => {
    const fragment = joinFragment({ sid: r.sid, link: r.keys.link, fp: r.fp, from: host.me()?.name ?? '' });
    return base ? `${base}#${fragment}` : fragment;
  };

  let room = null;
  let lobby = null;
  let link = null;
  let replica = null;
  let rtc = null;
  let timers = [];
  let openSid = null;
  let startedAt = 0;
  let relay = { upAt: null, downAt: null };
  let backAt = null;
  let note = null;
  let following = null;
  let bye = null;
  let gone = false;
  let followNote = null;
  const direct = new Set();
  const knocks = new Map();
  const readmitted = new Map();
  const peers = new Map();
  const known = new Map();
  // A name arrives on the wire with its author's first page, or is already in the held log after a reload.
  const nameOf = (author) => {
    if (!known.has(author) && host.me()) {
      const held = host.serve({ author, ch: 'pub', since: 0 }, host.me().author);
      const e = held.events?.find((x) => x.t === 'name');
      if (e) known.set(author, e.name);
    }
    return known.get(author) ?? room?.members[author]?.name ?? UNNAMED;
  };
  // The path a colleague is on: an open direct link to them, else the meeting point, whichever link a message took.
  const pathTo = (author) => [...direct].find((d) => d.peer === author && d.state === 'open')?.kind ?? 'relay';

  relays.onState((s) => {
    const at = now();
    if (s === 'open') {
      if (relay.downAt != null && at - relay.downAt >= LIMIT.blip) backAt = at;
      relay = { upAt: at, downAt: null };
    } else if (relay.upAt != null) relay = { upAt: null, downAt: at };
    ui.refresh();
  });
  for (const e of ['online', 'offline']) win.addEventListener(e, () => ui.refresh());

  let joining = null;
  let joinState = null;
  const pending = parseJoin(win.location.hash);
  if (pending) win.history.replaceState(null, '', win.location.pathname + win.location.search);

  api.askName();

  async function listen() {
    stopListening();
    const me = host.me();
    gone = false;
    startedAt = now();
    if (relays.state === 'open' && relay.upAt == null) relay = { upAt: startedAt, downAt: null };
    [lobby, link] = await Promise.all([relayLink(relays, room.keys.link), relayLink(relays, room.keys.session).then(faulty)]);
    lobby.onMessage(async (m) => {
      // Only a member the inviter signed for can let anyone in.
      if (!room.cert || !checkWire(m) || m.sid !== room.sid || m.body.t !== 'knock' || m.from === me.author) return;
      const at = now();
      // A member knocks when they missed Change the link; their own key proves it is them, so they come straight back.
      const member = room.members[m.from];
      if (member) {
        if (member.pub === m.body.key && at - (readmitted.get(m.from) ?? -KNOCK_GAP) >= KNOCK_GAP) { readmitted.set(m.from, at); admit(m.from, member); }
        return;
      }
      // Every knocker keeps their own row, so two of one name both show. A waiting knocker keeps the key they first
      // knocked with; anyone else knocking under their id with another key is ignored.
      const k = knocks.get(m.from);
      if (k ? k.key !== m.body.key || at - k.at < KNOCK_GAP : knocks.size >= KNOCK_MAX) return;
      knocks.set(m.from, { name: m.body.name, key: m.body.key, code: k?.code ?? await codeOf(m.body.key), at });
      ui.refresh();
    });
    watch(link);
    link.onOpen(where);
    // A member someone other than the inviter let in says so until the inviter signs their key, which puts them on
    // the inviter's roster for Change the link and lets them let others in.
    const announce = () => room && !room.cert && link?.send(envelope(me.author, room.sid, { t: 'joined', name: host.me().name, key: room.pair.pub }));
    link.onOpen(announce);
    // The goodbye is sealed ahead of time for the relay and goes down every open direct link too, since a closing
    // page's last relay frame may never leave while its data channels still deliver.
    const leaving = envelope(me.author, room.sid, { t: 'bye' });
    link.prepare(leaving).then((send) => { bye = () => { send(); for (const l of direct) if (l.state === 'open') l.send(leaving); }; });
    replica = createReplica(host);
    replica.attach(link);
    // A direct link carries presence and names as the relay does, so the detail line can say which path a colleague is on.
    rtc = createRtcLinks({ me: me.author, link, envelope: (body, to) => envelope(me.author, room.sid, body, to), turn: pack.options.sync?.turn ?? [], win,
      attach: (raw) => { const l = faulty(raw); watch(l); direct.add(l); const off = replica.attach(l); return () => { direct.delete(l); off(); }; } });
    timers = [win.setInterval(() => { replica.tick(); announce(); }, TICK), win.setInterval(() => doc().visibilityState === 'visible' && where(), WHERE_EVERY)];
    where();
    ui.refresh();
  }
  function stopListening() {
    replica?.stop();
    rtc?.close();
    link?.close();
    lobby?.close();
    for (const t of timers) win.clearInterval(t);
    replica = rtc = link = lobby = bye = null;
  }

  // Presence is rebuilt from whatever a colleague sends on any link, never logged. A link the transport adds later
  // is watched the same way.
  function watch(l) {
    l.onMessage((m) => {
      const me = host.me();
      if (!room || !me || !m || typeof m.from !== 'string' || m.from === me.author || m.from.length > 200) return;
      if (m.v !== 2) { if (peers.has(m.from) || room.members[m.from]) hear(peers, m.from, now(), { newer: true }); return ui.refresh(); }
      if (!checkWire(m) || m.sid !== room.sid) return;
      const b = m.body;
      const at = now();
      if (b.t === 'events' && b.ch === 'pub') for (const e of b.events) if (e.t === 'name') known.set(b.author, e.name);
      if (b.t === 'rekey' && m.to === me.author) rekeyed(m);
      if (b.t === 'joined' && room.sign) certify(m);
      if (b.t === 'cert' && m.to === me.author) certified(b.cert);
      knocks.delete(m.from);
      const p = hear(peers, m.from, at, { via: pathTo(m.from),
        ...(b.t === 'hello' && { have: b.have, pack: m.pack, newer: false }),
        ...(b.t === 'where' && { route: b.route, following: b.following, visible: b.visible }),
        ...(b.t === 'unsupported' && { newer: true }) });
      if (b.t === 'hello') caughtUp(p, at);
      if (b.t === 'bye') { p.leftAt = at; if (following === m.from) following = null; }
      if (following === m.from) track();
      ui.refresh();
    });
  }
  // Behind a colleague while their hello claims more of someone's shared stream than I hold.
  function caughtUp(p, at) {
    if (!p.have || !host.me()) return;
    const mine = host.vector(host.me().author);
    const behind = Object.entries(p.have).some(([a, c]) => (c.pub ?? 0) > (mine[a]?.pub ?? 0));
    if (behind) p.behindSince ??= at;
    else if (p.behindSince != null || p.caughtUpAt == null) { p.behindSince = null; p.caughtUpAt = at; }
  }

  function where() {
    const me = host.me();
    if (!link || !room || !me || gone) return;
    const m = envelope(me.author, room.sid, { t: 'where', route: host.route().slice(0, 200), following, visible: doc().visibilityState === 'visible' });
    link.send(m);
    for (const l of direct) if (l.state === 'open') l.send(m);
  }
  host.onNavigate(where);
  // A closed tab says goodbye at once instead of going quiet for 90 seconds, and says nothing after it: the page
  // goes hidden after pagehide, and that where would undo the goodbye. A reload comes straight back.
  win.addEventListener('pagehide', () => { bye?.(); gone = true; });

  function follow(author) {
    const me = host.me().author;
    for (let a = author, seen = new Set(); a && !seen.has(a); seen.add(a), a = peers.get(a)?.following ?? null) {
      if (a === me) { followNote = { text: `${peers.get(author).name} is following you, so you can't follow them back.`, at: now() }; return ui.refresh(); }
    }
    following = author;
    followNote = null;
    track();
    where();
    ui.refresh();
  }
  function stopFollowing() {
    followNote = following && { text: `Stopped following ${peers.get(following)?.name ?? nameOf(following)}.`, at: now() };
    following = null;
    where();
    ui.refresh();
  }
  function track() {
    const p = peers.get(following);
    if (p && !['lost', 'unreachable', 'left'].includes(statusOf(p, now())) && followable(p.route) && p.route !== host.route()) host.navigate(p.route);
  }
  function onInput(e) {
    if (!following) return;
    if (e.key === 'Escape') return stopFollowing();
    const t = e.target;
    if (t.closest?.('.sync-follow') || MODIFIERS.has(e.key) || e.key === 'Tab') return;
    if (e.type === 'keydown' && SCROLL_KEYS.has(e.key) && !t.matches?.(INTERACTIVE)) return;
    if (e.type === 'pointerdown' && (t === t.ownerDocument?.documentElement || t === t.ownerDocument?.body || t.matches?.('main'))) return;
    stopFollowing();
  }
  // Each document the app lands in gets the listeners; adding the same one twice to a document is a no-op.
  function listenTo(d) {
    d.addEventListener('visibilitychange', where);
    d.addEventListener('keydown', onInput, true);
    d.addEventListener('pointerdown', onInput, true);
  }
  listenTo(doc());
  api.onUpdate(() => listenTo(doc()));
  function followBar(at) {
    const p = following && peers.get(following);
    if (!p) return followNote && at - followNote.at < LIMIT.note ? { text: followNote.text, stop: false } : null;
    const text = ['lost', 'unreachable'].includes(statusOf(p, at)) ? `${p.name} is reconnecting. You stay where you are.`
      : PERSONAL[p.route] ? `${p.name} is on ${PERSONAL[p.route]}.` : followable(p.route) ? `Following ${p.name}.` : `${p.name} is on a page of their own.`;
    return { text, stop: true };
  }

  async function enter(sid) {
    room = room?.sid === sid ? room : await (await rooms).get(sid);
    if (room) await listen();
    ui.refresh();
  }
  function leave() {
    replica?.bye();
    stopListening();
    room = null;
    following = followNote = note = null;
    knocks.clear();
    peers.clear();
  }
  api.onUpdate(() => {
    const sid = host.me()?.sid ?? null;
    if (sid !== openSid) {
      openSid = sid;
      leave();
      if (sid) enter(sid);
    }
    for (const p of peers.values()) caughtUp(p, now());
    ui.refresh();
  });

  async function invite() {
    const me = host.me();
    if (!room) {
      const [pair, signer] = await Promise.all([makePair(), makeSigner()]);
      room = { sid: me.sid, author: me.author, keys: makeKeys(), pair, signer: signer.pub, sign: signer.priv, fp: await fingerprint(signer.pub),
        cert: await sign(signer.priv, memberText(me.sid, pair.pub)), inviter: true, members: {}, from: me.name };
      await (await rooms).put(room);
      await listen();
    }
    return inviteText(room);
  }
  async function letIn(author) {
    const knock = knocks.get(author);
    if (!knock) return;
    knocks.delete(author);
    room.members[author] = { name: knock.name, pub: knock.key };
    await (await rooms).put(room);
    await admit(author, room.members[author]);
    note = { text: `${knock.name} joined.`, at: now() };
    ui.refresh();
  }
  async function admit(author, { pub }) {
    const me = host.me();
    const wrapped = await wrap(room.pair.priv, pub, room.sid, { ...room.keys, role: me.role, round: me.round });
    const cert = room.sign && await sign(room.sign, memberText(room.sid, pub));
    await lobby.send(envelope(me.author, room.sid, { t: 'admit', key: room.pair.pub, wrapped, signer: room.signer, proof: room.cert, ...(cert && { cert }) }, author));
  }
  async function notNow(author) {
    knocks.delete(author);
    ui.refresh();
    await lobby.send(envelope(host.me().author, room.sid, { t: 'refuse' }, author));
  }
  // Only the members ticked move to the new link; anyone left out needs a new invite.
  async function rotateKeys(keep) {
    const me = host.me();
    const keys = makeKeys();
    for (const [author, m] of Object.entries(room.members)) {
      if (!keep.has(author)) { delete room.members[author]; peers.delete(author); continue; }
      const wrapped = await wrap(room.pair.priv, m.pub, room.sid, { ...keys, role: me.role, round: me.round });
      await link.send(envelope(me.author, room.sid, { t: 'rekey', key: room.pair.pub, wrapped, sig: await sign(room.sign, rekeyText(room.sid, author, wrapped)) }, author));
    }
    room.keys = keys;
    await (await rooms).put(room);
    await listen();
    return inviteText(room);
  }
  // Only the inviter changes the link, so a rekey counts only with their signature.
  async function rekeyed(m) {
    const ok = room.signer && await signedBy(room.signer, rekeyText(room.sid, m.to, m.body.wrapped), m.body.sig);
    const grant = ok ? await unwrap(room.pair.priv, m.body.key, room.sid, m.body.wrapped) : null;
    if (!grant) return;
    room.keys = { link: grant.link, session: grant.session };
    await (await rooms).put(room);
    await listen();
  }

  async function certify(m) {
    const known = room.members[m.from];
    if (known && known.pub !== m.body.key) return;
    if (!known) {
      room.members[m.from] = { name: m.body.name, pub: m.body.key };
      await (await rooms).put(room);
    }
    link?.send(envelope(host.me().author, room.sid, { t: 'cert', cert: await sign(room.sign, memberText(room.sid, m.body.key)) }, m.from));
  }
  async function certified(cert) {
    if (room.cert || !(await signedBy(room.signer, memberText(room.sid, room.pair.pub), cert))) return;
    room.cert = cert;
    await (await rooms).put(room);
    ui.refresh();
  }

  async function join(text, name) {
    const target = parseJoin(text);
    if (!target) { joinState = { from: '', state: 'wrong' }; return ui.refresh(); }
    if (!name) { joinState = { from: target.from, state: 'noName' }; ui.refresh(); return doc().querySelector('.start-name')?.focus(); }
    if (await rejoin(target)) return;
    // Pressing Join again knocks as the same person, so the inviter sees one knock. A link that changed since this
    // browser was in the room knocks as the member it was, back into the same interview.
    const again = joining?.sid === target.sid ? joining : null;
    stopJoining();
    const stored = await (await rooms).get(target.sid);
    const author = again?.author ?? stored?.author ?? `a-${hex(4)}`;
    const pair = again?.pair ?? stored?.pair ?? await makePair();
    const lobbyLink = await relayLink(relays, target.link);
    joining = { ...target, author, pair, name, back: Boolean(stored?.author), code: await codeOf(pair.pub), lobby: lobbyLink, timers: [] };
    joinState = { from: target.from, text, startedAt: now(), lobbyUpAt: null, state: 'knocking' };
    const knock = () => {
      joinState.lobbyUpAt ??= now();
      lobbyLink.send(envelope(author, target.sid, { t: 'knock', name, key: pair.pub }));
    };
    lobbyLink.onMessage(answered);
    lobbyLink.onOpen(knock);
    if (lobbyLink.state === 'open') knock();
    joining.timers.push(win.setInterval(() => lobbyLink.state === 'open' && knock(), KNOCK_EVERY));
    ui.refresh();
  }
  async function answered(m) {
    if (!joining || !checkWire(m) || m.sid !== joining.sid || m.to !== joining.author) return;
    if (m.body.t === 'refuse') { joinState.state = 'refused'; stopJoining(); return ui.refresh(); }
    const b = m.body;
    // An admit counts only from a key the inviter whose fingerprint the link carries has signed.
    if (b.t !== 'admit' || await fingerprint(b.signer) !== joining.fp || !(await signedBy(b.signer, memberText(joining.sid, b.key), b.proof))) return;
    const grant = await unwrap(joining.pair.priv, b.key, joining.sid, b.wrapped);
    if (!grant) return;
    const cert = b.cert && await signedBy(b.signer, memberText(joining.sid, joining.pair.pub), b.cert) ? b.cert : null;
    room = { sid: joining.sid, author: joining.author, keys: { link: grant.link, session: grant.session }, pair: joining.pair, signer: b.signer, fp: joining.fp, cert, inviter: false,
      members: { [m.from]: { name: joining.from, pub: b.key } }, from: joining.from };
    await (await rooms).put(room);
    const { author, name, back } = joining;
    stopJoining();
    if (back ? await host.open(room.sid) : await host.join({ sid: room.sid, author, roleId: grant.role, roundId: grant.round, name })) joinState = null;
    else { room = null; joinState.state = 'foreign'; ui.refresh(); }
  }
  // A link to a room this browser is already in opens it again, without knocking, unless the link has changed since.
  async function rejoin({ sid, link: key }) {
    const stored = await (await rooms).get(sid);
    if (!stored || !(stored.inviter || b64(stored.keys.link) === b64(key)) || !(await host.open(sid))) return false;
    joinState = null;
    return true;
  }
  function stopJoining() {
    if (!joining) return;
    for (const t of joining.timers) win.clearInterval(t);
    joining.lobby.close();
    joining = null;
  }

  function retry() {
    relays.retry();
    replica?.tick();
    where();
    note = { text: 'Trying again…', at: now() };
    ui.refresh();
  }

  function view(at = now()) {
    const me = host.me();
    for (const [a, k] of knocks) if (at - k.at >= KNOCK_FRESH) knocks.delete(a);
    // Someone who reopened the kit in a new browser comes back as a new member; their old self stops showing.
    const gone = (p) => ['unreachable', 'left'].includes(statusOf(p, at));
    const list = [...peers.values()].filter((p) => !gone(p) || ![...peers.values()].some((q) => q !== p && !gone(q) && nameOf(q.author) === nameOf(p.author)));
    const named = labels(list.map((p) => ({ author: p.author, name: nameOf(p.author) })));
    for (const p of list) p.name = named.get(p.author);
    const titleOf = (route) => doc().querySelector(`.session-nav a[href="${route}"]`)?.firstChild?.textContent.trim() ?? null;
    return {
      pending: pending && joinFragment(pending),
      invitedBy: pending?.from ?? '',
      join: joinState && !room ? joinLine({ ...joinState, downAt: relay.downAt }, at) : null,
      joining: !room && Boolean(pending),
      joinText: joinState?.text ?? '',
      joinCode: joining && joinState?.state === 'knocking' ? { code: joining.code, from: joining.from || 'Your colleague' } : null,
      room: room && me && {
        inviter: room.inviter,
        line: roomLine({ inviter: room.inviter, expect: Object.keys(room.members).filter((a) => !peers.has(a)).map(nameOf),
          startedAt, online: win.navigator.onLine !== false, relay, backAt, note, peers: list, knocks: knocks.size }, at),
        members: list.filter((p) => statusOf(p, at) !== 'left').map((p) => ({ author: p.author, label: p.name, status: statusOf(p, at),
          detail: detailOf(p, at, { titleOf, nameOf: (a) => (a === me.author ? 'you' : named.get(a) ?? nameOf(a)) }),
          place: placeOf(p, titleOf) && p.route, followed: following === p.author })),
        knocks: [...knocks].map(([author, k]) => ({ author, name: k.name, code: k.code })),
        follow: followBar(at),
        banners: banners(list, stamp),
        roster: [...labels(Object.entries(room.members).map(([author, m]) => ({ author, name: known.get(author) ?? m.name })))]
          .map(([author, name]) => ({ author, name, leftAt: peers.get(author)?.leftAt ?? null })),
      },
    };
  }

  const ui = mountUi(api, {
    view, invite, letIn, notNow, follow, stopFollowing, retry, join, rotateKeys,
    reminder: () => `I'm waiting to join the interview in the kit. Look for "${joining?.name ?? 'me'} wants to join" at the top of the kit and press Let in.`,
    busy: () => Boolean(room || joining || joinState),
    checks: { urls, iceServers: [{ urls: STUN }, ...pack.options.sync?.turn ?? []] },
  });
  let arrived = !pending;
  api.onUpdate(async () => {
    const name = !arrived && doc().querySelector('.start-name');
    if (!name) return;
    arrived = true;
    if (!(await rejoin(pending))) name.focus();
  });
}
// The build test looks for this string to tell whether the plugin made it into a build.
sync.marker = '__ik_plugin_sync__';
