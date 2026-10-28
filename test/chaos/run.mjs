#!/usr/bin/env node
// The chaos harness: `npm run chaos -- [--runs 1000] [--seed 7] [--only 42] [--out report.json]`.
// Builds the kit with the faulty Link injected through the sync plugin's `links` seam, opens rooms of 3 to 5 real
// Chromium contexts on a local meeting point and a local relay server, plays seeded schedules of appends and faults
// against them, and after each heal checks that nothing was lost, that no private event or count crossed before both
// sides decided, that every member converged, that each status line read exactly as the design words it, and times
// first sync and each reconnect from the moment the path came back. A page's clock is a Playwright fake that runs at
// real pace and can jump, so the slow states (lost at 12 s, unreachable at 72 s) are reached in milliseconds.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startBroker } from '../sync/broker.js';
import { buildKit, serve } from '../sync/harness.js';
import { startTurn } from '../sync/turn.js';
import { schedules } from './schedule.js';
import { classify, NAME_STATE, words } from './words.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const RUNS = Number(arg('runs', 1000));
const SEED = Number(arg('seed', 7));
const ONLY = arg('only', null);
const TRACE = process.argv.includes('--trace');
const OUT = arg('out', join(tmpdir(), `ik-chaos-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`));
const TARGET = { firstSync: 2_000, reconnect: 3_000, direct: 15_000 };
const NAMES = ['Jason', 'Alex', 'Kim', 'Sam', 'Lee'];
const SEG = 'practical/deep-dive';
const PUB = [
  (i) => ({ t: 'put', k: 'session.candidate', v: `Sam ${i}` }),
  (i) => ({ t: 'put', k: 'segment.minutes', seg: SEG, v: i % 60 }),
  (i) => ({ t: 'member', k: 'session.passions', id: ['css', 'react', 'a11y'][i % 3], v: i % 2 ? 'CSS and layout' : null }),
  (i) => ({ t: 'member', k: 'segment.asked', seg: SEG, id: `css-0${i % 9}`, v: true }),
];
const PRV = [
  (i) => ({ t: 'mark', o: `css-04#mid.${i % 9}`, d: 'a1b2c3d4', s: i % 3 ? 'seen' : 'clear' }),
  (i) => ({ t: 'note', scope: `css-0${i % 9}`, text: 'Found it after one nudge. '.repeat(i % 300) }),
];

// In the page before the kit loads: the status lines in order, the name states, every peer connection, and a
// visibility switch for the away state.
const WATCH = () => {
  window.__lines = [];
  window.__states = [];
  window.__pcs = [];
  let vis = 'visible';
  Object.defineProperty(document, 'visibilityState', { get: () => vis, configurable: true });
  window.__setVisible = (v) => { vis = v ? 'visible' : 'hidden'; document.dispatchEvent(new Event('visibilitychange')); };
  const NativePc = window.RTCPeerConnection;
  window.RTCPeerConnection = function (config) {
    const pc = new NativePc(config);
    const entry = { pc, opened: false };
    window.__pcs.push(entry);
    const hook = (ch) => ch.addEventListener('open', () => { entry.opened = true; });
    const create = pc.createDataChannel.bind(pc);
    pc.createDataChannel = (...a) => { const ch = create(...a); hook(ch); return ch; };
    pc.addEventListener('datachannel', ({ channel }) => hook(channel));
    return pc;
  };
  window.RTCPeerConnection.prototype = NativePc.prototype;
  new MutationObserver(() => {
    const t = document.querySelector('.sync-status span')?.textContent ?? '';
    if (t && window.__lines.at(-1) !== t) window.__lines.push(t);
    for (const el of document.querySelectorAll('.sync-name-state')) { const s = el.textContent; if (!window.__states.includes(s)) window.__states.push(s); }
  }).observe(document, { subtree: true, childList: true, characterData: true });
};

// What a page holds, straight from IndexedDB, with its plan and status line.
const SNAPSHOT = async () => {
  const me = window.host.me();
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const db = await req(indexedDB.open(`interview-kit:${window.PACK.id}`));
  const os = db.transaction('events').objectStore('events');
  const range = IDBKeyRange.bound([me.sid], [me.sid, '￿']);
  const [keys, values] = await Promise.all([req(os.getAllKeys(range)), req(os.getAll(range))]);
  db.close();
  const held = {};
  keys.forEach(([, author, ch], i) => { const h = held[author] ??= { pub: 0, prv: 0, decided: false }; h[ch]++; if (values[i].t === 'decided') h.decided = true; });
  return { me: me.author, held, plan: JSON.stringify(window.kit.view.plan()), status: document.querySelector('.sync-status span')?.textContent ?? '' };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page, selector, want, timeout = 20_000) => page.waitForFunction(([s, t]) => document.querySelector(s)?.textContent.trim() === t, [selector, want], { timeout });
const stats = (xs) => {
  if (!xs.length) return { n: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { n: s.length, median: q(0.5), p95: q(0.95), max: s.at(-1) };
};

let browser;
let site;
let broker;
let turn;
const patterns = words(NAMES);
const report = { seed: SEED, runs: 0, rooms: 0, failures: [], slow: [], skipped: 0, firstSync: [], direct: [], reconnect: {}, states: {}, lines: 0, sightings: 0, prvHeld: 0, repairs: 0, maxBytes: 0, startedAt: new Date().toISOString() };
let current = null;
const measure = (kind, ms) => { (report.reconnect[kind] ??= []).push(ms); if (ms > TARGET.reconnect) report.slow.push({ index: current?.index, kind, ms, actions: current?.actions }); };

async function laptop(url) {
  const context = await browser.newContext({ timezoneId: 'America/Los_Angeles', locale: 'en-US', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.clock.install();
  await page.addInitScript(WATCH);
  await page.goto(url);
  await page.evaluate(() => window.ready);
  return page;
}

async function openRoom(n) {
  const jason = await laptop(site.url);
  await jason.locator('.start-name').fill('Jason');
  await jason.getByLabel('Who are you meeting?').fill('Sam Lee');
  await jason.getByRole('button', { name: 'Start interview' }).click();
  await jason.waitForSelector('.session-header');
  await jason.locator('.session-menu summary').click();
  await jason.getByRole('button', { name: 'Invite' }).click();
  const link = await jason.locator('.sync-dialog .sync-code').inputValue();
  await jason.locator('.sync-dialog').getByRole('button', { name: 'Close' }).click();
  const pages = [jason];
  for (const name of NAMES.slice(1, n)) {
    const page = await laptop(link);
    await page.keyboard.type(name);
    await page.keyboard.press('Enter');
    await text(jason, '.sync-knock span', `${name} wants to join.`);
    const t0 = Date.now();
    await jason.getByRole('button', { name: 'Let in' }).first().click();
    await page.waitForSelector('.session-header', { timeout: 20_000 });
    pages.push(page);
    await page.waitForFunction(() => /^Connected to /.test(document.querySelector('.sync-status span')?.textContent ?? ''), null, { timeout: 20_000 });
    await untilConverged(pages, 10_000, false);
    report.firstSync.push(Date.now() - t0);
    const opened = await page.waitForFunction(() => window.__pcs.some((p) => p.opened), null, { timeout: TARGET.direct + 1_000 }).then(() => Date.now() - t0, () => null);
    report.direct.push(opened);
  }
  const authors = await Promise.all(pages.map((p) => p.evaluate(() => window.host.me().author)));
  report.rooms++;
  return { pages, authors, members: n, decided: new Set(), cut: new Map(), faulty: false };
}

async function closeRoom(room) {
  // One member closes the kit on the way out, so the others name them with the time they left.
  const [leaver, ...rest] = room.pages;
  await leaver.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await Promise.all(rest.map((p) => p.waitForFunction(() => /left at/.test(document.querySelector('.sync-status span')?.textContent ?? ''), null, { timeout: 10_000 }).catch(() => null)));
  for (const p of rest) { const bad = await collectWords(p); if (bad.length) report.failures.push({ index: 'leave', bad }); }
  for (const p of room.pages) await p.context().close();
}

const snapshots = (pages) => Promise.all(pages.map((p) => p.evaluate(SNAPSHOT)));

// Every live page holds every author's whole public stream, the same plan, and a private stream only when both
// decided. Nudges the repair hello with a 10 s jump when a wait runs long, and counts those.
function whyNotConverged(snaps, room) {
  const own = Object.fromEntries(snaps.map((s) => [s.me, s.held[s.me] ?? { pub: 0, prv: 0, decided: false }]));
  for (const s of snaps) {
    if (s.plan !== snaps[0].plan) return `${s.me} has another plan`;
    for (const a of room.authors) {
      const h = s.held[a] ?? { pub: 0, prv: 0 };
      if (h.pub !== own[a].pub) return `${s.me} holds ${h.pub} of ${a}'s ${own[a].pub} public events`;
      const both = own[s.me].decided && own[a].decided;
      if (a !== s.me && h.prv !== (both ? own[a].prv : 0)) return `${s.me} holds ${h.prv} of ${a}'s ${own[a].prv} private events, both decided: ${both}`;
    }
  }
  return null;
}
async function untilConverged(pages, timeout, nudge = true, room = { authors: null }) {
  const t0 = Date.now();
  let nudges = 0;
  for (;;) {
    const snaps = await snapshots(pages);
    const authors = room.authors ?? snaps.map((s) => s.me);
    const why = whyNotConverged(snaps, { authors });
    if (!why) return { ms: Date.now() - t0, nudges, snaps };
    const waited = Date.now() - t0;
    if (waited > timeout) throw new Error(`not converged after ${waited} ms: ${why}`);
    if (nudge && waited > 3_000 * (nudges + 1) && nudges < 2) { nudges++; await jump(pages, 10_000); }
    await sleep(50);
  }
}
const jump = (pages, ms) => Promise.all(pages.map((p) => p.clock.runFor(ms)));
const setChaos = (page, fn, arg) => page.evaluate(fn, arg);

async function collectWords(page) {
  const [lines, states] = await page.evaluate(() => [window.__lines.splice(0), window.__states.splice(0)]);
  const bad = [];
  for (const l of lines) {
    const state = classify(l, patterns);
    report.lines++;
    if (state) report.states[state] = (report.states[state] ?? 0) + 1; else bad.push(`unknown status line: "${l}"`);
  }
  for (const s of states) if (!NAME_STATE.test(s)) bad.push(`unknown name state: "${s}"`);
  return bad;
}

async function checkBlindness(room) {
  const bad = [];
  for (const [i, page] of room.pages.entries()) {
    const me = room.authors[i];
    const sightings = await page.evaluate(() => window.__chaos.sightings.splice(0));
    report.sightings += sightings.length;
    for (const s of sightings) if (!s.decided.includes(me) || !s.decided.includes(s.author)) bad.push(`${me} was sent ${s.author}'s private ${s.kind === 'hello' ? 'count' : 'events'} by ${s.from} before both decided`);
  }
  return bad;
}

async function decide(room, who) {
  const page = room.pages[who];
  const author = room.authors[who];
  room.decided.add(author);
  await Promise.all(room.pages.map((p) => setChaos(p, (d) => { window.__chaos.decided = d; }, [...room.decided])));
  await page.getByRole('navigation', { name: 'Run of show' }).getByRole('link', { name: 'Decide' }).click();
  await page.getByRole('radio', { name: /^Hire/ }).check();
  await page.getByLabel('Level you would place them at').selectOption({ label: 'Mid' });
  await page.getByRole('textbox', { name: 'Reason' }).fill('Meets the bar.');
  await page.getByRole('button', { name: 'Record' }).click();
  await page.waitForSelector('.decide-recorded');
}

// Waits for the path to come back (a new channel open, or the meeting point accepting a socket) and for every
// page's socket to the meeting point to be up again, then times the catch-up from that moment.
async function timed(kind, room, restored) {
  let back = await restored();
  if (back == null) return;
  for (let i = 0; i < 400 && broker.clients() < room.pages.length; i++) { await sleep(25); back = Date.now(); }
  const { ms } = await untilConverged(room.pages, 20_000, false, room);
  measure(kind, Date.now() - back);
  return ms;
}

async function play(room, s) {
  current = s;
  const bad = [];
  await Promise.all(room.pages.map((p, i) => setChaos(p, ([seed, tracing]) => { window.__chaos.reseed(seed); window.__chaos.tracing = tracing; window.__chaos.trace = []; }, [s.seed ^ i, TRACE])));
  for (const act of s.actions) {
    const page = 'who' in act ? room.pages[act.who] : null;
    const author = 'who' in act ? room.authors[act.who] : null;
    if (act.op === 'pub' || act.op === 'prv') {
      const table = act.op === 'pub' ? PUB : PRV;
      const e = table[act.i % table.length](act.i);
      const ok = await page.evaluate((ev) => window.kit.view.log(ev), e);
      if (!ok) bad.push(`${author} could not log ${JSON.stringify(e).slice(0, 60)}`);
    } else if (act.op === 'faults') { await setChaos(page, (f) => { window.__chaos.faults = f; }, act.faults); room.faulty = true; }
    else if (act.op === 'cut') { await setChaos(page, () => { window.__chaos.down = true; }); room.cut.set(act.who, 'cut'); }
    else if (act.op === 'partition') {
      await Promise.all(room.pages.map((p, i) => setChaos(p, (far) => { window.__chaos.cutFrom = new Set(far); }, room.authors.filter((_, j) => ((act.mask >> i) & 1) !== ((act.mask >> j) & 1)))));
      for (const i of room.pages.keys()) if (!room.cut.has(i)) room.cut.set(i, 'partition');
    } else if (act.op === 'heal') {
      const kinds = new Set(room.cut.values());
      // What a random drop lost before the heal has no link to restore and is the 10 s hello's to repair, so a
      // reconnect is timed only when no page was dropping at random.
      const skip = room.faulty;
      room.cut.clear();
      room.faulty = false;
      const t0 = Date.now();
      await Promise.all(room.pages.map((p) => Promise.all([setChaos(p, () => window.__chaos.heal()), p.context().setOffline(false)])));
      // A silent partition has no link to restore either; the hello that repairs it is brought forward here.
      if (kinds.has('partition')) await jump(room.pages, 10_000);
      if (kinds.size && !skip) await timed(kinds.has('offline') ? 'offline' : kinds.has('cut') ? 'cut' : 'partition', room, async () => t0);
      else if (kinds.size) report.skipped++;
    } else if (act.op === 'jump') await jump(room.pages, act.ms);
    else if (act.op === 'direct-close') {
      const before = await page.evaluate(() => { const n = window.__pcs.length; for (const e of window.__pcs) e.pc.close(); return n; });
      if (!room.cut.size && !room.faulty) await timed('direct-close', room, () => page.waitForFunction((n) => window.__pcs.slice(n).some((e) => e.opened), before, { timeout: 20_000 }).then(() => Date.now(), () => null));
    } else if (act.op === 'relay-drop' || act.op === 'relay-refuse') {
      const n = broker.accepted.length;
      if (act.op === 'relay-drop') broker.drop(); else broker.refuse(act.ms);
      if (!room.cut.size && !room.faulty) await timed(act.op, room, async () => { for (let i = 0; i < 400 && broker.accepted.length === n; i++) await sleep(25); return broker.accepted.length > n ? broker.accepted[n] : null; });
    } else if (act.op === 'decide') { if (!room.decided.has(author)) await decide(room, act.who); }
    else if (act.op === 'away') await page.evaluate((v) => window.__setVisible(v), act.visible);
    else if (act.op === 'offline') { await page.context().setOffline(true); room.cut.set(act.who, 'offline'); }
    else if (act.op === 'retry') await page.locator('.sync-status [data-retry]').click({ timeout: 500 }).catch(() => null);
    else if (act.op === 'reload') {
      const t0 = Date.now();
      await page.reload();
      await page.evaluate(() => window.ready);
      await setChaos(page, (d) => { window.__chaos.decided = d; }, [...room.decided]);
      room.cut.delete(act.who);
      if (!room.cut.size && !room.faulty) await timed('reload', room, async () => t0);
    }
  }
  const { nudges, snaps } = await untilConverged(room.pages, 30_000, true, room);
  report.repairs += nudges;
  for (const sn of snaps) for (const [a, h] of Object.entries(sn.held)) if (a !== sn.me && h.prv) report.prvHeld++;
  bad.push(...await checkBlindness(room));
  for (const p of room.pages) bad.push(...await collectWords(p));
  const bytes = await Promise.all(room.pages.map((p) => p.evaluate(() => window.__chaos.stats.maxBytes)));
  if (TRACE) {
    const traces = await Promise.all(room.pages.map((p) => p.evaluate(() => window.__chaos.trace)));
    const file = join(tmpdir(), `ik-chaos-trace-${s.index}.txt`);
    writeFileSync(file, traces.map((t, i) => `== ${room.authors[i]} (${NAMES[i]})\n${t.map((r) => r.join(' ')).join('\n')}`).join('\n'));
    console.log(`trace: ${file}`);
  }
  report.maxBytes = Math.max(report.maxBytes, ...bytes);
  return bad;
}

async function main() {
  [broker, turn] = await Promise.all([startBroker(), startTurn()]);
  const kit = await buildKit([broker.url], [{ urls: turn.url, username: turn.username, credential: turn.credential }], { links: resolve('test/chaos/faulty-link.js') });
  site = await serve(kit.html);
  browser = await chromium.launch({ args: ['--mute-audio'] });
  const list = schedules({ seed: SEED, runs: RUNS }).filter((s) => ONLY == null || s.index === Number(ONLY));
  let room = null;
  const t0 = Date.now();
  for (const s of list) {
    if (!room || room.members !== s.members || room.decided.size === room.members) { if (room) await closeRoom(room); room = await openRoom(s.members); }
    let bad;
    try { bad = await play(room, s); } catch (e) { bad = [e.message]; }
    report.runs++;
    if (bad.length) { report.failures.push({ index: s.index, members: s.members, actions: s.actions, bad }); console.log(`#${s.index} FAILED: ${bad.join('; ')}`); }
    if (report.runs % 25 === 0 || bad.length) console.log(`${report.runs}/${list.length} schedules, ${report.rooms} rooms, ${report.failures.length} failed, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  if (room) await closeRoom(room);
  await browser.close();
  await Promise.all([broker.close(), turn.close()]);
  site.close();
  finish();
}

function finish() {
  const r = report;
  const summary = {
    schedules: r.runs, rooms: r.rooms, failed: r.failures.length, repairsNeeded: r.repairs, reconnectsNotTimedForRandomDrops: r.skipped,
    firstSync: { ...stats(r.firstSync), over2s: r.firstSync.filter((x) => x > TARGET.firstSync).length },
    directWithin15s: { n: r.direct.length, opened: r.direct.filter((x) => x != null).length, ...stats(r.direct.filter((x) => x != null)) },
    reconnect: Object.fromEntries(Object.entries(r.reconnect).map(([k, xs]) => [k, { ...stats(xs), over3s: xs.filter((x) => x > TARGET.reconnect).length }])),
    statusLines: r.lines, states: r.states, sightings: r.sightings, privateStreamsHeldAfterBothDecided: r.prvHeld, maxMessageBytes: r.maxBytes,
    seconds: Math.round((Date.now() - Date.parse(r.startedAt)) / 1000),
  };
  writeFileSync(OUT, JSON.stringify({ ...summary, failures: r.failures, slow: r.slow }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`report: ${OUT}`);
  const missed = [];
  if (summary.failed) missed.push(`${summary.failed} schedules failed`);
  if (summary.firstSync.over2s) missed.push(`${summary.firstSync.over2s} first syncs over 2 s`);
  for (const [k, v] of Object.entries(summary.reconnect)) if (v.over3s) missed.push(`${v.over3s} ${k} reconnects over 3 s`);
  if (missed.length) { console.log(`targets missed: ${missed.join('; ')}`); process.exit(1); }
  console.log('every target met');
}

main().catch((e) => { console.error(e); process.exit(2); });
