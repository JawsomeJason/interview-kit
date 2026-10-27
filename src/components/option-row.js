import { esc } from '../esc.js';
import './option-row.css';

// One checkbox or radio with its label text beside it: a wrapped line lines up with the text, never under
// the control, and the whole row stays clickable. The control sits centered in a one-line box, so it lines up
// with the first line whatever size or margin a theme gives it. Used by every checkbox and radio list.
export const optionRow = ({ type, name, value, checked, disabled, key }, text, cls = '') =>
  `<label class="option-row${cls ? ` ${cls}` : ''}"><span class="option-row-box"><input type="${type}"${name ? ` name="${esc(name)}"` : ''} value="${esc(value)}"`
  + `${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}${key ? ` data-key="${esc(key)}"` : ''} class="option-row-control"></span><span class="option-row-text">${text}</span></label>`;
