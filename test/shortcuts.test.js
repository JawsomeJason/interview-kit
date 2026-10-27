// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import shortcuts, { handleKey } from '../src/plugins/shortcuts/shortcuts.js';

const spyApi = (calls, round = 'Practical round') => ({
  session: () => ({ round, elapsed: '' }),
  next: () => calls.push('next'),
  prev: () => calls.push('prev'),
});
const press = (key, target = { tagName: 'BODY' }, extra = {}) => ({ key, target, preventDefault() {}, ...extra });

test('j and k step through the run of show; the number, n, d and arrow keys are left to the Assess panel', () => {
  const calls = [];
  for (const key of ['j', 'k', 'j', '1', 'n', 'd', 'h', 'ArrowRight', 'ArrowLeft', 'Escape']) handleKey(press(key), spyApi(calls));
  expect(calls).toEqual(['next', 'prev', 'next']);
});

test('typing in a text field, a modifier, a key a widget already handled, or the setup page triggers nothing', () => {
  const calls = [];
  handleKey(press('j', { tagName: 'TEXTAREA' }), spyApi(calls));
  handleKey(press('k', { tagName: 'INPUT', type: 'text' }), spyApi(calls));
  handleKey(press('j', { tagName: 'BODY' }, { metaKey: true }), spyApi(calls));
  handleKey(press('j', { tagName: 'BODY' }, { defaultPrevented: true }), spyApi(calls));
  handleKey(press('j'), spyApi(calls, null));
  handleKey(press('j', { tagName: 'INPUT', type: 'checkbox' }), spyApi(calls));
  expect(calls).toEqual(['next']);
});

// Opening it with ? needs the Popover API, which happy-dom lacks; test/plugins.spec.js presses it in Chromium.
test('the help lists every key, the Assess panel\'s included', () => {
  shortcuts({ ...spyApi([]), doc: () => document, onUpdate: () => {} });
  const help = document.querySelector('[role="dialog"][aria-label="Keyboard shortcuts"]');
  expect([...help.querySelectorAll('.shortcuts-key')].map((k) => k.textContent))
    .toEqual(['j', 'k', '1 to 9', 'Shift + number', 'Alt + number', 'h', 'n', 'd', 'Esc', '?']);
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
  expect(calls).toEqual(['next']);
});
