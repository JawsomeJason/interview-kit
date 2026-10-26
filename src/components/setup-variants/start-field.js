import { esc } from '../../esc.js';
import { fromLocalInput, otherRange, startOptions } from '../../start-time.js';

// Why Start can't go yet, or '' once it can: it needs a name and, when Other time is picked (other is the field's
// value), a date and time inside the window.
export const startProblem = (name, other) => (!name.trim() ? 'Add a name to start.'
  : other !== undefined && fromLocalInput(other) === undefined ? 'Pick a start time from a day ago to a week ahead.' : '');

// The min and max attributes for an Other time field.
export const otherLimits = (now = Date.now()) => {
  const { min, max } = otherRange(now);
  return ` min="${min}" max="${max}"`;
};

// The <option>s of a start select: Now, the quarter-hour slots, then Other time…, with `selected` (a select value) picked.
export const startSelectOptions = (options, selected = '') => `${options.map(({ label, value }) =>
  `<option value="${value ?? ''}"${String(value ?? '') === selected ? ' selected' : ''}>${esc(label)}</option>`).join('')}<option value="other"${selected === 'other' ? ' selected' : ''}>Other time…</option>`;

// The Other field's value while Other time is picked, else undefined: startProblem's second argument.
export const otherValue = (select, other) => (select.value === 'other' ? other.value : undefined);

// The start a select and its Other field pick, as epoch ms; undefined is Now.
export const startedAtOf = (select, other) => (select.value === 'other' ? fromLocalInput(other.value) : pickedSlot(select.value));

// Says why Start can't go yet under it, and holds it until there is nothing to say.
export const showProblem = (note, button, problem) => { note.textContent = problem; note.hidden = !problem; button.disabled = Boolean(problem); };

// A select value as a picked slot (epoch ms), or undefined for Now and Other time.
export const pickedSlot = (value) => (value && value !== 'other' ? Number(value) : undefined);

// Brings a start select's slots and its Other field's limits up to the clock, keeping what is picked, and returns
// the new start choices.
export function refreshStart(select, other, now) {
  const picked = select.value;
  const options = startOptions(now, pickedSlot(picked));
  select.innerHTML = startSelectOptions(options, picked);
  select.value = picked;
  Object.assign(other, otherRange(now));
  return options;
}
