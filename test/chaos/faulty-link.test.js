import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { chaosLinks, chaosState } from './faulty-link.js';
import { createNetwork } from '../sync/link-memory.js';

const PACK = { id: 'p', version: '1', sha: 'x' };
const env = (from, body, to) => ({ v: 2, id: '0123456789abcdef', from, ...(to && { to }), sid: 's1', pack: PACK, body });
let net;
let state;
let wrap;
let heard;

beforeEach(() => {
  vi.useFakeTimers();
  net = createNetwork();
  state = chaosState(1);
  wrap = chaosLinks(state, { setTimeout: (...a) => setTimeout(...a) });
  heard = [];
});
afterEach(() => vi.useRealTimers());

// a1 wraps its end; b1 and c1 are plain. Returns a1's wrapped link.
function room() {
  const a = wrap(net.attach('a1'));
  net.attach('b1');
  net.attach('c1');
  a.onMessage((m) => heard.push(m));
  return a;
}
const from = (author, body = { t: 'ping' }) => { net.attach(author).send(env(author, body)); net.flush(); };

test('a wrapped link keeps its shape and passes messages both ways when nothing is wrong', () => {
  const a = room();
  expect([a.kind, a.state, typeof a.send, typeof a.onOpen, typeof a.close, typeof a.prepare]).toEqual(['memory', 'open', 'function', 'function', 'function', 'undefined']);
  a.send(env('a1', { t: 'ping' }));
  expect(net.sent.map((s) => s.from)).toEqual(['a1']);
  from('b1');
  expect(heard.map((m) => m.from)).toEqual(['b1']);
});

test('down closes the link both ways, reads as closed, and heal reopens it and fires onOpen', () => {
  const a = room();
  const opened = [];
  a.onOpen(() => opened.push(a.state));
  state.down = true;
  expect(a.state).toBe('closed');
  a.send(env('a1', { t: 'ping' }));
  from('b1');
  expect([net.sent.filter((s) => s.from === 'a1').length, heard.length]).toEqual([0, 0]);
  state.heal();
  expect([a.state, opened]).toEqual(['open', ['open']]);
  from('b1');
  expect(heard.length).toBe(1);
});

test('a partition drops what comes from the far side only', () => {
  room();
  state.cutFrom = new Set(['b1']);
  from('b1');
  from('c1');
  expect(heard.map((m) => m.from)).toEqual(['c1']);
  state.heal();
  from('b1');
  expect(heard.map((m) => m.from)).toEqual(['c1', 'b1']);
});

test('drops, duplicates and delays follow the seed, and a delayed message lands once the clock moves', () => {
  room();
  state.faults = { drop: 0.5, dup: 0, reorder: 0, delay: 0 };
  for (let i = 0; i < 40; i++) from('b1');
  const kept = heard.length;
  expect(kept > 8 && kept < 32).toBe(true);
  const again = chaosState(1);
  const b = chaosLinks(again, { setTimeout: (...x) => setTimeout(...x) })(net.attach('a2'));
  const heard2 = [];
  b.onMessage((m) => heard2.push(m));
  again.faults = { drop: 0.5, dup: 0, reorder: 0, delay: 0 };
  for (let i = 0; i < 40; i++) from('b1');
  expect(heard2.length).toBe(kept);
  state.faults = { drop: 0, dup: 1, reorder: 0, delay: 0 };
  heard.length = 0;
  from('b1');
  expect(heard.length).toBe(2);
  state.faults = { drop: 0, dup: 0, reorder: 0, delay: 1 };
  heard.length = 0;
  from('b1');
  expect(heard.length).toBe(0);
  vi.advanceTimersByTime(500);
  expect(heard.length).toBe(1);
  expect(state.stats.held).toBe(0);
});

test('every private page and every hello that names a private count is recorded with who had decided by then', () => {
  room();
  state.decided = ['a1'];
  from('b1', { t: 'hello', role: 'r', round: 'q', have: { b1: { pub: 2, prv: 1 }, c1: { pub: 1 } } });
  state.decided = ['a1', 'b1'];
  net.attach('b1').send(env('b1', { t: 'events', author: 'b1', ch: 'prv', more: false, events: [{ n: 0, h: '1', t: 'note', scope: 'x', text: 'hi' }] }, 'a1'));
  net.flush();
  from('b1', { t: 'events', author: 'b1', ch: 'pub', more: false, events: [{ n: 2, h: '1', t: 'decided' }] });
  expect(state.sightings).toEqual([
    { kind: 'hello', from: 'b1', author: 'b1', decided: ['a1'] },
    { kind: 'events', from: 'b1', to: 'a1', author: 'b1', decided: ['a1', 'b1'] },
  ]);
  expect(state.stats.frames).toBe(3);
  expect(state.stats.maxBytes).toBeGreaterThan(100);
});
