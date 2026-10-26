import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import d from '../src/components/sidebar-variants/d.js';

const q = (id, pool, poolName) => ({ id, pool, poolName, title: `Question ${id}`, minutes: 5, lookFor: [] });
const questions = [q('r1', 'react', 'React'), q('r2', 'react', 'React'), q('c1', 'css', 'CSS')];
const ctx = (over = {}) => ({
  round: { name: 'Pair programming', minutes: 60, deepDiveMinutes: 30 },
  parts: { intro: { name: 'Intro', minutes: 5 }, outro: { name: 'Outro', minutes: 5 } },
  dd: { minutes: 30 }, picked: questions.slice(0, 2), done: [], questions, pools: Map.groupBy(questions, (x) => x.pool),
  question: undefined, route: '#/intro', navigate: () => {}, ...over,
});

test('the current page is the one link marked current', () => {
  expect(d.render(ctx({ route: '#/q/r2' })).match(/<a [^>]*aria-current="page"[^>]*>/g))
    .toEqual(['<a href="#/q/r2" class="sb-d-row" aria-current="page">', '<a href="#/q/r2" class="sb-d-row" aria-current="page">']);
});

test('a done question is marked done in the plan and in its pool', () => {
  expect(d.render(ctx({ done: ['r1'] })).match(/done-mark is-done"><a href="[^"]*"/g))
    .toEqual(['done-mark is-done"><a href="#/q/r1"', 'done-mark is-done"><a href="#/q/r1"']);
});

test('the total reads planned of round minutes, and each pool counts done / picked / total', () => {
  const html = d.render(ctx({ done: ['r1'], dd: { minutes: 35 } }));
  expect(html.match(/<p class="sb-d-total[^"]*">[^<]*/)[0]).toBe('<p class="sb-d-total is-over">65 of 60 min · 5 over');
  expect(html.match(/<span aria-hidden="true">\d+\/\d+\/\d+/g)).toEqual(['<span aria-hidden="true">1/2/2', '<span aria-hidden="true">0/0/1']);
});

// Layout needs a real browser (npm run clip and QA's s5 script check it); this keeps the fix in place. An absolute box
// with no positioned ancestor sits in the page's scroll area, not the sidebar's, so each open pool grew the page.
test("each pool count's hidden words are positioned inside the count, so opening pools never makes the page scroll", () => {
  const css = readFileSync('src/components/sidebar-variants/d.css', 'utf8');
  const utility = readFileSync('src/style.css', 'utf8').match(/\.visually-hidden \{[^}]*\}/)[0];
  expect([css.match(/\.sb-d-count \{ position: relative; \}/)?.[0], utility]).toEqual(['.sb-d-count { position: relative; }',
    '.visually-hidden { position: absolute; width: var(--hidden-size); height: var(--hidden-size); margin: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }']);
});
