import { execFile, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, expect, test } from 'vitest';

// Every build runs in one throwaway copy of the app, with the pack inside it and outside any git repo, so the pack's
// paths and the stamp's sha read the same in every build; the date is pinned through the environment.
const root = mkdtempSync(join(tmpdir(), 'ik-plugins-'));
const app = join(root, 'app');
cpSync('.', app, { recursive: true, filter: (src) => !/^(node_modules|\.git|dist)$/.test(src.split('/')[0]) });
symlinkSync(resolve('node_modules'), join(app, 'node_modules'));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_ENV' && !k.startsWith('VITEST')));
const kit = (...args) => [process.execPath, [join(app, 'bin/interview-kit.js'), ...args], { cwd: app, env: { ...env, KIT_BUILD_DATE: '2026-01-01' } }];
const build = async (...args) => {
  const outDir = mkdtempSync(join(root, 'out-'));
  await promisify(execFile)(...kit('build', '--pack', 'examples/sample-pack', '--outDir', outDir, ...args));
  return readFileSync(join(outDir, 'index.html'));
};
const setPack = (json) => writeFileSync(join(app, 'examples/sample-pack/pack.json'), JSON.stringify({ format: 2, ...json }));
const marker = (name) => `__ik_plugin_${name}__`;
const plugins = ['ai', 'popout', 'shortcuts', 'sync', 'tab-timer'];
const gzip = (html) => gzipSync(html, { level: 9 }).length;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

const html = {};
const refused = [];
beforeAll(async () => {
  setPack({});
  [html.full, ...html.without] = await Promise.all([build(), ...plugins.map((name) => build('--without', name))]);
  refused.push(spawnSync(...kit('build', '--pack', 'examples/sample-pack', '--without', 'sync,synk')));
  setPack({ plugins: { popot: false } });
  refused.push(spawnSync(...kit('build', '--pack', 'examples/sample-pack')));
  setPack({ plugins: { sync: false } });
  html.packOff = await build();
  setPack({});
  rmSync(join(app, 'src/plugins/sync'), { recursive: true });
  html.deleted = await build();
}, 120_000);
afterAll(() => rmSync(root, { recursive: true }));

test('the full build carries every plugin, and leaving one out drops its marker and no other', () => {
  const has = (file) => plugins.filter((name) => file.includes(marker(name)));
  expect([readdirSync('src/plugins').sort(), has(html.full), ...html.without.map(has)])
    .toEqual([plugins, plugins, ['popout', 'shortcuts', 'sync', 'tab-timer'], ['ai', 'shortcuts', 'sync', 'tab-timer'], ['ai', 'popout', 'sync', 'tab-timer'],
      ['ai', 'popout', 'shortcuts', 'tab-timer'], ['ai', 'popout', 'shortcuts', 'sync']]);
});

test('--without sync ships no sync code and is byte-identical to a build with src/plugins/sync deleted', () => {
  const noSync = html.without[plugins.indexOf('sync')];
  const syncCode = ['ik2/', 'public.cloud.shiftr.io', marker('sync')];
  expect([syncCode.map((s) => html.full.includes(s)), syncCode.map((s) => noSync.includes(s)), noSync.equals(html.deleted)])
    .toEqual([[true, true, true], [false, false, false], true]);
});

test('pack.json "plugins": { "sync": false } gives the same bytes as --without sync', () => {
  expect(html.packOff.equals(html.without[plugins.indexOf('sync')])).toBe(true);
});

test('sync adds under 40 KB gzipped, and the size table reports each plugin', () => {
  const rows = plugins.map((name, i) => [name, gzip(html.full) - gzip(html.without[i])]);
  console.log(['Plugin sizes, gzipped (full build minus a build without it):', ...rows.map(([name, bytes]) => `  ${name.padEnd(12)} ${kb(bytes)}`), `  sync budget  ${kb(40 * 1024)}`].join('\n'));
  expect(Object.fromEntries(rows).sync).toBeLessThan(40 * 1024);
});

test('an unknown plugin name fails before building, listing the plugins, from --without or from pack.json', () => {
  const list = 'Plugins: ai, popout, shortcuts, sync, tab-timer.';
  expect(refused.map(({ status, stderr }) => [status, String(stderr).trim()])).toEqual([
    [1, `--without synk: no plugin named "synk". ${list}`],
    [1, `examples/sample-pack/pack.json plugins.popot: no plugin named "popot". ${list}`],
  ]);
});
