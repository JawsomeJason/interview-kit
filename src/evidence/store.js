import { createClock } from './clock.js';
import { foldShared, hasDecided, roomOf } from './reduce.js';

// IndexedDB `interview-kit:<pack id>`, version 1:
// - sessions, keyed by sid: { sid, author, touched }. author is this browser's id in the session; touched is the wall
//   ms of the last write or Keep, which starts the retention clock.
// - events, keyed by [sid, author, stream, n]: the event itself. A session's keys sort by author, stream, then n.
const VERSION = 1;
const DAY = 86_400_000;
const WARN_DAYS = 5;
const OLDER = 'This copy of the kit is older than one already opened on this laptop. Open the newer copy.';
const INSECURE = "Notes can't save on a page served over plain http. Open the kit from an https:// address, localhost or a file on this laptop.";

const request = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const finish = (tx) => new Promise((ok, no) => { tx.oncomplete = () => ok(); tx.onabort = () => no(tx.error ?? new DOMException('Aborted', 'AbortError')); });
const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const hex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
const range = (sid) => IDBKeyRange.bound([sid], [sid, []]);

// What retention does to a session: a decided one goes `days` after its last change, counting down in its last five;
// an undecided one is never deleted, only noted once it is as old.
function fate(decided, touched, now, days) {
  const left = Math.ceil((touched + days * DAY - now) / DAY);
  if (!decided) return left > 0 ? { k: 'kept' } : { k: 'undecided' };
  if (left <= 0) return { k: 'gone' };
  return left <= WARN_DAYS ? { k: 'warn', left } : { k: 'kept' };
}

function openDb(name) {
  return new Promise((ok, no) => {
    const r = indexedDB.open(name, VERSION);
    r.onupgradeneeded = () => { r.result.createObjectStore('sessions', { keyPath: 'sid' }); r.result.createObjectStore('events'); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error.name === 'VersionError' ? new Error(OLDER) : r.error);
  });
}

// The only code that touches storage. One window writes a session's log at a time (the Web Lock); a write IndexedDB
// refuses goes to an in-memory tail that marking reads from and a retry flushes. Status, for the bar:
// ok | unsaved (the tail holds events) | read-only | taken-over | conflict (this window stops writing until a reload).
export async function openStore(packId, { retentionDays = 30, retryMs = 10_000, now = Date.now } = {}) {
  // Browsers offer Web Locks only to secure pages, and without one two windows could write over each other.
  if (!globalThis.navigator?.locks) throw new Error(INSECURE);
  const name = `interview-kit:${packId}`;
  const db = await openDb(name);
  const lockName = (sid, author) => `${name}:${sid}:${author}`;
  const tail = [];
  const listeners = new Set();
  const promoted = new Set();
  let status = 'ok';
  let chain = Promise.resolve();
  let timer;
  let claimed;
  let release;
  let waiting;

  const set = (k) => {
    if (status === k || status === 'conflict') return;
    status = k;
    for (const fn of listeners) fn(k);
  };
  const resume = () => set(tail.length ? 'unsaved' : 'ok');
  const records = () => request(db.transaction('sessions').objectStore('sessions').getAll());
  const session = (sid) => request(db.transaction('sessions').objectStore('sessions').get(sid));

  const touch = (tx, sid) => {
    const sessions = tx.objectStore('sessions');
    sessions.get(sid).onsuccess = ({ target }) => { if (target.result) sessions.put({ ...target.result, touched: now() }); };
  };

  async function write({ sid, author, ch, event }) {
    const tx = db.transaction(['events', 'sessions'], 'readwrite');
    const done = finish(tx);
    const events = tx.objectStore('events');
    const key = [sid, author, ch, event.n];
    let outcome = 'saved';
    try {
      const add = events.add(event, key);
      add.onsuccess = () => touch(tx, sid);
      add.onerror = (ev) => {
        if (add.error.name !== 'ConstraintError') return;
        ev.preventDefault();
        events.get(key).onsuccess = ({ target }) => { outcome = canon(target.result) === canon(event) ? 'same' : 'conflict'; };
      };
    } catch (e) {
      tx.abort();
      await done.catch(() => {});
      throw e;
    }
    await done;
    return outcome;
  }

  async function flush() {
    while (tail.length) {
      let outcome;
      try { outcome = await write(tail[0]); } catch { return; }
      if (outcome === 'conflict') { clearInterval(timer); set('conflict'); return; }
      tail.shift();
    }
    clearInterval(timer);
    timer = undefined;
    if (status === 'unsaved') set('ok');
  }

  // Appends run one at a time, so a refused write never lets a later one land ahead of it.
  const append = (sid, author, ch, event) => (chain = chain.then(async () => {
    if (status !== 'ok' && status !== 'unsaved') return 'refused';
    const entry = { sid, author, ch, event };
    if (tail.length) { tail.push(entry); return 'held'; }
    try {
      const outcome = await write(entry);
      if (outcome === 'conflict') set('conflict');
      return outcome;
    } catch {
      tail.push(entry);
      set('unsaved');
      timer ??= setInterval(() => { chain = chain.then(flush); }, retryMs);
      return 'held';
    }
  }));

  async function read(sid) {
    const os = db.transaction('events').objectStore('events');
    const [keys, values] = await Promise.all([request(os.getAllKeys(range(sid))), request(os.getAll(range(sid)))]);
    const held = {};
    const add = (author, ch, e) => (held[author] ??= { pub: [], prv: [] })[ch].push(e);
    keys.forEach(([, author, ch], i) => add(author, ch, values[i]));
    for (const t of tail) if (t.sid === sid) add(t.author, t.ch, t.event);
    return held;
  }

  async function remove(sid) {
    const tx = db.transaction(['events', 'sessions'], 'readwrite');
    tx.objectStore('events').delete(range(sid));
    tx.objectStore('sessions').delete(sid);
    await finish(tx);
  }

  // A window that becomes the writer after being read-only stays refusing appends until each promoted fn has run, so
  // the session can read back what the other window wrote before it stamps another event.
  const hold = async (late) => {
    if (late) for (const fn of promoted) await fn();
    resume();
    return new Promise((r) => { release = r; });
  };

  async function claim(sid, author, steal = false) {
    release?.();
    waiting?.abort();
    claimed = { sid, author };
    return new Promise((resolve) => {
      navigator.locks.request(lockName(sid, author), steal ? { steal: true } : { ifAvailable: true }, (lock) => {
        if (lock) { resolve('writer'); return hold(steal); }
        set('read-only');
        resolve('read-only');
        // Queue behind the writer, so this window takes over by itself once that one closes.
        const queued = new AbortController();
        waiting = queued;
        navigator.locks.request(lockName(sid, author), { signal: queued.signal }, () => hold(true)).catch(() => {});
        return undefined;
      }).catch((e) => { if (e.name === 'AbortError') set('taken-over'); });
    });
  }

  // At start: a decision written without its `decided` (a crash between the two) gets its `decided`, and decided
  // sessions past retention go. A session another window holds is left to that window.
  for (const r of await records()) {
    await navigator.locks.request(lockName(r.sid, r.author), { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      const mine = (await read(r.sid))[r.author] ?? { pub: [], prv: [] };
      if (hasDecided(mine.pub)) {
        if (fate(true, r.touched, now(), retentionDays).k === 'gone') await remove(r.sid);
      } else if (mine.prv.some((e) => e.t === 'decide')) {
        const clock = createClock(now);
        for (const e of [...mine.pub, ...mine.prv]) clock.receive(e.h);
        await append(r.sid, r.author, 'pub', { n: mine.pub.length, h: clock.now(), t: 'decided' });
      }
    });
  }

  return {
    get status() { return status; },
    onStatus: (fn) => listeners.add(fn),
    onPromoted: (fn) => promoted.add(fn),
    session,
    read,
    append,
    remove,
    claim: (sid, author) => claim(sid, author),
    takeOver: () => claim(claimed.sid, claimed.author, true),
    // The setup Saving check: one record written, read back and removed in a single transaction.
    async check() {
      try {
        const tx = db.transaction('sessions', 'readwrite');
        const os = tx.objectStore('sessions');
        os.put({ sid: '~check', author: '', touched: 0 });
        const got = os.get('~check');
        os.delete('~check');
        await finish(tx);
        return got.result?.sid === '~check';
      } catch {
        return false;
      }
    },
    keep(sid) {
      const tx = db.transaction('sessions', 'readwrite');
      touch(tx, sid);
      return finish(tx);
    },
    async create({ sid = hex(6), author = `a-${hex(4)}` } = {}) {
      const r = { sid, author, touched: now() };
      await request(db.transaction('sessions', 'readwrite').objectStore('sessions').add(r));
      return { sid: r.sid, author: r.author };
    },
    async sessions() {
      const rows = [];
      for (const r of await records()) {
        const held = await read(r.sid);
        const pubs = Object.fromEntries(Object.entries(held).map(([a, log]) => [a, log.pub]));
        rows.push({ sid: r.sid, author: r.author, candidate: foldShared(roomOf(pubs, r.sid)).candidate, touched: r.touched,
          fate: fate(hasDecided(held[r.author]?.pub ?? []), r.touched, now(), retentionDays) });
      }
      return rows.sort((a, b) => b.touched - a.touched);
    },
  };
}
