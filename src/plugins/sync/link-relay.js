import { importKey, open, seal, topicOf } from './seal.js';

// The first relay is on port 443, which a corporate network that allows only HTTPS still passes. Measured from one Mac
// (sync-repro/relay-probe.mjs in the task folder): shiftr carries 60 KiB and drops the socket at 64 KiB, the others carry 64 KiB.
export const RELAYS = ['wss://public:public@public.cloud.shiftr.io', 'wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt'];
export const PREFIX = 'ik2/';
const utf8 = new TextEncoder();
const text = new TextDecoder();
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const str = (s) => { const b = utf8.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
const varint = (n) => { const out = []; do { let d = n & 127; n >>= 7; if (n) d |= 128; out.push(d); } while (n); return out; };
const packet = (first, body) => Uint8Array.from([first, ...varint(body.length), ...body]);
export const connectPacket = (clientId, user = '', pass = '') => packet(0x10, [...str('MQTT'), 4, user ? 0xc2 : 2, 0, 30, ...str(clientId), ...(user ? [...str(user), ...str(pass)] : [])]);
export const subscribePacket = (id, topic) => packet(0x82, [id >> 8, id & 255, ...str(topic), 0]);
export const publishPacket = (topic, payload) => packet(0x30, [...str(topic), ...payload]);
const PINGREQ = Uint8Array.from([0xc0, 0]);

export function parsePackets(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length;) {
    const first = bytes[i++];
    let len = 0;
    let shift = 0;
    let d;
    do { d = bytes[i++]; len += (d & 127) << shift; shift += 7; } while (d & 128 && i < bytes.length);
    out.push({ type: first >> 4, flags: first & 15, body: bytes.slice(i, i + len) });
    i += len;
  }
  return out;
}

export function publishOf({ flags, body }) {
  const len = (body[0] << 8) | body[1];
  return { topic: text.decode(body.slice(2, 2 + len)), payload: body.slice(2 + len + (flags & 6 ? 2 : 0)) };
}

export function createRelays(urls, { socket = (url) => new WebSocket(url, 'mqtt'), schedule = [1000, 2000, 4000, 8000, 15000], win = globalThis } = {}) {
  // Browsers refuse a login inside a WebSocket URL, so it moves into CONNECT.
  const conns = urls.map((url) => {
    const u = new URL(url);
    const login = [decodeURIComponent(u.username), decodeURIComponent(u.password)];
    u.username = u.password = '';
    return { url: u.href, login, ws: null, up: false, tries: 0, timer: null, ping: null };
  });
  const subs = new Map();
  const pending = new Map();
  const recent = new Set();
  const order = [];
  const stateFns = new Set();
  let state = 'opening';
  let started = false;
  let closed = false;
  let nextId = 0;

  const seen = (payload) => {
    const k = hex(payload.slice(0, 12));
    if (recent.has(k)) return true;
    recent.add(k);
    order.push(k);
    if (order.length > 512) recent.delete(order.shift());
    return false;
  };
  const setState = () => {
    const s = closed ? 'closed' : conns.some((c) => c.up) ? 'open' : 'opening';
    if (s === state) return;
    state = s;
    for (const fn of stateFns) fn(s);
  };
  const ready = (sub, delta) => {
    const was = sub.acked.size;
    delta(sub.acked);
    if ((was > 0) !== (sub.acked.size > 0)) for (const fn of sub.readyFns) fn(sub.acked.size);
  };
  function subscribeOn(c, topic) {
    nextId = (nextId % 65535) + 1;
    pending.set(nextId, { c, topic });
    c.ws.send(subscribePacket(nextId, topic));
  }
  function connect(c) {
    if (closed || c.ws) return;
    let ws;
    try { ws = socket(c.url); } catch { return retry(c); }
    c.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(connectPacket(`ik-${hex(crypto.getRandomValues(new Uint8Array(6)))}`, ...c.login));
    ws.onerror = () => {};
    ws.onmessage = ({ data }) => {
      for (const p of parsePackets(new Uint8Array(data))) {
        if (p.type === 2 && p.body[1] === 0) {
          c.up = true;
          c.tries = 0;
          c.ping = win.setInterval(() => ws.send(PINGREQ), 20_000);
          for (const topic of subs.keys()) subscribeOn(c, topic);
          setState();
        } else if (p.type === 9) {
          const ack = pending.get((p.body[0] << 8) | p.body[1]);
          pending.delete((p.body[0] << 8) | p.body[1]);
          if (ack && subs.has(ack.topic) && p.body[2] !== 0x80) ready(subs.get(ack.topic), (acked) => acked.add(c));
        } else if (p.type === 3) {
          const { topic, payload } = publishOf(p);
          if (!subs.has(topic) || seen(payload)) continue;
          for (const fn of subs.get(topic).fns) fn(payload);
        }
      }
    };
    ws.onclose = () => {
      c.ws = null;
      c.up = false;
      win.clearInterval(c.ping);
      for (const sub of subs.values()) ready(sub, (acked) => acked.delete(c));
      setState();
      retry(c);
    };
  }
  function retry(c) {
    if (closed) return;
    c.timer = win.setTimeout(() => connect(c), schedule[Math.min(c.tries++, schedule.length - 1)]);
  }
  const now = () => { for (const c of conns) if (!c.ws) { win.clearTimeout(c.timer); connect(c); } };
  function start() {
    if (started) return;
    started = true;
    for (const c of conns) connect(c);
    win.addEventListener?.('online', now);
    win.document?.addEventListener('visibilitychange', () => win.document.visibilityState === 'visible' && now());
  }

  return {
    get state() { return state; },
    connected: () => conns.filter((c) => c.up).map((c) => c.url),
    retry: now,
    ready: (topic) => subs.get(topic)?.acked.size ?? 0,
    onState(fn) { stateFns.add(fn); return () => stateFns.delete(fn); },
    onReady(topic, fn) { subs.get(topic)?.readyFns.add(fn); return () => subs.get(topic)?.readyFns.delete(fn); },
    subscribe(topic, fn) {
      if (!subs.has(topic)) {
        subs.set(topic, { fns: new Set(), acked: new Set(), readyFns: new Set() });
        for (const c of conns) if (c.up) subscribeOn(c, topic);
      }
      subs.get(topic).fns.add(fn);
      start();
      return () => subs.get(topic)?.fns.delete(fn);
    },
    publish(topic, payload) {
      const pkt = publishPacket(topic, payload);
      for (const c of conns) if (c.up) c.ws.send(pkt);
    },
    close() {
      closed = true;
      for (const c of conns) { win.clearTimeout(c.timer); win.clearInterval(c.ping); c.ws?.close(); c.ws = null; c.up = false; }
      setState();
    },
  };
}

export async function relayLink(relays, rawKey) {
  const key = await importKey(rawKey);
  const topic = PREFIX + await topicOf(rawKey);
  const handlers = new Set();
  const opens = new Set();
  let arriving = Promise.resolve();
  let leaving = Promise.resolve();
  let closed = false;
  const off = relays.subscribe(topic, (frame) => {
    arriving = arriving.then(async () => {
      const msg = await open(key, topic, frame);
      if (msg && !closed) for (const fn of handlers) fn(msg);
    });
  });
  const offReady = relays.onReady(topic, (n) => { if (n > 0) for (const fn of opens) fn(); });
  return {
    kind: 'relay',
    topic,
    get state() { return closed ? 'closed' : relays.ready(topic) ? 'open' : 'opening'; },
    send(msg) {
      leaving = leaving.then(async () => { if (!closed) relays.publish(topic, await seal(key, topic, msg)); });
      return leaving;
    },
    onMessage(fn) { handlers.add(fn); return () => handlers.delete(fn); },
    onOpen(fn) { opens.add(fn); return () => opens.delete(fn); },
    close() { closed = true; off(); offReady(); },
  };
}
