// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import a from '../src/components/sidebar-variants/a.js';

const q = (id, pool, poolName) => ({ id, pool, poolName, title: `Q ${id}`, minutes: 5 });
const pools = new Map([['react', [q('r1', 'react', 'React')]], ['css', [q('c1', 'css', 'CSS')]], ['a11y', [q('x1', 'a11y', 'Accessibility')]]]);
const ctx = { round: { name: 'Round', minutes: 60, deepDiveMinutes: 30 }, parts: { intro: { name: 'Intro', minutes: 5 }, outro: { name: 'Outro', minutes: 5 } },
  dd: { minutes: 30 }, picked: [], done: [], pools, questions: [], route: '#/intro' };

test('in sidebar A, Down, Up, End and Home move focus between the pool folder headers', () => {
  const body = document.createElement('div');
  document.body.append(body);
  body.innerHTML = a.render(ctx);
  a.bind(body, ctx);
  body.querySelector('.all-questions-pool > summary').focus();
  const walk = ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'End', 'Home'].map((key) => {
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    return document.activeElement.textContent;
  });
  expect(walk).toEqual(['CSS', 'Accessibility', 'Accessibility', 'CSS', 'Accessibility', 'React']);
});
