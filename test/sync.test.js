import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { decodeCode, encodeCode, peerMarks, peerMessage } from '../src/plugins/sync/core.js';

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
  expect(readFileSync('src/plugins/sync/sync.js', 'utf8').match(/\.send\(.*?\);/g)).toEqual(['.send(peerMessage(getState()));']);
});
