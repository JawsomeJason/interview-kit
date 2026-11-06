import { esc } from '../esc.js';
import { assertUnlocked } from '../evidence/gate.js';
import { foldEvidence, foldShared } from '../evidence/reduce.js';
import { clockTime } from '../start-time.js';
import { reader, STATE, stateWord } from './summary.js';
import { wallOf } from '../evidence/clock.js';
import { coursePath, finishedOf, REASONS } from '../model/course.js';

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

// A revision after first seeing a second opinion's proposals says so, so a colleague knows the AI was read first.
const afterSecond = (evidence, h, ai) => [...evidence.peeks].some(([from, at]) => ai.has(from) && h > at);
function decision(pack, role, evidence, ai = new Set()) {
  const d = evidence.decision;
  if (!d) return null;
  const word = (x) => ({ label: role.decisions.find((o) => o.id === x.choice)?.label ?? x.choice, level: levelName(pack, x.level), why: x.why });
  const when = (h) => (afterSecond(evidence, h, ai) ? 'revised after the second opinion' : afterPeek(evidence, h) ? 'revised after seeing colleagues' : 'revised before seeing colleagues');
  return { ...word(d), revisions: evidence.amendments.map((a) => ({ ...word(a), when: when(a.h) })) };
}

// Columns are the people who have decided, me first; rows are observables any of them marked or had on their
// checklist or placement layer. Rows where people saw different things come first. `at` replays the room at a stamp.
export function merge(unlocked, held, { pack, role, round }, at) {
  const { me } = assertUnlocked(unlocked);
  const room = at === undefined
    ? { plan: foldShared(Object.fromEntries(Object.entries(held).map(([a, log]) => [a, log.pub]))), participants: unlocked.participants }
    : foldAt(unlocked, held, at);
  const people = [...room.participants].sort((a, b) => (b.author === me) - (a.author === me));
  const ai = new Set(people.filter((p) => [...p.evidence.marks.values()].some((m) => m.src === 'ai')).map((p) => p.author));
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
    columns: people.map((p, i) => ({ author: p.author, name: p.name ?? (p.author === me ? 'You' : 'Unnamed'), focus: levelName(pack, readers[i].focus), decision: decision(pack, role, p.evidence, ai) })),
    rows: [...rows.filter((r) => r.differs), ...rows.filter((r) => !r.differs)].map(({ worth, ...r }) => r),
    notes: scopes.map((scope) => ({ scope, title: items.get(scope)?.title ?? scope,
      by: people.filter((p) => p.evidence.notes.get(scope)?.trim()).map((p) => ({ name: p.name ?? 'Unnamed', text: p.evidence.notes.get(scope) })) })),
  };
}

const inline = (md) => esc(md).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
const dot = '<span class="debrief-peek" title="Recorded after seeing a colleague\'s evidence">•</span>';

const decisionHtml = (d) => (d ? `<p class="debrief-decision"><b>${esc(d.label)}</b>, at ${esc(d.level)}</p><p class="debrief-why">${esc(d.why)}</p>
  ${d.revisions.map((r) => `<p class="debrief-revision">${esc(r.when[0].toUpperCase() + r.when.slice(1))}: <b>${esc(r.label)}</b>, at ${esc(r.level)}. ${esc(r.why)}${r.when.includes('after') ? ` ${dot}` : ''}</p>`).join('')}` : '<p class="debrief-decision">No decision</p>');

export function mergeHtml(m) {
  return `<div class="debrief-table-wrap"><table class="debrief-table">
  <thead><tr><th scope="col">What to look for</th>${m.columns.map((c) => `<th scope="col">${esc(c.name)}<small class="debrief-focus">evaluated at ${esc(c.focus)}</small></th>`).join('')}</tr></thead>
  <tbody>${m.rows.map((r) => `<tr class="debrief-row${r.differs ? ' is-differs' : ''}"><th scope="row">${r.differs ? '<span class="debrief-differs">differs</span> ' : ''}${inline(r.text)}<small class="debrief-item">${esc(r.title)}</small></th>${
    r.cells.map((c) => `<td class="debrief-cell is-${c.state}">${esc(stateWord(c))}${c.afterPeek ? ` ${dot}` : ''}</td>`).join('')}</tr>`).join('')}</tbody>
  <tfoot><tr><th scope="row">Decision</th>${m.columns.map((c) => `<td>${decisionHtml(c.decision)}</td>`).join('')}</tr></tfoot>
</table></div>
${m.notes.length ? `<h2 class="debrief-head">Notes</h2>${m.notes.map((n) => `<h3 class="debrief-note-item">${esc(n.title)}</h3><ul class="debrief-notes">${n.by.map((b) => `<li><b>${esc(b.name)}:</b> ${esc(b.text)}</li>`).join('')}</ul>`).join('')}` : ''}`;
}

const SKIP = { 'no-time': 'no time', covered: 'already covered', 'not-relevant': 'not relevant' };
const BY = { ai: ', proposed by a second opinion', accepted: ', accepted from a second opinion' };

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
  mark: (e, say) => `marked "${say.ref(e.o)}" ${e.s === 'clear' ? 'clear' : STATE[e.s].toLowerCase()}${BY[e.src] ?? ''}`,
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
  marking: (e) => (e.by === 'ai' ? 'left the marks to a second opinion' : 'chose to tick the marks'),
  'segment.start': (e) => `started ${e.seg} with ${e.cards.length} questions listed`,
  'segment.done': (e, say) => `finished ${e.id ? say.item(e.id) : e.seg}`,
  skip: (e, say) => `skipped ${e.id ? say.item(e.id) : e.seg}: ${SKIP[e.reason]}`,
  amend: (e, say) => `amended ${e.id ? say.item(e.id) : e.seg}`,
  bookmark: (e, say) => `bookmarked${e.id ? ` ${say.item(e.id)}` : ''}${e.word ? `: ${e.word}` : ''}`,
};

export const timelineHtml = (events, upTo, say) => `<ol class="debrief-timeline">${events.map((x, i) => `<li class="debrief-event${i > upTo ? ' is-later' : ''}"><time class="debrief-time">${
  clockTime(wallOf(x.e.h))}</time> <b>${esc(x.name ?? 'Unnamed')}</b> ${esc(Object.hasOwn(WHAT, x.e.t) ? WHAT[x.e.t](x.e, say) : 'did something from a newer kit')}</li>`).join('')}</ol>`;

const REASON = Object.fromEntries(REASONS);
const MIN = 60_000;
const ms = (h) => (typeof h === 'number' ? h : wallOf(h));

// The course log (B's direction with C's timeline): the planned path against the actual one, one row per step, with
// what happened inside it under it: amendments, bookmarks, detours off the path and pool changes after the segment
// started. A step began when the one before it finished, a card when it was first asked. Reads the room's plan and my
// own log only, so it shows before any colleague has decided. at(t) writes a stamp or wall ms as a clock time.
export function courseLog({ pack, role, round, plan, held, me, at }) {
  const steps = coursePath(pack, round, plan);
  // My own room's streams only: a second opinion's file carries its own session and the transcript's clock.
  const sid = held[me]?.pub[0]?.sid;
  const pubs = Object.values(held).filter((log) => log.pub[0]?.t !== 'open' || log.pub[0].sid === sid).flatMap((log) => log.pub);
  const ev = foldEvidence(held[me]?.prv ?? []);
  const asked = new Map();
  for (const e of pubs) if (e.t === 'member' && e.k === 'segment.asked' && e.v && !(asked.get(e.id) <= e.h)) asked.set(e.id, e.h);
  const ends = steps.map((st) => finishedOf(plan, st)?.h).filter(Boolean).sort();
  const begin = (st, fin) => asked.get(st.id) ?? (fin ? ends.filter((h) => h < fin.h).at(-1) ?? plan.startedAt : undefined);
  // An event with no step of its own sits under the step on screen when it happened: the first to finish after it.
  const hostOf = (h) => steps.find((st) => finishedOf(plan, st)?.h >= h) ?? steps.findLast((st) => asked.has(st.id)) ?? steps.at(-1);
  const cardTitle = (id) => pack.libs.questions.cards.find((c) => c.id === id)?.title ?? id;
  const poolName = (id) => pack.libs.questions.pools.find((x) => x.id === id)?.name ?? id;
  const sub = new Map(steps.map((st) => [st.key, []]));
  const under = (st, row) => sub.get(st.key)?.push({ sub: true, plan: '', delta: '', ...row });
  for (const st of steps) {
    for (const h of ev.amends.get(st.key) ?? []) under(st, { title: 'Amended after Done', at: h, actual: at(h), state: 'Amend, original kept', icon: 'amend' });
  }
  for (const b of ev.bookmarks) {
    const st = steps.find((x) => x.id && x.id === b.id);
    const row = { title: `Bookmark${b.word ? `: ${b.word}` : ''}`, at: b.h, actual: at(b.h), state: 'Bookmark', icon: 'bookmark' };
    if (st) under(st, row);
    else under(hostOf(b.h), b.id ? { ...row, title: `Detour: ${cardTitle(b.id)}`, state: 'Off path, from Browse', icon: 'off' } : row);
  }
  const started = new Map(pubs.filter((e) => e.t === 'segment.start').map((e) => [e.seg, e.h]));
  for (const e of pubs) {
    if (!(e.t === 'member' && e.k === 'segment.pools' && started.get(e.seg) < e.h)) continue;
    under(hostOf(e.h), { title: e.v ? `Pool added: ${poolName(e.id)}, cards appended` : `Pool unticked: ${poolName(e.id)}, nothing dropped`, at: e.h, actual: at(e.h), state: 'Pool change', icon: 'pool' });
  }
  let t = 0;
  const rows = steps.flatMap((st) => {
    const fin = finishedOf(plan, st);
    const from = begin(st, fin);
    const planned = plan.startedAt === undefined ? '' : `${at(plan.startedAt + t * MIN)}–${at(plan.startedAt + (t + st.minutes) * MIN)}`;
    t += st.minutes;
    const title = `${st.label}${st.kind === 'card' ? ` · ${st.title}` : ''}`;
    let row;
    if (fin?.s === 'done') {
      const d = from === undefined ? 0 : Math.round((ms(fin.h) - ms(from)) / MIN - st.minutes);
      row = { actual: from === undefined ? at(fin.h) : `${at(from)}–${at(fin.h)}`, delta: d > 0 ? `+${d} over` : d < 0 ? `${-d} under` : 'on time', state: `Done ${at(fin.h)}`, icon: 'done' };
    } else if (fin) row = { actual: from === undefined ? at(fin.h) : `${at(from)}–${at(fin.h)}`, delta: `${st.minutes} saved`, state: `Skipped · ${REASON[fin.reason]}`, icon: 'skipped' };
    else if (asked.has(st.id)) row = { actual: `${at(asked.get(st.id))}–`, delta: '', state: 'Left unfinished', icon: 'resume' };
    else row = { actual: 'Not reached', delta: '', state: 'Not reached', icon: null };
    return [{ title, sub: false, plan: planned, appended: st.appended, ...row }, ...sub.get(st.key).sort((a, b) => (a.at < b.at ? -1 : 1))];
  });
  const d = ev.decision;
  const firstAi = [...ev.marks.values()].filter((m) => m.src === 'accepted').map((m) => m.h).sort()[0];
  return {
    rows,
    totals: { done: steps.filter((st) => finishedOf(plan, st)?.s === 'done').length, steps: steps.length, skipped: steps.filter((st) => finishedOf(plan, st)?.s === 'skipped').length,
      amended: [...ev.amends.values()].reduce((n, a) => n + a.length, 0), bookmarks: ev.bookmarks.length },
    end: ends.at(-1) && at(ends.at(-1)),
    plannedEnd: plan.startedAt === undefined ? '' : at(plan.startedAt + t * MIN),
    decision: d && { label: role.decisions.find((o) => o.id === d.choice)?.label ?? d.choice, level: levelName(pack, d.level), at: at(d.h), beforeAi: !firstAi || d.h < firstAi },
  };
}

const ICONS = { done: '✓', skipped: '⏭', resume: '⏸', amend: '✎', bookmark: '★', off: '↗', pool: 'ⓘ' };

export function courseLogHtml(c) {
  const chip = (k, v) => `<li class="course-log-total"><span class="course-log-key">${k}</span> <b>${esc(v)}</b></li>`;
  return `<section class="course-log" aria-labelledby="course-log-title"><h2 id="course-log-title" class="debrief-head">Course log</h2>
  <p class="course-log-lead">Planned path against the actual one, one line per step, with what happened inside each.</p>
  <ul class="course-log-totals">${chip('Done', `${c.totals.done} of ${c.totals.steps}`)}${chip('Skipped', String(c.totals.skipped))}${chip('Amended', String(c.totals.amended))}${
  chip('Bookmarks', String(c.totals.bookmarks))}${c.end ? chip('Finished', `${c.end}${c.plannedEnd ? `, planned ${c.plannedEnd}` : ''}`) : ''}${
  chip('Decision', c.decision ? `${c.decision.label}${c.decision.beforeAi ? ', before any AI mark' : ''}` : 'Not recorded')}</ul>
  <div class="debrief-table-wrap"><table class="course-log-table"><thead><tr><th scope="col">Step</th><th scope="col">Planned</th><th scope="col">Actual</th><th scope="col">Delta</th><th scope="col">State</th></tr></thead>
  <tbody>${c.rows.map((r) => `<tr class="course-log-row${r.sub ? ' is-sub' : ''}"><th scope="row"><span class="course-log-icon" aria-hidden="true">${r.icon ? ICONS[r.icon] : ''}</span>${esc(r.title)}${
    r.appended ? ' <span class="course-badge">Added</span>' : ''}</th><td>${esc(r.plan)}</td><td>${esc(r.actual)}</td><td>${esc(r.delta)}</td><td>${esc(r.state)}</td></tr>`).join('')}
  ${c.decision ? `<tr class="course-log-row"><th scope="row"><span class="course-log-icon" aria-hidden="true">✓</span>Decide: your read</th><td></td><td>${esc(c.decision.at)}</td><td></td><td>${esc(`${c.decision.label}, ${c.decision.level}`)}</td></tr>` : ''}</tbody></table></div></section>`;
}
