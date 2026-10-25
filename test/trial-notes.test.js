// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import { packTheme } from '../src/content.js';
import { noteLines } from '../src/components/trial-notes.js';

// The real app, booted on a picked round of the sample pack, given a pack theme.
vi.mock('../src/content.js', async (original) => ({ ...(await original()), packTheme: { id: 'brand', name: 'Fixture' } }));
localStorage.setItem('interview-kit', JSON.stringify({ round: 'sample', candidate: 'Ada' }));
document.body.innerHTML = '<div id="root" class="app"></div>';
await import('../src/main.js');
const root = document.getElementById('root');
const panel = () => root.querySelector('.trials-panel');
const labels = () => [...panel().querySelectorAll('.trial-note')].map((l) => l.textContent.trim());
const note = (group) => panel().querySelector(`.trial-note-text[data-group="${group}"]`);
const type = (field, text) => { field.value = text; field.dispatchEvent(new Event('input', { bubbles: true })); };
const saved = () => JSON.parse(localStorage.getItem('interview-kit-layout')).notes;

test('every group in Try layouts has a notes box in view, labelled for the variant picked', () => {
  expect([labels(), panel().querySelector('details'), panel().querySelectorAll('.trial-note-text[hidden]').length])
    .toEqual([['Notes on Question layout A', 'Notes on Header A', 'Notes on Sidebar A', 'Notes on Setup page C', `Notes on Theme ${packTheme.name}`], null, 0]);
});

test('a note saves for its variant, makes way for the next pick, and comes back on switching back', () => {
  type(note('layout'), 'header crowds the pager');
  panel().querySelector('[data-layout="b"]').click();
  const onB = [labels()[0], note('layout').value];
  type(note('layout'), 'too wide');
  panel().querySelector('[data-layout="a"]').click();
  expect([onB, note('layout').value, saved()]).toEqual([['Notes on Question layout B', ''], 'header crowds the pager',
    { 'Question layout A': 'header crowds the pager', 'Question layout B': 'too wide' }]);
});

test('New interview keeps the notes', () => {
  root.querySelector('.app-header .header-a-menu').hidePopover = () => {};
  root.querySelector('.app-header .header-a-reset').click();
  expect(saved()['Question layout A']).toBe('header crowds the pager');
});

test('Copy summary lists only the notes with text, in panel order, after the Setup line', () => {
  expect(noteLines({ 'Sidebar C': 'jumps around', 'Theme Default': '  ', 'Question layout B': 'header crowds the pager\n', 'Setup page B': '' }))
    .toEqual(['Question layout B: header crowds the pager', 'Sidebar C: jumps around']);
});

// Unindented, a note's second line read as a line of the summary itself, and tally-trials dropped it.
test("a note's later lines are indented under its first in Copy summary", () => {
  expect(noteLines({ 'Header B': 'clock is too small\nand the menu hides New interview\n' }))
    .toEqual(['Header B: clock is too small', '  and the menu hides New interview']);
});
