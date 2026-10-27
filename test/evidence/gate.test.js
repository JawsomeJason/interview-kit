import { expect, test } from 'vitest';
import { assertUnlocked, mayServePrivate, PAGE_BYTES, serve, unlock, vector } from '../../src/evidence/gate.js';

const H = (i) => `0194c0de${(0x1000 + i).toString(16).padStart(4, '0')}.0000`;
const open = (author) => ({ n: 0, h: H(0), t: 'open', v: 2, sid: 's', author, role: 'r', round: 'p', pack: { id: 'x', version: '1', sha: 'a' } });
const log = (author, decided, prv = []) => ({
  pub: [open(author), { n: 1, h: H(1), t: 'name', name: author.toUpperCase() }, ...(decided ? [{ n: 2, h: H(2), t: 'decided' }] : [])],
  prv: prv.map((body, n) => ({ n, h: H(n), ...body })),
});
const MARK = { t: 'mark', o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen' };
const held = (me, au, rq) => ({ me: log('me', me), au: log('au', au, [MARK]), rq: log('rq', rq) });
const PULL = { author: 'au', ch: 'prv', since: 0 };

test('private events and private counts cross only when I, the author and the requester have all decided', () => {
  const rows = [];
  for (const me of [false, true]) for (const au of [false, true]) for (const rq of [false, true]) {
    const h = held(me, au, rq);
    const reply = serve(h, 'me', PULL, 'rq');
    rows.push([me, au, rq, mayServePrivate(h, 'me', 'au', 'rq'), 'deny' in reply ? reply.deny : reply.events.length, 'prv' in vector(h, 'me', 'rq').au]);
  }
  expect(rows).toEqual([
    [false, false, false, false, 'not-decided', false],
    [false, false, true, false, 'not-decided', false],
    [false, true, false, false, 'not-decided', false],
    [false, true, true, false, 'not-decided', false],
    [true, false, false, false, 'peer-not-decided', false],
    [true, false, true, false, 'peer-not-decided', false],
    [true, true, false, false, 'peer-not-decided', false],
    [true, true, true, true, 1, true],
  ]);
});

test('public events are served to anyone, and the vector always carries public counts', () => {
  const h = held(false, false, false);
  expect([serve(h, 'me', { author: 'au', ch: 'pub', since: 1 }, 'rq'), vector(h, 'me', 'rq')]).toEqual([
    { events: [h.au.pub[1]], more: false },
    { me: { pub: 2 }, au: { pub: 2 }, rq: { pub: 2 } },
  ]);
});

test('a page holds whole events up to the byte budget, at least one, and says when more remain', () => {
  const worst = '\u0001'.repeat(8000);
  const notes = Array.from({ length: 3 }, (_, i) => ({ t: 'note', scope: `item-${i}`, text: worst }));
  const marks = Array.from({ length: 100 }, (_, i) => ({ t: 'mark', o: `css-04#mid.${i % 9}`, d: 'a1b2c3d4', s: 'seen' }));
  const h = { me: log('me', true), au: log('au', true, [...notes, ...marks]), rq: log('rq', true) };
  const bytes = (v) => new TextEncoder().encode(JSON.stringify(v)).length;
  const pages = [];
  for (let since = 0, more = true; more; ) {
    const reply = serve(h, 'me', { ...PULL, since }, 'rq');
    pages.push(reply);
    since += reply.events.length;
    more = reply.more;
  }
  const full = (i) => i === pages.length - 1 || bytes([...pages[i].events, pages[i + 1].events[0]]) > PAGE_BYTES;
  expect(pages.map((p, i) => [p.events[0].t, p.more, bytes(p.events) <= PAGE_BYTES, full(i)]))
    .toEqual([['note', true, true, true], ['note', true, true, true], ['note', true, true, true], ['mark', false, true, true]]);
  expect(pages.flatMap((p) => p.events).map((e) => e.n)).toEqual(Array.from({ length: 103 }, (_, i) => i));
  expect(serve(h, 'me', { ...PULL, since: 0 }, 'rq', 10_000).events.length).toBe(1);
});

test('unlock is null before my decision and opens every decided colleague after it', () => {
  expect(unlock(held(false, true, true), 'me')).toBeNull();
  const u = unlock(held(true, true, false), 'me');
  expect([u.me, u.participants.map((p) => [p.author, p.name, [...p.evidence.marks.keys()]]), assertUnlocked(u) === u])
    .toEqual(['me', [['me', 'ME', []], ['au', 'AU', ['css-04#mid.1']]], true]);
});

test('a hand-built or copied Unlocked is refused', () => {
  const u = unlock(held(true, true, true), 'me');
  expect(() => assertUnlocked({ me: 'me', participants: [] })).toThrow(TypeError);
  expect(() => assertUnlocked({ ...u })).toThrow(TypeError);
  expect(Object.isFrozen(u)).toBe(true);
});
