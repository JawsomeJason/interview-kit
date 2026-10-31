import { closedKeys, list, markdown, sections } from '../../pack/doc.js';
import { copyFront, coreRows, lookFor, matchId, stretch } from '../../pack/lower.js';

const KEYS = ['id', 'name', 'minutes', 'competencies', 'core', 'coreBelow', 'floor'];
const TEXT = { Brief: 'brief', 'Paste to the candidate': 'paste', Run: 'run', Fallback: 'fallback' };

function exercise(doc, ctx, [, folder]) {
  const json = {};
  const lines = {};
  closedKeys(doc, KEYS, 'exercise');
  matchId(doc, folder, 'folder');
  copyFront(doc, KEYS, json, lines);
  const s = sections(doc, ['Brief', 'Paste to the candidate', 'Run', 'Look for', 'Fallback', 'Stretch'], 'exercise');
  for (const [title, key] of Object.entries(TEXT)) {
    const sec = s.get(title);
    if (sec) { json[key] = markdown(sec); lines[`/${key}`] = sec.line; }
  }
  json.lookFor = lookFor(doc, s.get('Look for'), ctx, lines, doc.ok ? doc.front.competencies ?? [] : null, { required: true });
  coreRows(doc, json.lookFor);
  json.stretch = stretch(doc, s.get('Stretch'), ctx, lines);
  const withFallback = json.lookFor.findIndex((b) => b.fallback !== undefined);
  if (withFallback >= 0 && !s.get('Fallback')) doc.error(lines[`/lookFor/${withFallback}`], 'a finding has a Fallback line but the exercise has no "## Fallback" section.\n  Add the section.');
  return { json, lines };
}

export default {
  id: 'exercise',
  folder: 'exercises',
  holds: 'exercises/<id>/exercise.md',
  files: [{ name: 'exercise', item: true, pattern: /^exercises\/([^/]+)\/exercise\.md$/, schema: 'exercise.schema.json', lower: exercise }],
  assemble: (files) => files.map((f) => f.json),
  resolve(lib, ref) {
    const found = lib.find((e) => e.id === ref);
    return found ? { title: found.name, minutes: found.minutes } : { error: `exercise "${ref}" does not exist.\n  Exercises in this pack: ${list(lib.map((e) => e.id))}.` };
  },
};
