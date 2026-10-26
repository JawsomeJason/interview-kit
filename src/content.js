import { parse } from './frontmatter.js';
import { PACK_FORMAT } from './pack-format.js';

const load = (files) => Object.keys(files).sort().map((path) => parse(files[path]));

const section = (name) => new RegExp(`^## ${name}\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
const [LOOK_FOR, FOLLOW_UPS, REVIEW] = ['Look for', 'Follow-ups', 'Review'].map(section);
const bullets = (body, re) => (body.match(re)?.[1] ?? '').split(/\r?\n/).filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());

// Look for and Follow-ups render as their own lists, so they leave the body and only the Ask remains.
const withSections = (q) => ({
  ...q,
  lookFor: bullets(q.body, LOOK_FOR),
  followUps: bullets(q.body, FOLLOW_UPS),
  // The reviewer's notes on a flagged card; shown in the Needs check alert, never in the card body.
  reviewMd: (q.body.match(REVIEW)?.[1] ?? '').trim(),
  body: q.body.replace(LOOK_FOR, '').replace(FOLLOW_UPS, '').replace(REVIEW, ''),
});

const { format } = Object.values(import.meta.glob('@pack/pack.json', { import: 'default', eager: true }))[0] ?? {};
if (format !== PACK_FORMAT) throw new Error(`Content pack format ${format} does not match the app's format ${PACK_FORMAT}: update the pack, or point KIT_PACK at a pack with a pack.json.`);

export const parseQuestion = (raw) => withSections(parse(raw));
export const questions = load(import.meta.glob('@pack/pools/*/*.md', { query: '?raw', import: 'default', eager: true }))
  .map(withSections);
export const rounds = load(import.meta.glob('@pack/rounds/*.md', { query: '?raw', import: 'default', eager: true }))
  .sort((a, b) => a.order - b.order);
export const pools = Map.groupBy(questions, (q) => q.pool);
export const parts = Object.fromEntries(load(import.meta.glob('@pack/parts/*.md', { query: '?raw', import: 'default', eager: true }))
  .map((p) => [p.id, p]));
