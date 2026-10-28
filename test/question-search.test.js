// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { bindQuestionSearch, questionSearch } from '../src/components/question-search.js';

const q = (id, title, extra = {}) => ({ id, title, minutes: 5, href: `#/r/deep/${id}`, inPlan: false, done: false, ...extra });
const groups = [{ id: 'css', name: 'CSS', options: [q('c1', 'Center a box', { inPlan: true, done: true }), q('c2', 'Specificity clash')] },
  { id: 'react', name: 'React', options: [q('r1', 'Lift state up'), q('r2', 'Keys in a list')] }];
const data = (route = '#/r/intro') => ({ groups, route });

// The page around it: the button that opened it, then the dialog.
function open(route) {
  document.body.innerHTML = `<button type="button" class="opener">Browse all questions</button>${questionSearch()}`;
  const dialog = document.querySelector('.question-search');
  const search = bindQuestionSearch(dialog);
  const opener = document.querySelector('.opener');
  opener.focus();
  search.open(data(route), opener);
  return { dialog, box: dialog.querySelector('.question-search-box'), opener, search };
}
const press = (target, key, extra = {}) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(e);
  return e;
};
const type = (box, text) => { box.value = text; box.dispatchEvent(new Event('input', { bubbles: true })); };
const shown = (dialog) => [...dialog.querySelectorAll('.question-search-option:not([hidden])')].map((o) => o.querySelector('.question-search-name').textContent);
const active = (dialog, box) => dialog.querySelector(`#${box.getAttribute('aria-activedescendant')}`)?.querySelector('.question-search-name').textContent;

test('the dialog is a modal named All questions, with a search box that lists every question by pool', () => {
  const { dialog, box } = open();
  expect([
    dialog.localName, dialog.open, document.getElementById(dialog.getAttribute('aria-labelledby')).textContent,
    document.activeElement === box, box.getAttribute('role'), box.getAttribute('aria-controls'),
    [...dialog.querySelectorAll('[role="group"]')].map((g) => document.getElementById(g.getAttribute('aria-labelledby')).textContent),
    shown(dialog), dialog.querySelector('.question-search-count').textContent, active(dialog, box),
  ]).toEqual(['dialog', true, 'All questions', true, 'combobox', 'question-search-list', ['CSS', 'React'],
    ['Center a box', 'Specificity clash', 'Lift state up', 'Keys in a list'], '4 questions', 'Center a box']);
});

test('each option says its minutes, and whether it is in the plan or done', () => {
  const { dialog } = open();
  expect([...dialog.querySelectorAll('.question-search-tag')].map((t) => t.textContent)).toEqual(['5 min · in plan · done', '5 min', '5 min', '5 min']);
});

test('typing filters by title and pool, marks each match, and makes the first match active', () => {
  const { dialog, box } = open();
  type(box, 'cs cla');
  expect([shown(dialog), dialog.querySelector('.question-search-option:not([hidden]) .question-search-name').innerHTML,
    dialog.querySelector('[role="group"]:not([hidden]) .question-search-pool').innerHTML,
    [...dialog.querySelectorAll('[role="group"]')].map((g) => g.hidden), dialog.querySelector('.question-search-count').textContent, active(dialog, box)])
    .toEqual([['Specificity clash'], 'Specificity <mark class="question-search-hit">cla</mark>sh', '<mark class="question-search-hit">CS</mark>S', [false, true], '1 question', 'Specificity clash']);
});

test('no match says so and leaves nothing active', () => {
  const { dialog, box } = open();
  type(box, 'zebra');
  expect([shown(dialog), dialog.querySelector('.question-search-count').textContent, box.hasAttribute('aria-activedescendant')]).toEqual([[], 'No questions match', false]);
});

test('Down and Up move the active option through the matches, wrapping at the ends, with aria-selected following', () => {
  const { dialog, box } = open();
  const seen = [];
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp']) {
    press(box, key);
    seen.push(active(dialog, box));
  }
  expect([seen, [...dialog.querySelectorAll('[aria-selected="true"]')].length]).toEqual([['Specificity clash', 'Lift state up', 'Keys in a list', 'Center a box', 'Keys in a list'], 1]);
});

test('Enter opens the active question and closes the dialog', () => {
  const { dialog, box } = open();
  press(box, 'ArrowDown');
  const enter = press(box, 'Enter');
  expect([location.hash, dialog.open, enter.defaultPrevented]).toEqual(['#/r/deep/c2', false, true]);
});

test('a click on an option opens it', () => {
  const { dialog } = open();
  dialog.querySelectorAll('.question-search-option')[2].click();
  expect([location.hash, dialog.open]).toEqual(['#/r/deep/r1', false]);
});

test('Escape with text clears the box and the filter and keeps the dialog open', () => {
  const { dialog, box } = open();
  type(box, 'clash');
  const esc = press(box, 'Escape');
  expect([box.value, shown(dialog).length, esc.defaultPrevented, dialog.open]).toEqual(['', 4, true, true]);
});

test("the search box's own clear button (a search event) clears the filter too", () => {
  const { dialog, box } = open();
  type(box, 'clash');
  box.value = '';
  box.dispatchEvent(new Event('search', { bubbles: true }));
  expect(shown(dialog).length).toBe(4);
});

test('Tab stays inside the dialog: past the last control it wraps to the first, and Shift+Tab wraps back', () => {
  const { dialog, box } = open();
  const close = dialog.querySelector('.question-search-close');
  const tab = press(box, 'Tab');
  const first = document.activeElement === close;
  const back = press(close, 'Tab', { shiftKey: true });
  expect([first, tab.defaultPrevented, document.activeElement === box, back.defaultPrevented]).toEqual([true, true, true, true]);
});

test('closing hands focus back to the button that opened it', () => {
  const { dialog, opener } = open();
  dialog.querySelector('.question-search-close').click();
  expect([dialog.open, document.activeElement === opener]).toEqual([false, true]);
});

test('Enter on the question already showing just closes the dialog', () => {
  location.hash = '#/r/deep/c1';
  const { dialog, box } = open('#/r/deep/c1');
  const enter = press(box, 'Enter');
  expect([location.hash, dialog.open, enter.defaultPrevented]).toEqual(['#/r/deep/c1', false, true]);
});

test('opening again starts from an empty search with every question shown', () => {
  const { dialog, box, opener, search } = open();
  type(box, 'clash');
  dialog.close();
  search.open(data(), opener);
  expect([box.value, shown(dialog).length, active(dialog, box)]).toEqual(['', 4, 'Center a box']);
});
