import { chromium } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeKeys, makePair, wrap } from '../../src/plugins/sync/admit.js';
import { createRelays, relayLink } from '../../src/plugins/sync/link-relay.js';
import { b64, unb64 } from '../../src/plugins/sync/seal.js';
import { startBroker } from './broker.js';
import { buildKit } from './harness.js';
import { fromMenu, knock, laptop, start, text } from './kit.js';

// Who gets into a room: what someone holding only the link can and cannot do, over the repo's local broker.
const PACK = { id: 'sample', version: '1.0.0', sha: 'e6854f1' };
const GRANT = { role: 'frontend-engineer', round: 'practical' };
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const open = [];
let browser;
let url;
let broker;

beforeAll(async () => {
  broker = await startBroker();
  url = (await buildKit([broker.url])).file;
  browser = await chromium.launch({ args: ['--mute-audio'] });
}, 60_000);

afterAll(async () => { for (const x of open.splice(0)) x.close(); await browser?.close(); await broker?.close(); }, 30_000);

const id = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
const envelope = (from, sid, body, to) => ({ v: 2, id: id(), from, ...(to && { to }), sid, pack: PACK, body });

// Someone holding the link, on the lobby from Node: they read every knock and can send anything a lobby message can carry.
async function linkHolder(code) {
  const [, sid, link] = /join=([a-z0-9]+)\.([A-Za-z0-9_-]{22})/.exec(code);
  const relays = createRelays([broker.url]);
  open.push(relays);
  const lobby = await relayLink(relays, unb64(link));
  const heard = [];
  lobby.onMessage((m) => heard.push(m));
  await new Promise((resolve) => (lobby.state === 'open' ? resolve() : lobby.onOpen(resolve)));
  return { sid, lobby, heard, send: (from, body, to) => lobby.send(envelope(from, sid, body, to)) };
}

test('a link holder who answers a knock with their own keys does not pull the joiner in; the inviter still can', async () => {
  const jason = await laptop(browser, url);
  await start(jason, 'Jason');
  const code = await fromMenu(jason, 'Invite');
  const mallory = await linkHolder(code);
  const [pair, signing] = await Promise.all([makePair(), crypto.subtle.generateKey(ECDSA, false, ['sign', 'verify'])]);
  const signer = b64(new Uint8Array(await crypto.subtle.exportKey('raw', signing.publicKey)));
  const proof = b64(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signing.privateKey, new TextEncoder().encode(`member:${mallory.sid}:${pair.pub}`))));
  let answered = 0;
  mallory.lobby.onMessage(async (m) => {
    if (m.body?.t !== 'knock') return;
    const wrapped = await wrap(pair.priv, m.body.key, mallory.sid, { ...makeKeys(), ...GRANT });
    mallory.send('a-mallory', { t: 'admit', key: pair.pub, wrapped }, m.from);
    mallory.send('a-mallory', { t: 'admit', key: pair.pub, wrapped, signer, proof }, m.from);
    answered++;
  });

  const alex = await laptop(browser, url);
  await knock(alex, code, 'Alex');
  await expect.poll(() => answered, { timeout: 15_000 }).toBeGreaterThan(0);
  await alex.waitForTimeout(2_000);
  expect(await alex.evaluate(() => [document.querySelectorAll('.session-header').length, document.querySelector('.sync-join-status')?.textContent ?? null]))
    .toEqual([0, 'Waiting for Jason to let you in…']);

  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.session-candidate', 'Sam Lee');
  await text(alex, '.sync-status', 'Connected to Jason');
}, 90_000);
