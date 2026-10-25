import { esc } from '../esc.js';
import './minutes-control.css';

export const minutesControl = (minutes, rounds) => `<p class="minutes-control">
  <label>Minutes <input class="minutes-control-range" type="range" min="5" max="60" step="1" value="${minutes}"></label>
  <input class="minutes-control-number" type="number" min="5" max="60" step="1" value="${minutes}" aria-label="Minutes, type a number">
  ${rounds.map((r) => `<button type="button" class="minutes-control-preset" data-minutes="${r.deepDiveMinutes}">
    ${esc(r.name)} · ${r.deepDiveMinutes} min</button>`).join(' ')}</p>`;

export function bindMinutesControl(el, onChange) {
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
