import { b64, open, randomBytes, seal, unb64 } from './seal.js';

const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };
const JOIN = /(?:^|[#&\s])join=([a-z0-9]{1,16})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{22})(?:&from=([^&#\s]*))?/;
const utf8 = new TextEncoder();

export const makeKeys = () => ({ link: randomBytes(16), session: randomBytes(16) });

export async function makePair() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(ECDH, false, ['deriveKey']);
  return { pub: b64(new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))), priv: privateKey };
}

// The inviter's signing key is the room's identity: the link pins its fingerprint, and a member can let someone in
// only with the inviter's signature on their own ECDH key, so a link holder cannot answer a knock.
export async function makeSigner() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey(ECDSA, false, ['sign', 'verify']);
  return { pub: b64(new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))), priv: privateKey };
}
export const fingerprint = async (pub) => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', unb64(pub))).slice(0, 16));
export const sign = async (priv, text) => b64(new Uint8Array(await crypto.subtle.sign(SIGN, priv, utf8.encode(text))));
export async function signedBy(pub, text, sig) {
  try {
    return await crypto.subtle.verify(SIGN, await crypto.subtle.importKey('raw', unb64(pub), ECDSA, false, ['verify']), unb64(sig), utf8.encode(text));
  } catch {
    return false;
  }
}
// Four hex digits of a knock's key, shown on the knocker's screen and beside their knock, to tell two of one name apart by voice.
export const codeOf = async (key) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', unb64(key))).slice(0, 2), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
export const memberText = (sid, key) => `member:${sid}:${key}`;
export const rekeyText = (sid, to, wrapped) => `rekey:${sid}:${to}:${wrapped}`;

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

export const joinFragment = ({ sid, link, fp, from = '' }) => `join=${sid}.${b64(link)}.${fp}${from ? `&from=${encodeURIComponent(from)}` : ''}`;

export function parseJoin(text) {
  const m = JOIN.exec(text.trim());
  if (!m) return null;
  try {
    return { sid: m[1], link: unb64(m[2]), fp: m[3], from: decodeURIComponent(m[4] ?? '') };
  } catch {
    return null;
  }
}
