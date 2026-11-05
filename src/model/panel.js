import { nudgesBefore } from '../evidence/reduce.js';
import { focusOf, isRequired, layerOf } from './layers.js';
import { observables, prompts } from './observables.js';
import { inScope } from './scope.js';

// Open layers first, in the order an interviewer reads them; the folded ones come last.
export const LAYERS = { main: '', placement: 'to place below the bar', above: 'headroom', basics: 'basics' };
export const FOLDED = new Set(['above', 'basics']);
// The layers whose blank rows leave for the Out of scope fold. Headroom is folded already, and basics are marked only when missing.
const SCOPED = ['main', 'placement'];
const MAX_KEY = 9;

export const nudgeRef = (o, k) => `${o.ref}~nudge.${k}`;
const givenOf = (ev, o) => o.nudges.map((_, i) => i + 1).filter((k) => ev.prompts.has(nudgeRef(o, k)));

// Everything one item's Look for panel shows, from my evidence, the shared plan and my focus. segment is the run of
// show step the item is open in; its minutes stand until the plan sets its own.
export function panel({ pack, role, plan, evidence: ev, segment }, item, seg) {
  const focus = focusOf(role, ev);
  const shared = plan.segments[seg];
  const fallback = Boolean(shared?.fallback);
  const minutes = shared?.minutes ?? segment.minutes;
  const levelName = (id) => pack.ladder.find((l) => l.id === id)?.name ?? id;
  // An observable carries no "Why:" or "Good answer:" lines, so they come from its bullet, which is in the same place.
  // An off activity has no time for a row to fall outside, so its rows show as normal.
  const rows = observables(item).map((o, i) => ({ o, details: item.lookFor[i].details ?? [] })).filter(({ o }) => !(fallback && o.fallback === false))
    .map((r) => ({ ...r, layer: layerOf(pack.ladder, focus, r.o.level), mark: ev.marks.get(r.o.ref), given: givenOf(ev, r.o), before: nudgesBefore(ev, r.o.ref), inScope: inScope(item, r.o, minutes) }));
  // A number key follows scope, not the mark, so marking a folded row never renumbers the rows around it.
  let key = 0;
  for (const r of rows) if (r.layer === 'main' && r.inScope && key < MAX_KEY) r.key = ++key;
  const out = rows.filter((r) => SCOPED.includes(r.layer) && !r.inScope && !r.mark && !r.given.length);
  const groupsOf = (layers, from) => layers.flatMap((layer) => pack.ladder.map((l) => l.id)
    .map((level) => ({ layer, level, name: levelName(level), rows: from.filter((r) => r.layer === layer && r.o.level === level) }))
    .filter((g) => g.rows.length));
  const listed = rows.filter((r) => !out.includes(r));
  const noCore = out.some((r) => r.layer === 'main') && !listed.some((r) => r.layer === 'main') ? levelName(focus) : null;
  const stretch = prompts(item).map((p) => ({ ...p, required: isRequired(pack.ladder, focus, p), asked: ev.prompts.has(p.ref), name: levelName(p.level) }));
  return { ev, rows, open: groupsOf(SCOPED, listed), out: groupsOf(SCOPED, out), noCore, folded: groupsOf([...FOLDED], listed), minutes, stretch, fallback, focus, closed: ev.closed.has(item.id), note: ev.notes.get(item.id) ?? '' };
}
