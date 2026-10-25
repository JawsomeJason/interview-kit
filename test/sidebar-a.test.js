// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import a from '../src/components/sidebar-variants/a.js';

test('A marks the open question as the current page and the Deep dive as the current step', () => {
  const q = { id: 'r1', pool: 'react', poolName: 'React', title: 'Hooks', minutes: 5 };
  const ctx = { round: { name: 'Round', minutes: 60, deepDiveMinutes: 30 }, parts: { intro: { name: 'Intro', minutes: 5 }, outro: { name: 'Outro', minutes: 5 } },
    dd: { minutes: 30 }, picked: [q], done: [], pools: new Map([['react', [q]]]), questions: [q], question: q, route: '#/q/r1' };
  const el = document.createElement('div');
  el.innerHTML = a.render(ctx);
  a.bind(el, ctx);
  const current = [...el.querySelectorAll('[aria-current]')].map((l) => [l.getAttribute('href'), l.getAttribute('aria-current')]);
  expect(current).toEqual([['#/deep-dive', 'step'], ['#/q/r1', 'page'], ['#/q/r1', 'page']]);
});

// Down stops at the last pool and Up at the first: All questions is the folder they sit in and Being reviewed a
// separate list, both a Tab away, so the arrows walk only the pools and never jump from the bottom to the top.
test('the arrows walk the pool folders without wrapping, and leave keys with Ctrl, Alt, Meta or Shift alone', () => {
  const qs = ['react', 'css', 'a11y'].map((pool) => ({ id: `${pool}1`, pool, poolName: pool.toUpperCase(), title: pool, minutes: 5 }));
  const ctx = { round: { name: 'Round', minutes: 60, deepDiveMinutes: 30 }, parts: { intro: { name: 'Intro', minutes: 5 }, outro: { name: 'Outro', minutes: 5 } },
    dd: { minutes: 30 }, picked: [], done: [], pools: Map.groupBy(qs, (q) => q.pool), questions: qs, question: undefined, route: '#/intro' };
  const el = document.createElement('div');
  el.innerHTML = a.render(ctx);
  document.body.replaceChildren(el);
  a.bind(el, ctx);
  const heads = [...el.querySelectorAll('.all-questions-pool > summary')];
  const press = (from, key, mods = {}) => {
    from.focus();
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
    from.dispatchEvent(e);
    return [document.activeElement.textContent, e.defaultPrevented];
  };
  expect([
    press(heads[0], 'ArrowDown'), press(heads[2], 'ArrowDown'), press(heads[0], 'ArrowUp'), press(heads[2], 'Home'), press(heads[0], 'End'),
    ...['ctrlKey', 'altKey', 'metaKey', 'shiftKey'].map((mod) => press(heads[0], 'ArrowDown', { [mod]: true })),
  ]).toEqual([['CSS', true], ['A11Y', true], ['REACT', true], ['REACT', true], ['A11Y', true],
    ['REACT', false], ['REACT', false], ['REACT', false], ['REACT', false]]);
});
