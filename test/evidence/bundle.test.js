import { expect, test } from 'vitest';
import { exportBundle, importBundle } from '../../src/evidence/bundle.js';

const H = (i) => `0194c0de${(0x1000 + i).toString(16).padStart(4, '0')}.0000`;
const stream = (...bodies) => bodies.map((body, n) => ({ n, h: H(n), ...body }));
const OPEN = { t: 'open', v: 2, sid: 'k3x9q2', author: 'a1', role: 'r', round: 'p', pack: { id: 'x', version: '1', sha: 'a' } };
const prv = stream({ t: 'mark', o: 'css-04#mid.1', d: 'a1b2c3d4', s: 'seen' }, { t: 'note', scope: 'css-04', text: 'Leans no.' }, { t: 'decide', choice: 'hire', why: 'ok' });
const undecided = { pub: stream(OPEN, { t: 'name', name: 'Jason' }), prv };
const decided = { pub: [...undecided.pub, { n: 2, h: H(2), t: 'decided' }], prv };

test('a bundle exported before my decision holds no private event', () => {
  expect(JSON.parse(exportBundle(undecided, 'a1'))).toEqual({ kit: 'interview-kit-evidence', v: 2, author: 'a1', pub: undecided.pub, prv: [] });
});

test('a bundle exported after my decision round-trips my whole log', () => {
  expect(importBundle(exportBundle(decided, 'a1'))).toEqual({ author: 'a1', pub: decided.pub, prv });
});

test('a file that is not an evidence bundle, or one with a damaged event or a gap, is refused', () => {
  const good = JSON.parse(exportBundle(decided, 'a1'));
  const gap = { ...good, prv: [prv[0], prv[2]] };
  const bad = { ...good, prv: [{ ...prv[0], s: 'prompted' }] };
  const crossed = { ...good, pub: [...good.pub, { n: 3, h: H(3), t: 'note', scope: 's', text: 'leaked' }] };
  expect(['not json', '{"kit":"other"}', JSON.stringify({ ...good, v: 3 }), JSON.stringify(gap), JSON.stringify(bad), JSON.stringify(crossed)]
    .map((text) => { try { importBundle(text); return 'accepted'; } catch (e) { return e.message; } }))
    .toEqual(['This is not an interview kit evidence file.', 'This is not an interview kit evidence file.', 'This is not an interview kit evidence file.', 'This evidence file is damaged.', 'This evidence file is damaged.', 'This evidence file is damaged.']);
});

test('one log exported under three time zones gives identical text', () => {
  const was = process.env.TZ;
  const texts = ['UTC', 'Europe/London', 'America/Los_Angeles'].map((tz) => { process.env.TZ = tz; return exportBundle(decided, 'a1'); });
  process.env.TZ = was;
  expect([texts[1] === texts[0], texts[2] === texts[0], texts[0].includes('"h":"0194c0de1000.0000"')]).toEqual([true, true, true]);
});
