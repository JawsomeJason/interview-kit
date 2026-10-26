// The parts of the capture run that need no browser: seeding, hashing, the skip plan and the budgets.
import { createHash } from 'node:crypto';

// Every scene runs at this instant (UTC), so clocks, start times and elapsed timers read the same on every run.
export const NOW = Date.UTC(2026, 0, 15, 14, 0, 0);
export const ago = (minutes) => NOW - minutes * 60e3;

// The localStorage the app reads on load. seenVersion matches the build so no What's new dot shows.
export function storageFor({ state, prefs }, version) {
  return {
    ...(state && { 'interview-kit': JSON.stringify(state) }),
    'interview-kit-layout': JSON.stringify({ ...prefs, seenVersion: version }),
  };
}

export const sha = (data) => createHash('sha256').update(data).digest('hex');
export const sceneHash = (scene, sourceHash) => sha(JSON.stringify(scene) + sourceHash).slice(0, 16);

// A scene is skipped when its hash matches the manifest and every file it wrote is still on disk unchanged.
export function plan(scenes, manifest, hashes, onDisk) {
  return scenes.map(({ id }) => {
    const entry = manifest[id];
    const same = entry?.hash === hashes[id] && Object.entries(entry.files).every(([name, f]) => onDisk[name] === f.sha);
    return { id, hash: hashes[id], action: same ? 'skip' : 'render' };
  });
}

export const BUDGET = { image: 40 * 1024, clip: 350 * 1024, total: 2 * 1024 * 1024 };

export function budgetErrors(files) {
  const errors = files.flatMap(({ name, bytes }) => {
    const [kind, max] = name.endsWith('.mp4') ? ['a clip', BUDGET.clip] : ['an image', BUDGET.image];
    return bytes > max ? [`${name} is ${bytes} bytes, over the ${max}-byte budget for ${kind}`] : [];
  });
  const total = files.reduce((sum, f) => sum + f.bytes, 0);
  return total > BUDGET.total ? [...errors, `src/media is ${total} bytes, over the ${BUDGET.total}-byte total budget`] : errors;
}
