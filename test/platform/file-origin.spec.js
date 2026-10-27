import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// Needs the three browsers and a build, so `npm run test:platform` sets IK_PLATFORM and `npm test` skips it.
const dir = mkdtempSync(join(tmpdir(), 'ik-platform-'));
const kit = (folder, file) => pathToFileURL(join(dir, folder, file)).href;

beforeAll(() => {
  if (!process.env.IK_PLATFORM) return;
  execFileSync('npx', ['vite', 'build', '--outDir', join(dir, 'kit-a'), '--emptyOutDir'], { env: { ...process.env, KIT_PACK: 'sample-pack' }, stdio: 'ignore' });
  mkdirSync(join(dir, 'kit-b'));
  cpSync(join(dir, 'kit-a', 'index.html'), join(dir, 'kit-b', 'index.html'));
  cpSync(join(dir, 'kit-a', 'index.html'), join(dir, 'kit-a', 'renamed.html'));
}, 120_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const features = async () => {
  const done = {};
  done.indexedDB = await new Promise((resolve) => {
    const req = indexedDB.open('ik-probe', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('log', { autoIncrement: true });
    req.onerror = () => resolve(`error: ${req.error?.name}`);
    req.onsuccess = () => {
      const tx = req.result.transaction('log', 'readwrite');
      tx.objectStore('log').add({ n: 0 });
      tx.oncomplete = () => resolve('write ok');
      tx.onerror = () => resolve(`tx error: ${tx.error?.name}`);
    };
  });
  done.webLocks = navigator.locks ? await navigator.locks.request('ik-probe', { ifAvailable: true }, (l) => (l ? 'granted' : 'busy')) : 'missing';
  try {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 128 }, true, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('hello'));
    done.aesGcm = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, sealed)) === 'hello' ? 'round trip ok' : 'mismatch';
  } catch (e) { done.aesGcm = `fails: ${e.name ?? e}`; }
  try {
    const ecdh = { name: 'ECDH', namedCurve: 'P-256' };
    const mine = await crypto.subtle.generateKey(ecdh, false, ['deriveKey']);
    const theirs = await crypto.subtle.generateKey(ecdh, false, ['deriveKey']);
    const wrapKey = (priv, pub) => crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, priv, { name: 'AES-GCM', length: 128 }, false, ['encrypt', 'decrypt']);
    const room = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await wrapKey(mine.privateKey, theirs.publicKey), room);
    const unwrapped = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await wrapKey(theirs.privateKey, mine.publicKey), wrapped));
    const stored = await new Promise((resolve) => {
      const req = indexedDB.open('ik-probe-keys', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('keys');
      req.onerror = () => resolve(`error: ${req.error?.name}`);
      req.onsuccess = () => {
        const tx = req.result.transaction('keys', 'readwrite');
        tx.objectStore('keys').put(mine.privateKey, 'me');
        tx.oncomplete = () => resolve('stored');
        tx.onerror = () => resolve(`tx error: ${tx.error?.name}`);
      };
    });
    done.ecdhAdmit = unwrapped.every((x, i) => x === room[i]) ? `unwrap ok, private key ${stored}` : 'mismatch';
  } catch (e) { done.ecdhAdmit = `fails: ${e.name ?? e}`; }
  done.rtc = typeof RTCPeerConnection === 'function' ? 'present' : 'missing';
  done.webSocket = typeof WebSocket === 'function' ? 'present' : 'missing';
  return done;
};

const keySurvivesReload = () => new Promise((resolve) => {
  const req = indexedDB.open('ik-probe-keys', 1);
  req.onerror = () => resolve(`error: ${req.error?.name}`);
  req.onsuccess = () => {
    const got = req.result.transaction('keys').objectStore('keys').get('me');
    got.onsuccess = async () => {
      const key = got.result;
      if (!key) return resolve('missing');
      try {
        const peer = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey'])).publicKey;
        await crypto.subtle.deriveKey({ name: 'ECDH', public: peer }, key, { name: 'AES-GCM', length: 128 }, false, ['encrypt']);
        resolve(`derives, extractable ${key.extractable}`);
      } catch (e) { resolve(`fails: ${e.name ?? e}`); }
    };
    got.onerror = () => resolve(`error: ${got.error?.name}`);
  };
});

const writeKitRecord = () => new Promise((resolve) => {
  const req = indexedDB.open('interview-kit', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('sessions');
  req.onsuccess = () => {
    const tx = req.result.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').put('from the first kit', 'k');
    tx.oncomplete = () => resolve();
  };
});

const holdLock = () => new Promise((held) => navigator.locks.request('interview-kit:sid1:a1', () => { held(); return new Promise((release) => { window.__release = release; }); }));

const sharing = async () => ({
  record: await new Promise((resolve) => {
    const req = indexedDB.open('interview-kit');
    req.onerror = () => resolve(`error: ${req.error?.name}`);
    req.onsuccess = () => {
      if (!req.result.objectStoreNames.contains('sessions')) return resolve(null);
      const got = req.result.transaction('sessions').objectStore('sessions').get('k');
      got.onsuccess = () => resolve(got.result ?? null);
    };
  }),
  lockOfFirstKit: await navigator.locks.request('interview-kit:sid1:a1', { ifAvailable: true }, (l) => (l ? 'free' : 'busy')),
  lockOfAnotherPack: await navigator.locks.request('interview-kit:other-pack:sid1:a1', { ifAvailable: true }, (l) => (l ? 'free' : 'busy')),
});

const measure = async (type, args = []) => {
  const browser = await type.launch({ args });
  const context = await browser.newContext();
  const first = await context.newPage();
  await first.goto(kit('kit-a', 'index.html'));
  const out = { features: await first.evaluate(features) };
  await first.reload();
  out.keyAfterReload = await first.evaluate(keySurvivesReload);
  await first.evaluate(writeKitRecord);
  await first.evaluate(holdLock);
  const other = await context.newPage();
  await other.goto(kit('kit-b', 'index.html'));
  out.otherFolder = await other.evaluate(sharing);
  const renamed = await context.newPage();
  await renamed.goto(kit('kit-a', 'renamed.html'));
  out.renamedFile = await renamed.evaluate(sharing);
  await first.evaluate(() => window.__release());
  await browser.close();
  return out;
};

const works = {
  features: { indexedDB: 'write ok', webLocks: 'granted', aesGcm: 'round trip ok', ecdhAdmit: 'unwrap ok, private key stored', rtc: 'present', webSocket: 'present' },
  keyAfterReload: 'derives, extractable false',
};
const shared = { record: 'from the first kit', lockOfFirstKit: 'busy', lockOfAnotherPack: 'free' };

const expected = {
  chromium: { ...works, otherFolder: shared, renamedFile: shared },
  firefox: { ...works, otherFolder: shared, renamedFile: shared },
  webkit: { ...works, otherFolder: shared, renamedFile: shared },
};

describe.skipIf(!process.env.IK_PLATFORM)('a built kit opened from file://', () => {
  test.each([
    ['chromium', chromium, ['--mute-audio']],
    ['firefox', firefox, []],
    ['webkit', webkit, []],
  ])('%s has what the design leans on, and shares or isolates storage as measured', async (name, type, args) => {
    expect(await measure(type, args)).toEqual(expected[name]);
  }, 60_000);
});
