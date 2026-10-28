import { describe, expect, test } from 'vitest';
import { detailOf, hear, labels, statusOf, UNNAMED } from '../../src/plugins/sync/presence.js';
import { banners, joinLine, roomLine } from '../../src/plugins/sync/status.js';

const S = 1000;
const T0 = new Date(2026, 9, 26, 15, 42).getTime();
const clock = (start = T0) => { let t = start; return { now: () => t, wait: (ms) => { t += ms; return t; } }; };
const text = (line) => line.text;

// A room as the inviter or a joiner sees it, with its relay up from `upAt`.
const room = (over = {}) => ({ inviter: true, expect: [], startedAt: T0, online: true, relay: { upAt: null, downAt: null }, backAt: null, note: null, peers: [], ...over });
const alex = (at, over = {}) => {
  const peers = new Map();
  const p = hear(peers, 'a-alex', at, { name: 'Alex', have: {}, ...over });
  return p;
};

describe('joining', () => {
  test('reaching the meeting point gets 10 seconds, then says why and keeps trying', () => {
    const c = clock();
    const j = { from: 'Jason', startedAt: c.now(), lobbyUpAt: null, state: 'knocking' };
    expect(text(joinLine(j, c.wait(9_999)))).toBe('Connecting…');
    expect(joinLine(j, c.wait(1))).toEqual({ text: "Can't reach the meeting point from this network. Your notes save on this laptop either way. Try another network, or share your evidence as a file after the interview.", tone: 'fail', action: { retry: 'Retry now' } });
  });

  test('waiting to be let in gets 60 seconds, then asks the joiner to remind the inviter, with a copy button', () => {
    const c = clock();
    const j = { from: 'Jason', startedAt: c.now(), lobbyUpAt: c.wait(2 * S), state: 'knocking' };
    expect(joinLine(j, c.wait(59_999))).toEqual({ text: 'Waiting for Jason to let you in…', tone: 'wait', action: null });
    expect(joinLine(j, c.wait(1))).toEqual({ text: "Jason hasn't let you in yet. Ask Jason to look at the kit.", tone: 'fail', action: { copy: 'Copy a reminder for Jason' } });
  });

  test('the meeting point going while knocking says so, then why after 10 seconds', () => {
    const j = { from: 'Jason', startedAt: T0, lobbyUpAt: T0, downAt: T0 + 5 * S, state: 'knocking' };
    expect([7_999, 8_000, 14_999, 15_000].map((ms) => text(joinLine(j, T0 + ms)))).toEqual(['Waiting for Jason to let you in…', 'Reconnecting to the meeting point…',
      'Reconnecting to the meeting point…', "Can't reach the meeting point from this network. Your notes save on this laptop either way. Try another network, or share your evidence as a file after the interview."]);
  });

  test('a link without a from names your colleagues', () => {
    const j = { from: '', startedAt: T0, lobbyUpAt: T0, state: 'knocking' };
    expect([text(joinLine(j, T0)), text(joinLine(j, T0 + 60 * S)), joinLine(j, T0 + 60 * S).action]).toEqual([
      'Waiting for your colleagues to let you in…', "Your colleagues haven't let you in yet. Ask them to look at the kit.", { copy: 'Copy a reminder for them' }]);
  });

  test('a refusal and a bad code each say what to do next', () => {
    const j = (state) => joinLine({ from: 'Jason', startedAt: T0, lobbyUpAt: T0, state }, T0);
    expect(['refused', 'wrong', 'noName', 'foreign'].map((s) => text(j(s)))).toEqual([
      "Jason didn't let you in. Ask Jason to send a new link.",
      "That isn't an invite link or code. Ask for the link again, or paste all of it.",
      'Type your name first, so your colleagues know who is knocking.',
      "This invite is for a role or round this kit doesn't have. Ask Jason which kit they are using.",
    ]);
  });
});

describe('in the room', () => {
  test('reaching the meeting point on reopening a synced session gets 10 seconds', () => {
    expect(text(roomLine(room({ inviter: false, expect: ['Jason'] }), T0 + 9 * S))).toBe('Connecting…');
    expect(roomLine(room(), T0 + 10 * S)).toEqual({ tone: 'fail', action: { retry: 'Retry now' },
      text: "Can't reach the meeting point from this network. Your notes save on this laptop either way. Try another network, or share your evidence as a file after the interview." });
  });

  test('an inviter alone is waiting, with no limit, since being alone is normal', () => {
    const r = room({ relay: { upAt: T0 + S, downAt: null } });
    expect([text(roomLine(r, T0 + S)), text(roomLine(r, T0 + 3600 * S))]).toEqual(['Waiting for colleagues. Send them the invite link.', 'Waiting for colleagues. Send them the invite link.']);
  });

  test('a joiner looks for the inviter for 15 seconds, then says they will connect once the inviter is back', () => {
    const r = room({ inviter: false, expect: ['Jason'], relay: { upAt: T0 + S, downAt: null } });
    expect(text(roomLine(r, T0 + 15_999))).toBe('Looking for Jason…');
    expect(roomLine(r, T0 + 16 * S)).toEqual({ text: "Jason isn't here yet. You'll connect as soon as Jason opens the interview.", tone: 'wait', action: null });
    expect(text(roomLine({ ...r, expect: ['Jason', 'Sam'] }, T0 + 16 * S))).toBe("Jason and Sam aren't here yet. You'll connect as soon as they open the interview.");
  });

  test('catching up gets 10 seconds, then asks the colleague to reload; once caught up it says connected', () => {
    const up = { upAt: T0, downAt: null };
    const p = alex(T0, { behindSince: T0 });
    expect(text(roomLine(room({ relay: up, peers: [p] }), T0 + 9 * S))).toBe('Catching up with Alex…');
    hear(new Map([[p.author, p]]), p.author, T0 + 9_500);
    expect(roomLine(room({ relay: up, peers: [p] }), T0 + 10 * S)).toEqual({ tone: 'fail', action: null,
      text: "Alex is here but their kit isn't answering. Ask Alex to reload the page." });
    p.behindSince = null;
    expect(roomLine(room({ relay: up, peers: [p] }), T0 + 10 * S)).toEqual({ text: 'Connected to Alex', tone: 'ok', action: null });
  });

  test('colleagues whose name has not arrived yet are counted, never numbered', () => {
    const peers = new Map();
    const ps = [hear(peers, 'a-jason', T0, { name: 'Jason' }), hear(peers, 'a-1', T0, { name: UNNAMED }), hear(peers, 'a-2', T0, { name: UNNAMED })];
    expect(text(roomLine(room({ relay: { upAt: T0, downAt: null }, peers: ps }), T0))).toBe('Catching up with Jason and 2 colleagues…');
    expect(text(roomLine(room({ relay: { upAt: T0, downAt: null }, peers: ps.slice(1, 2) }), T0))).toBe('Catching up with a colleague…');
    expect(labels([{ author: 'a', name: UNNAMED }, { author: 'b', name: UNNAMED }])).toEqual(new Map([['a', UNNAMED], ['b', UNNAMED]]));
  });

  test('no hello yet counts as catching up', () => {
    const peers = new Map();
    const p = hear(peers, 'a-alex', T0, { name: 'Alex' });
    expect([statusOf(p, T0), text(roomLine(room({ relay: { upAt: T0, downAt: null }, peers: [p] }), T0))]).toEqual(['catching-up', 'Catching up with Alex…']);
  });

  test('one late ping never shows Lost: under 12 seconds of silence only the detail line says how long', () => {
    const p = alex(T0);
    const r = room({ relay: { upAt: T0, downAt: null }, peers: [p] });
    expect([statusOf(p, T0 + 11_999), text(roomLine(r, T0 + 11_999)), detailOf(p, T0 + 8 * S, {})]).toEqual([
      'connected', 'Connected to Alex', ['Synced 8 s ago']]);
    expect(detailOf(p, T0 + 4 * S, {})).toEqual(['Synced 4 s ago']);
  });

  test('12 seconds of silence while visible is lost, and a minute later says why with Retry now', () => {
    const p = alex(T0);
    const r = room({ relay: { upAt: T0, downAt: null }, peers: [p] });
    expect([statusOf(p, T0 + 12 * S), roomLine(r, T0 + 12 * S)]).toEqual(['lost', { tone: 'wait', action: null,
      text: 'Lost Alex, reconnecting… What you record is saved and will catch up.' }]);
    expect(roomLine(r, T0 + 71_999).text).toBe('Lost Alex, reconnecting… What you record is saved and will catch up.');
    expect([statusOf(p, T0 + 72 * S), roomLine(r, T0 + 72 * S)]).toEqual(['unreachable', { tone: 'fail', action: { retry: 'Retry now' },
      text: "Can't reach Alex from this network. Alex may have closed the kit, or one of you lost the connection. Keep going: everything you record is saved and will catch up." }]);
    expect(detailOf(p, T0 + 72 * S, {})).toEqual(['Offline since 3:42 PM']);
  });

  test('a hidden tab is away, and lost only after 90 seconds of silence', () => {
    const p = alex(T0, { visible: false });
    expect([statusOf(p, T0 + 89 * S), statusOf(p, T0 + 90 * S), detailOf(p, T0 + 30 * S, {})]).toEqual(['away', 'lost', ['Away', 'Synced 30 s ago']]);
    expect(text(roomLine(room({ relay: { upAt: T0, downAt: null }, peers: [p] }), T0 + 30 * S))).toBe('Connected to Alex');
  });

  test('a colleague heard again after a drop reads Reconnected for 3 seconds, then Connected', () => {
    const peers = new Map();
    const p = hear(peers, 'a-alex', T0, { name: 'Alex', have: {} });
    hear(peers, 'a-alex', T0 + 20 * S);
    const r = room({ relay: { upAt: T0, downAt: null }, peers: [p] });
    expect([text(roomLine(r, T0 + 22_999)), text(roomLine(r, T0 + 23 * S))]).toEqual(['Reconnected to Alex. Caught up.', 'Connected to Alex']);
  });

  test('a colleague who left is named with the time for a minute, ahead of the ones still here', () => {
    const peers = new Map();
    const p = hear(peers, 'a-alex', T0, { name: 'Alex', have: {}, leftAt: T0 + 60 * S });
    const sam = hear(peers, 'a-sam', T0 + 115 * S, { name: 'Sam', have: {} });
    const r = room({ relay: { upAt: T0, downAt: null }, peers: [p, sam] });
    expect([statusOf(p, T0 + 61 * S), text(roomLine(r, T0 + 116 * S)), text(roomLine(r, T0 + 120 * S)), text(roomLine({ ...r, peers: [p] }, T0 + 600 * S))])
      .toEqual(['left', 'Alex left at 3:43 PM.', 'Connected to Sam', 'Alex left at 3:43 PM.']);
  });

  test('you are offline when the browser says so; a lost meeting point gets 3 seconds of grace, then 10 to come back', () => {
    const p = alex(T0);
    expect(text(roomLine(room({ online: false, relay: { upAt: T0, downAt: null }, peers: [p] }), T0 + S))).toBe("You're offline. Everything you record is saved and will catch up.");
    const gone = room({ relay: { upAt: null, downAt: T0 + S }, peers: [p] });
    expect([2_999, 3_000, 9_999, 10_000].map((ms) => roomLine(gone, T0 + S + ms).text)).toEqual([
      'Connected to Alex',
      'Reconnecting to the meeting point… Everything you record is saved and will catch up.',
      'Reconnecting to the meeting point… Everything you record is saved and will catch up.',
      "Can't reach the meeting point from this network. Your notes save on this laptop either way. Try another network, or share your evidence as a file after the interview."]);
    const back = room({ relay: { upAt: T0 + 40 * S, downAt: null }, backAt: T0 + 40 * S, peers: [p] });
    expect(text(roomLine(back, T0 + 41 * S))).toBe('Back online. Catching up…');
    hear(new Map([[p.author, p]]), p.author, T0 + 41 * S);
    expect(text(roomLine(back, T0 + 41 * S))).toBe('Reconnected to Alex. Caught up.');
  });

  test('several colleagues: the line names the group that needs something, and the dots show the rest', () => {
    const peers = new Map();
    hear(peers, 'a-alex', T0, { name: 'Alex', have: {} });
    hear(peers, 'a-sam', T0 + 10 * S, { name: 'Sam', have: {} });
    hear(peers, 'a-kim', T0 + 10 * S, { name: 'Kim', have: {} });
    expect(text(roomLine(room({ relay: { upAt: T0, downAt: null }, peers: [...peers.values()] }), T0 + 13 * S)))
      .toBe('Lost Alex, reconnecting… What you record is saved and will catch up.');
    expect(text(roomLine(room({ relay: { upAt: T0, downAt: null }, peers: [...peers.values()] }), T0 + 11 * S))).toBe('Connected to Alex, Sam and Kim');
  });

  test('a colleague on another kit version is told to reload', () => {
    const p = alex(T0, { newer: true });
    expect(roomLine(room({ relay: { upAt: T0, downAt: null }, peers: [p] }), T0)).toEqual({ tone: 'fail', action: null,
      text: 'Alex is using a newer or older kit. Both of you reload the page to get the same version.' });
  });

  test('a knock speaks for itself: no Waiting for colleagues beside it', () => {
    expect(roomLine(room({ relay: { upAt: T0, downAt: null }, knocks: 1 }), T0)).toEqual({ text: '', tone: 'ok', action: null });
  });

  test('Sam joined shows for 3 seconds', () => {
    const r = room({ relay: { upAt: T0, downAt: null }, note: { text: 'Sam joined.', at: T0 } });
    expect([text(roomLine(r, T0 + 2_999)), text(roomLine(r, T0 + 3 * S))]).toEqual(['Sam joined.', 'Waiting for colleagues. Send them the invite link.']);
  });
});

describe('detail lines and names', () => {
  test('hover says where a colleague is, whom they follow and how the link runs', () => {
    const p = alex(T0, { route: '#/practical/review-a-pr', following: 'a-jason', via: 'relay', caughtUpAt: T0 });
    const ctx = { titleOf: (r) => ({ '#/practical/review-a-pr': "Review a teammate's PR" })[r], nameOf: (a) => ({ 'a-jason': 'Jason' })[a] };
    expect(detailOf(p, T0 + S, ctx)).toEqual(["Alex is on Review a teammate's PR", 'Following Jason', 'Through the meeting point']);
    expect(detailOf({ ...p, heardAt: T0 + 15 * S }, T0 + 15 * S, ctx).at(-1)).toBe('Through the meeting point, a little slower');
    expect(detailOf({ ...p, via: 'direct', heardAt: T0 + 15 * S }, T0 + 15 * S, ctx).at(-1)).toBe('Direct connection');
    expect(detailOf({ ...p, via: 'turn', heardAt: T0 + 15 * S }, T0 + 15 * S, ctx).at(-1)).toBe('Through the relay server');
    expect(detailOf({ ...p, route: '#/decide' }, T0 + S, ctx)[0]).toBe('Alex is on their Decide page');
  });

  test('two colleagues with one name get a number', () => {
    expect(labels([{ author: 'a', name: 'Alex' }, { author: 'b', name: 'Sam' }, { author: 'c', name: 'Alex' }])).toEqual(new Map([['a', 'Alex 1'], ['b', 'Sam'], ['c', 'Alex 2']]));
  });

  test('the pack banner names the colleague and their pack version from the first hello', () => {
    const mine = { id: 'sample', version: '1.0.0', sha: 'e6854f1' };
    const peers = [alex(T0, { pack: { id: 'sample', version: '1.0.1', sha: 'aaaaaaa' } }), { ...alex(T0, { pack: mine }), name: 'Sam' }, { ...alex(T0, { pack: { ...mine, sha: 'bbbbbbb' } }), name: 'Kim' }];
    expect(banners(peers, mine)).toEqual([
      'Alex is using another version of this pack (1.0.1). Anchors that changed show as reworded.',
      'Kim is using another version of this pack (1.0.0, build bbbbbbb). Anchors that changed show as reworded.',
    ]);
  });
});
