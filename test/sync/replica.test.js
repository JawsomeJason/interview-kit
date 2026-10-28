import { expect, test } from 'vitest';
import { unlock } from '../../src/evidence/gate.js';
import { createReplica } from '../../src/plugins/sync/replica.js';
import { createHost, ROOM } from './host-memory.js';
import { createNetwork, FRAME_BYTES } from './link-memory.js';

const room = (names, { mode = 'broadcast', ...opts } = {}) => {
  const net = createNetwork(opts);
  const hosts = Object.fromEntries(names.map((a) => [a, createHost(a, a.toUpperCase())]));
  const replicas = Object.fromEntries(names.map((a) => [a, createReplica(hosts[a])]));
  const ends = {};
  if (mode === 'broadcast') for (const a of names) replicas[a].attach(ends[a] = net.attach(a));
  else for (const a of names) for (const b of names) if (a < b) { const [ea, eb] = net.pair(a, b); replicas[a].attach(ea); replicas[b].attach(eb); }
  return { net, hosts, replicas, ends, tick: () => Object.values(replicas).forEach((r) => r.tick()) };
};
const sees = (host, other) => unlock(host.held, host.me().author)?.participants.some((p) => p.author === other && p.evidence.marks.size > 0) ?? false;
const round = (net) => { for (let n = net.pending; n > 0; n--) net.deliver(); };
const MARK = { t: 'mark', o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen' };

test('members catch up on each other over a broadcast link from their first hello', () => {
  const { net, hosts } = room(['a1', 'a2', 'a3']);
  hosts.a1.append('pub', { t: 'put', k: 'session.candidate', v: 'Sam Lee' });
  net.flush();
  expect(Object.values(hosts).map((h) => [h.held.a1.pub.length, h.held.a2.pub.length, h.held.a3.pub.length])).toEqual([[3, 2, 2], [3, 2, 2], [3, 2, 2]]);
});

test('a reply addressed to one member is dropped unopened by the rest', () => {
  const net = createNetwork();
  const seen = { mine: 0, others: 0, opened: 0 };
  const a3 = createHost('a3', 'A3');
  const end = net.attach('a3');
  end.onMessage((m) => { if (m.body.t === 'events') seen[m.to === 'a3' ? 'mine' : 'others']++; });
  createReplica({ ...a3, receive: (...args) => { seen.opened++; return a3.receive(...args); } }).attach(end);
  for (const a of ['a1', 'a2']) createReplica(createHost(a, a.toUpperCase())).attach(net.attach(a));
  net.flush();
  expect(seen).toEqual({ mine: 2, others: 2, opened: 2 });
});

test('both sides deciding opens the merge within one round trip, with no hello timer', () => {
  const { net, hosts } = room(['a1', 'a2']);
  net.flush();
  hosts.a1.append('prv', MARK);
  hosts.a2.append('prv', MARK);
  hosts.a1.decide();
  net.flush();
  expect([sees(hosts.a1, 'a2'), sees(hosts.a2, 'a1')]).toEqual([false, false]);
  hosts.a2.decide();
  const after = [];
  for (let i = 0; i < 2; i++) { round(net); after.push([sees(hosts.a1, 'a2'), sees(hosts.a2, 'a1')]); }
  expect(after).toEqual([[true, false], [true, true]]);
});

test('a private stream after the gate is pushed live, and a quiet drop is repaired on the next tick', () => {
  const { net, hosts, tick } = room(['a1', 'a2']);
  net.flush();
  hosts.a1.decide();
  hosts.a2.decide();
  net.flush();
  hosts.a1.append('prv', { t: 'note', scope: 'css-04', text: 'Revised after the debrief.' });
  net.flush();
  expect(hosts.a2.held.a1.prv.at(-1).text).toBe('Revised after the debrief.');
  net.faults.drop = 1;
  hosts.a1.append('prv', { t: 'note', scope: 'css-04', text: 'Lost on the wire.' });
  net.flush();
  net.faults.drop = 0;
  expect(hosts.a2.held.a1.prv.at(-1).text).toBe('Revised after the debrief.');
  tick();
  net.flush();
  expect(hosts.a2.held.a1.prv.at(-1).text).toBe('Lost on the wire.');
});

test('every frame stays under 64 KiB, including a log of 500 maximum-size notes, one note per page', () => {
  // The last page carries the final note and the decision together, so 501 events go in 500 pages.
  const { net, hosts } = room(['a1', 'a2']);
  const worst = '\u0001'.repeat(8000);
  for (let i = 0; i < 500; i++) hosts.a1.append('prv', { t: 'note', scope: `item-${i}`, text: worst });
  hosts.a1.decide();
  hosts.a2.decide();
  net.flush();
  const pages = net.sent.filter(({ msg }) => msg.body.t === 'events' && msg.body.author === 'a1' && msg.body.ch === 'prv');
  expect([net.violations, net.maxFrame <= FRAME_BYTES, hosts.a2.held.a1.prv.map((e) => e.n)]).toEqual([[], true, Array.from({ length: 501 }, (_, i) => i)]);
  expect([pages.length, Math.max(...pages.map(({ msg }) => msg.body.events.length))]).toEqual([500, 2]);
});

test('a hello carries a private count only on a point-to-point link, and only once the gate has opened', () => {
  const prvIn = (net) => net.sent.filter(({ msg }) => msg.body.t === 'hello').map(({ msg }) => Object.values(msg.body.have).some((c) => 'prv' in c));
  const p2p = room(['a1', 'a2'], { mode: 'p2p' });
  p2p.net.flush();
  p2p.hosts.a1.decide();
  p2p.hosts.a2.decide();
  p2p.net.flush();
  const before = prvIn(p2p.net).some(Boolean);
  p2p.tick();
  const after = prvIn(p2p.net).slice(-2);
  const cast = room(['a1', 'a2']);
  cast.net.flush();
  cast.hosts.a1.decide();
  cast.hosts.a2.decide();
  cast.net.flush();
  cast.tick();
  expect([before, after, prvIn(cast.net).some(Boolean)]).toEqual([false, [true, true], false]);
});

test('a departed author is served by whoever caught up with them, and a bye drops them at once', () => {
  const { net, hosts, replicas, tick } = room(['a1', 'a2', 'a3']);
  net.flush();
  net.partition((a) => (a === 'a2' ? 1 : 0));
  hosts.a1.append('pub', { t: 'put', k: 'session.candidate', v: 'Sam' });
  net.flush();
  net.heal();
  replicas.a1.bye();
  net.flush();
  replicas.a1.stop();
  const before = net.sent.length;
  for (let i = 0; i < 3; i++) { tick(); net.flush(); }
  const toA1 = net.sent.slice(before).filter(({ msg }) => msg.body.t === 'pull' && msg.to === 'a1').length;
  expect([hosts.a2.held.a1.pub.length, hosts.a3.held.a1.pub.length, toA1]).toEqual([3, 3, 0]);
});

test('an author who falls silent without a bye stops being a pull target after two quiet ticks', () => {
  const { net, hosts, replicas, tick, ends } = room(['a1', 'a2', 'a3']);
  net.flush();
  net.partition((a) => (a === 'a2' ? 1 : 0));
  hosts.a1.append('pub', { t: 'put', k: 'session.candidate', v: 'Sam' });
  net.flush();
  ends.a1.close();
  replicas.a1.stop();
  net.heal();
  const held = [];
  for (let i = 0; i < 3; i++) { tick(); net.flush(); held.push(hosts.a2.held.a1.pub.length); }
  expect(held).toEqual([2, 3, 3]);
});

test('a colleague who left before I decided still reaches my debrief through a member who holds them', () => {
  const { net, hosts, replicas, tick, ends } = room(['a1', 'a2', 'a3']);
  net.flush();
  hosts.a1.append('prv', MARK);
  hosts.a1.decide();
  hosts.a3.decide();
  net.flush();
  ends.a1.close();
  replicas.a1.stop();
  hosts.a2.decide();
  for (let i = 0; i < 3; i++) { tick(); net.flush(); }
  expect([sees(hosts.a3, 'a1'), sees(hosts.a2, 'a1')]).toEqual([true, true]);
});

test('reordered frames never leave the merge waiting on the timer', () => {
  let late = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const { net, hosts } = room(['a1', 'a2'], { seed, faults: { reorder: 0.5 } });
    net.flush();
    hosts.a1.append('prv', MARK);
    hosts.a2.append('prv', MARK);
    hosts.a1.decide();
    net.flush();
    hosts.a2.decide();
    net.flush();
    if (!(sees(hosts.a1, 'a2') && sees(hosts.a2, 'a1'))) late++;
  }
  expect(late).toBe(0);
});

test('a reloaded member catches up from the hello it gets back, with no timer after the reload', () => {
  const { net, hosts, replicas, ends, tick } = room(['a1', 'a2']);
  net.flush();
  tick();
  net.flush();
  replicas.a1.stop();
  hosts.a2.append('pub', { t: 'put', k: 'session.candidate', v: 'Sam' });
  net.flush();
  createReplica(hosts.a1).attach(ends.a1);
  net.flush();
  expect(hosts.a1.held.a2.pub.length).toBe(3);
});

test('a page the host refuses is not pulled again until the timer', () => {
  const { net, hosts } = room(['a1', 'a2']);
  net.flush();
  for (let i = 0; i < 3; i++) hosts.a1.append('pub', { t: 'put', k: 'session.candidate', v: 'x'.repeat(30_000) });
  hosts.a1.held.a1.pub[2].k = 'score.alex';
  const a3 = createHost('a3', 'A3');
  createReplica(a3).attach(net.attach('a3'));
  net.flush();
  const pulls = net.sent.filter(({ msg, from }) => from === 'a3' && msg.body.t === 'pull' && msg.body.author === 'a1').length;
  expect([a3.held.a1.pub.length, pulls]).toEqual([2, 2]);
});

test('a link that is still opening gets its hello when it opens', () => {
  const net = createNetwork();
  const a1 = createHost('a1', 'A1');
  const a2 = createHost('a2', 'A2');
  const [ea, eb] = net.pair('a1', 'a2', 'opening');
  createReplica(a1).attach(ea);
  createReplica(a2).attach(eb);
  const quiet = net.sent.length;
  ea.open();
  eb.open();
  net.flush();
  expect([quiet, a1.held.a2.pub.length]).toEqual([0, 2]);
});

test('a link that was open at attach says hello again each time it reopens, so a reconnect repairs at once', () => {
  const net = createNetwork();
  const a1 = createHost('a1', 'A1');
  const a2 = createHost('a2', 'A2');
  const [ea, eb] = net.pair('a1', 'a2');
  createReplica(a1).attach(ea);
  createReplica(a2).attach(eb);
  net.flush();
  ea.close();
  a2.append('pub', { t: 'put', k: 'session.candidate', v: 'Sam Lee' });
  net.flush();
  const before = a1.held.a2.pub.length;
  ea.state = eb.state = 'open';
  ea.open();
  eb.open();
  net.flush();
  expect([before, a1.held.a2.pub.length, net.sent.filter((s) => s.msg.body.t === 'hello').length]).toEqual([2, 3, 7]);
});

test('a pull lost when a link dropped is asked again as soon as the link reopens, not on the timer', () => {
  const net = createNetwork();
  const a1 = createHost('a1', 'A1');
  const a2 = createHost('a2', 'A2');
  const [ea, eb] = net.pair('a1', 'a2');
  createReplica(a1).attach(ea);
  createReplica(a2).attach(eb);
  net.flush();
  const reopen = () => { ea.state = eb.state = 'open'; ea.open(); eb.open(); };
  ea.close();
  a2.append('pub', { t: 'put', k: 'session.candidate', v: 'Sam Lee' });
  // The hellos cross, a1 learns a2 holds more and pulls, and the link goes with that pull on the wire.
  reopen();
  for (let i = 0; i < 3; i++) net.deliver();
  const lost = net.sent.filter((s) => s.msg.body.t === 'pull').length;
  ea.close();
  net.flush();
  expect([lost, a1.held.a2.pub.length]).toEqual([3, 2]);
  reopen();
  net.flush();
  expect([net.sent.filter((s) => s.msg.body.t === 'pull').length, a1.held.a2.pub.length]).toEqual([4, 3]);
});

test('a second drop inside one tick still gets a hello back, so the catch-up never waits for the timer', () => {
  const net = createNetwork();
  const a1 = createHost('a1', 'A1');
  const a2 = createHost('a2', 'A2');
  const [ea, eb] = net.pair('a1', 'a2');
  createReplica(a1).attach(ea);
  createReplica(a2).attach(eb);
  net.flush();
  // Only a1's end notices the drop and the return, as a laptop whose own network blinked does.
  const dropAndAppend = (v) => { ea.close(); a2.append('pub', { t: 'put', k: 'session.candidate', v }); ea.state = eb.state = 'open'; ea.open(); net.flush(); };
  dropAndAppend('Sam Lee');
  dropAndAppend('Sam Li');
  expect(a1.held.a2.pub.length).toBe(4);
});

test('a message a dead direct link refuses goes out on the next link that reaches the peer', () => {
  const net = createNetwork();
  const a1 = createHost('a1', 'A1');
  const a2 = createHost('a2', 'A2');
  const r1 = createReplica(a1);
  createReplica(a2).attach(net.attach('a2'));
  r1.attach(net.attach('a1'));
  net.flush();
  const refused = [];
  r1.attach({ kind: 'direct', peer: 'a2', state: 'open', send: (m) => { refused.push(m.body.t); return false; }, onMessage: () => () => {} });
  // a1's broadcast link blinks while a2 appends, so a1 has to pull, and the direct link is the first that reaches a2.
  const e1 = net.ends.get('a1>*');
  e1.close();
  a2.append('pub', { t: 'put', k: 'session.candidate', v: 'Sam Lee' });
  e1.state = net.ends.get('a2>*').state = 'open';
  e1.open();
  net.flush();
  expect([refused, a1.held.a2.pub.length]).toEqual([['hello', 'pull'], 3]);
});

test('a hello from another round is refused before catch-up', () => {
  const net = createNetwork();
  const a1 = createHost('a1', 'A1');
  const a2 = createHost('a2', 'A2', { room: { ...ROOM, round: 'onsite' } });
  createReplica(a1).attach(net.attach('a1'));
  createReplica(a2).attach(net.attach('a2'));
  net.flush();
  expect([a1.held.a2, a2.held.a1]).toEqual([undefined, undefined]);
});

test('an envelope from another kit version is answered with unsupported, and two versions never answer each other forever', () => {
  const { net } = room(['a1', 'a2']);
  net.flush();
  const stale = net.attach('a9');
  const v3 = (body, to) => ({ v: 3, id: '0123456789abcdef', from: 'a9', ...(to && { to }), sid: 'k3x9q2', pack: ROOM.pack, body });
  stale.onMessage((m) => { if (m.v !== 3 && (!m.to || m.to === 'a9')) stale.send(v3({ t: 'unsupported' }, m.from)); });
  stale.send(v3({ t: 'hello' }));
  net.flush();
  expect(net.sent.filter(({ msg }) => msg.body.t === 'unsupported').map(({ msg }) => [msg.from, msg.to])).toEqual([['a1', 'a9'], ['a2', 'a9'], ['a9', 'a1'], ['a9', 'a2']]);
});
