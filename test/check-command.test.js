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
  for (const pack of ['sample-pack', 'designer-pack', 'sre-pack']) {
    for (const flags of [[], ['--strict']]) results.push(await run('--pack', `test/fixtures/packs/${pack}`, ...flags));
  }
  expect(results).toEqual(Array(6).fill([0, '0 errors, 0 notes.']));
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
      'scripts/outro.md:10  this line has an em dash.\n  Use a period, comma or colon.\n',
      '2 errors, 0 notes, in 2 files. Fix the errors and run "interview-kit check" again.',
    ].join('\n')],
  ]);
});

test('check refuses an option it does not know', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(await run('--pack', 'test/fixtures/packs/sample-pack', '--strickt')).toEqual([1, '']);
  expect(console.error).toHaveBeenCalledWith('--strickt is not an option of check. Usage: interview-kit check [--pack <dir>] [--strict]');
});
