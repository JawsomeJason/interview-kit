// priv is a non-extractable ECDH key, which IndexedDB stores as it is; a reload rejoins without knocking again.
const request = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

export async function openRooms(packId, { indexedDB = globalThis.indexedDB } = {}) {
  const r = indexedDB.open(`interview-kit:${packId}:sync`, 1);
  r.onupgradeneeded = () => r.result.createObjectStore('rooms', { keyPath: 'sid' });
  const db = await request(r);
  const store = (mode) => db.transaction('rooms', mode).objectStore('rooms');
  return {
    get: (sid) => request(store('readonly').get(sid)).then((room) => room ?? null),
    put: (room) => request(store('readwrite').put(room)),
  };
}
