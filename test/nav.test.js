import { expect, test } from 'vitest';
import { runOfShow, shell, timelineTotal, totalMeter } from '../src/components/nav.js';
import header from '../src/components/header.js';

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

const round = { name: 'Pair programming', minutes: 50 };
const parts = { intro: { name: 'Intro', minutes: 5 }, outro: { name: 'Outro', minutes: 5 } };
const headerCtx = (spot) => ({ spot, round, candidate: '', startedAt: 0, clock: () => '', schemeToggle: '', links: '', buttons: [], newInterview() {},
  plan: () => runOfShow({ ...round, deepDiveMinutes: 20 }, parts, { minutes: 20 }) });

test('the shell starts with a skip control and has a focusable main, and New interview is a button in the header and the drawer', () => {
  const html = shell(header.render(headerCtx('header')), header.render(headerCtx('drawer')));
  expect([
    html.startsWith('<button type="button" class="skip-link">Skip to content</button>'),
    html.includes('<main class="main" tabindex="-1">'),
    html.match(/<[a-z]+[^>]*class="header-menu-item header-menu-reset"/g),
  ]).toEqual([true, true, ['<button type="button" class="header-menu-item header-menu-reset"', '<button type="button" class="header-menu-item header-menu-reset"']]);
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
