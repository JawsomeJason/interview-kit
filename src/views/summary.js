import { esc } from '../esc.js';
import { nudgesBefore, rowState } from '../evidence/reduce.js';
import { focusOf, isRequired, layerOf } from '../model/layers.js';
import { itemsOf, observables, planned, prompts } from '../model/observables.js';
import { runOfShow } from '../model/timeline.js';

export const STATE = { seen: 'Seen', 'seen-after-nudge': 'Seen after a nudge', unseen: 'Not seen', 'not-marked': 'Not marked', 'not-asked': 'Not asked' };
const STRIP = { seen: '●', 'seen-after-nudge': '◐', unseen: '○', 'not-marked': '·', 'not-asked': '–' };
const LEGEND = Object.keys(STRIP).map((s) => `${STRIP[s]} ${STATE[s].toLowerCase()}`).join('  ');
const MARKED = new Set(['seen', 'seen-after-nudge', 'unseen']);
const itemOf = (ref) => ref.slice(0, ref.indexOf('#'));

// Items this interviewer opened: every card the room asked, and every item with a mark, prompt, note or close of mine.
export function opened(evidence, plan) {
  const ids = new Set(Object.values(plan.segments).flatMap((s) => s.asked ?? []));
  for (const ref of [...evidence.marks.keys(), ...evidence.prompts.keys()]) ids.add(itemOf(ref));
  for (const id of [...evidence.notes.keys(), ...evidence.closed]) ids.add(id);
  return ids;
}

// Where each logged mark lands now: on the bullet with its digest in the same item, else on the bullet at its ref,
// which was reworded since. A mark on a bullet that is gone lands nowhere.
function landing(evidence, byItem) {
  const at = new Map();
  for (const [ref, m] of evidence.marks) {
    const obs = byItem.get(itemOf(ref)) ?? [];
    const hit = obs.find((o) => o.digest === m.d && o.ref === ref) ?? obs.find((o) => o.digest === m.d && !at.has(o.ref));
    if (hit) at.set(hit.ref, { ref, reworded: false });
    else if (obs.some((o) => o.ref === ref) && !at.has(ref)) at.set(ref, { ref, reworded: true });
  }
  return at;
}

// One interviewer's reading of each observable: its state, which nudges came before a seen mark, and its layer.
export function reader(pack, role, plan, evidence) {
  const items = itemsOf(pack);
  const byItem = new Map([...items.values()].map((it) => [it.id, observables(it)]));
  const at = landing(evidence, byItem);
  const open = opened(evidence, plan);
  const focus = focusOf(role, evidence);
  return {
    items, byItem, open, focus,
    row(o) {
      const hit = at.get(o.ref);
      const state = rowState(evidence, hit?.ref ?? o.ref, open.has(o.item));
      const nudges = state === 'seen-after-nudge' ? nudgesBefore(evidence, hit.ref).map((p) => Number(p.split('~nudge.')[1])).sort((a, b) => a - b) : [];
      return { ref: o.ref, item: o.item, level: o.level, text: o.text, competencies: o.competencies, state, nudges,
        reworded: Boolean(hit?.reworded), layer: layerOf(pack.ladder, focus, o.level) };
    },
  };
}

// A row earns its place on the checklist and placement layers; headroom only once marked; basics never, since a
// basics row is only ever marked missing.
const shown = (r) => r.layer === 'main' || r.layer === 'placement' || (r.layer === 'above' && MARKED.has(r.state));
const byLevel = (pack, rows) => pack.ladder.map((l) => ({ id: l.id, name: l.name, rows: rows.filter((r) => r.level === l.id) })).filter((l) => l.rows.length);

// My evidence as the Decide page, Copy summary and the AI packet read it. No totals, ratios or placement: each row
// says what happened, and a row nobody probed reads "not asked", never as a failure.
export function summarize({ pack, role, round, plan, evidence }) {
  const read = reader(pack, role, plan, evidence);
  const inPlan = planned(pack, runOfShow(round, plan).steps, plan).filter((id) => read.items.has(id));
  const also = [...read.open].filter((id) => read.items.has(id) && !inPlan.includes(id));
  const rowsOf = (ids) => ids.flatMap((id) => read.byItem.get(id).map(read.row));
  const rows = rowsOf(inPlan).filter(shown);
  const order = role.competencies ?? pack.competencies.map((c) => c.id);
  const known = new Set(order);
  const groups = [
    ...order.map((id) => ({ id, name: pack.competencies.find((c) => c.id === id)?.name ?? id, rows: rows.filter((r) => r.competencies.includes(id)) })),
    { id: 'other', name: 'Other', rows: rows.filter((r) => !r.competencies.some((c) => known.has(c))) },
  ].filter((g) => g.rows.length).map(({ id, name, rows: r }) => ({ id, name, levels: byLevel(pack, r) }));
  const asked = [...inPlan, ...also].filter((id) => read.open.has(id));
  const title = (id) => read.items.get(id)?.title ?? id;
  return {
    candidate: plan.candidate, role: role.name, round: round.name, focus: read.focus,
    passions: plan.passions.map((p) => p.label),
    groups,
    also: also.map((id) => ({ item: id, title: title(id), levels: byLevel(pack, rowsOf([id]).filter(shown)) })).filter((a) => a.levels.length),
    promptsNotAsked: asked.flatMap((id) => prompts(read.items.get(id)).filter((p) => isRequired(read.focus, p) && !evidence.prompts.has(p.ref))
      .map((p) => ({ item: id, title: title(id), text: p.text }))),
    basicsMissing: rowsOf(asked).filter((r) => r.layer === 'basics' && r.state === 'unseen').map((r) => ({ item: r.item, title: title(r.item), text: r.text })),
    notes: [...evidence.notes].filter(([, text]) => text.trim()).map(([scope, text]) => ({ scope, title: title(scope), text })),
  };
}

const plain = (md) => md.replace(/\*\*(.+?)\*\*/g, '$1');
const inline = (md) => esc(md).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
export const stateWord = (r) => (r.state === 'seen-after-nudge'
  ? `Seen after nudge${r.nudges.length > 1 ? 's' : ''} ${r.nudges.join(', ')}` : STATE[r.state]) + (r.reworded ? ' (reworded since)' : '');
const strip = (rows) => rows.map((r) => STRIP[r.state]).join('');

function levelText(levels, pad) {
  return levels.flatMap((l) => [`${pad}${l.name}  ${strip(l.rows)}`, ...l.rows.map((r) => `${pad}  ${stateWord(r)}: ${plain(r.text)}`)]);
}

const indent = (text, pad) => text.split('\n').join(`\n${pad}`);

export function summaryText(s) {
  const out = [s.candidate || 'No name yet', `${s.role}, ${s.round}`];
  if (s.passions.length) out.push(`Says they specialize in: ${s.passions.join(', ')}`);
  out.push(LEGEND);
  const section = (title, lines) => { if (lines.length) out.push('', title, ...lines); };
  out.push('', ...s.groups.flatMap((g) => [g.name, ...levelText(g.levels, '  ')]));
  section('Also asked', s.also.flatMap((a) => [`  ${a.title}`, ...levelText(a.levels, '    ')]));
  section('Stretch prompts not asked', s.promptsNotAsked.map((p) => `  ${p.title}: ${p.text}`));
  section('Basics marked missing', s.basicsMissing.map((b) => `  ${b.title}: ${plain(b.text)}`));
  section('Notes', s.notes.map((n) => `  ${n.title}: ${indent(n.text, '    ')}`));
  return out.join('\n');
}

const levelsHtml = (levels) => levels.map((l) => `<h4 class="summary-level">${esc(l.name)} <span class="summary-strip" aria-hidden="true">${strip(l.rows)}</span></h4>
  <ul class="summary-rows">${l.rows.map((r) => `<li class="summary-row is-${r.state}"><span class="summary-state">${esc(stateWord(r))}</span> ${inline(r.text)}</li>`).join('')}</ul>`).join('');

const listHtml = (title, items) => (items.length ? `<h3 class="summary-head">${title}</h3><ul class="summary-rows">${items.join('')}</ul>` : '');

export function summaryHtml(s) {
  return `<section class="summary" aria-label="Your summary">
  <p class="summary-who"><b>${esc(s.candidate || 'No name yet')}</b>, ${esc(s.role)}, ${esc(s.round)}</p>
  ${s.passions.length ? `<p class="summary-passions">Says they specialize in: ${esc(s.passions.join(', '))}</p>` : ''}
  <p class="summary-legend" aria-hidden="true">${esc(LEGEND)}</p>
  ${s.groups.map((g) => `<h3 class="summary-head">${esc(g.name)}</h3>${levelsHtml(g.levels)}`).join('')}
  ${s.also.length ? `<h3 class="summary-head">Also asked</h3>${s.also.map((a) => `<p class="summary-item">${esc(a.title)}</p>${levelsHtml(a.levels)}`).join('')}` : ''}
  ${listHtml('Stretch prompts not asked', s.promptsNotAsked.map((p) => `<li class="summary-row"><b>${esc(p.title)}:</b> ${inline(p.text)}</li>`))}
  ${listHtml('Basics marked missing', s.basicsMissing.map((b) => `<li class="summary-row"><b>${esc(b.title)}:</b> ${inline(b.text)}</li>`))}
  ${listHtml('Notes', s.notes.map((n) => `<li class="summary-row summary-note"><b>${esc(n.title)}:</b> ${esc(n.text)}</li>`))}
</section>`;
}
