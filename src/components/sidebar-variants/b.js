import { esc } from '../../esc.js';
import { allQuestions, detailsToOpen, needsCheck, runOfShow, timelineTotal } from '../nav.js';
import { reviewDot } from '../review-mark.js';
import './b.css';

// Run of show: the hour as a broadcast rundown. Every row is one link with its start time, a state
// dot on the rail, its name and planned minutes. Rows before the current part read as done.

const clock = (minutes) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

const dot = (state) => (state === 'done'
  ? '<span class="run-dot" role="img" aria-label="Done"></span>'
  : '<span class="run-dot" aria-hidden="true"></span>');

// The start time is a visual aid for pacing, so it stays out of the link's name.
const row = ({ href, name, minutes, at, state, current, now }) => `<a href="${href}" class="run-row is-${state}"${current ? ` aria-current="${current}"` : ''}>`
  + `<span class="run-at" aria-hidden="true">${clock(at)}</span><span class="run-name">${name}${now ? ' <span class="run-now">Now</span>' : ''}</span>`
  + `${dot(state)}<span class="run-mins">${minutes} min</span></a>`;

const stateOf = (i, now) => (i < now ? 'done' : i === now ? 'current' : 'upcoming');

function render({ round, parts, dd, picked, done, pools, questions, route }) {
  const steps = runOfShow(round, parts, dd).map(({ id, name, minutes, start }) => ({ href: `#/${id}`, name: esc(name), minutes, at: start }));
  // A question page sits inside the deep dive; any other route shows the round page.
  const nowHref = route.startsWith('#/q/') ? '#/deep-dive' : steps.some((s) => s.href === route) ? route : '#/round';
  const now = steps.findIndex((s) => s.href === nowHref);
  steps.forEach((s, i) => { s.state = stateOf(i, now); });

  const deep = steps[2];
  const qState = (q) => (route === `#/q/${q.id}` ? 'current' : done.includes(q.id) ? 'done' : 'upcoming');
  let qAt = deep.at;
  const groups = [...Map.groupBy(picked, (q) => q.pool).values()].map((qs) => `<h2 class="run-pool">${esc(qs[0].poolName)}</h2><ol class="run-sub">${qs.map((q) => {
    const state = qState(q);
    const html = `<li>${row({ href: `#/q/${esc(q.id)}`, name: `${esc(q.title)}${reviewDot(q)}`, minutes: q.minutes, at: qAt, state, current: state === 'current' && 'page', now: state === 'current' })}</li>`;
    qAt += q.minutes;
    return html;
  }).join('')}</ol>`).join('');
  const doneCount = picked.filter((q) => done.includes(q.id)).length;
  const summary = picked.length ? `${picked.length} question${picked.length === 1 ? '' : 's'} · ${doneCount} done` : 'No questions picked yet';

  const stepHtml = steps.map((s) => {
    const onPage = s.href === route;
    const current = s.state === 'current' && (onPage ? 'page' : 'step');
    const head = row({ ...s, current, now: onPage });
    if (s !== deep) return `<li class="run-step">${head}</li>`;
    return `<li class="run-step run-deep${s.state === 'current' ? ' is-now' : ''}">${head}<p class="run-summary">${summary}</p><div class="run-questions">${groups}</div></li>`;
  }).join('');

  // The bar runs part by part, the deep dive split into its questions, so done time fills from the left;
  // unpicked deep dive minutes and spare minutes in the hour stay empty.
  const used = picked.reduce((sum, q) => sum + q.minutes, 0);
  const segs = [steps[0], steps[1], ...picked.map((q) => ({ minutes: q.minutes, state: qState(q) })),
    { minutes: Math.max(0, dd.minutes - used), state: 'free' }, steps[3]];
  const total = timelineTotal(round, parts, dd);
  const planned = segs.reduce((sum, s) => sum + s.minutes, 0);
  const spare = round.minutes - planned;
  const bar = segs.filter((s) => s.minutes > 0).map((s) => `<span class="run-seg is-${s.state}" style="--m: ${s.minutes}"></span>`).join('')
    + (spare > 0 ? `<span class="run-seg is-free" style="--m: ${spare}"></span>` : '')
    + (spare < 0 ? `<span class="run-hour" style="--hour: ${(round.minutes / planned) * 100}"></span>` : '');

  return `<ol class="run" aria-label="Run of show">${stepHtml}</ol>
    <div class="run-total"><div class="run-bar" aria-hidden="true">${bar}</div><p class="run-total-text${total.over ? ' is-over' : ''}">${total.text}</p></div>
    ${allQuestions(pools, picked)}
    ${needsCheck(questions)}`;
}

export default {
  label: 'Run of show',
  render,
  bind(el, { picked, question, route }) {
    for (const a of el.querySelectorAll('.all-questions a, .needs-check a')) {
      if (a.getAttribute('href') === route) a.setAttribute('aria-current', 'page');
    }
    for (const id of detailsToOpen(question, picked)) el.querySelector(`#${CSS.escape(id)}`).open = true;
  },
};
