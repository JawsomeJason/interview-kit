import { expect, test } from 'vitest';
import { bindQuestionNotes, questionNotes, withDone, withNotes } from '../src/components/question-notes.js';

test('typed notes persist in state and render back into the textarea', () => {
  const state = withNotes({ round: 'pair' }, 'r1', 'Line 1\nUses <Suspense>');
  expect(state).toEqual({ round: 'pair', notes: { r1: 'Line 1\nUses <Suspense>' } });
  expect(questionNotes(state.notes.r1, false)).toContain('<textarea class="question-notes-text" rows="4" aria-label="Notes">Line 1\nUses &#60;Suspense&#62;</textarea>');
});

test('done toggles in state and the button label switches', () => {
  const done = withDone({ done: [] }, 'r1');
  expect([done.done, withDone(done, 'r1').done]).toEqual([['r1'], []]);
  expect([questionNotes('', false), questionNotes('', true)].map((html) => html.match(/class="question-notes-done"[^>]*>([^<]*)</)[1]))
    .toEqual(['Mark done', 'Done ✓']);
});

test('toggling done only relabels its button, nothing re-renders', () => {
  const button = { textContent: 'Mark done', setAttribute(name, value) { this[name] = value; } };
  const el = { querySelector: (sel) => (sel === 'textarea' ? { addEventListener() {} } : button) };
  let calls = 0;
  bindQuestionNotes(el, { onNotes() {}, onDone: () => { calls += 1; return true; } });
  button.onclick();
  expect([calls, button.textContent, button['aria-pressed']]).toEqual([1, 'Done ✓', 'true']);
});

test('Mark done says whether it is pressed', () => {
  expect([questionNotes('', false), questionNotes('', true)].map((html) => html.match(/class="question-notes-done" aria-pressed="([^"]*)"/)?.[1]))
    .toEqual(['false', 'true']);
});
