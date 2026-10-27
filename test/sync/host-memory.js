import { checkPrv, checkPub } from '../../src/evidence/check.js';
import { createClock } from '../../src/evidence/clock.js';
import { serve, vector } from '../../src/evidence/gate.js';
import { hasDecided } from '../../src/evidence/reduce.js';

export const ROOM = { sid: 'k3x9q2', role: 'frontend-engineer', round: 'practical', pack: { id: 'sample', version: '1.0.0', sha: 'e6854f1' } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The Host seam of design.md section 6 over in-memory logs: the gate from U4, and the idempotent receive of section 5.
export function createHost(author, name, { physical = Date.now, room = ROOM } = {}) {
  const clock = createClock(physical);
  const held = { [author]: { pub: [], prv: [] } };
  const listeners = new Set();
  const host = {
    held,
    me: () => ({ ...room, author, name }),
    decided: () => hasDecided(held[author].pub),
    vector: (receiver) => vector(held, author, receiver),
    serve: (pull, requester, budget) => serve(held, author, pull, requester, budget),
    receive(from, ch, events) {
      if (from === author) return null;
      const ok = ch === 'prv' ? checkPrv : checkPub;
      const log = (held[from] ??= { pub: [], prv: [] })[ch];
      for (const e of events) {
        if (!ok(e)) return null;
        if (e.n > log.length) return { gapFrom: log.length };
        if (e.n < log.length) { if (!same(log[e.n], e)) return { mismatch: e.n }; continue; }
        clock.receive(e.h);
        log.push(e);
      }
      return null;
    },
    onAppend(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    append(ch, body) {
      const log = held[author][ch];
      const e = { n: log.length, h: clock.now(), ...body };
      log.push(e);
      for (const fn of listeners) fn(ch, e);
      return e;
    },
    decide(why = 'Meets the bar.') {
      host.append('prv', { t: 'decide', choice: 'hire', level: 'mid', why });
      if (!host.decided()) host.append('pub', { t: 'decided' });
    },
  };
  host.append('pub', { t: 'open', v: 2, sid: room.sid, author, role: room.role, round: room.round, pack: room.pack });
  host.append('pub', { t: 'name', name });
  return host;
}
