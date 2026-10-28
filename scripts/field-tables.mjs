// The README's field tables, one per pack file, generated from the schemas so the two cannot drift.
// `node scripts/field-tables.mjs --write` rewrites them in README.md; test/docs.test.js fails when they are stale.
import { readFileSync, writeFileSync } from 'node:fs';

const FILES = [
  ['`pack.json`', 'src/pack/schemas/pack.schema.json'],
  ['`roles/<id>.md`', 'src/pack/schemas/role.schema.json'],
  ['`rounds/<id>.md`', 'src/pack/schemas/round.schema.json'],
  ['`pools/<id>/pool.md`', 'src/kinds/questions/pool.schema.json'],
  ['`pools/<pool>/<id>-<slug>.md`, a question card', 'src/kinds/questions/card.schema.json'],
  ['`exercises/<id>/exercise.md`', 'src/kinds/exercise/exercise.schema.json'],
  ['`scripts/<id>.md`', 'src/kinds/script/script.schema.json'],
];
// Lowered fields that come from a section or a list, not a frontmatter key, by what the author writes.
const AUTHORED = {
  ask: '`## Ask`', brief: '`## Brief`', paste: '`## Paste to the candidate`', run: '`## Run`', fallback: '`## Fallback`', lookFor: '`## Look for`',
  followUps: '`## Follow-ups`', stretch: '`## Stretch`', decisions: '`## Decisions`', about: '`## About`', blocks: '`##` blocks', reviewMd: '`## Review`', segments: '`run:`',
};
const common = JSON.parse(readFileSync('src/pack/schemas/common.schema.json', 'utf8')).$defs;
const KINDS = { string: 'text', integer: 'whole number', number: 'number', boolean: 'true or false', object: 'keys', array: 'list' };

function what(p) {
  if (p.description) return p.description;
  const ref = p.$ref?.split('/').at(-1);
  if (ref) return { id: 'an id', ids: 'a list of ids', text: 'text' }[ref] ?? common[ref]?.description ?? ref;
  if (p.enum) return `one of ${p.enum.join(', ')}`;
  if (p.const !== undefined) return `always ${p.const}`;
  return KINDS[p.type] ?? '';
}

export function fieldTables() {
  return FILES.map(([file, path]) => {
    const schema = JSON.parse(readFileSync(path, 'utf8'));
    const rows = Object.entries(schema.properties).map(([key, p]) => `| ${AUTHORED[key] ?? `\`${key}\``} | ${schema.required?.includes(key) ? 'yes' : ''} | ${what(p).replaceAll('|', '\\|')} |`);
    return `#### ${file}\n\n| Field | Required | What it holds |\n| --- | --- | --- |\n${rows.join('\n')}`;
  }).join('\n\n');
}

const START = '<!-- fields:start -->';
const END = '<!-- fields:end -->';
export const withTables = (readme) => readme.replace(new RegExp(`${START}[\\s\\S]*?${END}`), `${START}\n\n${fieldTables()}\n\n${END}`);

if (process.argv.includes('--write')) writeFileSync('README.md', withTables(readFileSync('README.md', 'utf8')));
