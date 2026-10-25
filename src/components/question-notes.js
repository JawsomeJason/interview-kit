import { esc } from '../esc.js';
import './question-notes.css';

export const withNotes = (state, id, text) => ({ ...state, notes: { ...state.notes, [id]: text } });
export const withDone = (state, id) => {
  const done = state.done ?? [];
  return { ...state, done: done.includes(id) ? done.filter((d) => d !== id) : [...done, id] };
};

const doneLabel = (isDone) => (isDone ? 'Done ✓' : 'Mark done');

// Muted with a check, still readable: shared by the sidebar and the Deep dive list.
// The check slot is always there, hidden until done, so marking done never reflows the line.
export const doneText = (html, isDone) => `<span class="done-mark${isDone ? ' is-done' : ''}">${html}&nbsp;<span class="done-mark-check">✓</span></span>`;

export const questionNotes = (notes = '', isDone = false) => `<section class="question-notes" id="q-notes"><h2 class="panel-title">Notes</h2>
  <textarea class="question-notes-text" rows="4" aria-label="Notes">${esc(notes)}</textarea>
  <p><button type="button" class="question-notes-done" aria-pressed="${isDone}">${doneLabel(isDone)}</button></p></section>`;

// Saves as you type without re-rendering, so the caret stays put.
export function bindQuestionNotes(el, { onNotes, onDone }) {
  el.querySelector('textarea').addEventListener('input', ({ target }) => onNotes(target.value));
  const button = el.querySelector('.question-notes-done');
  button.onclick = () => {
    const isDone = onDone();
    button.textContent = doneLabel(isDone);
    button.setAttribute('aria-pressed', String(isDone));
  };
}
