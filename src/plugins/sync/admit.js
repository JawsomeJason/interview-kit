import { b64, open, randomBytes, seal, unb64 } from './seal.js';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const JOIN = /(?:^|[#&\s])join=([a-z0-9]{1,16})\.([A-Za-z0-9_-]{22})(?:&from=([^&#\s]*))?/;

export const makeKeys = () => ({ link: randomBytes(16), session: randomBytes(16) });

export async function makePair() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(ECDH, false, ['deriveKey']);
  return { pub: b64(new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))), priv: privateKey };
}

const shared = async (priv, theirPub) => crypto.subtle.deriveKey({ name: 'ECDH', public: await crypto.subtle.importKey('raw', unb64(theirPub), ECDH, false, []) },
  priv, { name: 'AES-GCM', length: 128 }, false, ['encrypt', 'decrypt']);

export async function wrap(priv, theirPub, sid, { link, session, role, round }) {
  return b64(await seal(await shared(priv, theirPub), `grant:${sid}`, { link: b64(link), session: b64(session), role, round }));
}

export async function unwrap(priv, theirPub, sid, wrapped) {
  try {
    const grant = await open(await shared(priv, theirPub), `grant:${sid}`, unb64(wrapped));
    return grant && { link: unb64(grant.link), session: unb64(grant.session), role: grant.role, round: grant.round };
  } catch {
    return null;
  }
}

export const joinFragment = ({ sid, link, from = '' }) => `join=${sid}.${b64(link)}${from ? `&from=${encodeURIComponent(from)}` : ''}`;

export function parseJoin(text) {
  const m = JOIN.exec(text.trim());
  if (!m) return null;
  try {
    return { sid: m[1], link: unb64(m[2]), from: decodeURIComponent(m[3] ?? '') };
  } catch {
    return null;
  }
}
