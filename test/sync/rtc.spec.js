import { chromium } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { startBroker } from './broker.js';
import { buildKit } from './harness.js';
import { meet } from './kit.js';
import { startTurn } from './turn.js';

const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] };
let browser;
let broker;
let turn;
let url;
let turnUrl;
const pages = [];

beforeAll(async () => {
  [broker, turn] = await Promise.all([startBroker(), startTurn()]);
  const turnServer = { urls: turn.url, username: turn.username, credential: turn.credential };
  [url, turnUrl] = (await Promise.all([buildKit([broker.url]), buildKit([broker.url], [turnServer])])).map((k) => k.file);
  browser = await chromium.launch({ args: ['--mute-audio'] });
}, 90_000);
afterEach(async () => { for (const p of pages.splice(0)) await p.context().close(); });
afterAll(async () => { await browser?.close(); await broker?.close(); await turn?.close(); });

// Records every RTCPeerConnection the kit makes: when it was made, its config, its state changes, when its channel
// opened, when it closed, and every string sent down a channel. config overrides what the kit asked for.
const RTC_LOG = (opts) => `(() => {
  const OPTS = ${JSON.stringify(opts)};
  const t0 = performance.now();
  const now = () => Math.round(performance.now() - t0);
  const log = window.__rtc = { pcs: [], sent: [] };
  const Native = window.RTCPeerConnection;
  window.RTCPeerConnection = function (config) {
    const pc = new Native({ ...config, ...OPTS.config });
    const entry = { at: now(), config, states: [], opened: null, closed: null, pc };
    log.pcs.push(entry);
    pc.addEventListener('connectionstatechange', () => entry.states.push([now(), pc.connectionState]));
    const hook = (ch) => {
      ch.addEventListener('open', () => { entry.opened = now(); });
      const send = ch.send.bind(ch);
      ch.send = (d) => { log.sent.push(d); return send(d); };
    };
    const create = pc.createDataChannel.bind(pc);
    pc.createDataChannel = (...a) => { const ch = create(...a); hook(ch); return ch; };
    pc.addEventListener('datachannel', ({ channel }) => hook(channel));
    const close = pc.close.bind(pc);
    pc.close = () => { entry.closed ??= now(); close(); };
    return pc;
  };
  window.RTCPeerConnection.prototype = Native.prototype;
})();`;

const opened = (page, timeout = 15_000) => page.waitForFunction(() => window.__rtc.pcs.some((p) => p.opened !== null), null, { timeout });
const pcs = (page) => page.evaluate(() => window.__rtc.pcs.map(({ at, config, states, opened, closed }) => ({ at, config, states, opened, closed })));
// The candidate types at both ends of the pair the open connection settled on.
const path = (page) => page.evaluate(async () => {
  const entry = window.__rtc.pcs.findLast((p) => p.opened !== null);
  const stats = await entry.pc.getStats();
  const transport = [...stats.values()].find((s) => s.type === 'transport' && s.selectedCandidatePairId);
  const pair = stats.get(transport.selectedCandidatePairId);
  return [stats.get(pair.localCandidateId).candidateType, stats.get(pair.remoteCandidateId).candidateType];
});
const sentOverChannel = (page, id) => page.evaluate((i) => window.__rtc.sent.filter((d) => d.includes('"t":"events"') && d.includes(`"id":"${i}"`)).length, id);
const log = (page, event) => page.evaluate((e) => window.kit.view.log(e), event);
const planHas = (page, id) => page.waitForFunction((i) => window.kit.view.plan().passions.some((p) => p.id === i), id, { timeout: 15_000 });
const connected = async (browser, url, init) => { const [jason, alex] = await meet(browser, url, init); pages.push(jason, alex); return [jason, alex]; };
// What Jason's hover over Alex's name says about the path, once Alex is on a page the detail names.
async function pathLine(jason, alex, want) {
  await alex.getByRole('link', { name: "Review a teammate's PR" }).click();
  await jason.getByRole('button', { name: 'Alex' }).hover();
  await jason.waitForFunction((w) => document.querySelector('.sync-detail')?.textContent.endsWith(w), want, { timeout: 15_000 });
  return jason.locator('.sync-detail').textContent();
}

// On a home LAN the two laptops meet host to host. Under a VPN Chrome exposes only the tunnel, whose host and srflx
// addresses cannot reach themselves (measured on this Mac under NordLayer, as sync-root-cause.md predicts), so the
// pack TURN server is configured here too and the test prints the path the channel took.
test('two laptops on one machine go from the relay to a channel within 15 s, sync over it, and come back under 3 s after a forced close', async () => {
  const [jason, alex] = await connected(browser, turnUrl, RTC_LOG({}));
  await Promise.all([opened(jason), opened(alex)]);
  const [j, a] = await Promise.all([pcs(jason), pcs(alex)]);
  const paths = await Promise.all([path(jason), path(alex)]);
  console.log(`channel path: Jason ${paths[0].join('/')}, Alex ${paths[1].join('/')} (host/host on a LAN, relay/relay under a VPN)`);
  expect({ config: j[0].config, within15s: [j[0].opened - j[0].at < 15_000, a[0].opened - a[0].at < 15_000], detail: await pathLine(jason, alex, 'Direct connection.') })
    .toEqual({ config: { iceServers: [STUN, { urls: turn.url, username: 'kit', credential: 'secret' }] }, within15s: [true, true], detail: "Alex is on Review a teammate's PR. Direct connection." });

  await log(alex, { t: 'member', k: 'session.passions', id: 'css', v: 'CSS and layout' });
  await planHas(jason, 'css');
  expect(await sentOverChannel(alex, 'css')).toBe(1);

  const closedAt = await alex.evaluate(() => { window.__rtc.pcs[0].pc.close(); return performance.now(); });
  await Promise.all([
    jason.waitForFunction(() => window.__rtc.pcs.length > 1 && window.__rtc.pcs.at(-1).opened !== null, null, { timeout: 15_000 }),
    alex.waitForFunction(() => window.__rtc.pcs.length > 1 && window.__rtc.pcs.at(-1).opened !== null, null, { timeout: 15_000 }),
  ]);
  const reopenedAt = await alex.evaluate(() => performance.now());
  await log(jason, { t: 'member', k: 'session.passions', id: 'a11y', v: 'Accessibility' });
  await planHas(alex, 'a11y');
  expect({ reconnectUnder3s: reopenedAt - closedAt < 3000, overNewChannel: await sentOverChannel(jason, 'a11y') }).toEqual({ reconnectUnder3s: true, overNewChannel: 1 });
}, 60_000);

test('with no direct path the pair gives up at 15 s, tries again, and keeps syncing through the relay', async () => {
  const [jason, alex] = await connected(browser, url, RTC_LOG({ config: { iceTransportPolicy: 'relay' } }));
  await jason.waitForFunction(() => window.__rtc.pcs.length >= 2, null, { timeout: 25_000 });
  await log(alex, { t: 'member', k: 'session.passions', id: 'css', v: 'CSS and layout' });
  await planHas(jason, 'css');
  const [j, a] = await Promise.all([pcs(jason), pcs(alex)]);
  const first = (list) => ({ opened: list[0].opened, closedAt15s: list[0].closed - list[0].at >= 14_500 && list[0].closed - list[0].at <= 17_000, states: list[0].states.map(([, s]) => s) });
  expect({ jason: first(j), alex: first(a), retried: j.length >= 2, overChannel: await sentOverChannel(alex, 'css') })
    .toEqual({ jason: { opened: null, closedAt15s: true, states: [] }, alex: { opened: null, closedAt15s: true, states: [] }, retried: true, overChannel: 0 });
}, 60_000);

test('with only the pack TURN server allowed, the channel opens through it and the relay server carries the sync', async () => {
  const [jason, alex] = await connected(browser, turnUrl, RTC_LOG({ config: { iceTransportPolicy: 'relay' } }));
  await Promise.all([opened(jason), opened(alex)]);
  await log(alex, { t: 'member', k: 'session.passions', id: 'css', v: 'CSS and layout' });
  await planHas(jason, 'css');
  const [j] = await Promise.all([pcs(jason)]);
  expect({ config: j[0].config, paths: await Promise.all([path(jason), path(alex)]), allocated: turn.log.allocations >= 2, relayedBytes: turn.log.relayed > 0, overChannel: await sentOverChannel(alex, 'css'), detail: await pathLine(jason, alex, 'Through the relay server.') })
    .toEqual({ config: { iceServers: [STUN, { urls: turn.url, username: 'kit', credential: 'secret' }] }, paths: [['relay', 'relay'], ['relay', 'relay']], allocated: true, relayedBytes: true, overChannel: 1, detail: "Alex is on Review a teammate's PR. Through the relay server." });
}, 60_000);
