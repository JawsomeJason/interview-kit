import { closedKeys, closest, leftover, levelled, list, markdown, norm, sections, slug } from './doc.js';

// Each lowerer turns a parsed file into the JSON its schema describes, plus a table from each JSON pointer to the
// source line it came from, so a schema error deep in the JSON still prints as file:line.

export const AVOID_VERBS = ['knows', 'understands', 'appreciates', 'cares', 'sets', 'owns', 'drives', 'leads', 'ensures'];
const RUN_KEYS = ['id', 'title', 'minutes'];

export function copyFront(doc, keys, json, lines) {
  for (const k of keys) if (doc.front[k] !== undefined) { json[k] = doc.front[k]; lines[`/${k}`] = doc.keyLine(k); }
}

// An id must match where the file sits: a card's filename starts with it, an exercise's folder is it, and a script,
// round or role is named by it.
export function matchId(doc, stem, where) {
  const { id } = doc.front;
  if (!doc.ok || typeof id !== 'string') return;
  const ok = where === 'card' ? stem === `${id}.md` || stem.startsWith(`${id}-`) : stem === id;
  if (ok) return;
  const fix = where === 'card' ? `Rename the file to "${id}.md" or "${id}-<slug>.md".` : `Set id to "${stem}" or rename the ${where}.`;
  doc.error(doc.keyLine('id'), `id: "${id}" does not match its ${where === 'folder' ? 'folder' : 'file'} "${stem}".\n  ${fix}`);
}

export const ladderOf = (levels) => {
  const ids = levels.map((l) => l.id);
  const levelOf = (s) => { const k = norm(s); return k ? levels.find((l) => norm(l.id) === k || norm(l.name) === k) : undefined; };
  const best = (s) => levelOf(closest(s, levels.flatMap((l) => [l.id, l.name])) ?? '')?.id;
  return { levels, ids, levelOf, best, hint: (s) => (best(s) ? `Did you mean "${best(s)}"? ` : '') + `Levels: ${list(ids)}.` };
};

// Every "##" heading is a level, lowest first; {#id} is optional and defaults to the name slugged.
export function ladder(doc) {
  const json = { levels: [] };
  const lines = {};
  const seen = new Map();
  const walk = (s) => {
    for (const c of s.children) {
      if (c.depth === 2) {
        const level = { id: c.id ?? slug(c.title), name: c.title, summary: markdown(c) };
        for (const key of new Set([norm(level.id), norm(level.name)])) {
          if (seen.has(key)) doc.error(c.line, `"${level.name}" reads the same as "${seen.get(key)}" once case and punctuation are ignored.\n  Rename one, because both are matched that way.`);
          else seen.set(key, level.name);
        }
        lines[`/levels/${json.levels.length}`] = c.line;
        json.levels.push(level);
      }
      walk(c);
    }
  };
  walk(doc.root);
  if (!json.levels.length) doc.error(1, 'no "## Name" level headings found.\n  Add one per level, lowest first, such as "## Mid {#mid}".');
  return { json, lines };
}

// Every "##" heading is a competency; a "###" under it names a level and says what the competency looks like there.
export function competencies(doc, ctx) {
  const json = { competencies: [] };
  const lines = {};
  const walk = (s) => {
    for (const c of s.children) {
      if (c.depth !== 2) { walk(c); continue; }
      const comp = { id: c.id ?? slug(c.title), name: c.title, summary: c.lines.map((l) => l.text).join('\n').trim() };
      const same = json.competencies.find((x) => x.id === comp.id);
      if (same) doc.error(c.line, `"## ${c.title}" has the id "${comp.id}", as "## ${same.name}" does.\n  Give each competency its own id.`);
      for (const sub of c.children.filter((x) => x.depth === 3)) {
        const level = ctx.ladder.levelOf(sub.title);
        if (!level) doc.error(sub.line, `"### ${sub.title}" under ${c.title} is not a level.\n  ${ctx.ladder.hint(sub.title)}`);
        else if (comp.expects?.[level.id] !== undefined) doc.error(sub.line, `"### ${sub.title}" under ${c.title} repeats level ${level.id}.\n  Keep one subsection per level.`);
        else (comp.expects ??= {})[level.id] = markdown(sub);
      }
      lines[`/competencies/${json.competencies.length}`] = c.line;
      json.competencies.push(comp);
    }
  };
  walk(doc.root);
  return { json, lines };
}

const words = (text) => (text.match(/^\*\*(.+?)\*\*/)?.[1] ?? text).split(/\s+/).length;

// One Look for bullet lowered: its nested lines become nudges, show, fallback, or details shown as written.
function bullet(level, it) {
  const b = { level, text: it.text };
  if (it.pin) b.pin = it.pin;
  if (it.tags.length) b.competencies = it.tags;
  for (const d of it.details) {
    if (d.label === 'Nudge') (b.nudges ??= []).push(d.text);
    else if (d.label === 'Show it') b.show = d.text;
    else if (d.label === 'Fallback') b.fallback = d.text === 'hide' ? false : d.text;
    else (b.details ??= []).push({ label: d.label, text: d.text });
  }
  return b;
}

// The house rules on an anchor: notes in the public check, errors under --strict.
function lint(doc, it, group, ctx, defaults) {
  const where = `Look for, ${group.heading}`;
  const flag = ctx.strict ? doc.error : doc.note;
  const count = words(it.text);
  if (count >= 12) flag(it.line, `${where}: "${it.text.slice(0, 40)}..." has ${count} words.\n  Keep anchors under 12 words so they read mid-call.`);
  const verb = it.text.replace(/^\*\*/, '').match(/^[A-Za-z']+/)?.[0];
  const v = verb?.toLowerCase();
  if (v && ctx.avoid.has(v) && !ctx.allow[group.level]?.has(v)) flag(it.line, `${where}: starts with "${verb}", which a candidate cannot show in an interview.\n  Try proposes, names, compares, asks or explains.`);
  if (defaults === null || !ctx.competencyIds.length || it.tags.length || (Array.isArray(defaults) && defaults.length)) return;
  if (ctx.strict) doc.error(it.line, `${where}: this bullet has no competency.\n  Add a #tag or a competencies: default in the file's frontmatter.`);
  else ctx.untagged.push(`${doc.path}:${it.line}`);
}

// The Look for list of a card, an exercise or a script. defaults is the competency list a bullet with no tag
// inherits, or null when the frontmatter could not be read.
export function lookFor(doc, sec, ctx, lines, defaults, { required = false } = {}) {
  const out = [];
  if (sec) lines['/lookFor'] = sec.line;
  const pins = new Set();
  for (const g of sec ? levelled(doc, sec, 'Look for', ctx.ladder, { details: true, peel: true }) : []) {
    for (const it of g.items) {
      if (!it.text) doc.error(it.line, `Look for, ${g.heading}: this bullet has no text.\n  Write the finding, then the tags.`);
      if (it.pin && pins.has(it.pin)) doc.error(it.line, `{#${it.pin}} is used twice in this file.\n  Pinned ids must be unique.`);
      if (it.pin) pins.add(it.pin);
      lint(doc, it, g, ctx, defaults);
      lines[`/lookFor/${out.length}`] = it.line;
      out.push(bullet(g.level, it));
    }
  }
  if (required && !out.length) doc.error(sec?.line ?? 1, `Look for: no level has any bullets.\n  Add a "### ${ctx.ladder.ids[0] ?? '<level>'}" heading with bullets under "## Look for".`);
  return out;
}

export function stretch(doc, sec, ctx, lines) {
  const out = [];
  if (!sec) return out;
  lines['/stretch'] = sec.line;
  for (const g of levelled(doc, sec, 'Stretch', ctx.ladder, {})) {
    for (const it of g.items) {
      lines[`/stretch/${out.length}`] = it.line;
      out.push({ level: g.level, text: it.text });
    }
  }
  return out;
}

export function role(doc, ctx, stem) {
  const json = {};
  const lines = {};
  closedKeys(doc, ['id', 'name', 'hiring', 'rounds', 'competencies'], 'role');
  matchId(doc, stem, 'file');
  copyFront(doc, ['id', 'name', 'hiring', 'rounds', 'competencies'], json, lines);
  const { hiring } = doc.front;
  if (doc.ok && hiring !== undefined) {
    const level = ctx.ladder.levelOf(hiring);
    if (level) json.hiring = level.id;
    else doc.error(doc.keyLine('hiring'), `hiring: "${hiring}" is not a level in ladder.md.\n  Levels there: ${list(ctx.ladder.ids)}.${ctx.ladder.best(hiring) ? ` Did you mean "${ctx.ladder.best(hiring)}"?` : ''}`);
  }
  const s = sections(doc, ['About', 'Decisions'], 'role');
  if (s.get('About')) json.about = markdown(s.get('About'));
  const decisions = s.get('Decisions');
  if (decisions) {
    lines['/decisions'] = decisions.line;
    json.decisions = [];
    for (const d of decisions.children) {
      if (d.depth !== 3 || !d.id) { doc.error(d.line, `Decisions: "${'#'.repeat(d.depth)} ${d.title}" is not a decision.\n  Write each one as "### Name {#id}", such as "### Hire {#hire}".`); continue; }
      const same = json.decisions.find((x) => x.id === d.id);
      if (same) doc.error(d.line, `Decisions: "${d.title}" has the id "${d.id}", as "${same.label}" does.\n  Give each decision its own id, because a recorded decision is its id.`);
      lines[`/decisions/${json.decisions.length}`] = d.line;
      json.decisions.push({ id: d.id, label: d.title, means: markdown(d) });
    }
  }
  return { json, lines };
}

// A round is frontmatter only. Each run entry names exactly one segment kind; link.js fills in what it references.
export function round(doc, ctx, stem) {
  const json = {};
  const lines = {};
  const runs = [];
  closedKeys(doc, ['id', 'name', 'run'], 'round');
  matchId(doc, stem, 'file');
  copyFront(doc, ['id', 'name'], json, lines);
  const id = doc.front.id ?? stem;
  const text = [...doc.root.lines];
  const flat = (s) => { text.push({ n: s.line, text: `${'#'.repeat(s.depth)} ${s.title}` }, ...s.lines); s.children.forEach(flat); };
  doc.root.children.forEach(flat);
  leftover(doc, text, `A round is its run list only. Move the text into scripts/${id}.md and add "- script: ${id}" to run.`);
  if (!doc.ok) return { json, lines, runs };
  const { run } = doc.front;
  if (!Array.isArray(run) || !run.length) {
    doc.error(doc.keyLine('run'), 'run: must be a list of segments.\n  Write "run:" then "  - script: intro".');
    return { json, lines, runs };
  }
  const kinds = ctx.kinds.map((k) => k.id);
  const keys = [...kinds, ...RUN_KEYS];
  json.segments = [];
  run.forEach((entry, k) => {
    const at = `run entry ${k + 1}`;
    const line = doc.at(['run', k]);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      doc.error(line, `${at}: must be "- script: <id>" or similar, not a bare value.\n  Start with a segment kind: ${kinds.join(', ')}.`);
      return;
    }
    for (const key of Object.keys(entry).filter((x) => !keys.includes(x))) {
      const guess = closest(key, keys, 3);
      doc.error(doc.at(['run', k, key]), `${at}: "${key}" is not a run entry key.${guess ? ` Did you mean "${guess}"?` : `\n  Keys: ${keys.join(', ')}.`}`);
    }
    const named = Object.keys(entry).filter((x) => kinds.includes(x));
    if (named.length !== 1) {
      doc.error(line, named.length ? `${at}: names two segment kinds (${named.join(', ')}).\n  Split it into two entries.` : `${at}: names no segment kind.\n  Start it with one of: ${kinds.join(', ')}.`);
      return;
    }
    const seg = { kind: named[0], ref: entry[named[0]] };
    const ptr = `/segments/${json.segments.length}`;
    lines[ptr] = line;
    for (const key of RUN_KEYS) if (entry[key] !== undefined) { seg[key] = entry[key]; lines[`${ptr}/${key}`] = doc.at(['run', k, key]); }
    runs.push({ at, line });
    json.segments.push(seg);
  });
  return { json, lines, runs };
}
