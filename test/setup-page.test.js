// @vitest-environment happy-dom
import { expect, test } from 'vitest';

// The real app on the setup page.
document.body.innerHTML = '<div id="root" class="app"></div>';
await import('../src/main.js');
const root = document.getElementById('root');

test('typing a name leaves Start off while Other time has no date', () => {
  root.querySelector('.setup-chip input[value="other"]').click();
  const date = root.querySelector('.setup-other input');
  date.value = '';
  date.dispatchEvent(new Event('input', { bubbles: true }));
  const name = root.querySelector('.candidate-field');
  name.value = 'Ada';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  const off = root.querySelector('.setup-start').disabled;
  root.querySelector('.setup-chip input').click();
  expect([off, root.querySelector('.setup-start').disabled]).toEqual([true, false]);
});

test('picking a round with a chosen start stores that start as the interview start', () => {
  const name = root.querySelector('.candidate-field');
  name.value = 'Ada';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  const chip = root.querySelectorAll('.setup-chip input')[2];
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

test('Undo after New interview brings the interview back', () => {
  root.querySelector('.undo-toast-button').click();
  expect([JSON.parse(localStorage.getItem('interview-kit')).round, root.querySelector('nav') !== null]).toEqual(['sample', true]);
});

test("Back to setup from What's new puts focus on the name field", async () => {
  button('New interview').click();
  location.hash = '#/whats-new';
  await settle();
  location.hash = '#/';
  await settle();
  expect([root.querySelector('h1').textContent, document.activeElement.classList.contains('candidate-field')]).toEqual(['Start an interview', true]);
});

test('an interview route with no interview running (browser Back after New interview) shows setup and drops the route', async () => {
  location.hash = '#/intro';
  await settle();
  expect([location.hash, root.querySelector('h1').textContent, root.querySelector('nav')]).toEqual(['', 'Start an interview', null]);
});
