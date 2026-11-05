import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { afterEach, expect, test, vi } from 'vitest';
import simulate from '../bin/commands/simulate.js';
import { CORPUS, summaryOf } from './evidence/corpus.js';
import { loadPack } from '../src/pack/load.js';

afterEach(() => vi.restoreAllMocks());

const valid = new Ajv2020({ strict: true }).compile(JSON.parse(readFileSync('bin/commands/simulate.schema.json', 'utf8')));
const SAMPLE = 'examples/sample-pack';

const run = async (...args) => {
  const out = [];
  const err = [];
  vi.spyOn(console, 'log').mockImplementation((line) => out.push(line));
  vi.spyOn(console, 'error').mockImplementation((line) => err.push(line));
  const code = await simulate(args);
  return { code, out: out.join('\n'), err: err.join('\n') };
};
const json = async (...args) => {
  const r = await run(...args, '--json');
  expect(r.err).toBe('');
  return JSON.parse(r.out);
};
const script = (actions) => {
  const file = join(mkdtempSync(join(tmpdir(), 'ik-simulate-')), 'script.json');
  writeFileSync(file, JSON.stringify(actions));
  return file;
};

// A frontend engineer's practical round: the css pool ticked, two cards asked, one row seen, then Evaluating at moved.
const PRACTICAL = [
  { do: 'start', role: 'frontend-engineer', round: 'practical', candidate: 'Pat Example' },
  { do: 'pools', pools: ['css'] },
  { do: 'open', id: 'css-02', at: '40:00' },
  { do: 'mark', ref: 'css-02#mid.1' },
  { do: 'open', id: 'css-01', at: '45:00' },
  { do: 'level', level: 'senior', at: '47:30' },
];

test('on a saved evidence file, its Copy summary is the one the Decide page copies, and the JSON matches the published schema', async () => {
  const file = `${CORPUS}/v1.1.0.json`;
  const r = await json(file, '--pack', `${CORPUS}/pack`);
  const { model: pack } = await loadPack(`${CORPUS}/pack`);
  expect([r.input, r.summary, r.summary === summaryOf(pack, readFileSync(file, 'utf8')), valid(r)]).toEqual(['evidence', readFileSync(`${CORPUS}/v1.1.0.txt`, 'utf8'), true, true]);
});

test('a script lists the asked cards first, then the pick rule, with each card\'s minutes and their total', async () => {
  const r = await json(script(PRACTICAL), '--pack', SAMPLE);
  const deep = r.run.find((s) => s.kind === 'questions');
  expect([deep.seg, deep.minutes, deep.pools, deep.questions.map((q) => `${q.id} ${q.minutes} ${q.asked}`), deep.questionMinutes])
    .toEqual(['practical/deep-dive', 10, ['css'], ['css-02 5 true', 'css-01 5 true'], 10]);
  expect(valid(r)).toBe(true);
});

test('Look for lays out each card\'s rows by level as its panel does, at the level moved to, with the mark', async () => {
  const r = await json(script(PRACTICAL), '--pack', SAMPLE);
  const css02 = r.lookFor.find((it) => it.id === 'css-02');
  expect([r.focus, css02.groups.map((g) => [g.name, g.folded, g.rows.map((row) => `${row.ref} ${row.key} ${row.mark}`)])]).toEqual([
    { id: 'senior', name: 'Senior' },
    [
      ['Senior', false, ['css-02#senior.1 1 null']],
      ['Mid, to place below the bar', false, ['css-02#mid.1 null seen', 'css-02#mid.2 null null']],
      ['Junior, basics', true, ['css-02#junior.1 null null', 'css-02#junior.2 null null']],
    ],
  ]);
});

test('--at stops after a step or at a time, and the summary reads only what happened by then', async () => {
  const before = await json(script(PRACTICAL), '--pack', SAMPLE, '--at', '3');
  const atTime = await json(script(PRACTICAL), '--pack', SAMPLE, '--at', '46:00');
  expect([before.at, before.focus.id, before.summary.includes('Seen:')]).toEqual([{ step: 3, of: 6, time: '40:00', did: 'open css-02' }, 'mid', false]);
  expect([atTime.at.step, atTime.focus.id, atTime.summary.includes('Seen: Explains specificity')]).toEqual([5, 'mid', true]);
});

test('text output names the step, the questions with their minutes, the rows and the summary', async () => {
  const { code, out } = await run(script(PRACTICAL), '--pack', SAMPLE);
  expect(code).toBe(0);
  expect(out).toContain('At step 6 of 6 (level senior), 47:30 into the interview.');
  expect(out).toContain('    Pools: css. Questions: 10 min of 10.\n    css-02  Specificity clash, 5 min, asked\n    css-01  Center a box, 5 min, asked');
  expect(out).toContain('      [seen] Explains specificity before source order, with this example  (css-02#mid.1)');
  expect(out).toContain('Copy summary\nPat Example\nFrontend engineer, Practical round');
});

test('an action the pack cannot back exits 1 and says how to fix it', async () => {
  const cases = [
    [{ do: 'open', id: 'css-99' }, 'Action 2 (open): no item "css-99" in the pack.'],
    [{ do: 'mark', ref: 'css-01#mid.9' }, 'Action 2 (mark): "css-01" has no row "css-01#mid.9". Its rows: css-01#junior.1, css-01#junior.2, css-01#mid.1, css-01#mid.2, css-01#senior.1.'],
    [{ do: 'pools', pools: ['react'] }, 'Action 2 (pools): pool "react" is not one practical/deep-dive offers. Its pools: css, html.'],
    [{ do: 'tick' }, 'Action 2 (tick): "do" must be one of start, minutes, pools, open, mark, note, level, decide.'],
  ];
  const results = [];
  for (const [action] of cases) {
    const { code, err } = await run(script([PRACTICAL[0], action]), '--pack', SAMPLE);
    results.push([code, err.split('\n')[0].slice(0, cases[results.length][1].length)]);
  }
  expect(results).toEqual(cases.map(([, message]) => [1, message]));
});

test('a usage mistake exits 2 and points at --help; --help exits 0 and documents every action and exit status', async () => {
  const usage = await Promise.all([run('--nope'), run(), run('x.json', '--at')].map(async (p) => { const r = await p; return [r.code, r.err.split('\n')[0]]; }));
  expect(usage).toEqual([
    [2, '--nope is not an option of simulate. Run "interview-kit simulate --help".'],
    [2, 'simulate needs an evidence file or an action script, or - for stdin.'],
    [2, '--at needs a value. Run "interview-kit simulate --help".'],
  ]);
  const help = await run('--help');
  expect([help.code, ...['start', 'minutes', 'pools', 'open', 'mark', 'note', 'level', 'decide'].map((a) => help.out.includes(`{"do": "${a}"`)),
    help.out.includes('Exit status: 0 shown, 1 the input or pack could not be read or simulated, 2 a usage error.')]).toEqual([0, true, true, true, true, true, true, true, true, true]);
});

test('the kit command runs simulate from stdin against KIT_PACK, and --schema prints the published schema', () => {
  const bin = resolve('bin/interview-kit.js');
  const piped = spawnSync(process.execPath, [bin, 'simulate', '-', '--json'], { input: JSON.stringify(PRACTICAL), encoding: 'utf8', env: { ...process.env, KIT_PACK: resolve(SAMPLE) } });
  const schema = spawnSync(process.execPath, [bin, 'simulate', '--schema'], { encoding: 'utf8' });
  expect([piped.status, JSON.parse(piped.stdout).v, schema.status, JSON.parse(schema.stdout).title]).toEqual([0, 1, 0, 'interview-kit simulate --json']);
});
