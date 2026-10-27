import fc from 'fast-check';
import { expect, test } from 'vitest';
import { mayServePrivate } from '../../src/evidence/gate.js';
import { foldShared } from '../../src/evidence/reduce.js';
import { createReplica } from '../../src/plugins/sync/replica.js';
import { createHost } from './host-memory.js';
import { createNetwork } from './link-memory.js';

const NAMES = ['a1', 'a2', 'a3', 'a4', 'a5'];
const SEG = 'practical/deep-dive';
const PUB = [
  (i) => ({ t: 'put', k: 'session.candidate', v: `Sam ${i}` }),
  (i) => ({ t: 'put', k: 'segment.minutes', seg: SEG, v: i % 60 }),
  (i) => ({ t: 'member', k: 'segment.pools', seg: SEG, id: ['css', 'react', 'a11y'][i % 3], v: i % 2 ? true : null }),
  (i) => ({ t: 'member', k: 'segment.asked', seg: SEG, id: `css-0${i % 9}`, v: true }),
];
const PRV = [
  (i) => ({ t: 'mark', o: `css-04#mid.${i % 9}`, d: 'a1b2c3d4', s: i % 3 ? 'seen' : 'clear' }),
  (i) => ({ t: 'note', scope: `css-0${i % 9}`, text: 'Found it after one nudge. '.repeat(i % 40) }),
];

const action = fc.oneof(
  { weight: 4, arbitrary: fc.record({ op: fc.constant('pub'), who: fc.nat(4), i: fc.nat(999) }) },
  { weight: 4, arbitrary: fc.record({ op: fc.constant('prv'), who: fc.nat(4), i: fc.nat(999) }) },
  { weight: 2, arbitrary: fc.record({ op: fc.constant('decide'), who: fc.nat(4) }) },
  { weight: 6, arbitrary: fc.record({ op: fc.constant('deliver'), n: fc.integer({ min: 1, max: 40 }) }) },
  { weight: 2, arbitrary: fc.record({ op: fc.constant('tick'), who: fc.nat(4) }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant('partition'), mask: fc.integer({ min: 1, max: 30 }) }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant('heal') }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant('crash'), who: fc.nat(4), i: fc.nat(999) }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant('join'), who: fc.nat(4) }) },
  { weight: 1, arbitrary: fc.record({ op: fc.constant('leave'), who: fc.nat(4), bye: fc.boolean() }) },
);
const schedule = fc.record({
  members: fc.integer({ min: 2, max: 5 }),
  seed: fc.nat(),
  faults: fc.record({ drop: fc.double({ min: 0, max: 0.4, noNaN: true }), dup: fc.double({ min: 0, max: 0.3, noNaN: true }), reorder: fc.double({ min: 0, max: 0.5, noNaN: true }) }),
  actions: fc.array(action, { minLength: 5, maxLength: 60 }),
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The ground truth is each author's own log; a member may hold another author's private events only when both decided.
function leaks(hosts, names) {
  const out = [];
  for (const m of names) for (const x of names) {
    if (m === x || !hosts[m].held[x]?.prv.length) continue;
    if (!hosts[m].decided() || !hosts[x].decided()) out.push(`${m} holds ${x}'s private events before both decided`);
  }
  return out;
}

// Live members agree on every author who ever joined. A departed author's stream is whatever reached the room.
function converged(hosts, live, authors) {
  const longest = (x, ch) => (live.includes(x) ? hosts[x].held[x][ch] : live.map((m) => hosts[m].held[x]?.[ch] ?? []).reduce((a, b) => (b.length > a.length ? b : a), []));
  const plans = live.map((m) => JSON.stringify(foldShared(Object.fromEntries(authors.map((x) => [x, hosts[m].held[x]?.pub ?? []])))));
  for (const m of live) for (const x of authors) {
    const copy = hosts[m].held[x] ?? { pub: [], prv: [] };
    if (!same(copy.pub, longest(x, 'pub'))) return `${m} holds ${copy.pub.length} of ${x}'s ${longest(x, 'pub').length} public events`;
    const both = hosts[m].decided() && hosts[x].decided();
    if (m !== x && !same(copy.prv, both ? longest(x, 'prv') : [])) return `${m} holds ${copy.prv.length} of ${x}'s ${longest(x, 'prv').length} private events, both decided: ${both}`;
  }
  return new Set(plans).size === 1 ? null : 'plans differ';
}

function run({ members, seed, faults, actions }, mode) {
  const names = NAMES.slice(0, members);
  const net = createNetwork({ seed, faults });
  let now = 0x0194c0de1000;
  const hosts = Object.fromEntries(names.map((a) => [a, createHost(a, a.toUpperCase(), { physical: () => now })]));
  const replicas = {};
  const ends = Object.fromEntries(names.map((a) => [a, []]));
  const joined = new Set();
  const left = new Set();
  let silent = false;
  const join = (a) => {
    if (mode === 'broadcast') ends[a].push(net.attach(a));
    else for (const b of joined) { const [ea, eb] = net.pair(a, b); ends[a].push(ea); ends[b].push(eb); replicas[b].attach(eb); }
    joined.add(a);
    start(a);
  };
  const start = (a) => { replicas[a] = createReplica(hosts[a]); for (const e of ends[a]) replicas[a].attach(e); };
  const who = (i) => names[i % names.length];
  const live = (a) => joined.has(a) && !left.has(a);
  const bad = [];
  net.hooks.push((msg, from, to) => {
    const { t, have, ch, author } = msg.body;
    if (t === 'hello') for (const r of to) for (const [x, c] of Object.entries(have)) if ('prv' in c && !mayServePrivate(hosts[from].held, from, x, r)) bad.push(`${from} told ${r} how many private events ${x} holds`);
    if (t === 'events' && ch === 'prv' && msg.body.events.length && !mayServePrivate(hosts[from].held, from, author, msg.to)) bad.push(`${from} sent ${msg.to} ${author}'s private events before the gate`);
  });
  join(names[0]);
  join(names[1]);
  for (const act of actions) {
    now += 1000;
    const a = 'who' in act ? who(act.who) : null;
    if (act.op === 'join') { if (!joined.has(a)) join(a); }
    else if (a && !live(a)) continue;
    else if (act.op === 'pub') hosts[a].append('pub', PUB[act.i % PUB.length](act.i));
    else if (act.op === 'prv') hosts[a].append('prv', PRV[act.i % PRV.length](act.i));
    else if (act.op === 'decide') hosts[a].decide();
    else if (act.op === 'deliver') for (let n = 0; n < act.n; n++) net.deliver();
    else if (act.op === 'tick') replicas[a].tick();
    else if (act.op === 'partition') net.partition((m) => (act.mask >> names.indexOf(m)) & 1);
    else if (act.op === 'heal') net.heal();
    else if (act.op === 'crash') { hosts[a].append('pub', PUB[act.i % PUB.length](act.i)); replicas[a].stop(); net.discard(a); start(a); }
    else if (act.op === 'leave' && [...joined].filter(live).length > 1) { if (act.bye) replicas[a].bye(); else silent = true; replicas[a].stop(); for (const e of ends[a]) e.close(); left.add(a); }
    bad.push(...leaks(hosts, names));
    if (bad.length) break;
  }
  const authors = [...joined];
  const stayed = authors.filter(live);
  net.heal();
  net.faults = { drop: 0, dup: 0, reorder: 0 };
  net.flush();
  let rounds = 0;
  let why = converged(hosts, stayed, authors);
  while (why && rounds < 3) { rounds++; for (const a of stayed) replicas[a].tick(); net.flush(); why = converged(hosts, stayed, authors); }
  // One repair tick heals everything, except that a member who closed without a bye stays a pull target for one more.
  return { bad, frames: net.violations, converged: why, repaired: rounds <= (silent ? 2 : 1) };
}

const clean = (r) => expect([r.bad, r.frames, r.converged, r.repaired]).toEqual([[], [], null, true]);

test('1,000 faulty schedules over the broadcast link converge after healing, leak nothing and lose nothing', () => {
  fc.assert(fc.property(schedule, (s) => { clean(run(s, 'broadcast')); }), { numRuns: 1000, seed: 7 });
}, 120_000);

test('200 faulty schedules over point-to-point links converge after healing, leak nothing and lose nothing', () => {
  fc.assert(fc.property(schedule, (s) => { clean(run(s, 'p2p')); }), { numRuns: 200, seed: 7 });
}, 60_000);
