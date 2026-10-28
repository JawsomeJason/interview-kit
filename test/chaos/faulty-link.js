// The faulty Link the chaos harness injects through the sync plugin's `links` seam. It wraps every link the plugin
// opens (the room's relay link and each direct link) and applies the faults in one shared state: down (every link
// closed both ways, reopened by heal, which fires onOpen as a real reconnect would), cutFrom (a partition: what comes
// from those authors is dropped), and seeded drops, duplicates and delays on what arrives. It also records every
// private page and every hello that names a private count, with who had decided by then, for the blindness check.
// Runs in the page, so it imports nothing.
const utf8 = typeof TextEncoder === 'undefined' ? null : new TextEncoder();

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function chaosState(seed = 1) {
  const state = {
    rnd: mulberry32(seed),
    faults: { drop: 0, dup: 0, reorder: 0, delay: 0 },
    down: false,
    cutFrom: new Set(),
    decided: [],
    sightings: [],
    stats: { frames: 0, maxBytes: 0, held: 0 },
    tracing: false,
    trace: [],
    links: new Set(),
    reseed(s) { state.rnd = mulberry32(s); },
    heal() {
      const wasDown = state.down;
      state.down = false;
      state.cutFrom = new Set();
      state.faults = { drop: 0, dup: 0, reorder: 0, delay: 0 };
      if (wasDown) for (const l of state.links) l.reopen();
    },
  };
  return state;
}

export function chaosLinks(state, win) {
  const chance = (p) => p > 0 && state.rnd() < p;
  return function wrap(link) {
    const handlers = new Set();
    const opens = new Set();
    const deliver = (m) => { for (const fn of handlers) fn(m); };
    link.onMessage((m) => {
      if (!m || typeof m !== 'object') return;
      state.stats.frames++;
      if (state.tracing) state.trace.push([Math.round(win.performance?.now() ?? 0), 'in', link.kind, m.from, m.body?.t, m.to ?? '', m.body?.author ?? '', state.down ? 'down' : '']);
      if (utf8) state.stats.maxBytes = Math.max(state.stats.maxBytes, utf8.encode(JSON.stringify(m)).length);
      const b = m.body;
      if (b?.t === 'events' && b.ch === 'prv' && b.events?.length) state.sightings.push({ kind: 'events', from: m.from, author: b.author, decided: [...state.decided] });
      if (b?.t === 'hello') for (const [author, c] of Object.entries(b.have ?? {})) if (c && 'prv' in c) state.sightings.push({ kind: 'hello', from: m.from, author, decided: [...state.decided] });
      if (state.down || state.cutFrom.has(m.from) || chance(state.faults.drop)) return;
      const copies = chance(state.faults.dup) ? 2 : 1;
      for (let i = 0; i < copies; i++) {
        // A delayed share of the messages, each by its own random time, lands out of order with the rest.
        if (state.faults.delay && (!state.faults.reorder || chance(state.faults.reorder))) {
          state.stats.held++;
          win.setTimeout(() => { state.stats.held--; if (!state.down && !state.cutFrom.has(m.from)) deliver(m); }, Math.floor(state.rnd() * state.faults.delay));
        } else deliver(m);
      }
    });
    link.onOpen?.(() => { if (!state.down) for (const fn of opens) fn(); });
    const wrapped = {
      get kind() { return link.kind; },
      get peer() { return link.peer; },
      get topic() { return link.topic; },
      get state() { return state.down ? 'closed' : link.state; },
      send(m) { if (state.tracing) state.trace.push([Math.round(win.performance?.now() ?? 0), 'out', link.kind, m.from, m.body?.t, m.to ?? '', m.body?.author ?? '', state.down ? 'down' : '']); if (!state.down) return link.send(m); },
      onMessage(fn) { handlers.add(fn); return () => handlers.delete(fn); },
      onOpen(fn) { opens.add(fn); return () => opens.delete(fn); },
      close() { state.links.delete(wrapped); link.close(); },
      reopen() { if (link.state === 'open') for (const fn of opens) fn(); },
      ...(link.prepare && { prepare: (m) => link.prepare(m) }),
    };
    state.links.add(wrapped);
    return wrapped;
  };
}
