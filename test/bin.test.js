import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';

const bin = resolve('bin/interview-kit.js');
const run = (cwd, ...args) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });

// A caller folder holding a copy of the sample pack whose first card has a title found nowhere else.
const callerWithPack = () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ik-bin-'));
  cpSync('sample-pack', join(cwd, 'my-pack'), { recursive: true });
  const card = join(cwd, 'my-pack/pools/css/css-01-center-a-box.md');
  writeFileSync(card, readFileSync(card, 'utf8').replace('title: "Center a box"', 'title: "Marker card from the bin test"'));
  return cwd;
};

test('build writes dist/index.html into the caller folder from the pack it names, and nothing into the app', () => {
  const cwd = callerWithPack();
  const { status } = run(cwd, 'build', '--pack', 'my-pack');
  const marked = (file) => existsSync(file) && readFileSync(file, 'utf8').includes('Marker card from the bin test');
  expect([status, marked(join(cwd, 'dist/index.html')), marked('dist/index.html')]).toEqual([0, true, false]);
}, 60_000);

test('build refuses an outDir that is the pack or a folder holding it, and leaves the pack alone', () => {
  const cwd = callerWithPack();
  const refused = ['my-pack', '.'].map((outDir) => run(cwd, 'build', '--pack', 'my-pack', '--outDir', outDir))
    .map(({ status, stderr }) => [status, stderr.includes('holds the pack')]);
  expect([refused, existsSync(join(cwd, 'my-pack/pack.json'))]).toEqual([[[1, true], [1, true]], true]);
});

test('refuses a pack.json that is not JSON, is null, or has the format as a string, with a plain message', () => {
  const results = ['{ nope', 'null', '{"format":"1"}'].map((raw) => {
    const cwd = callerWithPack();
    writeFileSync(join(cwd, 'my-pack/pack.json'), raw);
    const { status, stderr } = run(cwd, 'build', '--pack', 'my-pack');
    return [status, stderr.trim().split('\n')[0]];
  });
  expect(results).toEqual([
    [1, 'my-pack/pack.json is not valid JSON. Fix it so it reads like {"format": 1}.'],
    [1, 'my-pack/pack.json has no format, and this kit reads format 1. Update the pack to format 1.'],
    [1, 'my-pack/pack.json has format "1", and this kit reads format 1. Update the pack to format 1.'],
  ]);
}, 60_000);

test('refuses a pack.json with a missing or different format before starting Vite', () => {
  const results = [{}, { format: 999 }].map((json) => {
    const cwd = callerWithPack();
    writeFileSync(join(cwd, 'my-pack/pack.json'), JSON.stringify(json));
    const { status, stderr } = run(cwd, 'build', '--pack', 'my-pack');
    return [status, stderr.trim().split('\n')[0], existsSync(join(cwd, 'dist'))];
  });
  expect(results).toEqual([
    [1, `my-pack/pack.json has no format, and this kit reads format 1. Update the pack to format 1.`, false],
    [1, `my-pack/pack.json has format 999, and this kit reads format 1. Update the pack to format 1.`, false],
  ]);
}, 60_000);
