import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import fc from 'fast-check';
import { expect, test } from 'vitest';
import { checkPrv, checkPub } from '../../src/evidence/check.js';
import { checkWire } from '../../src/plugins/sync/wire-check.js';

const ajv = new Ajv2020({ strict: true })
  .addSchema(JSON.parse(readFileSync('src/evidence/event.schema.json', 'utf8')))
  .compile(JSON.parse(readFileSync('src/plugins/sync/wire.schema.json', 'utf8')));

// What runs on a laptop: the wire check on the envelope and body, then the host checks each event against its stream.
const accepts = (m) => checkWire(m) && (m.body.t !== 'events' || m.body.events.every(m.body.ch === 'prv' ? checkPrv : checkPub));

const PACK = { id: 'sample', version: '1.0.0', sha: 'e6854f1' };
const msg = (body, to) => ({ v: 2, id: '0123456789abcdef', from: 'a1', ...(to && { to }), sid: 'k3x9q2', pack: PACK, body });
const H = '0194c0de1234.0001';
const mark = { n: 0, h: H, t: 'mark', o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen' };
const name = { n: 1, h: H, t: 'name', name: 'Alex' };
const note = { n: 2, h: H, t: 'note', scope: 'css-04', text: 'leans no' };

const CASES = [
  [msg({ t: 'hello', role: 'frontend-engineer', round: 'practical', have: { a1: { pub: 4 }, a2: { pub: 3, prv: 2 } } }), true, 'hello'],
  [msg({ t: 'hello', role: 'frontend-engineer', round: 'practical', have: {} }, 'a2'), false, 'hello addressed to one member'],
  [msg({ t: 'hello', role: 'frontend-engineer', round: 'practical', have: { a2: { pub: 3, score: 4 } } }), false, 'a score in a vector'],
  [msg({ t: 'hello', role: 'frontend-engineer', round: 'practical', have: { a2: { pub: '3' } } }), false, 'a count as text'],
  [msg({ t: 'pull', author: 'a2', ch: 'pub', since: 3 }, 'a2'), true, 'pull'],
  [msg({ t: 'pull', author: 'a2', ch: 'pub', since: 3 }), false, 'pull with no recipient'],
  [msg({ t: 'events', author: 'a2', ch: 'pub', more: false, events: [name] }, 'a3'), true, 'public events'],
  [msg({ t: 'events', author: 'a2', ch: 'prv', more: true, events: [mark, note] }, 'a3'), true, 'private events'],
  [msg({ t: 'events', author: 'a2', ch: 'pub', more: false, events: [note] }, 'a3'), false, 'a note in a public reply'],
  [msg({ t: 'events', author: 'a2', ch: 'prv', more: false, events: [name] }, 'a3'), false, 'a name in a private reply'],
  [msg({ t: 'events', author: 'a2', ch: 'pub', more: false, events: [] }, 'a3'), true, 'an empty page'],
  [msg({ t: 'deny', author: 'a2', ch: 'prv', why: 'not-decided' }, 'a3'), true, 'deny'],
  [msg({ t: 'deny', author: 'a2', ch: 'pub', why: 'not-decided' }, 'a3'), false, 'public events are never denied'],
  [msg({ t: 'knock', name: 'Sam', key: 'BEqw_-x1' }), true, 'knock'],
  [msg({ t: 'admit', key: 'BEqw_-x1', wrapped: 'c2VhbGVk' }, 'a4'), true, 'admit'],
  [msg({ t: 'refuse' }, 'a4'), true, 'refuse'],
  [msg({ t: 'rekey', key: 'BEqw_-x1', wrapped: 'c2VhbGVk' }, 'a2'), true, 'rekey'],
  [msg({ t: 'where', route: '/q/css-04', following: null, visible: true }), true, 'where'],
  [msg({ t: 'where', route: '/q/css-04', following: 'a2', visible: 'yes' }), false, 'visible as text'],
  [msg({ t: 'ping' }), true, 'ping'],
  [msg({ t: 'bye' }), true, 'bye'],
  [msg({ t: 'unsupported' }, 'a2'), true, 'unsupported'],
  [msg({ t: 'rtc', data: { type: 'offer', sdp: 'v=0' } }, 'a2'), true, 'rtc'],
  [msg({ t: 'rtc', data: ['offer'] }, 'a2'), false, 'rtc with a list'],
  [msg({ t: 'score', value: 4 }), false, 'an unknown body'],
  [{ ...msg({ t: 'ping' }), v: 3 }, false, 'another wire version'],
  [{ ...msg({ t: 'ping' }), id: '0123456789abcde' }, false, 'a short message id'],
  [{ ...msg({ t: 'ping' }), extra: 1 }, false, 'an extra envelope key'],
  [{ ...msg({ t: 'ping' }), pack: { id: 'sample', version: '1.0.0' } }, false, 'a pack stamp with no sha'],
];

test('the hand-written wire check and Ajv agree on every planted case', () => {
  expect(CASES.map(([m, , why]) => [why, ajv(m), accepts(m)])).toEqual(CASES.map(([, want, why]) => [why, want, want]));
});

const VALID = CASES.filter(([, ok]) => ok).map(([m]) => m);
const paths = (v, p = []) => (v && typeof v === 'object' ? [p, ...Object.entries(v).flatMap(([k, x]) => paths(x, [...p, k]))] : [p]);
const mutate = (value, pick, op, junk) => {
  const v = structuredClone(value);
  const all = paths(v);
  const path = all[pick % all.length];
  const parent = path.slice(0, -1).reduce((a, k) => a[k], v);
  const key = path.at(-1);
  if (op === 0 && key !== undefined) delete parent[key];
  else if (op === 1) { const tgt = path.reduce((a, k) => a[k], v); if (tgt && typeof tgt === 'object') tgt.score = junk; }
  else if (op === 2 && key !== undefined) parent[key] = junk;
  return v;
};

test('the hand-written wire check and Ajv agree on 20,000 random mutations of valid messages', () => {
  let compared = 0;
  let valid = 0;
  fc.assert(fc.property(fc.nat(VALID.length - 1), fc.nat(), fc.nat(2), fc.jsonValue(), fc.boolean(), (i, pick, op, junk, raw) => {
    const m = raw ? VALID[i] : mutate(VALID[i], pick, op, junk);
    compared++;
    if (ajv(m)) valid++;
    return ajv(m) === accepts(m);
  }), { numRuns: 20_000, seed: 42 });
  expect([compared, valid > 5_000, valid < compared]).toEqual([20_000, true, true]);
}, 60_000);
