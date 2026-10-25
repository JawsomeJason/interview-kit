import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { expect, test } from 'vitest';
import { lookFor } from '../src/components/look-for.js';
import { decodeCode, encodeCode, peerMarks, peerMessage } from '../src/sync/core.js';

test('pairing codes round-trip and a wrong paste is rejected', () => {
  const offer = { type: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\na=ice-ufrag:+/x\r\n' };
  const code = encodeCode(offer);
  expect([code.startsWith('IK1.'), /^[\w.-]+$/.test(code), decodeCode(code)]).toEqual([true, true, offer]);
  expect(() => decodeCode('hello there')).toThrow("That isn't an interview-kit code");
});

test('peerMarks returns only items the peer ticked and I did not', () => {
  const mine = { q1: [0] };
  const peer = { q1: [0, 2], q2: [1] };
  expect([peerMarks(mine, peer, 'q1'), peerMarks(mine, peer, 'q2'), peerMarks(mine, peer, 'q3')]).toEqual([[2], [1], []]);
});

test('only ticks go to the peer: never notes, done or the candidate', () => {
  const state = { round: 'r1', candidate: 'Sam', ticks: { q1: [0, 2] }, notes: { q1: 'private' }, done: ['q1'] };
  expect([peerMessage(state), peerMessage({})]).toEqual(['{"ticks":{"q1":[0,2]}}', '{"ticks":{}}']);
  // And sync.js sends nothing else.
  expect(readFileSync('src/sync/sync.js', 'utf8').match(/\.send\(.*?\);/g)).toEqual(['.send(peerMessage(getState()));']);
});

test('look-for renders the shadow marker on the marked items only', () => {
  const q = { id: 'q1', lookFor: ['A', 'B', 'C'] };
  const labels = (html) => html.match(/<label class="option-row look-for-item">[\s\S]*?<\/label>/g).map((l) => l.includes('class="look-for-mark"'));
  expect([labels(lookFor(q, [0], [2])), labels(lookFor(q, [0]))]).toEqual([[false, false, true], [false, false, false]]);
});

test('a normal build ships no sync code; a sync build does', async () => {
  const bundle = async (flag) => {
    const outDir = mkdtempSync(join(tmpdir(), 'ik-build-'));
    process.env.VITE_SYNC = flag;
    // Build as `npm run build` does; under vitest NODE_ENV is test, which would make import.meta.env.DEV true.
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } });
    delete process.env.VITE_SYNC;
    process.env.NODE_ENV = nodeEnv;
    const html = readFileSync(join(outDir, 'index.html'), 'utf8');
    return ['RTCPeerConnection', 'shadow-sync', '__review'].map((s) => html.includes(s));
  };
  // The dev-only review feedback form never reaches a build.
  expect([await bundle(''), await bundle('1')]).toEqual([[false, false, false], [true, true, false]]);
}, 30_000);
