import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { build } from 'vite';
import { expect, test } from 'vitest';
import { poolQuestions, readPack, redact, report, run, suggest } from '../scripts/suggest-pools.mjs';

const pack = {
  allowResumeToTypeSafe: true,
  pools: [
    { id: 'css', name: 'CSS', titles: ['Grid or flex', 'Sticky header'] },
    { id: 'teamwork', name: 'Teamwork', titles: ['Feedback you acted on'], unranked: true },
    { id: 'react', name: 'React', titles: ['Lifting state up'] },
  ],
};

const resume = [
  'Jane Example',
  'jane.example@mail.com | +1 (415) 555-0123 | linkedin.com/in/jane-example',
  'Senior Frontend Engineer, Acme, 2021 - present',
  'Led the React rewrite of checkout. Call 415.555.0199 or see https://jane.dev for demos.',
].join('\n');

const answer = (score, confidence) => ({ type: 'score', score, confidence, legend: {}, probabilities: {} });

// A real SDK client whose transport is a stub: it records each request body and returns `response`.
const stubClient = (response) => {
  const sent = [];
  const client = new TypeSafeClient({
    apiKey: 'test-key',
    fetch: async (url, init) => {
      sent.push({ url, body: init.body });
      return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  return { client, sent };
};

test('redact strips the name line, emails, phone numbers and links, and keeps roles and dates', () => {
  expect(redact(resume)).toBe([
    '[email] | [phone] | [link]',
    'Senior Frontend Engineer, Acme, 2021 - present',
    'Led the React rewrite of checkout. Call [phone] or see [link] for demos.',
  ].join('\n'));
});

test('redact strips UK and FR numbers without +, a street address, the name in the body and a bare handle', () => {
  expect(redact([
    'Jane Example',
    'Mobile 07700 900123, office 020 7946 0958, Paris 06 12 34 56 78',
    'Lives at 221B Baker Street, London. Also 12 rue de la Paix.',
    'Jane Example mentored four engineers; Jane led the design review. Find me as @jane_dev.',
  ].join('\n'))).toBe([
    'Mobile [phone], office [phone], Paris [phone]',
    'Lives at [address], London. Also [address].',
    '[name] mentored four engineers; [name] led the design review. Find me as [handle].',
  ].join('\n'));
});

const r = (...lines) => redact(lines.join('\n'));

test('redact finds the name in a capitals first line and matches it in any case', () => {
  expect(r('JANE EXAMPLE', 'Jane led the review; example code by JANE.')).toBe('[name] led the review; [name] code by [name].');
});

test('redact takes the name from before a dash, so the title on line 1 stays in the body', () => {
  expect(r('Jane Example - Senior Frontend Engineer', 'Senior Frontend Engineer at Acme; Jane shipped it.'))
    .toBe('Senior Frontend Engineer at Acme; [name] shipped it.');
});

test('redact skips lowercase particles, so French de and la stay', () => {
  expect(r('Ana de la Cruz', 'Ana a construit la page de connexion. Cruz too.')).toBe('[name] a construit la page de connexion. [name] too.');
});

test('redact ignores pronouns in brackets after the name', () => {
  expect(r('Jane Example (she/her)', 'She led the team and her code shipped.')).toBe('She led the team and her code shipped.');
});

test('redact keeps a first line with no name words and guesses nothing', () => {
  expect(r('jane@mail.com | www.jane.dev', 'Senior Engineer at Acme')).toBe('[email] | [link]\nSenior Engineer at Acme');
  expect(r('Curriculum Vitae', 'Senior Engineer at Acme')).toBe('Curriculum Vitae\nSenior Engineer at Acme');
});

test('redact also hides an employer that shares a word with the name, since privacy wins', () => {
  expect(r('Jane Ford', 'Engineer at Ford Motor, 2019 - 2021')).toBe('Engineer at [name] Motor, 2019 - 2021');
});

test('poolQuestions asks one four-level Score per technical pool, keyed by pool id, without unranked pools', () => {
  const qs = poolQuestions(pack.pools);
  expect(Object.keys(qs)).toEqual(['css', 'react']);
  expect(qs.react).toEqual({
    type: 'score',
    instructions: 'How much evidence does the `resume` give that the candidate has done hands-on work in this area? Area: React. Topics this area covers: Lifting state up.',
    criteria: [
      'The resume does not mention this area or any work that would need it.',
      'The resume names this area only in passing, such as a keyword in a skills list, with no role or project that used it.',
      'The resume describes at least one role or project where the candidate did work in this area.',
      'Work in this area is central to the candidate\'s recent roles, with specific results they owned.',
    ],
  });
});

test('suggest orders pools by score then confidence, drops pools under the score cut and marks low confidence unsure', () => {
  const answers = { css: answer(1.9, 0.38), react: answer(2.8, 0.86), node: answer(1.2, 0.9), perf: answer(2.3, 0.61), html: answer(2.3, 0.7) };
  expect(suggest(answers, { scoreCut: 1.5, confCut: 0.5 })).toEqual({
    picks: [
      { id: 'react', score: 2.8, confidence: 0.86, unsure: false },
      { id: 'html', score: 2.3, confidence: 0.7, unsure: false },
      { id: 'perf', score: 2.3, confidence: 0.61, unsure: false },
    ],
    rest: [{ id: 'css', score: 1.9, confidence: 0.38 }, { id: 'node', score: 1.2, confidence: 0.9 }],
  });
  expect(suggest({ css: answer(1.9, 0.38), node: answer(1.2, 0.9) }, { scoreCut: 1.5, confCut: 0.5 }).picks)
    .toEqual([{ id: 'css', score: 1.9, confidence: 0.38, unsure: true }]);
});

test('report prints the picks in tick order, the rest, and the always-available pools', () => {
  const result = { picks: [{ id: 'react', score: 2.8, confidence: 0.86, unsure: false }, { id: 'css', score: 1.9, confidence: 0.38, unsure: true }], rest: [] };
  expect(report(result, pack.pools)).toBe([
    'Tick these on Deep dive, in this order:',
    '  1. react  React  2.8  conf 0.86',
    '  2. css    CSS    1.9  conf 0.38  unsure',
    'Always available: teamwork',
  ].join('\n'));
  expect(report({ picks: [], rest: [{ id: 'css', score: 0.4, confidence: 0.9 }] }, pack.pools)).toBe([
    'Nothing to tick: no pool scored 1.5 or more. Read the resume and pick by hand.',
    'Not suggested: css 0.4',
    'Always available: teamwork',
  ].join('\n'));
});

test('a pack without allowResumeToTypeSafe sends nothing and says how to turn it on', async () => {
  const { client, sent } = stubClient({});
  const out = await run({ pack: { ...pack, allowResumeToTypeSafe: false }, resume, client });
  expect(sent).toEqual([]);
  expect(out.code).toBe(1);
  expect(out.text).toContain('"allowResumeToTypeSafe": true');
});

test('the setting defaults to off: the sample pack is off and a pack that sets it is on', () => {
  expect([readPack('sample-pack').allowResumeToTypeSafe, readPack('test/fixtures/themed-pack').allowResumeToTypeSafe]).toEqual([false, true]);
});

test('pools named in pack.json unrankedPools are marked unranked, and none are by default', () => {
  expect([readPack('sample-pack').pools.map((p) => [p.id, p.unranked]), readPack('test/fixtures/themed-pack').pools.map((p) => [p.id, p.unranked])])
    .toEqual([[['css', false], ['html', false]], [['css', true]]]);
});

test('run sends one request with the redacted resume and the pool questions, then prints the picks', async () => {
  const { client, sent } = stubClient({
    model: 'jev-1.13.0',
    answers: { css: answer(1.9, 0.38), react: answer(2.8, 0.86) },
    usage: { input_tokens: 812, output_tokens: 20 },
  });
  const out = await run({ pack, resume, client });
  expect(sent.map((s) => s.url)).toEqual(['https://api.typesafe.ai/v1/systemone']);
  expect(JSON.parse(sent[0].body)).toEqual({ model: 'jev-latest', state: { resume: redact(resume) }, questions: poolQuestions(pack.pools) });
  expect(out).toEqual({ code: 0, inputTokens: 812, text: report(suggest({ css: answer(1.9, 0.38), react: answer(2.8, 0.86) }), pack.pools) });
});

test('no email or phone number from the resume leaves the machine', async () => {
  const { client, sent } = stubClient({ model: 'jev-1.13.0', answers: {}, usage: { input_tokens: 1, output_tokens: 0 } });
  await run({ pack, resume, client });
  expect(['jane.example@mail.com', '555-0123', '555.0199', 'Jane Example', 'linkedin.com'].filter((s) => sent[0].body.includes(s))).toEqual([]);
});

test('--dry-run prints the exact request and makes no call', async () => {
  const { client, sent } = stubClient({});
  const out = await run({ pack, resume, client, dryRun: true });
  expect(sent).toEqual([]);
  expect(JSON.parse(out.text)).toEqual({ model: 'jev-latest', state: { resume: redact(resume) }, questions: poolQuestions(pack.pools) });
});

test('the built app contains no TypeSafe code', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'ik-build-'));
  const nodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } });
  process.env.NODE_ENV = nodeEnv;
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  expect(['api.typesafe.ai', 'TypeSafeClient', 'TYPESAFE_API_KEY', 'suggest-pools'].filter((s) => html.includes(s))).toEqual([]);
}, 30_000);
