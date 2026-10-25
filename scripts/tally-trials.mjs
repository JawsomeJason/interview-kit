// Tallies the trials from a folder of pasted Copy summaries: node scripts/tally-trials.mjs <folder> [--close Layout,Header]
// Reads only each Setup line and the trial notes after it (a note's later lines are indented), so candidate names and scores never reach the output.
// The rules come from docs/plans/pick-trials.md.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TRIALS = { Layout: ['A', 'B'], Header: ['A', 'B', 'C', 'D'], Sidebar: ['A', 'B', 'C', 'D'], 'Setup page': ['A', 'B', 'C', 'D'], Theme: ['Default', 'Pack'] };
const ENOUGH = 2;
const GROUPS = 'Layout|Header|Sidebar|Setup page|Theme';
const label = (group) => (group === 'Question layout' ? 'Layout' : group);
// The pack's theme goes by its own name in a summary; the plan treats every non-Default theme as one variant.
const themeVariant = (name) => (name === 'Default' ? 'Default' : 'Pack');

export function parseSummary(text) {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => line.startsWith('Setup: '));
  if (at < 0) return { setup: null, notes: [] };
  const setup = {};
  for (const part of lines[at].slice('Setup: '.length).split(' · ')) {
    const [, group, variant] = part.match(new RegExp(`^(Question layout|${GROUPS}) (.+)$`)) ?? [];
    if (group) setup[label(group)] = label(group) === 'Theme' ? themeVariant(variant) : variant;
  }
  const notes = [];
  for (const line of lines.slice(at + 1)) {
    const [, group, variant, note] = line.match(new RegExp(`^(Question layout|${GROUPS}) (.+?): (.+)$`)) ?? [];
    if (group) notes.push({ group: label(group), variant: label(group) === 'Theme' ? themeVariant(variant) : variant, text: note.trim() });
    // A note's later lines come indented under its first.
    else if (notes.length && line.startsWith('  ')) notes.at(-1).text += `\n${line.slice(2).trimEnd()}`;
  }
  return { setup, notes };
}

export const readFolder = (dir) => readdirSync(dir).filter((file) => /\.(txt|md)$/.test(file)).sort()
  .map((file) => ({ file, ...parseSummary(readFileSync(join(dir, file), 'utf8')) }));

// `close` names the trials the maintainer judged close after two interviews each; they need a third.
export function tally(interviews, close = []) {
  const real = interviews.filter((i) => i.setup);
  return Object.entries(TRIALS).map(([group, names]) => {
    const variants = names.map((variant) => ({
      variant,
      interviews: real.filter((i) => i.setup[group] === variant).length,
      notes: real.flatMap((i) => i.notes.filter((n) => n.group === group && n.variant === variant).map((n) => ({ file: i.file, text: n.text }))),
    }));
    const least = Math.min(...variants.map((v) => v.interviews));
    const need = close.includes(group) ? ENOUGH + 1 : ENOUGH;
    const verdict = least >= need ? 'ready to pick' : least >= ENOUGH ? 'close call: give each variant one more' : 'needs more interviews';
    return { group, variants, verdict };
  });
}

// Each header and each sidebar should run once with each layout.
export function coverage(interviews) {
  const real = interviews.filter((i) => i.setup);
  return Object.fromEntries(['Header', 'Sidebar'].map((group) => [group, TRIALS[group].flatMap((variant) => TRIALS.Layout
    .filter((layout) => !real.some((i) => i.setup[group] === variant && i.setup.Layout === layout))
    .map((layout) => `${variant} with Layout ${layout}`))]));
}

export function render(interviews, close = []) {
  const out = [];
  const skipped = interviews.filter((i) => !i.setup).length;
  out.push(`${interviews.length - skipped} interviews${skipped ? `, ${skipped} skipped for having no Setup line` : ''}`, '');
  for (const { group, variants, verdict } of tally(interviews, close)) {
    out.push(`${group}: ${verdict}`);
    for (const { variant, interviews: n, notes } of variants) {
      out.push(`  ${variant}: ${n} ${n === 1 ? 'interview' : 'interviews'}`, ...notes.map((note) => `    - "${note.text.replaceAll('\n', '\n      ')}" (${note.file})`));
    }
    out.push('');
  }
  out.push('Rotation coverage');
  for (const [group, missing] of Object.entries(coverage(interviews))) out.push(`  ${group}: ${missing.length ? `missing ${missing.join(', ')}` : 'every variant has run with both layouts'}`);
  return out.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const closeAt = args.indexOf('--close');
  const close = closeAt < 0 ? [] : args.splice(closeAt, 2)[1].split(',');
  if (!args[0]) { console.error('Usage: npm run tally -- <folder> [--close Layout,Header]'); process.exit(1); }
  console.log(render(readFolder(args[0]), close));
}
