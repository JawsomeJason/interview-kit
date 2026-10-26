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

test('Browse all questions hands its own button to browse, so focus can come back to it', () => {
  const el = document.createElement('div');
  el.innerHTML = c.render(ctx('#/intro'));
  const opened = [];
  c.bind(el, { ...ctx('#/intro'), browse: (opener) => opened.push(opener) });
  el.querySelector('.now-next-browse').click();
  expect(opened).toEqual([el.querySelector('.now-next-browse')]);
});
