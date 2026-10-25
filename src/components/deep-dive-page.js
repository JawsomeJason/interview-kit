import { copySummary } from './copy-summary.js';
import { helpHint } from './help.js';
import { bindMinutesControl, minutesControl } from './minutes-control.js';
import { pickedList } from './picked-list.js';
import { poolPicker, refreshPoolPicker } from './pool-picker.js';

export const deepDivePage = (dd, pools, rounds, picked, ticks, done) => `<section class="deep-dive"><h1>Deep dive</h1>
  ${minutesControl(dd.minutes, rounds)}${poolPicker(dd, pools)}
  <div class="picked-list">${pickedList(picked, dd.minutes, ticks, done)}</div>
  <p>${copySummary()}${helpHint('copy-summary')}</p></section>`;

export function bindDeepDive(el, dd, pools, ticks, done, update) {
  const list = el.querySelector('.picked-list');
  const links = () => [...list.querySelectorAll('.question-link')];
  // Rows for newly picked questions fade in one after another (picked-list.css); rows that stay redraw in place.
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
