import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { describe, earlierId, idFor, loadPack, PACK_PATHS } from '../src/pack/load.js';

// A frozen copy of src/frontmatter.js as v0.10.0 shipped it, so check 4 compares against the format 1 reading after
// the app's own copy is gone.
function parseV1(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const data = { body: m ? raw.slice(m[0].length) : raw };
  for (const line of m ? m[1].split(/\r?\n/) : []) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const v = line.slice(i + 1).trim();
    const quoted = v.match(/^"(?:[^"\\]|\\.)*"/);
    const plain = v.replace(/\s+#.*/, '');
    data[line.slice(0, i).trim()] = quoted || plain.startsWith('[') ? JSON.parse(quoted?.[0] ?? plain) : /^\d+$/.test(plain) ? Number(plain) : plain;
  }
  return data;
}

// v0.10.0's src/content.js reading of a card's sections.
const sectionRe = (name) => new RegExp(`^## ${name}\\r?\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
const bullets = (body, name) => (body.match(sectionRe(name))?.[1] ?? '').split(/\r?\n/).filter((l) => l.startsWith('- ')).map((l) => l.slice(2).trim());
const askV1 = (body) => ['Look for', 'Follow-ups', 'Review'].reduce((b, name) => b.replace(sectionRe(name), ''), body).replace(/^## Ask\r?\n/m, '').trim();

const read = (...p) => readFileSync(join(...p), 'utf8');
const mdFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).sort() : []);
const lines = (text) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const tally = (xs) => xs.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());

const formatOf = (dir) => {
  try {
    return JSON.parse(read(dir, 'pack.json')).format;
  } catch {
    return undefined;
  }
};

// Format 1 had no pack id. The one written is what a format 2 pack with the migrated role would have defaulted to.
const withId = (text, id) => (JSON.parse(text).id === undefined ? text.replace(/"format":\s*2/, `"format": 2, "id": "${id}"`) : text);
const format2 = (text, role) => withId(text.replace(/"format":\s*1/, '"format": 2'), idFor(role ? [role] : []));

const REMOVED = { rounds: /^(order|minutes|deepDiveMinutes):\s*\d+(\s+#.*)?$/, pools: /^(pool|poolName):/ };
const added = (hiring) => [
  new RegExp(`^### ${hiring}$`), /^run:$/, /^- script: [a-z0-9-]+$/, /^- questions: all$/, /^title: Deep dive$/,
  /^minutes: \d+$/, /^---$/, /^(id|name): .+$/, /^competencies: \[[a-z0-9, -]+\]$/,
];

// Every format 2 file in memory, each tied to the format 1 files it came from. Nothing on disk changes.
function plan(dir, { hiring, role, name, rounds: roundList, poolCompetencies = {} }) {
  const files = new Map();
  const sources = new Map();
  const notes = [];
  const problems = [];
  const put = (path, text, from) => {
    files.set(path, text);
    if (from) sources.set(from, { text: read(dir, from), outputs: [...(sources.get(from)?.outputs ?? []), path] });
  };
  const LOOK = /^## Look for\r?\n(?:\r?\n)?/m;
  const withLevel = (text) => text.replace(LOOK, (h) => `${/\n\r?\n$/.test(h) ? h : `${h}\n`}### ${hiring}\n\n`);

  const cards = [];
  const poolNames = new Map();
  const poolDirs = existsSync(join(dir, 'pools')) ? readdirSync(join(dir, 'pools'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
  for (const pool of poolDirs) {
    for (const f of mdFiles(join(dir, 'pools', pool))) {
      const path = `pools/${pool}/${f}`;
      const old = read(dir, path);
      const front = old.match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0] ?? '';
      const written = front.match(/^poolName:(.*)$/m)?.[1].trim();
      if (written || !poolNames.has(pool)) poolNames.set(pool, written);
      if (!LOOK.test(old)) problems.push(`${path}: has no "## Look for" section, so there is nowhere to put "### ${hiring}".`);
      cards.push({ path, pool, old });
      put(path, withLevel(old.replace(front, front.replace(/^(pool|poolName):.*\r?\n/gm, ''))), path);
    }
  }
  for (const id of Object.keys(poolCompetencies)) {
    if (!poolNames.has(id)) problems.push(`--pool-competencies: "${id}" is not a pool in this pack. Pools: ${[...poolNames.keys()].join(', ')}.`);
  }
  for (const [pool, written] of poolNames) {
    if (!written) notes.push(`no card in pools/${pool} has poolName, so pool.md names it "${pool}".`);
    const comp = poolCompetencies[pool] ? `competencies: [${poolCompetencies[pool].join(', ')}]\n` : '';
    put(`pools/${pool}/pool.md`, `---\nname: ${written ?? pool}\n${comp}---\n`);
  }

  const parts = Object.fromEntries(mdFiles(join(dir, 'parts')).map((f) => [f.slice(0, -3), read(dir, 'parts', f)]));
  for (const id of Object.keys(parts)) put(`scripts/${id}.md`, parts[id], `parts/${id}.md`);
  const partMinutes = (id) => (parts[id] ? parseV1(parts[id]).minutes : 0);

  const keyLine = (raw, key) => raw.match(new RegExp(`^${key}:.*$`, 'm'))[0];
  const rounds = mdFiles(join(dir, 'rounds')).map((f) => {
    const old = read(dir, 'rounds', f);
    const data = parseV1(old);
    return { path: `rounds/${f}`, old, data, own: data.minutes - partMinutes('intro') - partMinutes('outro') - data.deepDiveMinutes };
  });
  for (const r of rounds) {
    const { id, minutes, deepDiveMinutes, body } = r.data;
    if (r.own < 0) {
      problems.push(`${r.path}: ${minutes} minutes less intro (${partMinutes('intro')}), outro (${partMinutes('outro')}) and Deep dive (${deepDiveMinutes}) leaves ${r.own} minutes for the round's own script.`);
      continue;
    }
    const head = `---\n${keyLine(r.old, 'id')}\n${keyLine(r.old, 'name')}\n`;
    const run = [
      parts.intro && '  - script: intro',
      `  - script: ${id}\n    minutes: ${r.own}`,
      `  - questions: all\n    title: Deep dive\n    minutes: ${deepDiveMinutes}`,
      parts.outro && '  - script: outro',
    ].filter(Boolean).join('\n');
    put(r.path, `${head}run:\n${run}\n---\n`, r.path);
    put(`scripts/${id}.md`, `${head}minutes: ${r.own}\n---\n\n${withLevel(body).trim()}\n`, r.path);
  }
  if (rounds.length && !Object.keys(parts).length) notes.push('this pack has no parts/ folder, so its rounds get no intro or outro.');

  const order = roundList ?? rounds.toSorted((a, b) => a.data.order - b.data.order).map((r) => r.data.id);
  if (roundList && !rounds.length) problems.push('--rounds: this pack has no rounds/ folder.');
  else for (const id of order) if (!rounds.some((r) => r.data.id === id)) problems.push(`--rounds: "${id}" is not a round in this pack. Rounds: ${rounds.map((r) => r.data.id).join(', ')}.`);
  if (!rounds.length) notes.push('this pack has no rounds/ folder, so no role was written. Add roles/<id>.md by hand.');
  else if (!role || !name) problems.push('this pack has rounds, so the migration writes a role: pass --role <id> --name "<Role name>".');
  else {
    put(`roles/${role}.md`, `---\nid: ${role}\nname: ${name}\nhiring: ${hiring}\nrounds: [${order.join(', ')}]\n---\n\n## Decisions\n\nRecord yours before you see anyone else's.\n\n### Hire {#hire}\n\nThe evidence meets the bar for the hiring level, and nothing I saw worries me.\n\n### No hire {#no-hire}\n\nThe evidence does not meet the bar for the hiring level, or something I saw worries me. Say which in your reason.\n`);
  }

  put('pack.json', format2(read(dir, 'pack.json'), rounds.length ? role : undefined), 'pack.json');

  for (const [path, text] of files) {
    if (!sources.has(path) && existsSync(join(dir, path)) && read(dir, path) !== text) problems.push(`${path}: already exists and is not a format 1 file this migration converts. Move it aside first.`);
  }
  return { role: rounds.length ? role : undefined, files, sources, cards, rounds, order, parts, deletes: Object.keys(parts).map((id) => `parts/${id}.md`), notes, problems };
}

// The five checks, on the staged pack in tmp: lines kept, lines added, minutes and order, meaning, idempotence.
async function prove(p, tmp, hiring) {
  const problems = [];
  const built = (path) => read(tmp, path);
  let removed = 0;
  let addedLines = 0;
  const ADDED = added(hiring);
  const countAdded = (where, line, n) => {
    if (ADDED.some((re) => re.test(line))) addedLines += n;
    else problems.push(`${where}: added a line no rule explains: ${JSON.stringify(line)}`);
  };
  for (const [oldPath, { text, outputs }] of p.sources) {
    if (oldPath === 'pack.json') {
      if (built('pack.json') !== format2(text, p.role)) problems.push('pack.json: changed more than its format number and id.');
      removed++;
      addedLines++;
      continue;
    }
    const before = tally(lines(text));
    const after = tally(outputs.flatMap((o) => lines(built(o))));
    for (const [line, n] of before) {
      const short = n - (after.get(line) ?? 0);
      if (short <= 0) continue;
      if (REMOVED[oldPath.split('/')[0]]?.test(line)) removed += short;
      else problems.push(`${oldPath}: lost the line ${JSON.stringify(line)}`);
    }
    for (const [line, n] of after) if (n > (before.get(line) ?? 0)) countAdded(outputs.join(' + '), line, n - (before.get(line) ?? 0));
  }
  for (const path of [...p.files.keys()].filter((f) => f.endsWith('/pool.md'))) for (const line of lines(built(path))) countAdded(path, line, 1);

  const loaded = await loadPack(tmp);
  const errors = loaded.problems.filter((x) => x.level === 'error');
  problems.push(...errors.map(describe));
  let cardsEqual = 0;
  const { model } = loaded;
  if (model) {
    for (const r of p.rounds) {
      const segments = model.rounds.find((x) => x.id === r.data.id).segments;
      const sum = segments.reduce((n, s) => n + s.minutes, 0);
      if (sum !== r.data.minutes) problems.push(`${r.path}: run minutes ${segments.map((s) => s.minutes).join('+')} do not sum to ${r.data.minutes}.`);
      if (segments.find((s) => s.kind === 'questions').minutes !== r.data.deepDiveMinutes) problems.push(`${r.path}: the Deep dive is not ${r.data.deepDiveMinutes} minutes.`);
    }
    for (const role of model.roles) if (!isDeepStrictEqual(role.rounds, p.order)) problems.push(`roles/${role.id}.md: rounds ${role.rounds.join(', ')} are not ${p.order.join(', ')}.`);

    const { cards, pools } = model.libs.questions;
    for (const c of p.cards) {
      const { body, pool, poolName, ...front } = parseV1(c.old);
      const card = cards.find((x) => x.id === front.id);
      const same = card
        && Object.entries(front).every(([k, v]) => isDeepStrictEqual(card[k], v))
        && card.pool === (pool ?? c.pool)
        && (poolName === undefined || pools.find((x) => x.id === c.pool).name === poolName)
        && card.lookFor.every((o) => o.level === hiring)
        && isDeepStrictEqual(card.lookFor.map((o) => o.text), bullets(body, 'Look for'))
        && isDeepStrictEqual(card.followUps ?? [], bullets(body, 'Follow-ups'))
        && (card.reviewMd ?? '') === (body.match(sectionRe('Review'))?.[1] ?? '').trim()
        && card.ask === askV1(body);
      if (same) cardsEqual++;
      else problems.push(`${c.path}: reads differently after the migration.`);
    }
  }
  if (formatOf(tmp) !== 2) problems.push('pack.json: the result is not format 2, so a second run would migrate it again.');
  return { problems, cards: p.cards.length, cardsEqual, removed, added: addedLines, rounds: p.rounds.length, notes: loaded.problems.length - errors.length };
}

// A git tree the migration can be undone in, or why not.
function undoable(dir) {
  const git = spawnSync('git', ['-C', dir, 'status', '--porcelain', '--', '.'], { encoding: 'utf8' });
  if (git.status !== 0) return `${dir} is not in a git repository, so the migration could not be undone. Run "git init" and commit the pack first.`;
  if (git.stdout.trim()) return `${dir} has uncommitted changes. Commit or stash your changes first, so the migration can be undone with git.`;
  return null;
}

// A format 2 pack from before ids were required gets the id it has used so far. null for any other format.
export function addId(dir, { write }) {
  let config;
  try {
    config = JSON.parse(read(dir, 'pack.json'));
  } catch {
    return null;
  }
  if (config?.format !== 2) return null;
  if (config.id !== undefined) return { status: 'already' };
  const id = earlierId(dir);
  if (!write) return { status: 'planned', id };
  const refusal = undoable(dir);
  if (refusal) return { status: 'refused', message: refusal };
  writeFileSync(join(dir, 'pack.json'), withId(read(dir, 'pack.json'), id));
  return { status: 'written', id };
}

// interview-kit migrate, format 1 to format 2. Plans every file in memory, stages the result in a temp folder beside
// the pack, proves the five checks there, and only with write renames each generated file into place.
export async function migrate(dir, opts) {
  const format = formatOf(dir);
  if (format === 2) return { status: 'already' };
  if (format !== 1) return { status: 'problems', problems: ['pack.json: this is not a format 1 pack, so there is nothing to migrate.'] };
  if (!existsSync(join(dir, 'ladder.md'))) return { status: 'refused', message: 'ladder.md is missing. Write it first, one "## Name {#id}" heading per level, lowest first, with --hiring among them: the migration puts every Look for bullet at that level.' };
  const refusal = opts.write && undoable(dir);
  if (refusal) return { status: 'refused', message: refusal };
  const p = plan(dir, opts);
  if (p.problems.length) return { status: 'problems', problems: p.problems };

  // Beside the pack, not in the OS temp folder, so each rename stays on one file system.
  const tmp = mkdtempSync(join(dirname(dir), `.${basename(dir)}.migrate-`));
  try {
    for (const path of PACK_PATHS) if (existsSync(join(dir, path))) cpSync(join(dir, path), join(tmp, path), { recursive: true });
    for (const [path, text] of p.files) {
      mkdirSync(dirname(join(tmp, path)), { recursive: true });
      writeFileSync(join(tmp, path), text);
    }
    const proof = await prove(p, tmp, opts.hiring);
    if (proof.problems.length) return { status: 'problems', problems: proof.problems };
    const changes = [...[...p.files.keys()].sort().map((path) => [existsSync(join(dir, path)) ? 'change' : 'add', path]), ...p.deletes.map((path) => ['delete', path])];
    if (!opts.write) return { status: 'planned', changes, notes: p.notes, proof };

    for (const path of p.files.keys()) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      renameSync(join(tmp, path), join(dir, path));
    }
    for (const path of p.deletes) unlinkSync(join(dir, path));
    const notes = [...p.notes];
    if (p.deletes.length) {
      try {
        rmdirSync(join(dir, 'parts'));
      } catch {
        notes.push('parts/ still holds files the migration did not convert, so it stays.');
      }
    }
    return { status: 'written', changes, notes, proof };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
