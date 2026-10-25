// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';

// The real app on the setup page, with a second trial setup page added to the registry and picked in the prefs.
vi.mock('../src/components/setup-variants/index.js', async (original) => {
  const real = await original();
  const b = { label: 'Test', render: () => '<main class="main"><h1>Setup B</h1></main>', bind: () => {} };
  return { ...real, SETUPS: { ...real.SETUPS, b } };
});
localStorage.setItem('interview-kit-layout', JSON.stringify({ setup: 'b' }));
document.body.innerHTML = '<div id="root" class="app"></div>';
await import('../src/main.js');
const root = document.getElementById('root');
const groups = () => [...root.querySelectorAll('.trials-panel [role="group"]')].map((g) => g.getAttribute('aria-label'));

test('the setup page shows the picked setup variant, with the Try layouts panel and its Setup group', () => {
  expect([root.querySelector('h1').textContent, groups().includes('Setup page'),
    root.querySelector('.trials-panel [data-setup="b"]').getAttribute('aria-pressed')]).toEqual(['Setup B', true, 'true']);
});

test('picking another setup page in the panel shows it and keeps the panel', () => {
  const panel = root.querySelector('.trials-panel');
  panel.querySelector('[data-setup="a"]').click();
  expect([root.querySelector('h1').textContent, root.querySelector('.trials-panel') === panel,
    JSON.parse(localStorage.getItem('interview-kit-layout')).setup]).toEqual(['Start an interview', true, 'a']);
});

test('typing a name leaves Start off while Other time has no date', () => {
  root.querySelector('.setup-a-chip input[value="other"]').click();
  const date = root.querySelector('.setup-a-other input');
  date.value = '';
  date.dispatchEvent(new Event('input', { bubbles: true }));
  const name = root.querySelector('.candidate-field');
  name.value = 'Ada';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  const off = root.querySelector('.setup-a-start').disabled;
  root.querySelector('.setup-a-chip input').click();
  expect([off, root.querySelector('.setup-a-start').disabled]).toEqual([true, false]);
});

test('picking a round with a chosen start stores that start as the interview start', () => {
  const name = root.querySelector('.candidate-field');
  name.value = 'Ada';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  const chip = root.querySelectorAll('.setup-a-chip input')[2];
  chip.click();
  root.querySelector('[data-round]').click();
  expect(JSON.parse(localStorage.getItem('interview-kit')).startedAt).toBe(Number(chip.value));
});

test('after Start, focus lands on the first page, not the body', () => {
  expect([document.activeElement.classList.contains('main'), root.querySelector('main').contains(document.activeElement)]).toEqual([true, true]);
});

const button = (text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
const toast = () => root.querySelector('.undo-toast:not([hidden])') !== null;
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
HTMLElement.prototype.hidePopover ??= () => {};

test('typing a new name after New interview keeps the Undo', () => {
  button('New interview').click();
  const shown = toast();
  const name = root.querySelector('.candidate-field');
  name.value = 'B';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  expect([shown, toast(), JSON.parse(localStorage.getItem('interview-kit')).candidate]).toEqual([true, true, 'B']);
});

test('switching the setup page keeps the Undo, and Undo still brings the interview back', () => {
  root.querySelector('.trials-panel [data-setup="a"]').click();
  const kept = toast();
  root.querySelector('.undo-toast-button').click();
  expect([kept, JSON.parse(localStorage.getItem('interview-kit')).round, root.querySelector('nav') !== null]).toEqual([true, 'sample', true]);
});

test('switching the setup page on What\'s new stays on What\'s new', async () => {
  button('New interview').click();
  location.hash = '#/whats-new';
  await settle();
  root.querySelector('.trials-panel [data-setup="b"]').click();
  await settle();
  expect([location.hash, root.querySelector('h1').textContent, root.querySelector('.kit-back') !== null]).toEqual(['#/whats-new', "What's new", true]);
});

test('Back to setup puts focus on the name field', async () => {
  root.querySelector('.trials-panel [data-setup="a"]').click();
  location.hash = '#/';
  await settle();
  expect([root.querySelector('h1').textContent, document.activeElement.classList.contains('candidate-field')]).toEqual(['Start an interview', true]);
});

test('Back to setup on a page with no name field puts focus on its heading', async () => {
  location.hash = '#/help';
  await settle();
  root.querySelector('.trials-panel [data-setup="b"]').click();
  location.hash = '#/';
  await settle();
  expect([document.activeElement.tagName, document.activeElement.textContent]).toEqual(['H1', 'Setup B']);
});

test('an interview route with no interview running (browser Back after New interview) shows setup and drops the route', async () => {
  location.hash = '#/intro';
  await settle();
  expect([location.hash, root.querySelector('h1').textContent, root.querySelector('nav')]).toEqual(['', 'Setup B', null]);
});
