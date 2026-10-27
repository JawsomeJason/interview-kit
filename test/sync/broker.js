import { WebSocketServer } from 'ws';
import { parsePackets, publishOf, publishPacket } from '../../src/plugins/sync/link-relay.js';

const topicsOf = (body) => {
  const topics = [];
  for (let i = 2; i < body.length;) {
    const len = (body[i] << 8) | body[i + 1];
    topics.push(Buffer.from(body.slice(i + 2, i + 2 + len)).toString());
    i += 3 + len;
  }
  return topics;
};

export function startBroker() {
  const server = new WebSocketServer({ port: 0, handleProtocols: () => 'mqtt' });
  const clients = new Map();
  const log = [];
  server.on('connection', (ws) => {
    const subs = new Set();
    clients.set(ws, subs);
    ws.on('message', (data) => {
      for (const p of parsePackets(new Uint8Array(data))) {
        if (p.type === 1) ws.send(Uint8Array.from([0x20, 2, 0, 0]));
        else if (p.type === 8) { for (const t of topicsOf(p.body)) subs.add(t); ws.send(Uint8Array.from([0x90, 3, p.body[0], p.body[1], 0])); }
        else if (p.type === 3) {
          const { topic, payload } = publishOf(p);
          log.push({ topic, payload });
          for (const [c, s] of clients) if (s.has(topic) && c.readyState === c.OPEN) c.send(publishPacket(topic, payload));
        } else if (p.type === 12) ws.send(Uint8Array.from([0xd0, 0]));
        else if (p.type === 14) ws.close();
      }
    });
    ws.on('close', () => clients.delete(ws));
  });
  return new Promise((resolve) => server.on('listening', () => resolve({
    url: `ws://127.0.0.1:${server.address().port}`,
    log,
    clients: () => clients.size,
    drop: () => { for (const c of clients.keys()) c.terminate(); },
    close: () => new Promise((done) => { for (const c of clients.keys()) c.terminate(); server.close(done); }),
  })));
}
