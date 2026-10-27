import { resolve } from 'node:path';
import { describe, loadPack } from '../../src/pack/load.js';

const USAGE = 'Usage: interview-kit check [--pack <dir>] [--strict]';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// interview-kit check: prints every problem in the pack, file and line first, and exits 1 when any is an error.
export default async function check(args) {
  let dir = '.';
  let strict = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--strict') strict = true;
    else if (args[i] === '--pack' && args[i + 1]) dir = args[++i];
    else if (args[i].startsWith('--pack=')) dir = args[i].slice('--pack='.length);
    else { console.error(`${args[i]} is not an option of check. ${USAGE}`); return 1; }
  }
  const { problems } = await loadPack(resolve(dir), { strict });
  for (const p of problems) console.log(`${describe(p)}\n`);
  const errors = problems.filter((p) => p.level === 'error').length;
  const files = new Set(problems.map((p) => p.file).filter(Boolean)).size;
  console.log(`${plural(errors, 'error')}, ${plural(problems.length - errors, 'note')}${problems.length ? `, in ${plural(files, 'file')}` : ''}.${errors ? ' Fix the errors and run "interview-kit check" again.' : ''}`);
  return errors ? 1 : 0;
}
