// A seeded faulty in-memory Link: broadcast or point-to-point, with drops, duplicates, reorders, partitions and the
// frame cap a sealed, base64-encoded message meets on a real link. Every end is a Link as design.md section 1 shapes it.
export const FRAME_BYTES = 64 * 1024;
const SEAL_BYTES = 28;
const utf8 = new TextEncoder();
const frameBytes = (msg) => Math.ceil((utf8.encode(JSON.stringify(msg)).length + SEAL_BYTES) * 4 / 3);

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function createNetwork({ seed = 1, faults = {} } = {}) {
  const rnd = mulberry32(seed);
  const chance = (p) => p > 0 && rnd() < p;
  const ends = new Map();
  const queue = [];
  let group = () => 0;

  const net = {
    faults: { drop: 0, dup: 0, reorder: 0, ...faults },
    sent: [],
    hooks: [],
    violations: [],
    maxFrame: 0,
    get pending() { return queue.length; },
    attach: (author, state = 'open') => end(author, undefined, state),
    pair: (a, b, state = 'open') => { const ea = end(a, b, state); const eb = end(b, a, state); ea.far = eb; eb.far = ea; return [ea, eb]; },
    partition(fn) { group = fn; },
    heal() { group = () => 0; },
    discard(author) { for (let i = queue.length - 1; i >= 0; i--) if (queue[i].from === author) queue.splice(i, 1); },
    deliver() {
      if (!queue.length) return false;
      const [item] = queue.splice(net.faults.reorder && chance(net.faults.reorder) ? Math.floor(rnd() * queue.length) : 0, 1);
      if (group(item.from) !== group(item.to) || chance(net.faults.drop) || item.end.state !== 'open') return true;
      if (chance(net.faults.dup)) queue.push(item);
      for (const fn of item.end.handlers) fn(structuredClone(item.msg));
      return true;
    },
    flush(limit = 100_000) {
      let n = 0;
      while (n < limit && net.deliver()) n++;
      if (n === limit) throw new Error(`the network never went quiet after ${limit} deliveries`);
      return n;
    },
  };

  function end(author, peer, state) {
    const link = {
      kind: 'memory', state, peer, author, handlers: new Set(), opens: new Set(),
      onMessage(fn) { link.handlers.add(fn); return () => link.handlers.delete(fn); },
      onOpen(fn) { link.opens.add(fn); },
      open() { link.state = 'open'; for (const fn of link.opens) fn(); },
      close() { link.state = 'closed'; if (link.far) link.far.state = 'closed'; },
      send(msg) {
        if (link.state !== 'open') return;
        const size = frameBytes(msg);
        net.maxFrame = Math.max(net.maxFrame, size);
        if (size > FRAME_BYTES) { net.violations.push({ from: author, t: msg.body?.t, size }); return; }
        const receivers = [...ends.values()].filter((e) => e.state === 'open' && e.author !== author && (peer ? e.author === peer && e.peer === author : !e.peer));
        const to = receivers.map((e) => e.author);
        net.sent.push({ msg, from: author, to, link });
        for (const fn of net.hooks) fn(msg, author, to);
        for (const e of receivers) queue.push({ msg, from: author, to: e.author, end: e });
      },
    };
    ends.set(`${author}>${peer ?? '*'}`, link);
    return link;
  }

  return net;
}
