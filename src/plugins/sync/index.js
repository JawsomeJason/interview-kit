import { joinFragment, makeKeys, makePair, parseJoin, unwrap, wrap } from './admit.js';
import { createRelays, RELAYS, relayLink } from './link-relay.js';
import { detailOf, followable, hear, labels, PERSONAL, placeOf, statusOf, WHERE_EVERY } from './presence.js';
import { createReplica } from './replica.js';
import { openRooms } from './rooms.js';
import { banners, joinLine, roomLine } from './status.js';
import { mountUi } from './ui.js';
import { checkWire } from './wire-check.js';
import './sync.css';

const KNOCK_EVERY = 5_000;
const TICK = 10_000;
const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
// Keys that scroll the page when nothing interactive has focus; scrolling does not stop Follow.
const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' ']);
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);
const INTERACTIVE = 'input, textarea, select, button, a, [contenteditable], [role]';

export default function sync(api) {
  const { host, pack, stamp } = api;
  const doc = api.doc();
  const win = doc.defaultView;
  // Limits run on the monotonic clock, anchored once to the wall clock for the times the words show.
  const origin = Date.now() - win.performance.now();
  const now = () => origin + win.performance.now();
  const urls = pack.options.sync?.relays ?? RELAYS;
  const relays = createRelays(urls, { win });
  const rooms = openRooms(pack.id, { indexedDB: win.indexedDB });
  const envelope = (from, sid, body, to) => ({ v: 2, id: hex(8), from, ...(to && { to }), sid, pack: { id: pack.id, ...stamp }, body });
  // A link opens the kit wherever the pack is served, or this page when it is served at all; from disk it is a code.
  const base = pack.options.url || (/^https?:$/.test(win.location.protocol) ? win.location.origin + win.location.pathname : '');
  const inviteText = (r) => {
    const fragment = joinFragment({ sid: r.sid, link: r.keys.link, from: host.me()?.name ?? '' });
    return base ? `${base}#${fragment}` : fragment;
  };

  let room = null;
  let lobby = null;
  let link = null;
  let replica = null;
  let timers = [];
  let openSid = null;
  let startedAt = 0;
  let relay = { upAt: null, downAt: null };
  let backAt = null;
  let note = null;
  let following = null;
  let followNote = null;
  const knocks = new Map();
  const peers = new Map();
  const known = new Map();
  const nameOf = (author) => known.get(author) ?? room?.members[author]?.name ?? 'a colleague';

  relays.onState((s) => {
    const at = now();
    if (s === 'open') {
      if (relay.downAt != null) backAt = at;
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
    startedAt = now();
    if (relays.state === 'open' && relay.upAt == null) relay = { upAt: startedAt, downAt: null };
    [lobby, link] = await Promise.all([relayLink(relays, room.keys.link), relayLink(relays, room.keys.session)]);
    lobby.onMessage((m) => {
      if (!checkWire(m) || m.sid !== room.sid || m.body.t !== 'knock' || room.members[m.from] || m.from === me.author) return;
      knocks.set(m.from, { name: m.body.name, key: m.body.key });
      ui.refresh();
    });
    watch(link);
    link.onOpen(where);
    replica = createReplica(host);
    replica.attach(link);
    timers = [win.setInterval(() => replica.tick(), TICK), win.setInterval(() => doc.visibilityState === 'visible' && where(), WHERE_EVERY)];
    where();
    ui.refresh();
  }
  function stopListening() {
    replica?.stop();
    link?.close();
    lobby?.close();
    for (const t of timers) win.clearInterval(t);
    replica = link = lobby = null;
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
      const p = hear(peers, m.from, at, { via: l.kind,
        ...(b.t === 'hello' && { have: b.have, pack: m.pack }),
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
    if (!link || !room || !me) return;
    link.send(envelope(me.author, room.sid, { t: 'where', route: host.route().slice(0, 200), following, visible: doc.visibilityState === 'visible' }));
  }
  host.onNavigate(where);
  doc.addEventListener('visibilitychange', where);

  function follow(author) {
    const me = host.me().author;
    for (let a = author, seen = new Set(); a && !seen.has(a); seen.add(a), a = peers.get(a)?.following ?? null) {
      if (a === me) { followNote = `${peers.get(author).name} is following you, so you can't follow them back.`; return ui.refresh(); }
    }
    following = author;
    followNote = null;
    track();
    where();
    ui.refresh();
  }
  function stopFollowing() {
    followNote = null;
    if (!following) return ui.refresh();
    following = null;
    where();
    ui.refresh();
  }
  function track() {
    const p = peers.get(following);
    if (p && !['lost', 'unreachable', 'left'].includes(statusOf(p, now())) && followable(p.route) && p.route !== host.route()) host.navigate(p.route);
  }
  host.onInput((e) => {
    if (!following && !followNote) return;
    if (e.key === 'Escape') return stopFollowing();
    const t = e.target;
    if (t.closest?.('.sync-follow') || MODIFIERS.has(e.key)) return;
    if (e.type === 'keydown' && SCROLL_KEYS.has(e.key) && !t.matches?.(INTERACTIVE)) return;
    if (e.type === 'pointerdown' && (t === doc.documentElement || t === doc.body || t.matches?.('main'))) return;
    stopFollowing();
  });
  function followBar(at) {
    if (followNote) return followNote;
    const p = following && peers.get(following);
    if (!p) return null;
    if (['lost', 'unreachable'].includes(statusOf(p, at))) return `${p.name} is reconnecting. You stay where you are.`;
    if (PERSONAL[p.route]) return `${p.name} is on ${PERSONAL[p.route]}.`;
    return followable(p.route) ? `Following ${p.name}.` : `${p.name} is on a page of their own.`;
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
      room = { sid: me.sid, keys: makeKeys(), pair: await makePair(), inviter: true, members: {}, from: me.name };
      await (await rooms).put(room);
      await listen();
    }
    return inviteText(room);
  }
  async function letIn(author) {
    const me = host.me();
    const knock = knocks.get(author);
    if (!knock) return;
    knocks.delete(author);
    const wrapped = await wrap(room.pair.priv, knock.key, room.sid, { ...room.keys, role: me.role, round: me.round });
    room.members[author] = { name: knock.name, pub: knock.key };
    await (await rooms).put(room);
    await lobby.send(envelope(me.author, room.sid, { t: 'admit', key: room.pair.pub, wrapped }, author));
    note = { text: `${knock.name} joined.`, at: now() };
    ui.refresh();
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
      await link.send(envelope(me.author, room.sid, { t: 'rekey', key: room.pair.pub, wrapped: await wrap(room.pair.priv, m.pub, room.sid, { ...keys, role: me.role, round: me.round }) }, author));
    }
    room.keys = keys;
    await (await rooms).put(room);
    await listen();
    return inviteText(room);
  }
  async function rekeyed(m) {
    const from = room.members[m.from];
    const grant = from && from.pub === m.body.key ? await unwrap(room.pair.priv, m.body.key, room.sid, m.body.wrapped) : null;
    if (!grant) return;
    room.keys = { link: grant.link, session: grant.session };
    await (await rooms).put(room);
    await listen();
  }

  async function join(text, name) {
    const target = parseJoin(text);
    if (!target) { joinState = { from: '', state: 'wrong' }; return ui.refresh(); }
    if (!name) { joinState = { from: target.from, state: 'noName' }; return ui.refresh(); }
    stopJoining();
    const author = `a-${hex(4)}`;
    const pair = await makePair();
    const lobbyLink = await relayLink(relays, target.link);
    joining = { ...target, author, pair, name, lobby: lobbyLink, timers: [] };
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
    if (m.body.t !== 'admit') return;
    const grant = await unwrap(joining.pair.priv, m.body.key, joining.sid, m.body.wrapped);
    if (!grant) return;
    room = { sid: joining.sid, keys: { link: grant.link, session: grant.session }, pair: joining.pair, inviter: false, members: { [m.from]: { name: joining.from, pub: m.body.key } }, from: joining.from };
    await (await rooms).put(room);
    const { author, name } = joining;
    stopJoining();
    if (await host.join({ sid: room.sid, author, roleId: grant.role, roundId: grant.round, name })) joinState = null;
    else { room = null; joinState.state = 'foreign'; ui.refresh(); }
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

  // Everything the slots draw, as of `at`.
  function view(at = now()) {
    const me = host.me();
    const list = [...peers.values()];
    const named = labels(list.map((p) => ({ author: p.author, name: nameOf(p.author) })));
    for (const p of list) p.name = named.get(p.author);
    const titleOf = (route) => doc.querySelector(`.session-nav a[href="${route}"]`)?.firstChild?.textContent.trim() ?? null;
    return {
      pending: pending && joinFragment(pending),
      invitedBy: pending?.from ?? '',
      join: joinState && !room ? joinLine(joinState, at) : null,
      joinText: joinState?.text ?? '',
      room: room && me && {
        inviter: room.inviter,
        line: roomLine({ inviter: room.inviter, expect: Object.keys(room.members).filter((a) => !peers.has(a)).map(nameOf),
          startedAt, online: win.navigator.onLine !== false, relay, backAt, note, peers: list }, at),
        members: list.filter((p) => statusOf(p, at) !== 'left').map((p) => ({ author: p.author, label: p.name, status: statusOf(p, at),
          detail: detailOf(p, at, { titleOf, nameOf: (a) => (a === me.author ? 'you' : named.get(a) ?? nameOf(a)) }),
          place: placeOf(p, titleOf) && p.route, followed: following === p.author })),
        knocks: [...knocks].map(([author, k]) => ({ author, name: k.name })),
        follow: followBar(at),
        banners: banners(list, stamp),
        roster: Object.entries(room.members).map(([author, m]) => ({ author, name: known.get(author) ?? m.name })),
      },
    };
  }

  const ui = mountUi(api, {
    view, invite, letIn, notNow, follow, stopFollowing, retry, join, rotateKeys,
    busy: () => Boolean(room || joining || joinState),
    checks: { urls, iceServers: [...STUN, ...pack.options.sync?.turn ?? []] },
  });
  let focused = !pending;
  api.onUpdate(() => {
    const name = !focused && doc.querySelector('.start-name');
    if (name) { focused = true; name.focus(); }
  });
}
// The build test looks for this string to tell whether the plugin made it into a build.
sync.marker = '__ik_plugin_sync__';
