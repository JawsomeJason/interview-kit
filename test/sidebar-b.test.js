import { expect, test } from 'vitest';
import b from '../src/components/sidebar-variants/b.js';

const q = (id, pool, poolName) => ({ id, pool, poolName, title: id, minutes: 5, lookFor: [] });
const picked = [q('r1', 'react', 'React'), q('r2', 'react', 'React'), q('c1', 'css', 'CSS')];
const ctx = (route, extra = {}) => ({
  round: { name: 'Pair programming', minutes: 50, deepDiveMinutes: 20 },
  parts: { intro: { name: 'Intro', minutes: 5 }, outro: { name: 'Outro', minutes: 5 } },
  dd: { minutes: 20 }, picked, done: ['r1'], pools: Map.groupBy(picked, (p) => p.pool), questions: picked, route, ...extra,
});
const rows = (html) => html.match(/<a href="[^"]*" class="run-row [^"]*"(?: aria-current="[^"]*")?/g).slice(0, 7);

test('on a question page the deep dive is the current step, the question the current page, earlier parts and done questions done', () => {
  expect(rows(b.render(ctx('#/q/r2')))).toEqual([
    '<a href="#/intro" class="run-row is-done"',
    '<a href="#/round" class="run-row is-done"',
    '<a href="#/deep-dive" class="run-row is-current" aria-current="step"',
    '<a href="#/q/r1" class="run-row is-done"',
    '<a href="#/q/r2" class="run-row is-current" aria-current="page"',
    '<a href="#/q/c1" class="run-row is-upcoming"',
    '<a href="#/outro" class="run-row is-upcoming"',
  ]);
});

test('each row shows its start time and minutes, and the total reads N of M, warning when over', () => {
  const html = b.render(ctx('#/intro'));
  const over = b.render(ctx('#/intro', { dd: { minutes: 25 } }));
  expect([
    html.match(/run-at" aria-hidden="true">[^<]*/g).map((s) => s.split('>')[1]),
    html.match(/<p class="run-total-text[^"]*">[^<]*/)[0],
    over.match(/<p class="run-total-text[^"]*">[^<]*/)[0],
  ]).toEqual([
    ['0:00', '0:05', '0:25', '0:25', '0:30', '0:35', '0:45'],
    '<p class="run-total-text">50 of 50 min',
    '<p class="run-total-text is-over">55 of 50 min · 5 over',
  ]);
});
