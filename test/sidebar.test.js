// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import c from '../src/components/sidebar.js';

const q = (id) => ({ id, pool: 'react', poolName: 'React', title: id, minutes: 5, lookFor: [] });
const picked = [q('r1'), q('r2'), q('r3')];
const ctx = (route, done = []) => ({
  round: { name: 'Pair programming', minutes: 60, deepDiveMinutes: 30 },
  parts: { intro: { name: 'Intro', minutes: 5 }, outro: { name: 'Outro', minutes: 5 } },
  dd: { minutes: 35, pools: ['react'] }, picked, done, pools: new Map([['react', picked]]), questions: picked,
  question: picked.find((p) => route === `#/q/${p.id}`), route,
});
const block = (html, cls) => html.match(new RegExp(`<div class="${cls}">[\\s\\S]*?</div>`))[0].replace(/\s+/g, ' ');

test('Now shows the current question with its planned minutes; Next up skips a done question', () => {
  const html = c.render(ctx('#/q/r1', ['r2']));
  expect([block(html, 'now-next-now'), block(html, 'now-next-next')]).toEqual([
    '<div class="now-next-now"><h2 class="now-next-label">Now</h2> <a href="#/q/r1" class="now-next-title">r1</a> '
      + '<p class="now-next-meta">React</p> <p class="now-next-meta">5 min · minute 25 to 30 of 60</p> </div>',
    '<div class="now-next-next"><h2 class="now-next-label">Next up</h2><a href="#/q/r3" class="now-next-next-title">r3</a> '
      + '<p class="now-next-meta">React · 5 min</p></div>',
  ]);
});

test('a done question shows as done in Now, and the summary shows the total', () => {
  const html = c.render(ctx('#/q/r2', ['r2']));
  expect([
    block(html, 'now-next-now').includes('<p class="now-next-meta">React · Done ✓</p>'),
    html.match(/<span class="now-next-total[^"]*">([^<]*)/)[1],
  ]).toEqual([true, '65 of 60 min · 5 over']);
});

test('Rest of the plan starts open, with the total in its summary', () => {
  const html = c.render(ctx('#/intro'));
  expect(html.match(/<details id="sidebar-rest"[^>]*>/)[0]).toBe('<details id="sidebar-rest" class="now-next-rest" open>');
});

// The plan rows: each one link with its start time, a state, and aria-current where it is the page or the step.
const rows = (html) => html.match(/<a href="[^"]*" class="run-row [^"]*"(?: aria-current="[^"]*")?/g);
const starts = (html) => html.match(/run-at" aria-hidden="true">[^<]*/g).map((x) => x.split('>')[1]);

test('the plan runs as a run of show: on a question page the deep dive is the current step and the question the current page', () => {
  const html = c.render(ctx('#/q/r2', ['r1']));
  expect([rows(html), starts(html)]).toEqual([[
    '<a href="#/intro" class="run-row is-done"',
    '<a href="#/round" class="run-row is-done"',
    '<a href="#/deep-dive" class="run-row is-current" aria-current="step"',
    '<a href="#/q/r1" class="run-row is-done"',
    '<a href="#/q/r2" class="run-row is-current" aria-current="page"',
    '<a href="#/q/r3" class="run-row is-upcoming"',
    '<a href="#/outro" class="run-row is-upcoming"',
  ], ['0:00', '0:05', '0:25', '0:25', '0:30', '0:35', '1:00']]);
});

test('on the round page the round row is the current page and the rest is upcoming; the empty route counts as the round page', () => {
  expect([rows(c.render(ctx('#/round'))).slice(0, 3), rows(c.render(ctx(''))).slice(0, 3)]).toEqual([[
    '<a href="#/intro" class="run-row is-done"',
    '<a href="#/round" class="run-row is-current" aria-current="page"',
    '<a href="#/deep-dive" class="run-row is-upcoming"',
  ], [
    '<a href="#/intro" class="run-row is-done"',
    '<a href="#/round" class="run-row is-current" aria-current="page"',
    '<a href="#/deep-dive" class="run-row is-upcoming"',
  ]]);
});

// Browse all questions, bound and open, as a click on its button leaves it.
function browse(route) {
  const el = document.createElement('div');
  el.innerHTML = c.render(ctx(route));
  document.body.replaceChildren(el);
  c.bind(el, ctx(route));
  const dialog = el.querySelector('.now-next-dialog');
  dialog.showModal();
  return dialog;
}
const press = (target, key) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};
const type = (search, text) => { search.value = text; search.dispatchEvent(new Event('input', { bubbles: true })); };
const shown = (dialog) => [dialog.querySelector('.now-next-count').textContent, dialog.querySelectorAll('.now-next-hit:not([hidden])').length];

// Chromium's own Escape empties a search box without an input event, which left the list filtered. Escape now clears
// box and filter together, as sidebar D's does, and only a second Escape closes the dialog.
test('Escape in a search with text clears the box, the filter and the count, and keeps the dialog open', () => {
  const dialog = browse('#/intro');
  const search = dialog.querySelector('.now-next-search');
  type(search, 'r1');
  const filtered = shown(dialog);
  const esc = press(search, 'Escape');
  expect([filtered, search.value, shown(dialog), esc.defaultPrevented, dialog.open]).toEqual([['1 question', 1], '', ['3 questions', 3], true, true]);
});

test("the search box's own clear (a search event) clears the filter too", () => {
  const dialog = browse('#/intro');
  const search = dialog.querySelector('.now-next-search');
  type(search, 'r1');
  search.value = '';
  search.dispatchEvent(new Event('search', { bubbles: true }));
  expect(shown(dialog)).toEqual(['3 questions', 3]);
});

// In Chromium the link click closes the dialog and focus goes back to Browse all questions; an uncancelled Enter then
// activates that button and opens the dialog again. So Enter must be spent on the match.
test('Enter on a match that is the page already showing closes the dialog and spends the key', () => {
  const dialog = browse('#/q/r1');
  const search = dialog.querySelector('.now-next-search');
  type(search, 'r1');
  const enter = press(search, 'Enter');
  expect([dialog.open, enter.defaultPrevented]).toEqual([false, true]);
});
