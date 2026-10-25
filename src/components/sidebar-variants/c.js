import { esc } from '../../esc.js';
import { needsCheck, timeline, timelineTotal, totalMeter } from '../nav.js';
import { questionLink } from '../question-parts.js';
import { doneText } from '../question-notes.js';
import { reviewDot } from '../review-mark.js';
import './c.css';

// The plan in running order, each step with the minute it is planned to start at.
// Picked questions run back to back inside the deep dive; the outro starts when the deep dive ends.
function plan(round, { intro, outro }, dd, picked) {
  const roundMinutes = round.minutes - intro.minutes - outro.minutes - round.deepDiveMinutes;
  const ddStart = intro.minutes + roundMinutes;
  let at = ddStart;
  return [
    { href: '#/intro', title: intro.name, minutes: intro.minutes, start: 0 },
    { href: '#/round', title: round.name, minutes: roundMinutes, start: intro.minutes },
    { href: '#/deep-dive', title: 'Deep dive', minutes: dd.minutes, start: ddStart },
    ...picked.map((q) => ({ href: `#/q/${q.id}`, title: q.title, minutes: q.minutes, start: (at += q.minutes) - q.minutes, q })),
    { href: '#/outro', title: outro.name, minutes: outro.minutes, start: ddStart + dd.minutes },
  ];
}

const DEEP_DIVE = 2;

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

// Every pool's questions in one list; bind filters it by title and pool as you type.
const browseDialog = (pools, picked, done) => `<dialog id="sidebar-c-browse" class="now-next-dialog" aria-labelledby="sidebar-c-browse-title" closedby="any">
  <div class="now-next-dialog-head"><h2 id="sidebar-c-browse-title" class="now-next-dialog-title">All questions</h2>
    <button type="button" class="now-next-dialog-close" commandfor="sidebar-c-browse" command="close">Close</button></div>
  <input type="search" class="now-next-search" aria-label="Search questions by title or pool" placeholder="Search by title or pool" autofocus>
  <p class="now-next-count" role="status"></p>
  <div class="now-next-pools">${[...pools].map(([, qs]) => `<section class="now-next-pool"><h3 class="now-next-pool-name">${esc(qs[0].poolName)}</h3>
    <ul class="now-next-hits">${qs.map((q) => `<li class="now-next-hit" data-search="${esc(`${q.title} ${q.poolName}`.toLowerCase())}">${
      doneText(questionLink(q, `${esc(q.title)}${reviewDot(q)}`), done.includes(q.id))}
      <small class="now-next-tag">${q.minutes} min${picked.includes(q) ? ' · in plan' : ''}</small></li>`).join('')}</ul></section>`).join('')}</div>
</dialog>`;

function filter(dialog, text) {
  const terms = text.toLowerCase().split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const hit of dialog.querySelectorAll('.now-next-hit')) {
    hit.hidden = !terms.every((t) => hit.dataset.search.includes(t));
    shown += !hit.hidden;
  }
  for (const pool of dialog.querySelectorAll('.now-next-pool')) pool.hidden = !pool.querySelector('.now-next-hit:not([hidden])');
  dialog.querySelector('.now-next-count').textContent = shown ? `${shown} question${shown === 1 ? '' : 's'}` : 'No questions match';
}

// The present first: what is on now, what comes next, and the rest of the plan one click away.
// The empty route shows the round page, so it counts as the round part.
export default {
  label: 'Now and next',
  render({ round, parts, dd, picked, done, pools, questions, question, route }) {
    const steps = plan(round, parts, dd, picked);
    const here = steps.findIndex((s) => s.href === (route || '#/round'));
    const offPlan = here === -1 && question;
    const now = offPlan ? { href: route, title: question.title, minutes: question.minutes, q: question } : steps[Math.max(here, 0)];
    // Done questions are skipped, so Next up is always something still to ask. A question off the plan
    // was browsed to during the deep dive, so Next up picks up from there.
    const next = steps.slice((offPlan ? DEEP_DIVE : Math.max(here, 0)) + 1).find((s) => !(s.q && done.includes(s.q.id)));
    const total = timelineTotal(round, parts, dd);
    return `${nowBlock(now, round, { picked, done, offPlan })}${nextBlock(next)}
      <details id="sidebar-c-rest" class="now-next-rest"><summary class="now-next-rest-summary">Rest of the plan
        <span class="now-next-total${total.over ? ' is-over' : ''}">${total.text}</span>${totalMeter(total)}</summary>
        <div class="timeline">${timeline(round, parts, dd, picked, done)}</div>${needsCheck(questions)}</details>
      <button type="button" class="now-next-browse" commandfor="sidebar-c-browse" command="show-modal">Browse all questions</button>
      ${browseDialog(pools, picked, done)}`;
  },
  bind(el, { route }) {
    const current = route || '#/round';
    for (const a of el.querySelectorAll('a')) {
      if (a.getAttribute('href') === current) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    const dialog = el.querySelector('.now-next-dialog');
    const search = dialog.querySelector('.now-next-search');
    filter(dialog, '');
    // The box's own clear button fires search, not always input.
    for (const type of ['input', 'search']) search.addEventListener(type, () => filter(dialog, search.value));
    // Enter opens the first match. A link to the page already showing changes no hash, so it just closes; the key is spent
    // there, or it would go on to press Browse all questions, which takes focus back as the dialog closes, and reopen it.
    // Escape with text clears the box and the filter, as in sidebar D; on an empty box it closes the dialog.
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        dialog.querySelector('.now-next-hit:not([hidden]) a')?.click();
      } else if (e.key === 'Escape' && search.value) {
        e.preventDefault();
        search.value = '';
        filter(dialog, '');
      }
    });
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('a')?.getAttribute('href') === current) dialog.close();
    });
  },
};
