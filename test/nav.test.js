import { expect, test } from 'vitest';
import { pickedLinks, runOfShow, shell, timeline, timelineTotal, totalMeter } from '../src/components/nav.js';
import header from '../src/components/header.js';

const q = (id, pool, poolName) => ({ id, pool, poolName, title: id, minutes: 5, lookFor: [] });
const picked = [q('r1', 'react', 'React'), q('r2', 'react', 'React'), q('c1', 'css', 'CSS'), q('a1', 'a11y', 'Accessibility')];

test('one heading per pool in picked order', () => {
  expect(pickedLinks(picked).match(/<h2 class="timeline-pool">[^<]*<\/h2>/g)).toEqual(['<h2 class="timeline-pool">React</h2>', '<h2 class="timeline-pool">CSS</h2>', '<h2 class="timeline-pool">Accessibility</h2>']);
});

test('each link sits under its own pool heading', () => {
  expect(pickedLinks(picked).match(/<h2 class="timeline-pool">[^<]*|href="[^"]*"/g)).toEqual([
    '<h2 class="timeline-pool">React', 'href="#/q/r1"', 'href="#/q/r2"',
    '<h2 class="timeline-pool">CSS', 'href="#/q/c1"',
    '<h2 class="timeline-pool">Accessibility', 'href="#/q/a1"',
  ]);
});

test('an empty list renders no headings', () => {
  expect(pickedLinks([])).toBe('');
});

test('the sidebar shows no score word even for ticked questions', () => {
  const ticked = picked.map((p) => ({ ...p, lookFor: ['a', 'b', 'c'] }));
  expect(/score|Weak|Solid|Strong/.test(pickedLinks(ticked))).toBe(false);
});

const round = { name: 'Pair programming', minutes: 50 };
test('the timeline runs Intro, Round, Deep dive, Outro with minutes', () => {
  const parts = { intro: { name: 'Intro', minutes: 5 }, outro: { name: 'Outro', minutes: 5 } };
  const html = timeline({ name: 'Pair programming', minutes: 50, deepDiveMinutes: 20 }, parts, { minutes: 30 }, [], []);
  expect(html.match(/<a href="[^"]*" class="timeline-item">[^<]*<small class="timeline-mins">[^<]*<\/small><\/a>/g)).toEqual([
    '<a href="#/intro" class="timeline-item">Intro <small class="timeline-mins">5 min</small></a>',
    '<a href="#/round" class="timeline-item">Pair programming <small class="timeline-mins">20 min</small></a>',
    '<a href="#/deep-dive" class="timeline-item">Deep dive <small class="timeline-mins">30 min</small></a>',
    '<a href="#/outro" class="timeline-item">Outro <small class="timeline-mins">5 min</small></a>',
  ]);
});

test('timeline total reads N of M min, with a gentle note when over', () => {
  const round = { minutes: 60, deepDiveMinutes: 25 };
  const parts = { intro: { minutes: 5 }, outro: { minutes: 5 } };
  expect([timelineTotal(round, parts, { minutes: 15 }), timelineTotal(round, parts, { minutes: 30 })]).toEqual([
    { text: '50 of 60 min', over: false, minutes: 50, limit: 60 },
    { text: '65 of 60 min · 5 over', over: true, minutes: 65, limit: 60 },
  ]);
});

test('the timeline is a popover panel toggled by the menu button', () => {
  const html = shell('', '');
  const target = html.match(/<button type="button" class="topbar-menu" commandfor="([^"]+)" command="toggle-popover"/)[1];
  expect([target, html.includes(`<nav id="${target}" class="sidebar" popover="auto">`)]).toEqual(['timeline-panel', true]);
});

const parts = { intro: { name: 'Intro', minutes: 5 }, outro: { name: 'Outro', minutes: 5 } };
const headerCtx = (spot) => ({ spot, round, candidate: '', startedAt: 0, clock: () => '', schemeToggle: '', themeToggle: '', links: '', buttons: [], newInterview() {},
  plan: () => runOfShow({ ...round, deepDiveMinutes: 20 }, parts, { minutes: 20 }) });

test('the shell starts with a skip control and has a focusable main, and New interview is a button in the header and the drawer', () => {
  const html = shell(header.render(headerCtx('header')), header.render(headerCtx('drawer')));
  expect([
    html.startsWith('<button type="button" class="skip-link">Skip to content</button>'),
    html.includes('<main class="main" tabindex="-1">'),
    html.match(/<[a-z]+[^>]*class="cockpit-new"/g),
  ]).toEqual([true, true, ['<button type="button" class="cockpit-new"', '<button type="button" class="cockpit-new"']]);
});

test('the total gauge is fine up to the hour and in the bad range past it', () => {
  expect([totalMeter({ minutes: 55, limit: 60 }), totalMeter({ minutes: 65, limit: 60 })]).toEqual([
    '<meter class="time-meter" aria-label="Planned minutes" min="0" max="60" low="60" high="60" optimum="0" value="55"></meter>',
    '<meter class="time-meter" aria-label="Planned minutes" min="0" max="65" low="60" high="60" optimum="0" value="65"></meter>',
  ]);
});

test('the run of show lays intro, round, deep dive and outro end to end, and follows the deep dive minutes', () => {
  const round = { name: 'Pair programming', minutes: 50, deepDiveMinutes: 20 };
  const parts = { intro: { name: 'Intro', minutes: 5 }, outro: { name: 'Outro', minutes: 5 } };
  const flat = (dd) => runOfShow(round, parts, dd).map((p) => [p.id, p.start, p.minutes]);
  expect([flat({ minutes: 20 }), flat({ minutes: 30 })]).toEqual([
    [['intro', 0, 5], ['round', 5, 20], ['deep-dive', 25, 20], ['outro', 45, 5]],
    [['intro', 0, 5], ['round', 5, 20], ['deep-dive', 25, 30], ['outro', 55, 5]],
  ]);
});
