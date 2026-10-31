import { closedKeys, list, markdown, sections } from '../../pack/doc.js';
import { copyFront, lookFor, matchId } from '../../pack/lower.js';

const KEYS = ['id', 'name', 'minutes', 'competencies', 'frame'];

// Every "##" section is a block on the Run panel, except Look for, which is the same grammar as on a card.
function script(doc, ctx, [, stem]) {
  const json = {};
  const lines = {};
  closedKeys(doc, KEYS, 'script');
  matchId(doc, stem, 'file');
  copyFront(doc, KEYS, json, lines);
  const s = sections(doc, null, 'script');
  json.blocks = [];
  for (const sec of s.all.filter((x) => x.title.toLowerCase() !== 'look for')) {
    lines[`/blocks/${json.blocks.length}`] = sec.line;
    json.blocks.push({ title: sec.title, md: markdown(sec), ...(sec.title.toLowerCase() === 'paste to the candidate' && { copy: true }) });
  }
  if (s.get('Look for')) json.lookFor = lookFor(doc, s.get('Look for'), ctx, lines, doc.ok ? doc.front.competencies ?? [] : null);
  return { json, lines };
}

export default {
  id: 'script',
  folder: 'scripts',
  holds: 'scripts/<id>.md',
  files: [{ name: 'script', item: true, pattern: /^scripts\/([^/]+)\.md$/, schema: 'script.schema.json', lower: script }],
  assemble: (files) => files.map((f) => f.json),
  resolve(lib, ref) {
    const found = lib.find((s) => s.id === ref);
    return found ? { title: found.name, minutes: found.minutes, frame: found.frame } : { error: `script "${ref}" does not exist.\n  Scripts in this pack: ${list(lib.map((s) => s.id))}.` };
  },
};
