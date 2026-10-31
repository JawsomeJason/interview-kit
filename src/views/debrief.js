import { esc } from '../esc.js';
import { assertUnlocked } from '../evidence/gate.js';
import { foldEvidence, foldShared } from '../evidence/reduce.js';
import { clockTime } from '../start-time.js';
import { reader, STATE, stateWord } from './summary.js';
import { wallOf } from '../evidence/clock.js';

const MARKED = new Set(['seen', 'seen-after-nudge', 'unseen']);
const byStamp = (a, b) => (a.e.h === b.e.h ? (a.author < b.author ? -1 : 1) : a.e.h < b.e.h ? -1 : 1);

// Every released event from every decided log, in stamp order.
export function timeline(unlocked, held) {
  return assertUnlocked(unlocked).participants
    .flatMap((p) => ['pub', 'prv'].flatMap((ch) => held[p.author][ch].map((e) => ({ author: p.author, name: p.name, ch, e }))))
    .sort(byStamp);
}

// The room as it stood at stamp h: the shared plan and each participant's evidence folded from events up to h.
export function foldAt(unlocked, held, h) {
  const upTo = (events) => events.filter((e) => e.h <= h);
  return {
    plan: foldShared(Object.fromEntries(Object.entries(held).map(([a, log]) => [a, upTo(log.pub)]))),
    participants: assertUnlocked(unlocked).participants.map((p) => ({ ...p, evidence: foldEvidence(upTo(held[p.author].prv)) })),
  };
}

// Recorded after this person first saw a colleague's evidence. Stamps sort as strings.
const afterPeek = (evidence, h) => h !== undefined && evidence.peeks.size > 0 && h > [...evidence.peeks.values()].sort()[0];
const levelName = (pack, id) => pack.ladder.find((l) => l.id === id)?.name ?? 'Not sure';

function decision(pack, role, evidence) {
  const d = evidence.decision;
  if (!d) return null;
  const word = (x) => ({ label: role.decisions.find((o) => o.id === x.choice)?.label ?? x.choice, level: levelName(pack, x.level), why: x.why });
  return { ...word(d), revisions: evidence.amendments.map((a) => ({ ...word(a), when: afterPeek(evidence, a.h) ? 'revised after seeing colleagues' : 'revised before seeing colleagues' })) };
}

// Columns are the people who have decided, me first; rows are observables any of them marked or had on their
// checklist or placement layer. Rows where people saw different things come first. `at` replays the room at a stamp.
export function merge(unlocked, held, { pack, role, round }, at) {
  const { me } = assertUnlocked(unlocked);
  const room = at === undefined
    ? { plan: foldShared(Object.fromEntries(Object.entries(held).map(([a, log]) => [a, log.pub]))), participants: unlocked.participants }
    : foldAt(unlocked, held, at);
  const people = [...room.participants].sort((a, b) => (b.author === me) - (a.author === me));
  const readers = people.map((p) => reader(pack, role, round, room.plan, p.evidence));
  const { items, byItem } = readers[0] ?? {};
  const open = [...items?.keys() ?? []].filter((id) => readers.some((r) => r.open.has(id)));
  const rows = open.flatMap((id) => byItem.get(id).map((o) => {
    const cells = readers.map((r) => r.row(o));
    return { ref: o.ref, item: o.item, title: items.get(o.item).title, text: o.text, level: o.level, cells,
      differs: new Set(cells.map((c) => c.state)).size > 1,
      worth: cells.some((c) => MARKED.has(c.state) || ((c.layer === 'main' || c.layer === 'placement') && c.state !== 'not-asked')) };
  })).filter((r) => r.worth);
  for (const r of rows) r.cells.forEach((c, i) => { c.afterPeek = afterPeek(people[i].evidence, c.h); });
  const scopes = [...new Set(people.flatMap((p) => [...p.evidence.notes.keys()]))];
  return {
    columns: people.map((p, i) => ({ author: p.author, name: p.name ?? (p.author === me ? 'You' : 'Unnamed'), focus: levelName(pack, readers[i].focus), decision: decision(pack, role, p.evidence) })),
    rows: [...rows.filter((r) => r.differs), ...rows.filter((r) => !r.differs)].map(({ worth, ...r }) => r),
    notes: scopes.map((scope) => ({ scope, title: items.get(scope)?.title ?? scope,
      by: people.filter((p) => p.evidence.notes.get(scope)?.trim()).map((p) => ({ name: p.name ?? 'Unnamed', text: p.evidence.notes.get(scope) })) })),
  };
}

const inline = (md) => esc(md).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
const dot = '<span class="debrief-peek" title="Recorded after seeing a colleague\'s evidence">•</span>';

const decisionHtml = (d) => (d ? `<p class="debrief-decision"><b>${esc(d.label)}</b>, at ${esc(d.level)}</p><p class="debrief-why">${esc(d.why)}</p>
  ${d.revisions.map((r) => `<p class="debrief-revision">${esc(r.when === 'revised after seeing colleagues' ? 'Revised after seeing colleagues' : 'Revised before seeing colleagues')}: <b>${esc(r.label)}</b>, at ${esc(r.level)}. ${esc(r.why)}${r.when.includes('after') ? ` ${dot}` : ''}</p>`).join('')}` : '<p class="debrief-decision">No decision</p>');

export function mergeHtml(m) {
  return `<div class="debrief-table-wrap"><table class="debrief-table">
  <thead><tr><th scope="col">What to look for</th>${m.columns.map((c) => `<th scope="col">${esc(c.name)}<small class="debrief-focus">evaluated at ${esc(c.focus)}</small></th>`).join('')}</tr></thead>
  <tbody>${m.rows.map((r) => `<tr class="debrief-row${r.differs ? ' is-differs' : ''}"><th scope="row">${r.differs ? '<span class="debrief-differs">differs</span> ' : ''}${inline(r.text)}<small class="debrief-item">${esc(r.title)}</small></th>${
    r.cells.map((c) => `<td class="debrief-cell is-${c.state}">${esc(stateWord(c))}${c.afterPeek ? ` ${dot}` : ''}</td>`).join('')}</tr>`).join('')}</tbody>
  <tfoot><tr><th scope="row">Decision</th>${m.columns.map((c) => `<td>${decisionHtml(c.decision)}</td>`).join('')}</tr></tfoot>
</table></div>
${m.notes.length ? `<h2 class="debrief-head">Notes</h2>${m.notes.map((n) => `<h3 class="debrief-note-item">${esc(n.title)}</h3><ul class="debrief-notes">${n.by.map((b) => `<li><b>${esc(b.name)}:</b> ${esc(b.text)}</li>`).join('')}</ul>`).join('')}` : ''}`;
}

// One line per event. `say` names things for people: say.ref(ref) is a bullet's text, say.item(id) an item's title,
// say.level(id) a level's name, say.choice(id) a decision's label and say.who(author) a participant's name.
const WHAT = {
  open: () => 'opened the interview',
  name: (e) => `joined as ${e.name}`,
  put: (e, say) => ({ 'session.candidate': `set the candidate to ${e.v}`, 'session.startedAt': 'set the start time', 'session.length': `planned ${e.v} min in all`,
    'segment.minutes': `set ${e.seg} to ${e.v} min`, 'segment.fallback': `turned the fallback ${e.v ? 'on' : 'off'} for ${e.seg}` })[e.k],
  member: (e, say) => ({ 'session.passions': e.v === null ? 'unticked a passion' : `ticked the passion ${e.v}`,
    'segment.pools': `${e.v ? 'picked' : 'unpicked'} the pool ${e.id}`, 'segment.asked': `opened ${say.item(e.id)}` })[e.k],
  decided: () => 'recorded a decision',
  mark: (e, say) => `marked "${say.ref(e.o)}" ${e.s === 'clear' ? 'clear' : STATE[e.s].toLowerCase()}`,
  prompt: (e, say) => {
    const [bullet, nudge] = e.p.split('~nudge.');
    if (e.given === false) return `took back ${nudge ? `nudge ${nudge} on "${say.ref(bullet)}"` : 'a stretch prompt'}`;
    return nudge ? `gave nudge ${nudge} on "${say.ref(bullet)}"` : `asked a stretch prompt on ${say.item(e.p.slice(0, e.p.indexOf('#')))}`;
  },
  note: (e, say) => `wrote a note on ${say.item(e.scope)}`,
  close: (e, say) => `${e.closed ? 'closed' : 'reopened'} ${say.item(e.item)}`,
  focus: (e, say) => `evaluated at ${say.level(e.level)}`,
  decide: (e, say) => `decided ${say.choice(e.choice)}${e.level ? `, at ${say.level(e.level)}` : ''}`,
  peek: (e, say) => `first saw ${say.who(e.from)}'s evidence`,
};

export const timelineHtml = (events, upTo, say) => `<ol class="debrief-timeline">${events.map((x, i) => `<li class="debrief-event${i > upTo ? ' is-later' : ''}"><time class="debrief-time">${
  clockTime(wallOf(x.e.h))}</time> <b>${esc(x.name ?? 'Unnamed')}</b> ${esc(WHAT[x.e.t](x.e, say))}</li>`).join('')}</ol>`;
