// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import popout from '../src/plugins/popout/popout.js';

// The Pop out window is faked as a second document; close() fires pagehide, as the browser does.
function setup() {
  document.body.innerHTML = '<div id="root" class="app"><textarea aria-label="Notes"></textarea></div>';
  const root = document.getElementById('root');
  const opened = [];
  const pip = {
    requestWindow: async () => {
      const w = Object.assign(new EventTarget(), {
        document: document.implementation.createHTMLDocument(),
        close: () => w.dispatchEvent(new Event('pagehide')),
        setInterval: () => {},
      });
      opened.push(w);
      return w;
    },
  };
  const buttons = [];
  popout({
    headerButton: (label, onClick) => buttons.push([label, onClick]),
    onUpdate: () => {},
    session: () => ({ elapsed: '12:40' }),
    moveApp: (parent, before = null) => parent.insertBefore(root, before),
  }, pip);
  return { root, opened, buttons, popOut: () => buttons[0][1]() };
}

const tabButton = (text) => [...document.querySelectorAll('button')].find((b) => b.textContent === text);

test('Pop out moves the app into the window and leaves a note with a way back in the tab', async () => {
  const { root, opened, popOut } = setup();
  await popOut();
  expect([opened[0].document.body.contains(root), document.body.contains(root), Boolean(tabButton('Bring it back'))])
    .toEqual([true, false, true]);
});

test('closing the window puts the same app back in the tab, with what was typed, and removes the note', async () => {
  const { root, popOut } = setup();
  root.querySelector('textarea').value = 'Strong on hooks';
  await popOut();
  tabButton('Bring it back').click();
  expect([document.body.firstElementChild === root, root.querySelector('textarea').value, document.body.children.length])
    .toEqual([true, 'Strong on hooks', 1]);
});

test('the window shows the time since the round was picked, outside the app', async () => {
  const { root, opened, popOut } = setup();
  await popOut();
  const { body } = opened[0].document;
  expect([body.textContent.includes('12:40'), root.textContent.includes('12:40')]).toEqual([true, false]);
});

test('Pop out opens no second window while the app is already popped out', async () => {
  const { opened, popOut } = setup();
  await popOut();
  await popOut();
  expect(opened.length).toBe(1);
});

test('browsers without Document Picture-in-Picture get no Pop out button', () => {
  const buttons = [];
  popout({ headerButton: (label) => buttons.push(label), onUpdate: () => {} }, undefined);
  expect(buttons).toEqual([]);
});
