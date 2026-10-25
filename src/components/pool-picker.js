import { esc } from '../esc.js';
import { poolStatus } from '../pick.js';
import { helpHint } from './help.js';
import { hint } from './hint.js';
import { optionRow } from './option-row.js';
import './pool-picker.css';

const note = (s, id) => {
  if (s.order) return s.order === 1 ? 'main focus' : String(s.order);
  if (!s.noRoom) return '';
  return hint(`room-${id}`, 'no room', s.minutesNeeded ? `${s.minutesNeeded} minutes required to include` : "Doesn't fit even at 60 minutes");
};

export const poolPicker = (dd, pools) => `<fieldset class="pool-picker"><legend>Pools${helpHint('pick')}</legend>${[...pools].map(([id, qs]) => {
  const s = poolStatus(dd, pools, id);
  // The note holds a hint button, which can't sit inside the label, so it follows the option row.
  return `<div class="pool-picker-row">${optionRow({ type: 'checkbox', value: id, checked: Boolean(s.order), disabled: s.noRoom }, esc(qs[0].poolName))}`
    + ` <small class="pool-picker-note">${note(s, id)}</small></div>`;
}).join('')}</fieldset>`;

// Updates notes and disabled state in place, so the focused checkbox keeps focus.
export function refreshPoolPicker(el, dd, pools) {
  for (const box of el.querySelectorAll('input')) {
    const s = poolStatus(dd, pools, box.value);
    box.closest('.pool-picker-row').querySelector('.pool-picker-note').innerHTML = note(s, box.value);
    box.disabled = Boolean(s.noRoom);
  }
}
