import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import check from '../bin/commands/check.js';

afterEach(() => vi.restoreAllMocks());

const run = async (...args) => {
  const out = [];
  vi.spyOn(console, 'log').mockImplementation((line) => out.push(line));
  const code = await check(args);
  return [code, out.join('\n')];
};

// The sample fixture with one anchor that opens with an avoided verb and one em dash.
const packWithHouseFaults = () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'ik-check-')), 'pack');
  cpSync('test/fixtures/packs/sample-pack', dir, { recursive: true });
  const css = join(dir, 'pools/css/css-04-menu-cut-off-by-its-card.md');
  writeFileSync(css, readFileSync(css, 'utf8').replace('- Moves the menu out', '- Leads the fix for the clipped menu #judgment\n- Moves the menu out'));
  const outro = join(dir, 'scripts/outro.md');
  writeFileSync(outro, readFileSync(outro, 'utf8').replace('then thank them for coming.', 'then thank them — for coming.'));
  return dir;
};

test('check passes the example packs, with and without --strict', async () => {
  const results = [];
  for (const pack of ['examples/sample-pack', 'test/fixtures/packs/sample-pack', 'test/fixtures/packs/designer-pack', 'test/fixtures/packs/sre-pack']) {
    for (const flags of [[], ['--strict']]) results.push(await run('--pack', pack, ...flags));
  }
  expect(results).toEqual(Array(8).fill([0, '0 errors, 0 notes.']));
});

test('check prints each problem with its file and line, marks notes, and fails only on errors', async () => {
  const pack = packWithHouseFaults();
  expect([await run('--pack', pack), await run(`--pack=${pack}`, '--strict')]).toEqual([
    [0, [
      'pools/css/css-04-menu-cut-off-by-its-card.md:29  Look for, mid: starts with "Leads", which a candidate cannot show in an interview.\n  Try proposes, names, compares, asks or explains. (note)\n',
      '0 errors, 1 note, in 1 file.',
    ].join('\n')],
    [1, [
      'pools/css/css-04-menu-cut-off-by-its-card.md:29  Look for, mid: starts with "Leads", which a candidate cannot show in an interview.\n  Try proposes, names, compares, asks or explains.\n',
      'scripts/outro.md:11  this line has an em dash.\n  Use a period, comma or colon.\n',
      '2 errors, 0 notes, in 2 files. Fix the errors and run "interview-kit check" again.',
    ].join('\n')],
  ]);
});

test('check refuses an option it does not know', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await run('--pack', 'test/fixtures/packs/sample-pack', '--strickt')).toEqual([1, '']);
  expect(console.error).toHaveBeenCalledWith('--strickt is not an option of check. Usage: interview-kit check [--pack <dir>] [--strict]');
});

test('interview-kit check runs from a pack repo, before the format gate that dev, build and test keep', () => {
  const cli = (cwd, ...args) => {
    const { status, stdout } = spawnSync(process.execPath, [join(process.cwd(), 'bin/interview-kit.js'), 'check', ...args], { cwd, encoding: 'utf8' });
    return [status, stdout.trim()];
  };
  expect([cli('test/fixtures/packs/sre-pack', '--strict'), cli('.', '--pack', 'test/migrate/packs/sample-pack')]).toEqual([
    [0, '0 errors, 0 notes.'],
    [1, 'pack.json:1  format: this pack is format 1 and this kit reads format 2. Run "interview-kit migrate" to move it.\n\n1 error, 0 notes, in 1 file. Fix the errors and run "interview-kit check" again.'],
  ]);
});
