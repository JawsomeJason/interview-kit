import { esc } from '../../esc.js';
import { joinFragment, makeKeys, makePair, parseJoin, unwrap, wrap } from './admit.js';
import { createRelays, RELAYS, relayLink } from './link-relay.js';
import { createRtcLinks } from './link-rtc.js';
import { createReplica } from './replica.js';
import { openRooms } from './rooms.js';
import { checkWire } from './wire-check.js';
import './sync.css';

const KNOCK_EVERY = 5_000;
const LET_IN_LIMIT = 60_000;
const TICK = 10_000;
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
const names = (list) => (list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0]);

export default function sync(api) {
  const { host, pack, stamp } = api;
  const doc = api.doc();
  const win = doc.defaultView;
  const relays = createRelays(pack.options.sync?.relays ?? RELAYS, { win });
  const rooms = openRooms(pack.id, { indexedDB: win.indexedDB });
  const envelope = (from, sid, body, to) => ({ v: 2, id: hex(8), from, ...(to && { to }), sid, pack: { id: pack.id, ...stamp }, body });
  const inviteText = (room) => {
    const fragment = joinFragment({ sid: room.sid, link: room.keys.link, from: host.me()?.name ?? '' });
    return pack.options.url ? `${pack.options.url}#${fragment}` : fragment;
  };
  const els = new Set();
  const refresh = () => { for (const el of els) if (el.isConnected) draw(el); else els.delete(el); };

  let room = null;
  let lobby = null;
  let link = null;
  let replica = null;
  let rtc = null;
  let timer = null;
  let openSid = null;
  let status = '';
  const knocks = new Map();
  const peers = new Map();
  const known = new Map();
  const nameOf = (author) => known.get(author) ?? room?.members[author]?.name ?? 'a colleague';
  const say = (text) => { status = text; refresh(); };

  let joining = null;
  let joinNote = null;
  const pending = parseJoin(win.location.hash);
  if (pending) win.history.replaceState(null, '', win.location.pathname + win.location.search);
  const inviter = () => joining?.from || 'your colleagues';
  const JOIN_WORDS = {
    knocking: () => `Waiting for ${inviter()} to let you in…`,
    late: () => `${inviter()} hasn't let you in yet. Ask ${inviter()} to look at the kit.`,
    refused: () => `${inviter()} didn't let you in. Ask ${inviter()} to send a new link.`,
    wrong: () => "That isn't an invite link or code.",
    noName: () => 'Type your name first.',
    foreign: () => "This invite is for a role or round this kit doesn't have.",
  };

  api.askName();

  async function listen() {
    stopListening();
    const me = host.me();
    [lobby, link] = await Promise.all([relayLink(relays, room.keys.link), relayLink(relays, room.keys.session)]);
    lobby.onMessage((m) => {
      if (!checkWire(m) || m.sid !== room.sid || m.body.t !== 'knock' || room.members[m.from] || m.from === me.author) return;
      knocks.set(m.from, { name: m.body.name, key: m.body.key });
      refresh();
    });
    link.onMessage((m) => {
      if (!checkWire(m) || m.sid !== room.sid || m.from === me.author) return;
      if (m.body.t === 'events' && m.body.ch === 'pub') for (const e of m.body.events) if (e.t === 'name') known.set(m.body.author, e.name);
      if (m.body.t === 'hello') { peers.set(m.from, true); say(`Connected to ${names([...peers.keys()].map(nameOf))}`); }
      if (m.body.t === 'bye') { peers.delete(m.from); say(`${nameOf(m.from)} left.`); }
      if (m.body.t === 'rekey' && m.to === me.author) rekeyed(m);
    });
    replica = createReplica(host);
    replica.attach(link);
    rtc = createRtcLinks({ me: me.author, link, envelope: (body, to) => envelope(me.author, room.sid, body, to), turn: pack.options.sync?.turn ?? [], win, attach: (l) => replica.attach(l) });
    timer = win.setInterval(() => replica.tick(), TICK);
  }
  function stopListening() {
    replica?.stop();
    rtc?.close();
    link?.close();
    lobby?.close();
    win.clearInterval(timer);
    replica = rtc = link = lobby = null;
  }
  async function enter(sid) {
    room = room?.sid === sid ? room : await (await rooms).get(sid);
    if (room) await listen();
    refresh();
  }
  function leave() {
    replica?.bye();
    stopListening();
    room = null;
    knocks.clear();
    peers.clear();
    status = '';
  }
  api.onUpdate(() => {
    const sid = host.me()?.sid ?? null;
    if (sid === openSid) return;
    openSid = sid;
    leave();
    if (sid) enter(sid);
  });

  async function invite() {
    const me = host.me();
    if (!room) {
      room = { sid: me.sid, keys: makeKeys(), pair: await makePair(), inviter: true, members: {}, from: me.name };
      await (await rooms).put(room);
      await listen();
      refresh();
    }
    showInvite();
  }
  function showInvite() {
    const text = inviteText(room);
    const dialog = doc.createElement('dialog');
    dialog.className = 'sync-dialog';
    dialog.innerHTML = `<form method="dialog"><h2 class="sync-dialog-title">Invite colleagues</h2>
      <p>Send this to your colleagues directly, not in a channel.${pack.options.url ? '' : ' They paste it once into Join an interview on their setup page.'}</p>
      <label>${pack.options.url ? 'Invite link' : 'Invite code'} <textarea class="sync-code" rows="3" readonly>${esc(text)}</textarea></label>
      <div class="sync-dialog-actions"><button type="button" class="sync-copy">Copy</button><button type="submit">Close</button></div></form>`;
    dialog.querySelector('.sync-copy').onclick = ({ target }) => win.navigator.clipboard.writeText(text).then(() => { target.textContent = 'Copied'; });
    dialog.onclose = () => dialog.remove();
    doc.body.append(dialog);
    dialog.showModal();
  }
  async function letIn(author) {
    const me = host.me();
    const knock = knocks.get(author);
    knocks.delete(author);
    const wrapped = await wrap(room.pair.priv, knock.key, room.sid, { ...room.keys, role: me.role, round: me.round });
    room.members[author] = { name: knock.name, pub: knock.key };
    await (await rooms).put(room);
    await lobby.send(envelope(me.author, room.sid, { t: 'admit', key: room.pair.pub, wrapped }, author));
    say(`${knock.name} joined.`);
  }
  async function notNow(author) {
    knocks.delete(author);
    refresh();
    await lobby.send(envelope(host.me().author, room.sid, { t: 'refuse' }, author));
  }
  async function rotateKeys() {
    const me = host.me();
    const keys = makeKeys();
    for (const [author, m] of Object.entries(room.members)) {
      await link.send(envelope(me.author, room.sid, { t: 'rekey', key: room.pair.pub, wrapped: await wrap(room.pair.priv, m.pub, room.sid, { ...keys, role: me.role, round: me.round }) }, author));
    }
    room.keys = keys;
    await (await rooms).put(room);
    await listen();
    showInvite();
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
    if (!target) return joinSay('wrong', true);
    if (!name) return joinSay('noName', true);
    stopJoining();
    const author = `a-${hex(4)}`;
    const pair = await makePair();
    const lobbyLink = await relayLink(relays, target.link);
    joining = { ...target, author, pair, name, lobby: lobbyLink, timers: [] };
    const knock = () => lobbyLink.send(envelope(author, target.sid, { t: 'knock', name, key: pair.pub }));
    lobbyLink.onMessage(answered);
    lobbyLink.onOpen(knock);
    if (lobbyLink.state === 'open') knock();
    joining.timers.push(win.setInterval(knock, KNOCK_EVERY), win.setTimeout(() => joinSay('late'), LET_IN_LIMIT));
    joinSay('knocking');
  }
  async function answered(m) {
    if (!joining || !checkWire(m) || m.sid !== joining.sid || m.to !== joining.author) return;
    if (m.body.t === 'refuse') { joinSay('refused', true); return stopJoining(); }
    if (m.body.t !== 'admit') return;
    const grant = await unwrap(joining.pair.priv, m.body.key, joining.sid, m.body.wrapped);
    if (!grant) return;
    room = { sid: joining.sid, keys: { link: grant.link, session: grant.session }, pair: joining.pair, inviter: false, members: { [m.from]: { name: joining.from, pub: m.body.key } }, from: joining.from };
    await (await rooms).put(room);
    const { author, name } = joining;
    stopJoining();
    if (!await host.join({ sid: room.sid, author, roleId: grant.role, roundId: grant.round, name })) { room = null; joinSay('foreign', true); }
  }
  const joinSay = (state, failed = false) => { joinNote = { text: JOIN_WORDS[state](), failed }; refresh(); };
  function stopJoining() {
    if (!joining) return;
    for (const t of joining.timers) { win.clearInterval(t); win.clearTimeout(t); }
    joining.lobby.close();
    joining = null;
  }

  function draw(el) {
    const slot = el.dataset.slot;
    if (slot === 'setup.join') {
      el.innerHTML = `<fieldset class="sync-join"><legend class="sync-join-title">Join an interview</legend>
        <label class="start-field">Invite link or code <input class="start-input sync-join-code" autocomplete="off" spellcheck="false" placeholder="Paste what your colleague sent you" value="${esc(pending ? joinFragment(pending) : '')}"></label>
        <button type="button" class="sync-join-go">Join</button>
        <p class="sync-join-status${joinNote?.failed ? ' is-failed' : ''}" role="status">${esc(joinNote?.text ?? '')}</p></fieldset>`;
      el.querySelector('.sync-join-go').onclick = () => join(el.querySelector('.sync-join-code').value, el.closest('form')?.querySelector('.start-name')?.value.trim() ?? '');
    } else if (slot === 'menu.invite') {
      el.innerHTML = '<button type="button" class="sync-invite">Invite</button>';
      el.firstElementChild.onclick = invite;
    } else if (slot === 'menu.relink') {
      el.innerHTML = room?.inviter ? '<button type="button" class="sync-relink">Change the link</button>' : '';
      if (el.firstElementChild) el.firstElementChild.onclick = rotateKeys;
    } else if (slot === 'header.presence') {
      el.innerHTML = `<div class="sync-presence">${[...knocks].map(([author, k]) => `<p class="sync-knock" role="status"><span>${esc(k.name)} wants to join.</span>
        <button type="button" data-let-in="${esc(author)}">Let in</button><button type="button" data-not-now="${esc(author)}">Not now</button></p>`).join('')}
        <p class="sync-status" role="status">${esc(status)}</p></div>`;
      el.onclick = ({ target }) => {
        if (target.dataset.letIn) letIn(target.dataset.letIn);
        if (target.dataset.notNow) notNow(target.dataset.notNow);
      };
    }
  }
  for (const slot of ['setup.join', 'menu.invite', 'menu.relink', 'header.presence']) api.slot(slot, (el) => { els.add(el); draw(el); });
  if (pending) api.onUpdate(() => doc.querySelector('.start-name')?.focus());
}
// The build test looks for this string to tell whether the plugin made it into a build.
sync.marker = '__ik_plugin_sync__';
