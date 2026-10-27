import { list, slug } from './doc.js';

// The rules that need more than one file: a run entry resolves through its kind, item ids are unique across the
// pack, a role's rounds exist, every competency tag exists, and a role's placement layer is not empty.
export function link({ records, kinds, libs, ladder, competencyIds, untagged, pack }) {
  const owners = new Map();
  for (const r of records.filter((x) => x.item && typeof x.json.id === 'string')) {
    if (owners.has(r.json.id)) r.doc.error(r.doc.keyLine('id'), `id: "${r.json.id}" is also used by ${owners.get(r.json.id)}.\n  Item ids are unique across the pack, because evidence refs start with the item id. Rename one.`);
    else owners.set(r.json.id, r.doc.path);
  }

  const rounds = records.filter((r) => r.type === 'round');
  for (const r of rounds) {
    const ids = new Set();
    (r.json.segments ?? []).forEach((seg, k) => {
      const { at, line } = r.runs[k];
      const kind = kinds.find((x) => x.id === seg.kind);
      const target = kind.resolve(libs[kind.id], seg.ref);
      if (target.error) { r.doc.error(line, `${at}: ${target.error}`); return; }
      seg.title ??= target.title;
      seg.minutes ??= target.minutes;
      if (seg.minutes === undefined) { r.doc.error(line, `${at}: minutes come from nowhere.\n  Add "minutes:" to this entry.`); return; }
      seg.id ??= slug(seg.title);
      if (ids.has(seg.id)) r.doc.error(line, `${at}: two segments are called "${seg.id}".\n  Add "id:" to one.`);
      ids.add(seg.id);
    });
  }

  const roundIds = rounds.map((r) => r.json.id);
  const levels = new Set(records.flatMap((r) => r.json.lookFor ?? []).map((b) => b.level));
  for (const r of records.filter((x) => x.type === 'role')) {
    for (const id of Array.isArray(r.json.rounds) ? r.json.rounds : []) {
      if (!roundIds.includes(id)) r.doc.error(r.doc.keyLine('rounds'), `rounds: "${id}" does not exist.\n  Rounds in this pack: ${list(roundIds)}.`);
    }
    const below = ladder.ids[ladder.ids.indexOf(r.json.hiring) - 1];
    if (r.json.hiring && below && !levels.has(below)) r.doc.note(r.doc.keyLine('hiring'), `no Look for bullet sits at ${below}, one below hiring, so the placement layer is empty.\n  Add anchors at ${below} so a candidate under the bar can be placed.`);
  }

  for (const r of records.filter((x) => x.type !== 'competencies')) {
    const known = (ids, line, shown) => {
      for (const c of Array.isArray(ids) ? ids : []) if (!competencyIds.includes(c)) r.doc.error(line, `${shown(c)} is not a competency in competencies.md.\n  Use one of: ${list(competencyIds)}.`);
    };
    known(r.json.competencies, r.lines['/competencies'], (c) => `competencies: "${c}"`);
    (r.json.lookFor ?? []).forEach((b, k) => known(b.competencies, r.lines[`/lookFor/${k}`], (c) => `#${c}`));
  }

  if (untagged.length) pack.note(0, `${untagged.length} Look for bullets have no competency while competencies.md names some; they show under "Other". First: ${untagged[0]}`);
}
