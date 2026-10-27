import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { parseDoc, sink } from './doc.js';
import { link } from './link.js';
import { AVOID_VERBS, competencies, ladder, ladderOf, role, round } from './lower.js';
import { validator } from './validate.js';

const KINDS = new URL('../kinds/', import.meta.url);
const SCHEMAS = new URL('./schemas/', import.meta.url);
const readJson = (url) => JSON.parse(readFileSync(url, 'utf8'));

// Kinds are found by listing src/kinds/, so adding one edits nothing else.
const kinds = await Promise.all(readdirSync(KINDS).sort().map(async (name) => {
  const dir = new URL(`${name}/`, KINDS);
  const kind = (await import(new URL('kind.js', dir).href)).default;
  return { ...kind, files: kind.files.map((f) => ({ ...f, schema: readJson(new URL(f.schema, dir)) })) };
}));
const validate = validator([
  ...['common', 'pack', 'ladder', 'competencies', 'role', 'round'].map((n) => readJson(new URL(`${n}.schema.json`, SCHEMAS))),
  ...kinds.flatMap((k) => k.files.map((f) => f.schema)),
]);

const filesUnder = (dir, folder) => (existsSync(join(dir, folder))
  ? readdirSync(join(dir, folder), { recursive: true }).map((p) => `${folder}/${p.split(sep).join('/')}`).sort()
  : []);

// 8 hex chars of FNV-1a, enough to tell packs apart in browser storage names.
const hash = (text) => {
  let h = 0x811c9dc5;
  for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
};

const byPlace = (a, b) => (!a.file - !b.file) || a.file.localeCompare(b.file) || a.line - b.line;

export const describe = (p) => `${p.file ? `${p.file}${p.line ? `:${p.line}` : ''}  ` : ''}${p.message}${p.level === 'note' ? ' (note)' : ''}`;

// Parses every file in a format 2 pack, lowers each to JSON, links them, checks each against its schema, and
// returns the model with every problem found. The model is null while any problem is an error.
export async function loadPack(dir, { strict = false } = {}) {
  const pack = sink('pack.json');
  const whole = sink('');
  const sinks = [pack, whole];
  const result = (model) => ({ model, problems: sinks.flatMap((s) => s.problems).sort(byPlace) });

  if (!existsSync(join(dir, 'pack.json'))) { pack.error(0, 'this file is missing.\n  Add a pack.json that reads { "format": 2 }.'); return result(null); }
  const raw = readFileSync(join(dir, 'pack.json'), 'utf8');
  const lineOf = (key) => raw.split(/\r?\n/).findIndex((l) => l.includes(`"${key}"`)) + 1 || 1;
  let config;
  try {
    config = JSON.parse(raw);
  } catch (e) {
    pack.error(1, `this is not valid JSON: ${e.message}.\n  Fix it so it reads like { "format": 2 }.`);
    return result(null);
  }
  if (config?.format !== 2) {
    pack.error(lineOf('format'), config?.format === 1
      ? 'format: this pack is format 1 and this kit reads format 2. Run "interview-kit migrate" to move it.'
      : `format: ${JSON.stringify(config?.format ?? null)} is not a format this kit reads.\n  Write "format": 2.`);
    return result(null);
  }

  const records = [];
  const open = (path) => { const doc = parseDoc(path, readFileSync(join(dir, path), 'utf8')); sinks.push(doc); return doc; };
  const add = (doc, type, out, schema, extra) => { records.push({ doc, type, schema, ...out, ...extra }); return out; };

  let levels = [];
  if (existsSync(join(dir, 'ladder.md'))) {
    const doc = open('ladder.md');
    levels = add(doc, 'ladder', ladder(doc), 'ik:ladder').json.levels;
  } else {
    const missing = sink('ladder.md');
    sinks.push(missing);
    missing.error(0, 'this file is missing.\n  Add a ladder.md with one "## Name {#id}" heading per level, lowest first.');
  }

  const ctx = { strict, kinds, ladder: ladderOf(levels), lowered: new Map(), untagged: [], competencyIds: [], allow: {} };
  const lint = config.lint ?? {};
  ctx.avoid = new Set([...AVOID_VERBS, ...[lint.avoidVerbs ?? []].flat()].map((v) => String(v).toLowerCase()));
  if (lint.allowVerbs && typeof lint.allowVerbs === 'object' && !Array.isArray(lint.allowVerbs)) {
    for (const [key, verbs] of Object.entries(lint.allowVerbs)) {
      const level = ctx.ladder.levelOf(key);
      if (level) ctx.allow[level.id] = new Set([verbs].flat().map((v) => String(v).toLowerCase()));
      else pack.error(lineOf('allowVerbs'), `lint.allowVerbs: "${key}" is not a level in ladder.md.\n  ${ctx.ladder.hint(key)}`);
    }
  }

  if (existsSync(join(dir, 'competencies.md'))) {
    const doc = open('competencies.md');
    ctx.competencyIds = add(doc, 'competencies', competencies(doc, ctx), 'ik:competencies').json.competencies.map((c) => c.id);
  }

  for (const kind of kinds) {
    const paths = filesUnder(dir, kind.folder);
    for (const def of kind.files) {
      for (const path of paths) {
        const match = path.match(def.pattern);
        if (!match || kind.files.find((f) => f.pattern.test(path)) !== def) continue;
        const doc = open(path);
        add(doc, def.name, def.lower(doc, ctx, match), def.schema.$id, { kind, item: def.item });
        ctx.lowered.set(path, records.at(-1));
      }
    }
  }
  for (const [folder, type, lower] of [['rounds', 'round', round], ['roles', 'role', role]]) {
    for (const path of filesUnder(dir, folder).filter((p) => /^[^/]+\/[^/]+\.md$/.test(p))) {
      const doc = open(path);
      add(doc, type, lower(doc, ctx, path.slice(folder.length + 1, -3)), `ik:${type}`);
    }
  }

  const libs = Object.fromEntries(kinds.map((k) => [k.id, k.assemble(records.filter((r) => r.kind === k).map((r) => ({ name: r.type, json: r.json })))]));
  link({ records, kinds, libs, ladder: ctx.ladder, competencyIds: ctx.competencyIds, untagged: ctx.untagged, pack: whole });
  if (strict) for (const doc of sinks.filter((s) => s.lines)) doc.lines.forEach((l, i) => { if (l.includes('—')) doc.error(i + 1, 'this line has an em dash.\n  Use a period, comma or colon.'); });

  validate(pack, 'ik:pack', config, Object.fromEntries(Object.keys(config).map((k) => [`/${k}`, lineOf(k)])));
  for (const r of records) if (!r.doc.failed()) validate(r.doc, r.schema, r.json, r.lines);

  if (sinks.some((s) => s.failed())) return result(null);
  const of = (type) => records.filter((r) => r.type === type).map((r) => r.json);
  const roles = of('role');
  const { format, id, ...options } = config;
  return result({
    format,
    id: id ?? `pack-${hash(roles.map((r) => r.id).sort().join(','))}`,
    options: {
      ...options,
      plugins: config.plugins ?? {},
      retentionDays: config.retentionDays ?? 30,
      sync: { turn: [], ...config.sync },
      lint: { avoidVerbs: lint.avoidVerbs ?? [], allowVerbs: Object.fromEntries(Object.entries(ctx.allow).map(([k, v]) => [k, [...v]])) },
    },
    ladder: levels,
    competencies: of('competencies')[0]?.competencies ?? [],
    roles,
    rounds: of('round').map((r) => ({ ...r, segments: r.segments.map((s) => ({ ...s, round: r.id })) })),
    libs,
  });
}
