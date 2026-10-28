import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createSocket } from 'node:dgram';

// A TURN server over UDP for one test, just enough of RFC 5766 for Chrome: long-term credentials, Allocate, Refresh,
// CreatePermission, ChannelBind, Send and Data indications and ChannelData. Permissions are accepted, never checked.
// Chrome validates MESSAGE-INTEGRITY on every signed reply, so a success response carries one.
const COOKIE = 0x2112a442;
const [BINDING, ALLOCATE, REFRESH, SEND, DATA, PERMISSION, CHANNEL_BIND] = [0x0001, 0x0003, 0x0004, 0x0016, 0x0017, 0x0008, 0x0009];
const A = { integrity: 0x0008, error: 0x0009, channel: 0x000c, lifetime: 0x000d, peer: 0x0012, data: 0x0013, realm: 0x0014, nonce: 0x0015, relayed: 0x0016, mapped: 0x0020 };
const pad = (n) => (4 - (n % 4)) % 4;
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const attr = (type, value) => { const b = Buffer.alloc(4 + value.length + pad(value.length)); b.writeUInt16BE(type, 0); b.writeUInt16BE(value.length, 2); value.copy(b, 4); return b; };
const cookieByte = (i) => (COOKIE >>> (24 - 8 * i)) & 255;
const xorAddr = (type, address, port) => {
  const b = Buffer.alloc(8);
  b[1] = 1;
  b.writeUInt16BE(port ^ 0x2112, 2);
  address.split('.').forEach((n, i) => { b[4 + i] = Number(n) ^ cookieByte(i); });
  return attr(type, b);
};
const readXorAddr = (v) => ({ port: v.readUInt16BE(2) ^ 0x2112, address: [0, 1, 2, 3].map((i) => v[4 + i] ^ cookieByte(i)).join('.') });
const header = (type, length, tid) => { const h = Buffer.alloc(20); h.writeUInt16BE(type, 0); h.writeUInt16BE(length, 2); h.writeUInt32BE(COOKIE, 4); tid.copy(h, 8); return h; };
const hmac = (key, bytes) => createHmac('sha1', key).update(bytes).digest();
const message = (type, tid, attrs, key) => {
  let body = Buffer.concat(attrs);
  if (key) body = Buffer.concat([body, attr(A.integrity, hmac(key, Buffer.concat([header(type, body.length + 24, tid), body])))]);
  return Buffer.concat([header(type, body.length, tid), body]);
};
function parse(msg) {
  const attrs = new Map();
  let integrityAt = 0;
  for (let i = 20; i < 20 + msg.readUInt16BE(2);) {
    const type = msg.readUInt16BE(i);
    const len = msg.readUInt16BE(i + 2);
    if (type === A.integrity) integrityAt = i;
    attrs.set(type, msg.subarray(i + 4, i + 4 + len));
    i += 4 + len + pad(len);
  }
  return { type: msg.readUInt16BE(0), tid: msg.subarray(8, 20), attrs, integrityAt };
}
const signed = (msg, { attrs, integrityAt }, key) => {
  if (!integrityAt) return false;
  const head = Buffer.from(msg.subarray(0, integrityAt));
  head.writeUInt16BE(integrityAt + 24 - 20, 2);
  return hmac(key, head).equals(attrs.get(A.integrity));
};

export function startTurn({ username = 'kit', credential = 'secret', realm = 'kit', address = '127.0.0.1' } = {}) {
  const key = createHash('md5').update(`${username}:${realm}:${credential}`).digest();
  const sock = createSocket('udp4');
  const allocations = new Map();
  const log = { allocations: 0, relayed: 0 };

  sock.on('message', (msg, rinfo) => {
    const client = `${rinfo.address}:${rinfo.port}`;
    const alloc = allocations.get(client);
    const toClient = (bytes) => sock.send(bytes, rinfo.port, rinfo.address);
    if (msg[0] >= 0x40 && msg[0] <= 0x7f) {
      const peer = alloc?.channels.get(msg.readUInt16BE(0));
      const data = msg.subarray(4, 4 + msg.readUInt16BE(2));
      if (peer) { alloc.relay.send(data, peer.port, peer.address); log.relayed += data.length; }
      return;
    }
    if (msg.length < 20 || msg.readUInt32BE(4) !== COOKIE) return;
    const req = parse(msg);
    const { type, tid, attrs } = req;
    const reply = (attrsOut, k) => toClient(message(type | 0x0100, tid, attrsOut, k));
    const mapped = xorAddr(A.mapped, rinfo.address, rinfo.port);
    if (type === BINDING) return reply([mapped]);
    if (type === SEND) {
      const peer = readXorAddr(attrs.get(A.peer));
      const data = attrs.get(A.data);
      if (alloc && data) { alloc.relay.send(data, peer.port, peer.address); log.relayed += data.length; }
      return;
    }
    if (!signed(msg, req, key)) {
      return toClient(message(type | 0x0110, tid, [attr(A.error, Buffer.concat([Buffer.from([0, 0, 4, 1]), Buffer.from('Unauthorized')])), attr(A.realm, Buffer.from(realm)), attr(A.nonce, Buffer.from(randomBytes(8).toString('hex')))]));
    }
    if (type === ALLOCATE) {
      const relay = createSocket('udp4');
      relay.bind(0, address, () => {
        const a = { relay, channels: new Map(), byPeer: new Map() };
        allocations.set(client, a);
        log.allocations++;
        relay.on('message', (data, peer) => {
          log.relayed += data.length;
          const channel = a.byPeer.get(`${peer.address}:${peer.port}`);
          if (channel === undefined) return toClient(message(DATA, randomBytes(12), [xorAddr(A.peer, peer.address, peer.port), attr(A.data, data)]));
          const head = Buffer.alloc(4);
          head.writeUInt16BE(channel, 0);
          head.writeUInt16BE(data.length, 2);
          toClient(Buffer.concat([head, data]));
        });
        reply([xorAddr(A.relayed, address, relay.address().port), mapped, attr(A.lifetime, u32(600))], key);
      });
      return;
    }
    if (type === REFRESH) {
      const lifetime = attrs.get(A.lifetime)?.readUInt32BE(0) ?? 600;
      if (lifetime === 0) { alloc?.relay.close(); allocations.delete(client); }
      return reply([attr(A.lifetime, u32(lifetime))], key);
    }
    if (type === PERMISSION) return reply([], key);
    if (type === CHANNEL_BIND && alloc) {
      const channel = attrs.get(A.channel).readUInt16BE(0);
      const peer = readXorAddr(attrs.get(A.peer));
      alloc.channels.set(channel, peer);
      alloc.byPeer.set(`${peer.address}:${peer.port}`, channel);
      return reply([], key);
    }
  });
  return new Promise((resolve) => sock.bind(0, address, () => resolve({
    url: `turn:${address}:${sock.address().port}?transport=udp`,
    username,
    credential,
    log,
    close: () => new Promise((done) => { for (const a of allocations.values()) a.relay.close(); sock.close(done); }),
  })));
}
