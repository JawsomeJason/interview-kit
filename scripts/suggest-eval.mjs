// Grades pool suggestions against the maintainer's own picks, for the eval in docs/plans/pool-suggestions.md.
// Usage: npm run suggest:eval -- [dir] [--score-cut 1.5] [--conf-cut 0.5] [--refresh]
// <dir> (default resumes/) holds <name>.txt resumes and picks.json: { "<name>.txt": [first, second, third] }.
// Each resume is asked once, with a Score and a Noul per pool and a Choice for the main focus in one request.
// Answers are cached in <dir>/.jev-cache/, so changing the cuts re-grades without new calls.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { choice, noul, TypeSafeClient } from '@typesafe-ai/sdk';
import { area, CUTS, MODEL, poolQuestions, rankedPools, readPack, redact, suggest } from './suggest-pools.mjs';

const prefixed = (prefix, qs) => Object.fromEntries(Object.entries(qs).map(([id, q]) => [`${prefix}${id}`, q]));

export const evalQuestions = (pools) => ({
  ...prefixed('score:', poolQuestions(pools)),
  ...prefixed('noul:', Object.fromEntries(rankedPools(pools).map((p) => [p.id, noul(
    `Does the \`resume\` show that the candidate has done hands-on work in this area? ${area(p)}`,
  )]))),
  main: choice(
    'Which area should be the main focus of a technical deep dive with this candidate, judged by the work the `resume` describes?',
    Object.fromEntries(rankedPools(pools).map((p) => [p.id, area(p)])),
  ),
});

const shape = (answers, prefix) => Object.fromEntries(Object.entries(answers)
  .filter(([k]) => k.startsWith(prefix)).map(([k, a]) => [k.slice(prefix.length), a]));

// Each shape's suggested pools, best first, at most three.
export const rankings = (answers, cuts) => ({
  score: suggest(shape(answers, 'score:'), cuts).picks.map((p) => p.id),
  noul: Object.entries(shape(answers, 'noul:')).filter(([, a]) => a.noul >= 0.5)
    .sort(([, a], [, b]) => b.noul - a.noul).slice(0, 3).map(([id]) => id),
  choice: Object.entries(answers.main.probabilities).sort(([, a], [, b]) => b - a).slice(0, 3).map(([id]) => id),
});

export const grade = (ranked, picks) => ({
  first: ranked[0] === picks[0],
  overlap: ranked.slice(0, 3).filter((id) => picks.slice(0, 3).includes(id)).length,
});

const arg = (args, name, fallback) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : fallback);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const dir = resolve(args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.endsWith('-cut')) ?? 'resumes');
  const cuts = { scoreCut: arg(args, '--score-cut', CUTS.scoreCut), confCut: arg(args, '--conf-cut', CUTS.confCut) };
  const pack = readPack(resolve(process.env.KIT_PACK ?? 'sample-pack'));
  const picksFile = join(dir, 'picks.json');
  if (!existsSync(picksFile)) {
    console.error(`No ${picksFile}. Write your own ordered top 3 for each resume there before running anything.`);
    process.exit(1);
  }
  const picks = JSON.parse(readFileSync(picksFile, 'utf8'));
  const files = readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
  const unpicked = files.filter((f) => !picks[f]?.length);
  if (unpicked.length) {
    console.error(`picks.json has no picks for: ${unpicked.join(', ')}. Add them first, so the answers can't sway them.`);
    process.exit(1);
  }

  const cacheDir = join(dir, '.jev-cache');
  mkdirSync(cacheDir, { recursive: true });
  let client;
  let calls = 0;
  let inputTokens = 0;
  const results = [];
  for (const f of files) {
    const req = { model: MODEL, state: { resume: redact(readFileSync(join(dir, f), 'utf8')) }, questions: evalQuestions(pack.pools) };
    const hash = createHash('sha256').update(JSON.stringify(req)).digest('hex');
    const cacheFile = join(cacheDir, `${f}.json`);
    let cached = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : null;
    if (cached && cached.hash !== hash && !args.includes('--refresh')) {
      console.error(`${f}: the resume or the questions changed since its answers were cached. Rerun with --refresh to ask again.`);
      process.exit(1);
    }
    if (!cached || cached.hash !== hash) {
      if (!pack.allowResumeToTypeSafe) {
        console.error(`${pack.dir}/pack.json does not allow sending resumes to TypeSafe. Add "allowResumeToTypeSafe": true to run the eval.`);
        process.exit(1);
      }
      client ??= new TypeSafeClient();
      const res = await client.systemOne(req);
      calls += 1;
      inputTokens += res.usage?.input_tokens ?? 0;
      cached = { hash, model: res.model, usage: res.usage, answers: res.answers };
      writeFileSync(cacheFile, JSON.stringify(cached, null, 2));
    }
    results.push({ f, model: cached.model, picks: picks[f], ranked: rankings(cached.answers, cuts), answers: cached.answers });
  }

  const n = results.length;
  console.log(`Cuts: score ${cuts.scoreCut}, confidence ${cuts.confCut}. Models: ${[...new Set(results.map((r) => r.model))].join(', ')}.\n`);
  for (const r of results) {
    console.log(`${r.f}\n  Picks:  ${r.picks.join(', ')}`);
    for (const [s, ranked] of Object.entries(r.ranked)) {
      const g = grade(ranked, r.picks);
      console.log(`  ${s.padEnd(6)}  ${ranked.join(', ') || '(none)'}   first ${g.first ? 'yes' : 'no'}, overlap ${g.overlap}/3`);
    }
  }
  console.log('\nShape   first match   overlap >= 2   target   floor');
  for (const s of ['score', 'noul', 'choice']) {
    const gs = results.map((r) => grade(r.ranked[s], r.picks));
    const first = gs.filter((g) => g.first).length;
    const two = gs.filter((g) => g.overlap >= 2).length;
    console.log(`${s.padEnd(6)}  ${`${first}/${n}`.padEnd(12)}  ${`${two}/${n}`.padEnd(13)}  ${first === n && two === n ? 'met ' : 'no  '}     ${two >= 0.8 * n ? 'met' : 'no'}`);
  }

  console.log('\nScore cut sweep (Score shape): cut, first match, overlap >= 2, average pools suggested');
  for (const scoreCut of [1, 1.5, 2, 2.5]) {
    const ranked = results.map((r) => ({ picks: r.picks, ids: rankings(r.answers, { ...cuts, scoreCut }).score }));
    const gs = ranked.map((r) => grade(r.ids, r.picks));
    const avg = ranked.reduce((t, r) => t + r.ids.length, 0) / n;
    console.log(`  ${scoreCut.toFixed(1)}  ${gs.filter((g) => g.first).length}/${n}  ${gs.filter((g) => g.overlap >= 2).length}/${n}  ${avg.toFixed(1)}`);
  }

  // A confidence cut is useful when the Score picks that miss the maintainer's top 3 have lower confidence than the hits.
  const conf = { hit: [], miss: [] };
  for (const r of results) {
    for (const id of r.ranked.score) conf[r.picks.includes(id) ? 'hit' : 'miss'].push(r.answers[`score:${id}`].confidence);
  }
  const fmt = (xs) => (xs.length ? xs.sort((a, b) => a - b).map((x) => x.toFixed(2)).join(' ') : '(none)');
  console.log(`\nConfidence of Score picks in your top 3:     ${fmt(conf.hit)}\nConfidence of Score picks not in your top 3: ${fmt(conf.miss)}`);

  if (calls) {
    console.log(`\n${calls} request(s), ${inputTokens} input tokens.`);
  } else {
    console.log('\nAll answers came from the cache: no requests made.');
  }
}
