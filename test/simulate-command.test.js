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

// A frontend engineer's practical round: the css pool ticked, one card opened, another marked, one row seen, then Evaluating at moved.
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

test('a script lists the asked cards first, then the pick rule, with each card\'s minutes and their total; a card only opened is not yet asked', async () => {
  const r = await json(script(PRACTICAL), '--pack', SAMPLE);
  const deep = r.run.find((s) => s.kind === 'questions');
  expect([deep.seg, deep.minutes, deep.pools, deep.questions.map((q) => `${q.id} ${q.minutes} ${q.asked}`), deep.questionMinutes])
    .toEqual(['practical/deep-dive', 10, ['css'], ['css-02 5 true', 'css-01 5 false'], 10]);
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

test('open shows a card and records nothing; the first mark or note on it records it asked, and a card with no Look for rows never is', async () => {
  const asked = async (...actions) => {
    const r = await json(script([PRACTICAL[0], { do: 'pools', pools: ['css'] }, ...actions]), '--pack', SAMPLE);
    return r.run.flatMap((s) => s.questions ?? []).filter((q) => q.asked).map((q) => q.id);
  };
  expect([
    await asked({ do: 'open', id: 'css-01' }),
    await asked({ do: 'open', id: 'css-01' }, { do: 'mark', ref: 'css-01#mid.1' }),
    await asked({ do: 'note', id: 'css-02', text: 'Strong' }),
    await asked({ do: 'mark', ref: 'css-01#mid.1' }, { do: 'mark', ref: 'css-01#mid.2' }, { do: 'note', id: 'css-01', text: 'x' }),
    await asked({ do: 'note', id: 'intro', text: 'Warm' }),
  ]).toEqual([[], ['css-01'], ['css-02'], ['css-01'], []]);
  const opened = await json(script([PRACTICAL[0], { do: 'open', id: 'css-01' }]), '--pack', SAMPLE);
  expect(opened.at).toEqual({ step: 2, of: 2, time: '0:00', did: 'open css-01' });
});

test('simulate asks on the same gestures and condition as the browser\'s logAsked in src/ui/session.js', () => {
  const source = readFileSync('src/ui/session.js', 'utf8');
  expect(source).toContain("const RECORDS = new Set(['mark', 'prompt', 'note', 'close']);");
  expect(source).toContain("if (seg && byItem.get(id)?.length && !derived().plan.segments[seg]?.asked?.includes(id)) append({ t: 'member', k: 'segment.asked', seg, id, v: true });");
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
  expect(out).toContain('    Pools: css. Questions: 10 min of 10.\n    css-02  Specificity clash, 5 min, asked\n    css-01  Center a box, 5 min\n');
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

test('an action field the action does not take exits 1 and names the fields it does, so a did line never echoes what was not done', async () => {
  const cases = [
    [{ do: 'mark', ref: 'css-02#mid.1', status: 'unseen' }, 'Action 2 (mark): "status" is not a field of mark. Its fields: ref, s, seg, at.'],
    [{ do: 'open', id: 'css-01', pool: 'css' }, 'Action 2 (open): "pool" is not a field of open. Its fields: id, seg, at.'],
    [{ do: 'level', level: 'senior', why: 'x' }, 'Action 2 (level): "why" is not a field of level. Its fields: level, at.'],
    [{ do: 'decide', choice: 'hire', levels: 'senior' }, 'Action 2 (decide): "levels" is not a field of decide. Its fields: choice, level, why, at.'],
  ];
  const got = [];
  for (const [action] of cases) {
    const { code, out, err } = await run(script([PRACTICAL[0], action]), '--pack', SAMPLE);
    got.push([code, out, err]);
  }
  expect(got).toEqual(cases.map(([, message]) => [1, '', message]));
  const start = await run(script([{ ...PRACTICAL[0], team: 'x' }]), '--pack', SAMPLE);
  expect([start.code, start.err]).toEqual([1, 'Action 1 (start): "team" is not a field of start. Its fields: role, round, candidate, at.']);
});

test('a pool that does not fit the minutes is refused with the picker\'s no room rule, and one that fits is ticked', async () => {
  const deep = (...actions) => script([PRACTICAL[0], ...actions]);
  const second = await run(deep({ do: 'pools', pools: ['css', 'html'] }), '--pack', SAMPLE);
  expect([second.code, second.err]).toEqual([1, 'Action 2 (pools): pool "html" has no room in practical/deep-dive at 10 min after css: 12 minutes required to include. Raise the minutes first, or leave the pool out.']);
  const first = await run(deep({ do: 'pools', pools: ['html', 'css'] }), '--pack', SAMPLE);
  expect([first.code, first.err.split('\n')[0]]).toEqual([1, 'Action 2 (pools): pool "css" has no room in practical/deep-dive at 10 min after html: 12 minutes required to include. Raise the minutes first, or leave the pool out.']);
  const later = await run(deep({ do: 'pools', pools: ['css'] }, { do: 'pools', pools: ['css', 'html'] }), '--pack', SAMPLE);
  expect([later.code, later.err.split('\n')[0]]).toEqual([1, 'Action 3 (pools): pool "html" has no room in practical/deep-dive at 10 min after css: 12 minutes required to include. Raise the minutes first, or leave the pool out.']);
  const pools = async (...actions) => (await json(deep(...actions), '--pack', SAMPLE)).run.find((s) => s.kind === 'questions').pools;
  expect([
    await pools({ do: 'minutes', minutes: 12 }, { do: 'pools', pools: ['css', 'html'] }),
    await pools({ do: 'minutes', minutes: 12 }, { do: 'pools', pools: ['css', 'html'] }, { do: 'pools', pools: ['html', 'css'] }),
    // Ticked at 12, then the minutes lowered: the ticks stay, as in the picker, and an unchanged list asks nothing more.
    await pools({ do: 'minutes', minutes: 12 }, { do: 'pools', pools: ['css', 'html'] }, { do: 'minutes', minutes: 10 }, { do: 'pools', pools: ['css', 'html'] }),
    await pools({ do: 'pools', pools: ['css'] }, { do: 'pools', pools: [] }),
  ]).toEqual([['css', 'html'], ['html', 'css'], ['css', 'html'], []]);
});

test('a mark clear needs a mark on the row, as the app only clears a row that has one', async () => {
  const mark = (s) => ({ do: 'mark', ref: 'css-01#mid.1', s });
  const message = (n) => `Action ${n} (mark): "css-01#mid.1" has no mark to clear. Mark it seen or not seen first.`;
  const bare = await run(script([PRACTICAL[0], mark('clear')]), '--pack', SAMPLE);
  const twice = await run(script([PRACTICAL[0], mark('seen'), mark('clear'), mark('clear')]), '--pack', SAMPLE);
  expect([bare.code, bare.err, twice.code, twice.err]).toEqual([1, message(2), 1, message(4)]);
  for (const first of ['seen', 'unseen']) {
    const r = await json(script([PRACTICAL[0], mark(first), mark('clear')]), '--pack', SAMPLE);
    const row = r.lookFor.find((it) => it.id === 'css-01').groups.flatMap((g) => g.rows).find((x) => x.ref === 'css-01#mid.1');
    expect(row.mark).toBe(null);
  }
});

test('a start needs the candidate\'s name, as the start page does, and keeps it trimmed', async () => {
  const { candidate, ...bare } = PRACTICAL[0];
  const message = 'Action 1 (start): the start page needs the candidate\'s name. Add "candidate": "<name>".';
  const refused = [];
  for (const start of [bare, { ...bare, candidate: '' }, { ...bare, candidate: '   ' }]) {
    const r = await run(script([start]), '--pack', SAMPLE);
    refused.push([r.code, r.err]);
  }
  expect(refused).toEqual([[1, message], [1, message], [1, message]]);
  const padded = await json(script([{ ...bare, candidate: '  Pat Example ' }]), '--pack', SAMPLE);
  expect(padded.candidate).toBe('Pat Example');
  const help = await run('--help');
  expect(help.out).toContain('"candidate": "<name>"}');
  expect(help.out).not.toContain('["candidate"');
});

test('--at 0:00 is the state right after the interview opened, also on a file the browser saved, where startedAt is stamped before open', async () => {
  const fromScript = await json(script(PRACTICAL), '--pack', SAMPLE, '--at', '0:00');
  expect([fromScript.at, fromScript.candidate]).toEqual([{ step: 2, of: 6, time: '0:00', did: 'pools [css]' }, 'Pat Example']);
  const file = await json(`${CORPUS}/v1.1.0.json`, '--pack', `${CORPUS}/pack`, '--at', '0:00');
  expect([file.at.step, file.at.time, file.at.did, file.candidate]).toEqual([4, '0:00', 'put session.startedAt "01a1ad9a0bf4"', 'Casey Example']);
  expect(valid(file)).toBe(true);
  const later = await json(`${CORPUS}/v1.1.0.json`, '--pack', `${CORPUS}/pack`, '--at', '0:01');
  expect(later.at.step).toBeGreaterThanOrEqual(file.at.step);
  const step1 = await json(`${CORPUS}/v1.1.0.json`, '--pack', `${CORPUS}/pack`, '--at', '1');
  expect([step1.at.step, step1.at.did, step1.candidate]).toEqual([1, 'open', null]);
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
