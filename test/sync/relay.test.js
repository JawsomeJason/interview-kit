import { afterEach, expect, test } from 'vitest';
import { connectPacket, createRelays, parsePackets, PREFIX, publishOf, publishPacket, RELAYS, relayLink, subscribePacket } from '../../src/plugins/sync/link-relay.js';
import { topicOf } from '../../src/plugins/sync/seal.js';
import { startBroker } from './broker.js';

const KEY = Uint8Array.from({ length: 16 }, (_, i) => i);
const utf8 = (bytes) => new TextDecoder().decode(bytes);
const until = (fn, ms = 3000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const look = () => { if (fn()) resolve(); else if (Date.now() - t0 > ms) reject(new Error('never happened')); else setTimeout(look, 10); };
  look();
});
const FAST = { schedule: [40, 40, 40] };
const open = [];
afterEach(async () => { for (const x of open.splice(0)) await x.close(); });

test('MQTT packets encode and parse, including a remaining length over one byte', () => {
  const payload = new Uint8Array(300).fill(7);
  const bytes = new Uint8Array([...connectPacket('ik-1'), ...subscribePacket(5, 'ik2/t'), ...publishPacket('ik2/t', payload)]);
  const packets = parsePackets(bytes);
  expect([packets.map((p) => p.type), packets[2].body.length, [...bytes.slice(connectPacket('ik-1').length + subscribePacket(5, 'ik2/t').length, -300 - 7)],
    publishOf(packets[2]).topic, publishOf(packets[2]).payload]).toEqual([[1, 8, 3], 307, [0x30, 0xb3, 0x02], 'ik2/t', payload]);
});

test('a message published to two brokers arrives once, and one broker is enough to stay open', async () => {
  const [b1, b2] = await Promise.all([startBroker(), startBroker()]);
  open.push(b1, b2);
  const a = createRelays([b1.url, b2.url], FAST);
  const b = createRelays([b1.url, b2.url], FAST);
  open.push(a, b);
  const states = [a.state];
  a.onState((s) => states.push(s));
  const got = [];
  b.subscribe('ik2/t', (payload) => got.push(utf8(payload)));
  a.subscribe('ik2/t', () => {});
  await until(() => a.ready('ik2/t') === 2 && b.ready('ik2/t') === 2);
  a.publish('ik2/t', new TextEncoder().encode('000000000000first'));
  await until(() => got.length === 1);
  await new Promise((r) => setTimeout(r, 100));
  expect([states, got, b1.log.length, b2.log.length]).toEqual([['opening', 'open'], ['000000000000first'], 1, 1]);
  await b1.close();
  await until(() => a.connected().length === 1 && b.connected().length === 1);
  a.publish('ik2/t', new TextEncoder().encode('111111111111second'));
  await until(() => got.length === 2);
  expect([a.state, got[1]]).toEqual(['open', '111111111111second']);
  b2.drop();
  await until(() => a.state === 'opening');
  // Subscribed again, not only connected: a message the broker gets before b's subscription is not b's to hear.
  await until(() => a.state === 'open' && b.ready('ik2/t') === 1, 2000);
  a.publish('ik2/t', new TextEncoder().encode('222222222222third'));
  await until(() => got.length === 3);
  expect(got[2]).toBe('222222222222third');
});

test('a relay link carries sealed envelopes only its key opens, and the broker sees no plaintext', async () => {
  const broker = await startBroker();
  open.push(broker);
  const relays = [createRelays([broker.url], FAST), createRelays([broker.url], FAST), createRelays([broker.url], FAST)];
  open.push(...relays);
  const [a, b, stranger] = await Promise.all([relayLink(relays[0], KEY), relayLink(relays[1], KEY), relayLink(relays[2], Uint8Array.from({ length: 16 }, () => 9))]);
  const heard = { b: [], stranger: [], opens: 0 };
  b.onMessage((m) => heard.b.push(m));
  stranger.onMessage((m) => heard.stranger.push(m));
  b.onOpen(() => heard.opens++);
  await until(() => a.state === 'open' && b.state === 'open');
  const msg = { v: 2, id: '0123456789abcdef', from: 'a-1', sid: 'k3x9q2', pack: { id: 'sample', version: '1.0.0', sha: 'e6854f1' }, body: { t: 'hello', role: 'r', round: 'p', have: {} } };
  await a.send(msg);
  await until(() => heard.b.length === 1);
  const [frame] = broker.log;
  expect([a.kind, a.topic, heard.b, heard.stranger, heard.opens, frame.topic, frame.payload.length, ['hello', 'k3x9q2', 'a-1', 'sample'].filter((s) => utf8(frame.payload).includes(s))])
    .toEqual(['relay', `${PREFIX}${await topicOf(KEY)}`, [msg], [], 1, `${PREFIX}${await topicOf(KEY)}`, 12 + JSON.stringify(msg).length + 16, []]);
});

test('the default relay list has a relay on port 443', () => {
  expect(RELAYS.map((url) => new URL(url).port || '443')).toContain('443');
});
