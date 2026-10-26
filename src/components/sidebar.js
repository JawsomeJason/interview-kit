import { esc } from '../esc.js';
import { helpHint } from './help.js';
import { needsCheck, runOfShow, timelineTotal, totalMeter } from './nav.js';
import { reviewDot } from './review-mark.js';
import './sidebar.css';

// The plan in running order, each step with the minute it is planned to start at.
// Picked questions run back to back inside the deep dive; the outro starts when the deep dive ends.
function plan(round, parts, dd, picked) {
  const steps = runOfShow(round, parts, dd).map(({ id, name, minutes, start }) => ({ id, href: `#/${id}`, title: name, minutes, start }));
  const deep = steps.findIndex((s) => s.id === 'deep-dive');
  let at = steps[deep].start;
  steps.splice(deep + 1, 0, ...picked.map((q) => ({ href: `#/q/${q.id}`, title: q.title, minutes: q.minutes, start: (at += q.minutes) - q.minutes, q })));
  return steps;
}

const meta = (bits) => `<p class="now-next-meta">${bits.filter(Boolean).join(' · ')}</p>`;

function nowBlock(step, round, { picked, done, offPlan }) {
  const isDone = step.q && done.includes(step.q.id);
  const progress = step.href === '#/deep-dive' && picked.length
    ? `${picked.length} questions, ${picked.filter((q) => done.includes(q.id)).length} done` : '';
  return `<div class="now-next-now"><h2 class="now-next-label">Now</h2>
    <a href="${esc(step.href)}" class="now-next-title">${esc(step.title)}${step.q ? reviewDot(step.q) : ''}</a>
    ${step.q ? meta([esc(step.q.poolName), offPlan && 'Not in the plan', isDone && 'Done ✓']) : ''}
    ${meta([`${step.minutes} min`, offPlan ? '' : `minute ${step.start} to ${step.start + step.minutes} of ${round.minutes}`])}
    ${progress ? meta([progress]) : ''}</div>`;
}

const nextBlock = (step) => `<div class="now-next-next"><h2 class="now-next-label">Next up</h2>${step
  ? `<a href="${esc(step.href)}" class="now-next-next-title">${esc(step.title)}${step.q ? reviewDot(step.q) : ''}</a>
    ${meta([step.q && esc(step.q.poolName), `${step.minutes} min`])}`
  : '<p class="now-next-meta">Nothing after this. The round is wrapping up.</p>'}</div>`;

// The plan as a run of show: every row one link with its start time, a state dot on the rail, its name and planned
// minutes. Rows before the current part read as done; the deep dive's questions sit under it, grouped by pool.
const runClock = (minutes) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

const runDot = (state) => (state === 'done'
  ? '<span class="run-dot" role="img" aria-label="Done"></span>'
  : '<span class="run-dot" aria-hidden="true"></span>');

// The start time is a visual aid for pacing, so it stays out of the link's name.
const runRow = ({ href, name, minutes, at, state, current, now }) => `<a href="${href}" class="run-row is-${state}"${current ? ` aria-current="${current}"` : ''}>`
  + `<span class="run-at" aria-hidden="true">${runClock(at)}</span><span class="run-name">${name}${now ? ' <span class="run-now">Now</span>' : ''}</span>`
  + `${runDot(state)}<span class="run-mins">${minutes} min</span></a>`;

// `route` is the page showing, with the empty route already read as the round page.
function runOfShowList(round, parts, dd, picked, done, route) {
  const steps = runOfShow(round, parts, dd).map(({ id, name, minutes, start }) => ({ id, href: `#/${id}`, name: esc(name), minutes, at: start }));
  // A question page sits inside the deep dive.
  const nowHref = route.startsWith('#/q/') ? '#/deep-dive' : route;
  const now = steps.findIndex((s) => s.href === nowHref);
  const stateOf = (i) => (i < now ? 'done' : i === now ? 'current' : 'upcoming');
  const deep = steps.find((s) => s.id === 'deep-dive');
  const qState = (q) => (route === `#/q/${q.id}` ? 'current' : done.includes(q.id) ? 'done' : 'upcoming');
  let qAt = deep.at;
  const groups = [...Map.groupBy(picked, (q) => q.pool).values()].map((qs) => `<h2 class="run-pool">${esc(qs[0].poolName)}</h2><ol class="run-sub">${qs.map((q) => {
    const state = qState(q);
    const html = `<li>${runRow({ href: `#/q/${esc(q.id)}`, name: `${esc(q.title)}${reviewDot(q)}`, minutes: q.minutes, at: qAt, state, current: state === 'current' && 'page', now: state === 'current' })}</li>`;
    qAt += q.minutes;
    return html;
  }).join('')}</ol>`).join('');
  return `<ol class="run" aria-label="Run of show">${steps.map((s, i) => {
    const state = stateOf(i);
    const onPage = s.href === route;
    const head = runRow({ ...s, state, current: state === 'current' && (onPage ? 'page' : 'step'), now: onPage });
    return s === deep ? `<li class="run-step run-deep">${head}${groups ? `<div class="run-questions">${groups}</div>` : ''}</li>` : `<li class="run-step">${head}</li>`;
  }).join('')}</ol>`;
}

// The present first: what is on now, what comes next, the rest of the plan, and a way to browse every question.
// The empty route shows the round page, so it counts as the round part. render fills .sidebar-body and bind wires it,
// both on every nav update, with ctx = { round, parts, dd, picked, done, questions, question, route, browse(opener) };
// browse opens All questions. A <details> with an id keeps its open state across updates.
export default {
  render({ round, parts, dd, picked, done, questions, question, route }) {
    const steps = plan(round, parts, dd, picked);
    const here = steps.findIndex((s) => s.href === (route || '#/round'));
    const offPlan = here === -1 && question;
    const now = offPlan ? { href: route, title: question.title, minutes: question.minutes, q: question } : steps[Math.max(here, 0)];
    // Done questions are skipped, so Next up is always something still to ask. A question off the plan
    // was browsed to during the deep dive, so Next up picks up from there.
    const next = steps.slice((offPlan ? steps.findIndex((s) => s.id === 'deep-dive') : Math.max(here, 0)) + 1).find((s) => !(s.q && done.includes(s.q.id)));
    const total = timelineTotal(round, parts, dd);
    return `${nowBlock(now, round, { picked, done, offPlan })}${nextBlock(next)}
      <details id="sidebar-rest" class="now-next-rest" open><summary class="now-next-rest-summary">Rest of the plan
        <span class="now-next-total${total.over ? ' is-over' : ''}">${total.text}</span></summary>
        ${runOfShowList(round, parts, dd, picked, done, route || '#/round')}<div class="now-next-meter">${totalMeter(total)}${helpHint('time-meter')}</div>${needsCheck(questions)}</details>
      <button type="button" class="now-next-browse">Browse all questions</button>`;
  },
  bind(el, { route, browse }) {
    const current = route || '#/round';
    // The plan rows mark themselves; this marks Now and the cards being reviewed.
    for (const a of el.querySelectorAll('a:not(.run-row)')) {
      if (a.getAttribute('href') === current) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    el.querySelector('.now-next-browse').onclick = ({ currentTarget }) => browse(currentTarget);
  },
};
