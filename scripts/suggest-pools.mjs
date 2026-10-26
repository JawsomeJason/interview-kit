// Suggests which pools to tick on Deep dive from a resume, by asking TypeSafe's Jev for a Score per pool.
// Usage: npm run suggest -- <resume.txt> [--dry-run] [--json]. See docs/plans/pool-suggestions.md.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { score, TypeSafeClient } from '@typesafe-ai/sdk';
import { parse } from '../src/frontmatter.js';

// Pin the versioned id the cut-offs were tuned on, such as jev-1.13.0, once the eval has run.
export const MODEL = 'jev-latest';
// Placeholders until the eval on past resumes sets them.
export const CUTS = { scoreCut: 1.5, confCut: 0.5 };

const CRITERIA = [
  'The resume does not mention this area or any work that would need it.',
  'The resume names this area only in passing, such as a keyword in a skills list, with no role or project that used it.',
  'The resume describes at least one role or project where the candidate did work in this area.',
  'Work in this area is central to the candidate\'s recent roles, with specific results they owned.',
];

const SETTING_OFF = (dir) => `This pack does not allow sending resumes to TypeSafe, so nothing was sent.
To allow it, add "allowResumeToTypeSafe": true to ${join(dir, 'pack.json')}.
--dry-run still shows what would be sent.`;
const NO_KEY = 'TYPESAFE_API_KEY is not set. Export it in your shell (for example in ~/.zshrc), never in a file in this repo.';

// The pack's TypeSafe setting (off unless pack.json says true) and its pools with their question titles.
// pack.json unrankedPools names pools that fit every candidate, such as behavioral ones, so a resume says nothing about them.
export const readPack = (dir) => {
  const { allowResumeToTypeSafe, unrankedPools = [] } = JSON.parse(readFileSync(join(dir, 'pack.json'), 'utf8'));
  const pools = readdirSync(join(dir, 'pools')).sort().map((id) => {
    const qs = readdirSync(join(dir, 'pools', id)).filter((f) => f.endsWith('.md')).sort()
      .map((f) => parse(readFileSync(join(dir, 'pools', id, f), 'utf8')));
    return { id, name: qs[0]?.poolName ?? id, titles: qs.map((q) => q.title), unranked: unrankedPools.includes(id) };
  });
  return { dir, allowResumeToTypeSafe: allowResumeToTypeSafe === true, pools };
};

// Employers, titles and dates stay: "recent" and "central to the role" depend on them.
// The name is line 1 up to the first separator (a comma, bar, bracket, middle dot or spaced dash), with hyphenated names
// split into parts. Capitalised words are the name, so particles like de or la stay; a line with no capitals (all lowercase,
// or a script without case) gives every word. Domains and emails are never name words. Each name word is then hidden
// wherever it appears, even inside an employer name.
const NOT_NAMES = /^(?:curriculum|vitae|resume|résumé|cv)$/i;
const nameWords = (text) => {
  const words = text.match(/^\s*(.*)/)[1].split(/[,|(·]|\s[-–—]\s/)[0].split(/[\s-]+/)
    .filter((w) => w && !/[.@]/.test(w) && !NOT_NAMES.test(w));
  const capitalised = words.filter((w) => /^\p{Lu}[\p{L}'’]*$/u.test(w));
  return capitalised.length ? capitalised : words.flatMap((w) => w.match(/\p{L}{2,}/gu) ?? []);
};
// A number then a time unit ("30 Minutes Each Way") is a duration, not a street.
const STREET_WORD = String.raw`(?!(?:minutes?|hours?|days?|weeks?|months?|years?)\b)\p{L}[\p{L}'-]*`;
const STREET_EN = String.raw`\b\d+[a-z]?,?\s+(?:${STREET_WORD}\s+){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Boulevard|Blvd|Way|Court|Ct|Place|Pl|Close|Crescent|Square|Gardens|Terrace|Mews|Row|Hill|Grove|Parkway)\b`;
const STREET_FR = String.raw`\b\d+(?:\s+(?:bis|ter))?,?\s+(?:rue|avenue|boulevard|bd|place|chemin|allée|impasse)(?:\s+[\p{L}'-]+){1,4}`;
const STREET = new RegExp(`${STREET_EN}|${STREET_FR}`, 'giu');
// UK postcode, French postcode before a capitalised city, US ZIP after a two-letter state.
const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s+\d[A-Z]{2}\b|\b\d{5}(?=\s+\p{Lu})|(?<=\b[A-Z]{2}\s)\d{5}(?:-\d{4})?\b/gu;

export const redact = (text) => {
  const words = nameWords(text);
  const name = words.length && new RegExp(`(?<![\\p{L}\\[])(?:${words.join('|')})(?:[\\s-]+(?:${words.join('|')}))*(?!\\p{L})`, 'giu');
  const body = text.replace(/^\s*\S.*(\r?\n|$)/, '')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/(?<![\w@])@(?!(?:media|container|layer|supports|import|font-face|keyframes)\b)[\w.-]*\w(?![\w.-]*\/)/g, '[handle]')
    .replace(/\bhttps?:\/\/[^\s)]*[^\s).,;]|\b(?:www\.)?[\w-]+(?:\.[\w-]+)*\.(?:com|dev|io|net|org|me|co|app|ai|tech|xyz)\b(?:\/[^\s)]*[^\s).,;])?/gi, '[link]')
    .replace(/(?:\+|\b00)\d[\d\s().-]{7,}\d|\(0\d{2,4}\)\s?\d{3,4}[\s.-]?\d{3,4}\b|\b(?:44|33)[\s.-]\d(?:[\s.-]?\d){8,9}\b|(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b|\b0\d(?:[\s.-]?\d){8,9}\b|\b\d{10}\b/g, '[phone]')
    .replace(STREET, '[address]')
    .replace(POSTCODE, '[postcode]');
  return name ? body.replace(name, '[name]') : body;
};

export const area = (p) => `Area: ${p.name}. Topics this area covers: ${p.titles.join('; ')}.`;
export const rankedPools = (pools) => pools.filter((p) => !p.unranked);

export const poolQuestions = (pools) => Object.fromEntries(rankedPools(pools).map((p) => [p.id, score(
  `How much evidence does the \`resume\` give that the candidate has done hands-on work in this area? ${area(p)}`,
  CRITERIA,
)]));

// Up to three pools at or above the score cut, best first; the first is the main focus (ADR 004).
export const suggest = (answers, { scoreCut, confCut } = CUTS) => {
  const ranked = Object.entries(answers).map(([id, a]) => ({ id, score: a.score, confidence: a.confidence }))
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);
  const picks = ranked.filter((r) => r.score >= scoreCut).slice(0, 3);
  return {
    picks: picks.map((r) => ({ ...r, unsure: r.confidence < confCut })),
    rest: ranked.filter((r) => !picks.includes(r)),
  };
};

export const report = ({ picks, rest }, pools) => {
  const name = (id) => pools.find((p) => p.id === id)?.name ?? id;
  const idW = Math.max(...picks.map((p) => p.id.length));
  const nameW = Math.max(...picks.map((p) => name(p.id).length));
  const always = pools.filter((p) => p.unranked).map((p) => p.id);
  return [
    ...(picks.length
      ? ['Tick these on Deep dive, in this order:', ...picks.map((p, i) => `  ${i + 1}. ${p.id.padEnd(idW)}  ${name(p.id).padEnd(nameW)}  ${p.score.toFixed(1)}  conf ${p.confidence.toFixed(2)}${p.unsure ? '  unsure' : ''}`)]
      : [`Nothing to tick: no pool scored ${CUTS.scoreCut} or more. Read the resume and pick by hand.`]),
    ...(rest.length ? [`Not suggested: ${rest.map((r) => `${r.id} ${r.score.toFixed(1)}`).join(', ')}`] : []),
    ...(always.length ? [`Always available: ${always.join(', ')}`] : []),
  ].join('\n');
};

export const request = (pack, resume) => ({ model: MODEL, state: { resume: redact(resume) }, questions: poolQuestions(pack.pools) });

export const run = async ({ pack, resume, client, dryRun = false, json = false }) => {
  const req = request(pack, resume);
  if (dryRun) return { code: 0, text: JSON.stringify(req, null, 2) + (pack.allowResumeToTypeSafe ? '' : `\n\n${SETTING_OFF(pack.dir ?? 'pack')}`) };
  if (!pack.allowResumeToTypeSafe) return { code: 1, text: SETTING_OFF(pack.dir ?? 'pack') };
  if (!client && !process.env.TYPESAFE_API_KEY) return { code: 1, text: NO_KEY };
  const res = await (client ?? new TypeSafeClient()).systemOne(req);
  const inputTokens = res.usage?.input_tokens ?? 0;
  return { code: 0, inputTokens, text: json ? JSON.stringify(res, null, 2) : report(suggest(res.answers), pack.pools) };
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: npm run suggest -- <resume.txt> [--dry-run] [--json]');
    process.exit(1);
  }
  const out = await run({
    pack: readPack(resolve(process.env.KIT_PACK ?? 'sample-pack')),
    resume: readFileSync(file, 'utf8'),
    dryRun: args.includes('--dry-run'),
    json: args.includes('--json'),
  });
  (out.code ? console.error : console.log)(out.text);
  if (out.inputTokens !== undefined) console.error(`\n1 request, ${out.inputTokens} input tokens.`);
  process.exit(out.code);
}
