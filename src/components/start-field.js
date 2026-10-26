import { fromLocalInput, otherRange } from '../start-time.js';

// Why Start can't go yet, or '' once it can: it needs a name and, when Other time is picked (other is the field's
// value), a date and time inside the window.
export const startProblem = (name, other) => (!name.trim() ? 'Add a name to start.'
  : other !== undefined && fromLocalInput(other) === undefined ? 'Pick a start time from a day ago to a week ahead.' : '');

// The min and max attributes for an Other time field.
export const otherLimits = (now = Date.now()) => {
  const { min, max } = otherRange(now);
  return ` min="${min}" max="${max}"`;
};

export const showProblem = (note, button, problem) => { note.textContent = problem; note.hidden = !problem; button.disabled = Boolean(problem); };

// A start choice's value as a picked slot (epoch ms), or undefined for Now and Other time.
export const pickedSlot = (value) => (value && value !== 'other' ? Number(value) : undefined);
