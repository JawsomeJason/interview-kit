// Lists review answers not yet applied, by kind. An answer is handled once its subject is gone, or its latest line is
// marked done: a card once it no longer has `review: needs-check`, a Help entry once HELP.md drops its guess markers,
// a question once it leaves the pack's .review/questions.json.
//   npm run review:pending                       print what is left
//   npm run review:pending -- --done ID          record that card ID's answer was applied
//   npm run review:pending -- --done help:ID     the same for a Help entry or a question (question:ID)
import { appendFileSync, existsSync, globSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { helpGuesses } from '../src/dev/review/guesses.js';

// Card lines predate kinds and carry none.
const keyOf = (line) => `${line.kind ?? 'card'}:${line.id}`;

export const readFeedback = (file) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

// `open` holds the kind:id keys whose subject is still waiting on an answer.
export function pending(lines, open) {
  const latest = new Map();
  for (const line of lines) latest.set(keyOf(line), line);
  return [...latest.values()].filter((line) => open.has(keyOf(line)) && !line.done);
}

const flaggedIds = (pack) => globSync(`${pack}/pools/*/*.md`).map((f) => readFileSync(f, 'utf8'))
  .filter((text) => /^review:\s*needs-check\s*$/m.test(text)).map((text) => text.match(/^id:\s*(\S+)/m)[1]);

const KINDS = { card: 'Cards', help: 'Help', question: 'Questions' };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pack = resolve(process.env.KIT_PACK ?? 'sample-pack');
  const file = resolve(pack, '.review/feedback.jsonl');
  const done = process.argv.indexOf('--done');
  if (done > -1) {
    const [kind, id] = process.argv[done + 1].includes(':') ? process.argv[done + 1].split(':') : ['card', process.argv[done + 1]];
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ kind, id, done: true, at: new Date().toISOString() })}\n`);
    console.log(`Marked ${kind} ${id} done.`);
  } else {
    const questions = resolve(pack, '.review/questions.json');
    const open = new Set([
      ...flaggedIds(pack).map((id) => `card:${id}`),
      ...[...helpGuesses(readFileSync('HELP.md', 'utf8')).keys()].map((id) => `help:${id}`),
      ...(existsSync(questions) ? JSON.parse(readFileSync(questions, 'utf8')) : []).map((q) => `question:${q.id}`),
    ]);
    const left = pending(readFeedback(file), open);
    if (!left.length) console.log('Nothing pending.');
    for (const [kind, heading] of Object.entries(KINDS)) {
      const lines = left.filter((l) => (l.kind ?? 'card') === kind);
      if (!lines.length) continue;
      console.log(heading);
      for (const l of lines) {
        const notes = l.notes ?? l.text;
        console.log(`  ${l.id}  ${l.choice ?? '(no choice)'}${notes ? `: ${notes}` : ''}  (${l.at})`);
      }
    }
  }
}
