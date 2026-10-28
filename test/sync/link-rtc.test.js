import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createRtcLinks } from '../../src/plugins/sync/link-rtc.js';
import { createNetwork } from './link-memory.js';

// A fake RTCPeerConnection: records its config and what it was told, and lets a test move it through connected,
// failed and closed. Candidates trickle two microtasks after setLocalDescription, so they follow the description
// out as a browser's do (a 0 ms timer would not: the fake clock pushes one scheduled inside a tick to the next ms).
class FakePc {
  static all = [];
  constructor(config) {
    Object.assign(this, { config, connectionState: 'new', remoteDescription: null, candidates: [], restarts: 0, channels: [], closed: false, at: Date.now(), stats: new Map() });
    FakePc.all.push(this);
  }
  createDataChannel(label) { const ch = new FakeChannel(label); this.channels.push(ch); queueMicrotask(() => this.onnegotiationneeded?.()); return ch; }
  async createOffer() { return { type: 'offer', sdp: `offer-${FakePc.all.indexOf(this)}` }; }
  async createAnswer() { return { type: 'answer', sdp: `answer-${FakePc.all.indexOf(this)}` }; }
  async setLocalDescription(d) {
    this.localDescription = d;
    Promise.resolve().then(() => Promise.resolve()).then(() => { this.onicecandidate?.({ candidate: { candidate: `cand-${FakePc.all.indexOf(this)}`, sdpMid: '0' } }); this.onicecandidate?.({ candidate: null }); });
  }
  async setRemoteDescription(d) { this.remoteDescription = d; }
  async addIceCandidate(c) { this.candidates.push(c.candidate); }
  restartIce() { this.restarts++; queueMicrotask(() => this.onnegotiationneeded?.()); }
  async getStats() { return this.stats; }
  close() { this.closed = true; this.connectionState = 'closed'; }
  set(state) { this.connectionState = state; this.onconnectionstatechange?.(); }
}
class FakeChannel {
  constructor(label) { Object.assign(this, { label, readyState: 'connecting', sent: [] }); }
  send(s) { this.sent.push(s); this.far?.onmessage?.({ data: s }); }
  open() { this.readyState = 'open'; this.onopen?.(); }
  close() { this.readyState = 'closed'; this.onclose?.(); if (this.far?.readyState === 'open') this.far.close(); }
}

const PACK = { id: 'p', version: '1', sha: 'x' };
const envelope = (from) => (body, to) => ({ v: 2, id: '0123456789abcdef', from, ...(to && { to }), sid: 's1', pack: PACK, body });
let net;
let win;
let attached;
let detached;
let rtc;
let listeners;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  FakePc.all = [];
  net = createNetwork();
  attached = [];
  detached = [];
  listeners = { online: [], visibilitychange: [] };
  win = {
    RTCPeerConnection: FakePc,
    setTimeout: (...a) => setTimeout(...a),
    clearTimeout: (t) => clearTimeout(t),
    addEventListener: (type, fn) => listeners[type].push(fn),
    removeEventListener: (type, fn) => { listeners[type] = listeners[type].filter((f) => f !== fn); },
    document: { visibilityState: 'visible', addEventListener: (type, fn) => listeners[type].push(fn), removeEventListener: (type, fn) => { listeners[type] = listeners[type].filter((f) => f !== fn); } },
  };
  rtc = {};
});
afterEach(() => { for (const r of Object.values(rtc)) r.close(); vi.useRealTimers(); });

const member = (me, link, turn = []) => createRtcLinks({ me, link, envelope: envelope(me), turn, win, attach: (l) => { attached.push(l); return () => detached.push(l); } });
function setup({ turn = [] } = {}) {
  const relay = { a1: net.attach('a1'), b1: net.attach('b1') };
  for (const me of ['a1', 'b1']) rtc[me] = member(me, relay[me], turn);
  return relay;
}
// Lets every promise settle and every queued relay frame land, then does it again for what that caused. A long
// wait moves a second at a time so the relay keeps delivering, as it would.
async function tick(ms = 0) {
  do {
    await vi.advanceTimersByTimeAsync(Math.min(ms, 1000));
    for (let i = 0; i < 6; i++) { net.flush(); await vi.advanceTimersByTimeAsync(0); }
  } while ((ms -= 1000) > 0);
}
async function meet(relay) {
  relay.a1.send(envelope('a1')({ t: 'ping' }));
  relay.b1.send(envelope('b1')({ t: 'ping' }));
  await tick();
}
// The fake wire: hands the answerer its channel, then both sides connect and open.
async function connect([pcA, pcB] = FakePc.all.slice(-2)) {
  const chA = pcA.channels[0];
  const chB = new FakeChannel('ik');
  chA.far = chB;
  chB.far = chA;
  pcB.ondatachannel({ channel: chB });
  pcA.set('connected');
  pcB.set('connected');
  chA.open();
  chB.open();
  await tick();
  return [chA, chB];
}
const signals = () => net.sent.filter((s) => s.msg.body.t === 'rtc').map((s) => [s.from, s.msg.to, s.msg.body.data]);
const RELAY_PAIR = new Map([['T', { type: 'transport', selectedCandidatePairId: 'P' }], ['P', { type: 'candidate-pair', localCandidateId: 'L', remoteCandidateId: 'R' }], ['L', { type: 'local-candidate', candidateType: 'relay' }], ['R', { type: 'remote-candidate', candidateType: 'host' }]]);

test('the lower author id offers as soon as it hears the peer on the relay, with STUN plus the pack TURN servers, and trickles candidates as rtc bodies to the peer', async () => {
  const turn = [{ urls: 'turn:turn.example:3478', username: 'u', credential: 'p' }];
  const relay = setup({ turn });
  relay.a1.send(envelope('a1')({ t: 'ping' }));
  await tick();
  expect(FakePc.all.length).toBe(0);
  relay.b1.send(envelope('b1')({ t: 'ping' }));
  await tick();
  expect(FakePc.all.map((pc) => pc.config)).toEqual([
    { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }, ...turn] },
    { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }, ...turn] },
  ]);
  expect(signals()).toEqual([
    ['a1', 'b1', { gen: 1, type: 'offer', sdp: 'offer-0' }],
    ['a1', 'b1', { gen: 1, candidate: { candidate: 'cand-0', sdpMid: '0' } }],
    ['b1', 'a1', { gen: 1, type: 'answer', sdp: 'answer-1' }],
    ['b1', 'a1', { gen: 1, candidate: { candidate: 'cand-1', sdpMid: '0' } }],
  ]);
  const [pcA, pcB] = FakePc.all;
  expect([pcA.remoteDescription, pcB.remoteDescription, pcA.candidates, pcB.candidates, pcA.channels.map((c) => c.label)])
    .toEqual([{ type: 'answer', sdp: 'answer-1' }, { type: 'offer', sdp: 'offer-0' }, ['cand-1'], ['cand-0'], ['ik']]);
});

test('an open channel becomes a Link to that peer that carries envelopes as JSON, and reads as turn when the selected pair is relayed', async () => {
  const relay = setup();
  await meet(relay);
  FakePc.all[0].stats = RELAY_PAIR;
  const [chA] = await connect();
  expect(attached.map((l) => [l.kind, l.peer, l.state])).toEqual([['turn', 'b1', 'open'], ['direct', 'a1', 'open']]);
  const heard = [];
  attached[1].onMessage((m) => heard.push(m));
  attached[0].send(envelope('a1')({ t: 'ping' }));
  expect([chA.sent, heard]).toEqual([[JSON.stringify(envelope('a1')({ t: 'ping' }))], [envelope('a1')({ t: 'ping' })]]);
});

test('no channel within 15 s closes the attempt on both sides, and the offerer tries again at 1, 2, 4, 8 and then every 15 s', async () => {
  const relay = setup();
  await meet(relay);
  await tick(14_999);
  expect(FakePc.all.map((pc) => pc.closed)).toEqual([false, false]);
  await tick(1);
  expect(FakePc.all.map((pc) => pc.closed)).toEqual([true, true]);
  await tick(999);
  expect(FakePc.all.length).toBe(2);
  await tick(120_000);
  const offers = FakePc.all.filter((pc) => pc.channels.length);
  expect(offers.map((pc) => pc.at)).toEqual([0, 16_000, 33_000, 52_000, 75_000, 105_000, 135_000]);
  expect(signals().filter(([, , d]) => d.type === 'offer').map(([, , d]) => d.gen)).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test('coming back online or to a visible tab retries at once instead of waiting out the backoff', async () => {
  const relay = setup();
  await meet(relay);
  await tick(15_000);
  await tick(1_000);
  await tick(15_000);
  expect(FakePc.all.length).toBe(4);
  for (const fn of listeners.online) fn();
  await tick();
  expect(FakePc.all.length).toBe(6);
  await tick(15_000);
  for (const fn of listeners.visibilitychange) fn();
  await tick();
  expect([FakePc.all.length, FakePc.all.at(-1).at]).toEqual([8, 46_000]);
});

test('a channel that closes takes its Link with it, and the offerer re-signals after 1 s with a new gen that ignores the old one', async () => {
  const relay = setup();
  await meet(relay);
  const [chA] = await connect();
  chA.close();
  await tick();
  expect([attached.map((l) => l.state), detached.length, FakePc.all.map((pc) => pc.closed)]).toEqual([['closed', 'closed'], 2, [true, true]]);
  await tick(1_000);
  await tick();
  expect([FakePc.all.length, signals().at(-4)]).toEqual([4, ['a1', 'b1', { gen: 2, type: 'offer', sdp: 'offer-2' }]]);
  relay.b1.send(envelope('b1')({ t: 'rtc', data: { gen: 1, candidate: { candidate: 'old', sdpMid: '0' } } }, 'a1'));
  await tick();
  expect(FakePc.all[2].candidates).toEqual(['cand-3']);
});

test('a failed path under an open channel restarts ICE from the offerer, on its own or at the answerer\'s request, and re-signals when the restart does not connect', async () => {
  const relay = setup();
  await meet(relay);
  await connect();
  const [pcA, pcB] = FakePc.all;
  pcA.set('failed');
  await tick();
  expect([pcA.restarts, signals().slice(4), pcB.remoteDescription, FakePc.all.length]).toEqual([1, [
    ['a1', 'b1', { gen: 1, type: 'offer', sdp: 'offer-0' }],
    ['a1', 'b1', { gen: 1, candidate: { candidate: 'cand-0', sdpMid: '0' } }],
    ['b1', 'a1', { gen: 1, type: 'answer', sdp: 'answer-1' }],
    ['b1', 'a1', { gen: 1, candidate: { candidate: 'cand-1', sdpMid: '0' } }],
  ], { type: 'offer', sdp: 'offer-0' }, 2]);
  pcA.set('connected');
  pcB.set('failed');
  await tick();
  expect([signals().at(-5), pcA.restarts, attached.map((l) => l.state)]).toEqual([['b1', 'a1', { restart: true }], 2, ['open', 'open']]);
  await tick(15_000);
  expect([attached.map((l) => l.state), pcA.closed, pcB.closed]).toEqual([['closed', 'closed'], true, true]);
  await tick(1_000);
  expect([FakePc.all.length, signals().at(-2)[2].gen]).toEqual([4, 2]);
});

test('a bye ends the pair, a peer silent on the relay for 40 s is not offered to until it speaks, and close drops everything', async () => {
  const relay = setup();
  await meet(relay);
  relay.b1.send(envelope('b1')({ t: 'bye' }));
  await tick();
  expect([FakePc.all.map((pc) => pc.closed), FakePc.all.length]).toEqual([[true, false], 2]);
  rtc.b1.close();
  rtc.b1 = member('b1', relay.b1);
  relay.b1.send(envelope('b1')({ t: 'ping' }));
  await tick();
  expect([FakePc.all.map((pc) => pc.closed), FakePc.all.length]).toEqual([[true, true, false, false], 4]);
  rtc.b1.close();
  await tick(15_000);
  await tick(1_000);
  await tick(15_000);
  await tick(2_000);
  await tick(15_000);
  await tick(4_000);
  await tick(60_000);
  expect(FakePc.all.slice(4).map((pc) => [pc.at, pc.closed])).toEqual([[16_000, true], [33_000, true]]);
  relay.b1.send(envelope('b1')({ t: 'ping' }));
  await tick();
  expect(FakePc.all.slice(6).map((pc) => [pc.at, pc.closed])).toEqual([[112_000, false]]);
  rtc.a1.close();
  await tick(60_000);
  expect([FakePc.all.map((pc) => pc.closed), listeners.online.length, listeners.visibilitychange.length]).toEqual([[true, true, true, true, true, true, true], 0, 0]);
});

test('a send on a channel that is no longer open returns false and fails the pair, so the replica tries another link and the offerer re-signals', async () => {
  const relay = setup();
  await meet(relay);
  const [chA] = await connect();
  chA.readyState = 'closing';
  expect([attached[0].send(envelope('a1')({ t: 'ping' })), attached[0].state, detached.length]).toEqual([false, 'closed', 1]);
  await tick(1_000);
  await tick();
  expect([FakePc.all.length, signals().at(-4)[2].gen]).toEqual([4, 2]);
});

test('a send on a closed channel the pair has since replaced drops only that Link, and the new channel opens as the Link', async () => {
  const relay = setup();
  await meet(relay);
  const [, chB] = await connect();
  const pcB = FakePc.all[1];
  const chB2 = new FakeChannel('ik');
  pcB.ondatachannel({ channel: chB2 });
  chB.readyState = 'closed';
  const old = attached[1];
  expect([old.send(envelope('b1')({ t: 'ping' })), old.state, detached.includes(old), pcB.closed]).toEqual([false, 'closed', true, false]);
  chB2.open();
  await tick();
  const current = attached.at(-1);
  current.send(envelope('b1')({ t: 'ping' }));
  expect([attached.length, current.state, pcB.closed, chB2.sent.length]).toEqual([3, 'open', false, 1]);
});
