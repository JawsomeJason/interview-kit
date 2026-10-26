import { esc } from '../esc.js';
import { poolStatus } from '../pick.js';
import { score } from './copy-summary.js';
import { helpHint } from './help.js';
import { hint } from './hint.js';
import { optionRow } from './option-row.js';
import { questionLink, questionMeta } from './question-parts.js';
import { doneText } from './question-notes.js';
import './deep-dive-page.css';

const minutesControl = (minutes, rounds) => `<p class="minutes-control">
  <label>Minutes <input class="minutes-control-range" type="range" min="5" max="60" step="1" value="${minutes}"></label>
  <input class="minutes-control-number" type="number" min="5" max="60" step="1" value="${minutes}" aria-label="Minutes, type a number">
  ${rounds.map((r) => `<button type="button" class="minutes-control-preset" data-minutes="${r.deepDiveMinutes}">
    ${esc(r.name)} · ${r.deepDiveMinutes} min</button>`).join(' ')}</p>`;

function bindMinutesControl(el, onChange) {
  const inputs = el.querySelectorAll('input');
  let minutes = Number(inputs[0].value);
  // Skips the input being typed into, so its caret and partial text stay put.
  const set = (v, source) => {
    if (!Number.isInteger(v) || v < 5 || v > 60) return;
    minutes = v;
    for (const input of inputs) if (input !== source) input.value = v;
    onChange(v);
  };
  el.addEventListener('input', ({ target }) => set(Number(target.value), target));
  el.addEventListener('click', ({ target }) => {
    const preset = target.closest('[data-minutes]');
    if (preset) set(Number(preset.dataset.minutes));
  });
  inputs[1].onchange = () => { inputs[1].value = minutes; };
}

const note = (s, id) => {
  if (s.order) return s.order === 1 ? 'main focus' : String(s.order);
  if (!s.noRoom) return '';
  return hint(`room-${id}`, 'no room', s.minutesNeeded ? `${s.minutesNeeded} minutes required to include` : "Doesn't fit even at 60 minutes");
};

const poolPicker = (dd, pools) => `<fieldset class="pool-picker"><legend>Pools${helpHint('pick')}</legend>${[...pools].map(([id, qs]) => {
  const s = poolStatus(dd, pools, id);
  // The note holds a hint button, which can't sit inside the label, so it follows the option row.
  return `<div class="pool-picker-row">${optionRow({ type: 'checkbox', value: id, checked: Boolean(s.order), disabled: s.noRoom }, esc(qs[0].poolName))}`
    + ` <small class="pool-picker-note">${note(s, id)}</small></div>`;
}).join('')}</fieldset>`;

// Updates notes and disabled state in place, so the focused checkbox keeps focus.
function refreshPoolPicker(el, dd, pools) {
  for (const box of el.querySelectorAll('input')) {
    const s = poolStatus(dd, pools, box.value);
    box.closest('.pool-picker-row').querySelector('.pool-picker-note').innerHTML = note(s, box.value);
    box.disabled = Boolean(s.noRoom);
  }
}

const scoreLabel = (q, ticked = []) => {
  const word = score(ticked.length, q.lookFor.length);
  return word ? ` <small class="score-label">${word}</small>` : '';
};

export const pickedList = (picked, minutes, ticks = {}, done = []) => `<ol class="picked-list-items">${picked.map((q) => `<li>${
  doneText(`${questionLink(q)} · ${questionMeta(q)}${scoreLabel(q, ticks[q.id])}`, done.includes(q.id))}</li>`).join('')}</ol>
  <p class="picked-list-total">${picked.reduce((sum, q) => sum + q.minutes, 0)} min of ${minutes}</p>${
  picked.some((q) => ticks[q.id]?.length) ? `<p class="picked-list-scores">Scores come from your Look for ticks.${helpHint('score-after')}</p>` : ''}`;

export const deepDivePage = (dd, pools, rounds, picked, ticks, done) => `<section class="deep-dive"><h1>Deep dive</h1>
  ${minutesControl(dd.minutes, rounds)}${poolPicker(dd, pools)}
  <div class="picked-list">${pickedList(picked, dd.minutes, ticks, done)}</div>
  <p><button type="button" class="copy-summary">Copy summary</button>${helpHint('copy-summary')}</p></section>`;

export function bindDeepDive(el, dd, pools, ticks, done, update) {
  const list = el.querySelector('.picked-list');
  const links = () => [...list.querySelectorAll('.question-link')];
  // Rows for newly picked questions fade in one after another (deep-dive-page.css); rows that stay redraw in place.
  const refresh = () => {
    refreshPoolPicker(el.querySelector('.pool-picker'), dd, pools);
    const before = new Set(links().map((a) => a.getAttribute('href')));
    list.innerHTML = pickedList(update(), dd.minutes, ticks, done);
    for (const a of links()) a.closest('li').toggleAttribute('data-new', !before.has(a.getAttribute('href')));
  };
  bindMinutesControl(el.querySelector('.minutes-control'), (minutes) => { dd.minutes = minutes; refresh(); });
  el.querySelector('.pool-picker').addEventListener('input', ({ target }) => {
    dd.pools = target.checked ? [...dd.pools, target.value] : dd.pools.filter((id) => id !== target.value);
    refresh();
  });
}
