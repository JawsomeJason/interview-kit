import { expect, test } from 'vitest';
import { b64, importKey, open, randomBytes, seal, topicOf, unb64 } from '../../src/plugins/sync/seal.js';

const KEY = Uint8Array.from({ length: 16 }, (_, i) => i);
const utf8 = (bytes) => new TextDecoder().decode(bytes);

test('a topic is 32 hex characters of the key, and two keys never share one', async () => {
  const topic = await topicOf(KEY);
  expect([topic, /^[0-9a-f]{32}$/.test(topic), topic === await topicOf(randomBytes(16))]).toEqual(['be45cb2605bf36bebde684841a28f0fd', true, false]);
});

test('a sealed frame opens with its key and topic, and reads as nothing without them', async () => {
  const key = await importKey(KEY);
  const topic = await topicOf(KEY);
  const msg = { v: 2, id: '0123456789abcdef', from: 'a-1', sid: 'k3x9q2', body: { t: 'hello' } };
  const frame = await seal(key, topic, msg);
  const again = await seal(key, topic, msg);
  const tampered = Uint8Array.from(frame);
  tampered[20] ^= 1;
  expect([await open(key, topic, frame), frame.length, b64(frame.slice(0, 12)) === b64(again.slice(0, 12)),
    await open(key, 'another-topic', frame), await open(await importKey(randomBytes(16)), topic, frame), await open(key, topic, tampered),
    utf8(frame).includes('hello'), utf8(frame).includes('k3x9q2')])
    .toEqual([msg, 12 + JSON.stringify(msg).length + 16, false, null, null, null, false, false]);
});

test('base64url round-trips bytes without padding or url characters', () => {
  const bytes = Uint8Array.from([0, 251, 255, 62, 63, 1]);
  expect([b64(bytes), unb64(b64(bytes))]).toEqual(['APv_Pj8B', bytes]);
});
