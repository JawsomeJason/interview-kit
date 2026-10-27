import { bullets, closedKeys, list, markdown, sections } from '../../pack/doc.js';
import { copyFront, lookFor, matchId, stretch } from '../../pack/lower.js';

const CARD_KEYS = ['id', 'title', 'minutes', 'tier', 'competencies', 'overlaps', 'review'];
const MOVED = 'is set by the folder and pool.md now.\n  Delete this line.';

function pool(doc, ctx, [, id]) {
  const json = { id };
  const lines = {};
  closedKeys(doc, ['name', 'competencies'], 'pool');
  copyFront(doc, ['name', 'competencies'], json, lines);
  if (id === 'all') doc.error(1, 'a pool may not be called "all".\n  Rename the folder: "questions: all" means every pool.');
  const about = markdown(doc.root);
  if (about) json.about = about;
  return { json, lines };
}

function card(doc, ctx, [, poolId, file]) {
  const json = {};
  const lines = {};
  closedKeys(doc, CARD_KEYS, 'card', { pool: MOVED, poolName: MOVED });
  matchId(doc, file, 'card');
  copyFront(doc, CARD_KEYS, json, lines);
  json.pool = poolId;
  const poolFile = ctx.lowered.get(`pools/${poolId}/pool.md`);
  if (!poolFile) doc.error(1, `pool "${poolId}" has no pool.md.\n  Add pools/${poolId}/pool.md with a "name:" line.`);
  const s = sections(doc, ['Ask', 'Look for', 'Follow-ups', 'Stretch', 'Review'], 'card');
  const ask = s.get('Ask');
  if (ask) { json.ask = markdown(ask); lines['/ask'] = ask.line; }
  const defaults = doc.ok && poolFile?.doc.ok !== false ? doc.front.competencies ?? poolFile?.json.competencies ?? [] : null;
  json.lookFor = lookFor(doc, s.get('Look for'), ctx, lines, defaults, { required: true });
  const fu = s.get('Follow-ups');
  json.followUps = [];
  if (fu) {
    lines['/followUps'] = fu.line;
    for (const c of fu.children) doc.error(c.line, `Follow-ups: "${'#'.repeat(c.depth)} ${c.title}" is not read.\n  Follow-ups is one plain list of bullets.`);
    for (const it of bullets(doc, fu.lines, { fix: 'Put it in a bullet starting with "- ", or delete it.' })) {
      lines[`/followUps/${json.followUps.length}`] = it.line;
      json.followUps.push(it.text);
    }
  }
  if (ctx.strict && !json.followUps.length) doc.error(fu?.line ?? 1, 'Follow-ups: a card needs 1 to 4 under --strict.\n  Add one.');
  json.stretch = stretch(doc, s.get('Stretch'), ctx, lines);
  const review = s.get('Review') && markdown(s.get('Review'));
  if (review) { json.reviewMd = review; lines['/reviewMd'] = s.get('Review').line; }
  return { json, lines };
}

export default {
  id: 'questions',
  folder: 'pools',
  files: [
    { name: 'pool', pattern: /^pools\/([^/]+)\/pool\.md$/, schema: 'pool.schema.json', lower: pool },
    { name: 'card', item: true, pattern: /^pools\/([^/]+)\/([^/]+\.md)$/, schema: 'card.schema.json', lower: card },
  ],
  // Cards in pool order, since files arrive sorted by path.
  assemble: (files) => ({ pools: files.filter((f) => f.name === 'pool').map((f) => f.json), cards: files.filter((f) => f.name === 'card').map((f) => f.json) }),
  resolve(lib, ref) {
    const missing = (ref === 'all' ? [] : [ref].flat()).find((p) => !lib.pools.some((x) => x.id === p));
    if (missing !== undefined) return { error: `pool "${missing}" does not exist.\n  Pools in this pack: ${list(lib.pools.map((p) => p.id))}.` };
    return { title: 'Questions' };
  },
};
