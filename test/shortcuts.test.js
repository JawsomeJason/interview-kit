// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import shortcuts, { handleKey } from '../src/plugins/shortcuts/shortcuts.js';

const spyApi = (calls) => ({
  route: () => '#/q/css-01',
  next: () => calls.push(['next']),
  prev: () => calls.push(['prev']),
  toggleTick: (i) => calls.push(['toggleTick', i]),
  focusNotes: () => calls.push(['focusNotes']),
  toggleDone: () => calls.push(['toggleDone']),
});
const press = (key, target = { tagName: 'BODY' }, extra = {}) => ({ key, target, preventDefault() {}, ...extra });

test('keys call the matching API function on a question page', () => {
  const calls = [];
  for (const key of ['j', 'ArrowRight', 'k', 'ArrowLeft', '1', '3', 'n', 'd']) handleKey(press(key), spyApi(calls));
  handleKey(press('j', { tagName: 'BODY' }, { metaKey: true }), spyApi(calls));
  expect(calls).toEqual([['next'], ['next'], ['prev'], ['prev'], ['toggleTick', 0], ['toggleTick', 2], ['focusNotes'], ['toggleDone']]);
});

test('typing in Notes triggers nothing, and Esc leaves the textarea', () => {
  const calls = [];
  let blurred = false;
  const notes = { tagName: 'TEXTAREA', blur: () => { blurred = true; } };
  for (const key of ['j', 'd', '1', 'n']) handleKey(press(key, notes), spyApi(calls));
  handleKey(press('Escape', notes), spyApi(calls));
  expect([calls, blurred]).toEqual([[], true]);
});

test('a key a widget already handled (defaultPrevented) does nothing', () => {
  const calls = [];
  handleKey(press('ArrowRight', { tagName: 'BODY' }, { defaultPrevented: true }), spyApi(calls));
  handleKey(press('j', { tagName: 'BODY' }, { defaultPrevented: true }), spyApi(calls));
  expect(calls).toEqual([]);
});

test('keys pressed in the Pop out window reach the shortcuts once the app has moved there', () => {
  const calls = [];
  const popped = document.implementation.createHTMLDocument();
  let appDoc = document;
  const updates = [];
  shortcuts({ ...spyApi(calls), doc: () => appDoc, onUpdate: (fn) => updates.push(fn) });
  appDoc = popped;
  for (const fn of updates) fn();
  popped.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
  expect(calls).toEqual([['next']]);
});
