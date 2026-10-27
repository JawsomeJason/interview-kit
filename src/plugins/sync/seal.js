// Every relay message is one frame: a fresh 12-byte IV, then AES-GCM of the envelope with the topic as associated
// data, so a frame cannot be replayed onto another topic. The relay sees the topic, the size and the timing.
const utf8 = new TextEncoder();
const text = new TextDecoder();
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
export const b64 = (bytes) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export const unb64 = (s) => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
export const topicOf = async (rawKey) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', rawKey)).slice(0, 16));
export const importKey = (rawKey) => crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);

export async function seal(key, topic, value) {
  const iv = randomBytes(12);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8.encode(topic) }, key, utf8.encode(JSON.stringify(value))));
  const frame = new Uint8Array(12 + sealed.length);
  frame.set(iv);
  frame.set(sealed, 12);
  return frame;
}

export async function open(key, topic, frame) {
  try {
    return JSON.parse(text.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: frame.slice(0, 12), additionalData: utf8.encode(topic) }, key, frame.slice(12))));
  } catch {
    return null;
  }
}
