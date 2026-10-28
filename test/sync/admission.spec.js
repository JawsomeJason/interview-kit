import { chromium } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { makeKeys, makePair, unwrap, wrap } from '../../src/plugins/sync/admit.js';
import { createRelays, relayLink } from '../../src/plugins/sync/link-relay.js';
import { b64, unb64 } from '../../src/plugins/sync/seal.js';
import { startBroker } from './broker.js';
import { buildKit } from './harness.js';
import { fromMenu, knock, laptop, meet, start, text } from './kit.js';

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

const knockRows = (page) => page.locator('.sync-knock').evaluateAll((els) => els.map((p) => [p.querySelector('span').textContent, p.querySelector('.sync-knock-code')?.textContent ?? null]));
const codeOn = async (page) => /code ([0-9A-F]{4} [0-9A-F]{4})/.exec(await page.locator('.sync-join-check').innerText({ timeout: 15_000 }))?.[1];

test('two knocks under one name both show with the code each knocker sees, a waiting knock cannot change its key, and knocks are capped', async () => {
  const jason = await laptop(browser, url);
  await start(jason, 'Jason');
  const code = await fromMenu(jason, 'Invite');
  const alex = await laptop(browser, url);
  await knock(alex, code, 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  const impostor = await laptop(browser, url);
  await knock(impostor, code, 'Alex');
  await jason.waitForFunction(() => document.querySelectorAll('.sync-knock').length === 2, null, { timeout: 15_000 });
  const [alexCode, impostorCode] = [await codeOn(alex), await codeOn(impostor)];
  expect([await alex.locator('.sync-join-check').innerText(), alexCode === impostorCode])
    .toEqual([`Jason sees the code ${alexCode} beside your name. Read it out if two of you share a name.`, false]);
  expect((await knockRows(jason)).sort()).toEqual([['Alex wants to join.', `code ${alexCode}`], ['Alex wants to join.', `code ${impostorCode}`]].sort());

  // Someone with the link knocks again as the waiting Alex, with a key of their own: the row keeps Alex's key and code.
  const mallory = await linkHolder(code);
  const alexAuthor = await jason.locator('.sync-knock').filter({ hasText: alexCode }).getByRole('button', { name: 'Let in' }).getAttribute('data-let-in');
  mallory.send(alexAuthor, { t: 'knock', name: 'Alex', key: (await makePair()).pub });
  await jason.waitForTimeout(2_500);
  expect((await knockRows(jason)).filter(([, c]) => c === `code ${alexCode}`).length).toBe(1);

  for (let i = 0; i < 12; i++) mallory.send(`a-flood${i}`, { t: 'knock', name: `Flood ${i}`, key: (await makePair()).pub });
  await jason.waitForTimeout(2_500);
  expect((await knockRows(jason)).length).toBe(8);

  await jason.locator('.sync-knock').filter({ hasText: alexCode }).getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');
  expect(await impostor.locator('.sync-join-status').innerText()).toBe('Waiting for Jason to let you in…');
}, 90_000);

async function relink(jason, keep) {
  await jason.locator('.session-menu summary').click();
  await jason.getByRole('button', { name: 'Change the link' }).click();
  const dialog = jason.locator('.sync-dialog');
  const roster = await dialog.getByRole('checkbox').evaluateAll((els) => els.map((i) => i.labels[0].textContent.trim().replace(/ \(left at .*\)$/, '')));
  for (const name of roster) await dialog.getByRole('checkbox', { name }).setChecked(keep.includes(name));
  await dialog.getByRole('button', { name: 'Change the link' }).click();
  const code = await dialog.locator('.sync-code').inputValue();
  await dialog.getByRole('button', { name: 'Close' }).click();
  return { roster, code };
}
const newInterview = async (page) => {
  await page.locator('.session-menu summary').click();
  await page.getByRole('button', { name: 'New interview' }).click();
  await page.waitForSelector('.start');
};
const passion = (page, id, v) => page.evaluate((e) => window.kit.view.log(e), { t: 'member', k: 'session.passions', id, v });
const hasPassion = (page, id) => page.waitForFunction((x) => window.kit.view.plan().passions.some((p) => p.id === x), id, { timeout: 15_000 });

test('a colleague left out of Change the link knocks again with the new link and comes back into the same interview', async () => {
  const jason = await laptop(browser, url);
  await start(jason, 'Jason');
  const alex = await laptop(browser, url);
  await knock(alex, await fromMenu(jason, 'Invite'), 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');
  const sid = await alex.evaluate(() => window.host.me().sid);

  const { code } = await relink(jason, []);
  await newInterview(alex);
  await knock(alex, code, 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');
  await passion(jason, 'a11y', 'Accessibility');
  await hasPassion(alex, 'a11y');
  expect([await alex.evaluate(() => window.host.me().sid), await alex.locator('.session-candidate').innerText()]).toEqual([sid, 'Sam Lee']);
}, 90_000);

test('a colleague kept in Change the link who was away comes back from the new link without a new Let in', async () => {
  const jason = await laptop(browser, url);
  await start(jason, 'Jason');
  const alex = await laptop(browser, url);
  await knock(alex, await fromMenu(jason, 'Invite'), 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');
  const context = alex.context();
  await alex.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await alex.close();

  const { code } = await relink(jason, ['Alex']);
  const back = await context.newPage();
  await back.goto(`${url}#${code}`);
  await back.evaluate(() => window.ready);
  await back.locator('.start-name').fill('Alex');
  await back.getByRole('button', { name: 'Join' }).click();
  await text(back, '.sync-status', 'Connected to Jason');
  expect(await jason.locator('.sync-knock').count()).toBe(0);
}, 90_000);

test('a colleague another member let in reaches the inviter\'s roster, so Change the link moves them too', async () => {
  const jason = await laptop(browser, url);
  await start(jason, 'Jason');
  const code = await fromMenu(jason, 'Invite');
  const alex = await laptop(browser, url);
  await knock(alex, code, 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');

  const kim = await laptop(browser, url);
  await knock(kim, code, 'Kim');
  await text(alex, '.sync-knock span', 'Kim wants to join.');
  await alex.getByRole('button', { name: 'Let in' }).click();
  await kim.waitForFunction(() => /^Connected to (Alex and Jason|Jason and Alex)$/.test(document.querySelector('.sync-status')?.textContent), null, { timeout: 20_000 })
    .catch(async (e) => { throw new Error(`Kim reads "${await kim.locator('.sync-status').textContent()}"`, { cause: e }); });

  await expect.poll(async () => {
    await jason.locator('.session-menu summary').click();
    await jason.getByRole('button', { name: 'Change the link' }).click();
    const roster = await jason.locator('.sync-dialog').getByRole('checkbox').evaluateAll((els) => els.map((i) => i.labels[0].textContent.trim()));
    await jason.locator('.sync-dialog').getByRole('button', { name: 'Cancel' }).click();
    return roster;
  }, { timeout: 20_000, interval: 2_000 }).toEqual(['Alex', 'Kim']);
  await relink(jason, ['Alex', 'Kim']);
  await passion(jason, 'a11y', 'Accessibility');
  await hasPassion(kim, 'a11y');
  await hasPassion(alex, 'a11y');
}, 120_000);

const roster = async (jason) => {
  await jason.locator('.session-menu summary').click();
  await jason.getByRole('button', { name: 'Change the link' }).click();
  const names = await jason.locator('.sync-dialog').getByRole('checkbox').evaluateAll((els) => els.map((i) => i.labels[0].textContent.trim()));
  await jason.locator('.sync-dialog').getByRole('button', { name: 'Cancel' }).click();
  return names;
};

test('a colleague left out of Change the link cannot come back through another member: they knock, every member sees it, and only Let in brings them back', async () => {
  const jason = await laptop(browser, url);
  await start(jason, 'Jason');
  const code = await fromMenu(jason, 'Invite');
  const alex = await laptop(browser, url);
  await knock(alex, code, 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');
  const kim = await laptop(browser, url);
  await knock(kim, code, 'Kim');
  await text(alex, '.sync-knock span', 'Kim wants to join.');
  await alex.getByRole('button', { name: 'Let in' }).click();
  await kim.waitForFunction(() => /^Connected to/.test(document.querySelector('.sync-status')?.textContent), null, { timeout: 20_000 });
  const sid = await kim.evaluate(() => window.host.me().sid);
  await expect.poll(() => roster(jason), { timeout: 20_000, interval: 2_000 }).toEqual(['Alex', 'Kim']);

  const { code: fresh } = await relink(jason, ['Alex']);
  await newInterview(kim);
  await knock(kim, fresh, 'Kim');
  await text(jason, '.sync-knock span', 'Kim wants to join.');
  await text(alex, '.sync-knock span', 'Kim wants to join.');
  await text(kim, '.sync-join-status', 'Waiting for Jason to let you in…');
  expect(await roster(jason)).toEqual(['Alex']);

  await jason.getByRole('button', { name: 'Let in' }).click();
  await kim.waitForFunction(() => /^Connected to/.test(document.querySelector('.sync-status')?.textContent), null, { timeout: 20_000 });
  expect([await kim.evaluate(() => window.host.me().sid), await kim.locator('.session-candidate').innerText(), await roster(jason)]).toEqual([sid, 'Sam Lee', ['Alex', 'Kim']]);
}, 150_000);

test('a colleague who deleted the interview from their laptop knocks again from the same invite and is let back in', async () => {
  const jason = await laptop(browser, url);
  await start(jason, 'Jason');
  const code = await fromMenu(jason, 'Invite');
  const alex = await laptop(browser, url);
  await knock(alex, code, 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');
  await newInterview(alex);
  await alex.getByRole('button', { name: 'Delete from this laptop' }).first().click();
  await alex.getByRole('button', { name: 'Delete', exact: true }).click();
  await alex.waitForFunction(() => !document.querySelector('.session-list-item'));

  await knock(alex, code, 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await text(alex, '.sync-join-status', 'Waiting for Jason to let you in…');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');
  await text(alex, '.session-candidate', 'Sam Lee');
}, 90_000);

test('a member cannot replay an old Change the link to move a colleague back onto the old keys', async () => {
  const jason = await laptop(browser, url);
  await start(jason, 'Jason');
  const code = await fromMenu(jason, 'Invite');
  const alex = await laptop(browser, url);
  await knock(alex, code, 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');

  // Mal is a member too, from Node: let in like anyone, then reading the room as any member can.
  const lobby = await linkHolder(code);
  const pair = await makePair();
  const mal = `a-${id().slice(0, 8)}`;
  const admitted = new Promise((resolve) => lobby.lobby.onMessage(async (m) => {
    if (m.to === mal && m.body.t === 'admit') resolve({ jason: m.from, grant: await unwrap(pair.priv, m.body.key, lobby.sid, m.body.wrapped) });
  }));
  const knocking = setInterval(() => lobby.send(mal, { t: 'knock', name: 'Mal', key: pair.pub }), 2_500);
  lobby.send(mal, { t: 'knock', name: 'Mal', key: pair.pub });
  await jason.locator('.sync-knock').filter({ hasText: 'Mal' }).getByRole('button', { name: 'Let in' }).click();
  const { jason: from, grant } = await admitted;
  clearInterval(knocking);
  const relays = createRelays([broker.url]);
  open.push(relays);
  const rekeys = [];
  const listen = async (key) => {
    const room = await relayLink(relays, key);
    room.onMessage((m) => m.body?.t === 'rekey' && rekeys.push(m));
    await new Promise((resolve) => (room.state === 'open' ? resolve() : room.onOpen(resolve)));
    return room;
  };
  await listen(grant.session);
  const moved = async (n) => {
    await expect.poll(() => rekeys.filter((m) => m.to === mal).length, { timeout: 15_000 }).toBe(n);
    const mine = rekeys.filter((m) => m.to === mal)[n - 1];
    return listen((await unwrap(pair.priv, mine.body.key, lobby.sid, mine.body.wrapped)).session);
  };

  await relink(jason, ['Alex', 'Mal']);
  await moved(1);
  const old = rekeys.find((m) => m.to !== mal);
  await relink(jason, ['Alex', 'Mal']);
  const room = await moved(2);
  await passion(jason, 'perf', 'Performance');
  await hasPassion(alex, 'perf');

  room.send({ ...old, id: id(), from });
  await alex.waitForTimeout(3_000);
  await passion(jason, 'a11y', 'Accessibility');
  await hasPassion(alex, 'a11y');
  await text(alex, '.sync-status', 'Connected to Jason');
}, 120_000);

test('a second window on the same interview stays out of the room until it takes over, so colleagues hear one of you', async () => {
  const [jason, alex] = await meet(browser, url);
  const second = await alex.context().newPage();
  await second.goto(url);
  await second.evaluate(() => window.ready);
  await second.getByRole('button', { name: 'Open', exact: true }).click();
  await second.waitForSelector('.store-status-button');
  await second.waitForTimeout(3_000);
  const presence = (page) => page.evaluate(() => [document.querySelectorAll('.sync-names li').length, document.querySelector('.sync-status')?.textContent ?? null]);
  expect([await presence(second), await presence(alex)]).toEqual([[0, ''], [1, 'Connected to Jason']]);

  await second.getByRole('button', { name: 'Take over' }).click();
  await text(second, '.sync-status', 'Connected to Jason');
  await passion(jason, 'a11y', 'Accessibility');
  await hasPassion(second, 'a11y');
  expect(await presence(alex)).toEqual([0, '']);
}, 90_000);

// A window on an interview another window of this browser already has open, waiting behind it.
async function secondWindow(page) {
  const w = await page.context().newPage();
  await w.goto(url);
  await w.evaluate(() => window.ready);
  await w.getByRole('button', { name: 'Open', exact: true }).first().click();
  await w.waitForSelector('.store-status-button');
  return w;
}

test('a waiting window takes over with the keys Change the link gave the first, for the inviter and for a colleague', async () => {
  const [jason, alex] = await meet(browser, url);
  const [j2, a2] = [await secondWindow(jason), await secondWindow(alex)];
  await relink(jason, ['Alex']);
  await passion(jason, 'perf', 'Performance');
  await hasPassion(alex, 'perf');

  await jason.close();
  await text(j2, '.sync-status', 'Connected to Alex', 30_000);
  await alex.close();
  await text(a2, '.sync-status', 'Connected to Jason', 30_000);
  await passion(j2, 'a11y', 'Accessibility');
  await hasPassion(a2, 'a11y');
}, 150_000);

test('a window opened before Invite takes over in the room the first made, and its Invite gives the same link', async () => {
  const jason = await laptop(browser, url);
  await start(jason, 'Jason');
  const j2 = await secondWindow(jason);
  const code = await fromMenu(jason, 'Invite');
  const alex = await laptop(browser, url);
  await knock(alex, code, 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');

  await jason.close();
  await text(j2, '.sync-status', 'Connected to Alex', 30_000);
  expect(await fromMenu(j2, 'Invite')).toBe(code);
  await passion(j2, 'a11y', 'Accessibility');
  await hasPassion(alex, 'a11y');
}, 120_000);

// Holds every key import for window.slow ms while it is set, so a test can act while the room is still connecting.
const SLOW = `(() => {
  const real = SubtleCrypto.prototype.importKey;
  SubtleCrypto.prototype.importKey = function (...a) {
    if (!window.slow) return real.apply(this, a);
    window.slowed = (window.slowed ?? 0) + 1;
    return new Promise((r) => setTimeout(r, window.slow)).then(() => real.apply(this, a));
  };
})();`;
const openOn = (page, candidate) => page.locator('.session-list-item').filter({ hasText: candidate }).getByRole('button', { name: 'Open', exact: true }).click();

test('leaving an interview while it connects frees it, so another window can sync it', async () => {
  const jason = await laptop(browser, url);
  await start(jason, 'Jason');
  const alex = await laptop(browser, url, { init: SLOW });
  await knock(alex, await fromMenu(jason, 'Invite'), 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');
  await newInterview(jason);
  await start(jason, 'Jason', 'Kim Park');
  await newInterview(alex);
  await knock(alex, await fromMenu(jason, 'Invite'), 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');

  await newInterview(alex);
  await alex.evaluate(() => { window.slow = 3_000; });
  await openOn(alex, 'Sam Lee');
  await alex.waitForFunction(() => window.slowed > 0);
  await newInterview(alex);
  await openOn(alex, 'Kim Park');
  const a2 = await alex.context().newPage();
  await a2.goto(url);
  await a2.evaluate(() => window.ready);
  await openOn(a2, 'Sam Lee');
  await text(a2, '.sync-status', "Jason isn't here yet. You'll connect as soon as Jason opens the interview.", 30_000);
}, 150_000);

// Records, for every change to the page once an interview shows, whether the menu offers Invite.
const INVITE_SHOWN = `new MutationObserver(() => {
  if (document.querySelector('.session-header')) (window.invite ??= []).push(Boolean(document.querySelector('.sync-invite')));
}).observe(document, { childList: true, subtree: true });`;

test('the menu offers Invite from the first draw of an interview, without waiting a beat', async () => {
  const jason = await laptop(browser, url, { init: INVITE_SHOWN });
  await start(jason, 'Jason');
  await jason.waitForTimeout(1_000);
  expect([...new Set(await jason.evaluate(() => window.invite))]).toEqual([true]);
}, 60_000);

// The sample pack without the role the invite is for, while sessionStorage.noRole is set in that tab.
const NO_ROLE = `Object.defineProperty(window, 'PACK', { configurable: true, get() { return this.pack; },
  set(p) { if (sessionStorage.getItem('noRole')) p.roles = p.roles.filter((r) => r.id !== 'frontend-engineer'); this.pack = p; } });`;

test('a kit without the interview\'s role keeps the room, so the link opens straight back in once the role is back', async () => {
  const jason = await laptop(browser, url);
  await start(jason, 'Jason');
  const code = await fromMenu(jason, 'Invite');
  const alex = await laptop(browser, url, { init: NO_ROLE });
  await knock(alex, code, 'Alex');
  await text(jason, '.sync-knock span', 'Alex wants to join.');
  await jason.getByRole('button', { name: 'Let in' }).click();
  await text(alex, '.sync-status', 'Connected to Jason');

  await alex.evaluate(() => sessionStorage.setItem('noRole', '1'));
  await alex.goto('about:blank');
  await alex.goto(`${url}#${code}`);
  await alex.evaluate(() => window.ready);
  await text(alex, '.sync-join-status', "This invite is for a role or round this kit doesn't have. Ask Jason which kit they are using.");
  await jason.waitForTimeout(2_000);
  expect(await jason.locator('.sync-knock').count()).toBe(0);

  await alex.evaluate(() => sessionStorage.removeItem('noRole'));
  await alex.goto('about:blank');
  await alex.goto(`${url}#${code}`);
  await alex.evaluate(() => window.ready);
  await text(alex, '.sync-status', 'Connected to Jason');
  expect(await jason.locator('.sync-knock').count()).toBe(0);
}, 120_000);
