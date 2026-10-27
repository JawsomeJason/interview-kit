import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrate as run } from '../../scripts/migrate-1-to-2.mjs';

const USAGE = 'Usage: interview-kit migrate --hiring <level> [--role <id> --name "<Role name>"] [--rounds <a,b>] [--pool-competencies <file.json>] [--pack <dir>] [--write]';
const VALUES = ['pack', 'hiring', 'role', 'name', 'rounds', 'pool-competencies'];

const fail = (message) => {
  console.error(message);
  return 1;
};

// interview-kit migrate: moves a format 1 pack to format 2. Without --write it prints the plan and the proof only.
export default async function migrate(args) {
  const opts = { pack: '.', write: false };
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].split(/=(.*)/s);
    const key = flag.slice(2);
    if (flag === '--write') opts.write = true;
    else if (VALUES.includes(key) && (inline ?? args[i + 1]) !== undefined) opts[key] = inline ?? args[++i];
    else return fail(`${args[i]} is not an option of migrate. ${USAGE}`);
  }
  if (!opts.hiring) return fail(`--hiring is required: the level id from ladder.md that every migrated anchor sits at. ${USAGE}`);
  let poolCompetencies;
  if (opts['pool-competencies']) {
    try {
      poolCompetencies = JSON.parse(readFileSync(resolve(opts['pool-competencies']), 'utf8'));
    } catch (e) {
      return fail(`--pool-competencies: ${opts['pool-competencies']} is not a readable JSON file (${e.message}).\n  Write it like { "css": ["craft"], "html": ["craft", "judgment"] }.`);
    }
  }
  const dir = resolve(opts.pack);
  const result = await run(dir, { hiring: opts.hiring, role: opts.role, name: opts.name, rounds: opts.rounds?.split(','), poolCompetencies, write: opts.write });

  if (result.status === 'already') {
    console.log('Already format 2, nothing to do.');
    return 0;
  }
  if (result.status === 'refused') return fail(result.message);
  if (result.status === 'problems') {
    console.log([...result.problems, 'Nothing was written.'].join('\n'));
    return 1;
  }
  const { cards, cardsEqual, removed, added, rounds, notes } = result.proof;
  console.log([
    result.status === 'written' ? 'Migrated to format 2:' : 'Plan for format 2 (nothing written; add --write to apply it):',
    ...result.changes.map(([verb, path]) => `  ${verb.padEnd(6)} ${path}`),
    ...result.notes.map((n) => `Note: ${n}`),
    `Checks: ${cardsEqual} of ${cards} cards read the same. ${removed} lines removed and ${added} added, all expected.${rounds ? ' Round minutes and role rounds match.' : ''} Loads with 0 errors, ${notes} note${notes === 1 ? '' : 's'}.`,
    ...(result.status === 'written' ? [`To undo: run "git restore . && git clean -fd" in ${dir}.`] : []),
  ].join('\n'));
  return 0;
}
