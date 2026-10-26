// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { ago, budgetErrors, plan, storageFor } from '../capture/lib.js';

test("a scene's state and prefs seed what the app reads", async () => {
  const scene = { state: { round: 'sample', candidate: 'Sam Rivera', ticks: { 'css-01': [0, 2] }, done: ['css-01'], startedAt: ago(12) }, prefs: { tab: 'assess' } };
  for (const [key, value] of Object.entries(storageFor(scene, '0.7.5'))) localStorage.setItem(key, value);
  const { load } = await import('../src/store.js');
  const { getPref } = await import('../src/prefs.js');
  expect([load(), getPref('tab'), getPref('seenVersion')]).toEqual([
    { round: 'sample', candidate: 'Sam Rivera', ticks: { 'css-01': [0, 2] }, done: ['css-01'], startedAt: 1768484880000, deepDive: undefined, notes: undefined },
    'assess', '0.7.5',
  ]);
});

test('a scene with no state leaves the interview unseeded, so the app opens on setup', () => {
  expect(Object.keys(storageFor({}, '0.7.5'))).toEqual(['interview-kit-layout']);
});

test('the plan skips a scene whose hash and files match the manifest and renders the rest', () => {
  const manifest = {
    pick: { hash: 'h1', files: { 'pick.webp': { sha: 's1' } } },
    columns: { hash: 'h2', files: { 'columns.webp': { sha: 's2' } } },
    schemes: { hash: 'h3', files: { 'schemes.webp': { sha: 's3' } } },
  };
  const scenes = [{ id: 'pick' }, { id: 'columns' }, { id: 'schemes' }, { id: 'new-one' }];
  const hashes = { pick: 'h1', columns: 'h2-changed', schemes: 'h3', 'new-one': 'h4' };
  const onDisk = { 'pick.webp': 's1', 'columns.webp': 's2', 'schemes.webp': 'edited by hand' };
  expect(plan(scenes, manifest, hashes, onDisk).map(({ id, action }) => `${id} ${action}`))
    .toEqual(['pick skip', 'columns render', 'schemes render', 'new-one render']);
});

test('a media file over its budget fails with its name, and so does the folder over the total', () => {
  expect(budgetErrors([{ name: 'big.webp', bytes: 41_000 }, { name: 'ok.webp', bytes: 40_000 }, { name: 'clip.mp4', bytes: 360_000 }])).toEqual([
    'big.webp is 41000 bytes, over the 40960-byte budget for an image',
    'clip.mp4 is 360000 bytes, over the 358400-byte budget for a clip',
  ]);
  expect(budgetErrors(Array.from({ length: 7 }, (_, i) => ({ name: `c${i}.mp4`, bytes: 350_000 })))).toEqual([
    'src/media is 2450000 bytes, over the 2097152-byte total budget',
  ]);
});
