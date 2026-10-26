// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import b, { clockSeconds, phase } from '../src/components/header.js';
import { runOfShow } from '../src/components/nav.js';

afterEach(() => vi.useRealTimers());

const round = { id: 'sample', name: 'Sample round', minutes: 45, deepDiveMinutes: 20 };
const parts = { intro: { name: 'Intro', minutes: 3 }, outro: { name: 'Outro', minutes: 2 } };
const dd = { minutes: 20 };
const plan = () => runOfShow(round, parts, dd);
const links = `<a href="#/whats-new" class="whats-new-link">What's new <span class="whats-new-dot" role="img" aria-label="New">●</span></a><a href="#/help" class="help-link">Help</a>`;
const ctx = (spot, extra = {}) => ({
  spot,
  round,
  candidate: 'Ada',
  startedAt: 1,
  clock: () => '12:40',
  links,
  buttons: [{ label: 'Pop out', onClick: vi.fn() }],
  schemeToggle: '<span class="scheme-toggle" role="group" aria-label="Color scheme"></span>',
  themeToggle: '',
  newInterview: vi.fn(),
  plan,
  ...extra,
});

const mount = (c) => {
  document.body.innerHTML = b.render(c);
  const el = document.body.firstElementChild;
  b.bind(el, c);
  return el;
};

test.each([['header', 'header', 'app-header'], ['drawer', 'div', 'sidebar-round']])(
  'the %s spot is one %s.%s carrying the candidate field, round name, page links, plugin buttons and scheme toggle', (spot, tag, className) => {
    const html = b.render(ctx(spot));
    document.body.innerHTML = html;
    const el = document.body.firstElementChild;
    expect([
      document.body.children.length, el.localName, el.className,
      el.querySelector('.candidate-field').value,
      el.querySelector('.cockpit-round').textContent,
      [...el.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.textContent.trim()]),
      [...el.querySelectorAll('.header-button')].map((x) => [x.className, x.textContent]),
      Boolean(el.querySelector('.scheme-toggle')),
    ]).toEqual([1, tag, className, 'Ada', 'Sample round · 45 min', [['#/whats-new', "What's new ●"], ['#/help', 'Help']], [['header-button cockpit-tool', 'Pop out']], true]);
  },
);

test('the header folds the tools into one menu whose button carries the unseen dot; the drawer lists them flat', () => {
  const header = b.render(ctx('header'));
  const seen = b.render(ctx('header', { links: '<a href="#/help" class="help-link">Help</a>' }));
  const drawer = b.render(ctx('drawer'));
  expect([
    header.includes('<details class="cockpit-menu">'),
    header.match(/<summary class="cockpit-menu-button">[^<]*<span class="cockpit-dot[^"]*"[^>]*>/)?.[0],
    seen.includes('cockpit-dot'),
    drawer.includes('<details'),
  ]).toEqual([true, '<summary class="cockpit-menu-button">Menu <span class="cockpit-dot whats-new-dot" role="img" aria-label="New">', false, false]);
});

test('New interview sits last in the menu and calls newInterview; a plugin button calls its own', () => {
  const c = ctx('header');
  const el = mount(c);
  const panel = el.querySelector('.cockpit-menu-panel');
  panel.lastElementChild.click();
  el.querySelector('.cockpit-tool').click();
  expect([panel.lastElementChild.className, panel.lastElementChild.textContent,
    c.newInterview.mock.calls.length, c.buttons[0].onClick.mock.calls.length])
    .toEqual(['cockpit-new', 'New interview', 1, 1]);
});

test('the menu closes on Escape and after a link or tool is picked', () => {
  const el = mount(ctx('header'));
  const menu = el.querySelector('.cockpit-menu');
  const states = [];
  menu.open = true;
  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  states.push(menu.open);
  menu.open = true;
  el.querySelector('.help-link').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  states.push(menu.open);
  menu.open = true;
  el.querySelector('.cockpit-tool').click();
  states.push(menu.open);
  expect(states).toEqual([false, false, false]);
});

test('a clock string parses to seconds, minus sign included; anything else is null', () => {
  expect(['12:40', '1:02:05', '−4:12', '-0:01', '', 'soon'].map(clockSeconds)).toEqual([760, 3725, -252, -1, null, null]);
});

test('the phase follows the round: starts in, round, deep dive soon, deep dive, over', () => {
  const at = (s) => { const p = phase(plan(), s); return [p.mode, p.label, p.cue, Math.round(p.used * 100), p.soon ?? false]; };
  expect([at(null), at(-252), at(0), at(760), at(1260), at(1500), at(2460), at(2580), at(2700), at(2800)]).toEqual([
    ['idle', 'Elapsed', 'Not started', 0, false],
    ['before', 'Starts in', '45 min round · deep dive at 23 min', 0, false],
    ['round', 'Elapsed', 'Deep dive at 23 min · in 23 min', 0, false],
    ['round', 'Elapsed', 'Deep dive at 23 min · in 11 min', 28, false],
    ['round', 'Elapsed', 'Deep dive at 23 min · in 2 min', 47, true],
    ['deep', 'Elapsed', 'Deep dive · 18 min left', 56, false],
    ['deep', 'Elapsed', 'Deep dive · 2 min left', 91, true],
    ['outro', 'Elapsed', 'Outro · 2 min left', 96, true],
    ['over', 'Elapsed', 'Time is up', 100, false],
    ['over', 'Elapsed', 'Over by 1 min', 100, false],
  ]);
});

test('a round with no deep dive counts down to the end instead', () => {
  expect(phase(runOfShow({ name: 'R', minutes: 30, deepDiveMinutes: 0 }, parts, { minutes: 0 }), 600).cue).toBe('20 min left');
});

test('before the start the clock reads as Starts in with the minus sign dropped; after it, Elapsed', () => {
  const before = b.render(ctx('header', { clock: () => '−4:12' }));
  const after = b.render(ctx('drawer'));
  const parts = (html) => [html.match(/cockpit-clock-label">([^<]*)/)[1], html.match(/cockpit-clock-value">([^<]*)/)[1], html.match(/cockpit-cue[^"]*">([^<]*)/)[1]];
  expect([parts(before), parts(after)]).toEqual([['Starts in', '4:12', '45 min round · deep dive at 23 min'], ['Elapsed', '12:40', 'Deep dive at 23 min · in 11 min']]);
});

test('the bar reports minutes used of the round and marks where the deep dive starts', () => {
  const html = b.render(ctx('header'));
  expect(html.match(/<div class="cockpit-bar" role="progressbar"[^>]*>/)[0])
    .toBe('<div class="cockpit-bar" role="progressbar" aria-label="Time used" aria-valuemin="0" aria-valuemax="45" aria-valuenow="12" aria-valuetext="12 of 45 min" style="--cockpit-used: 28%; --cockpit-deep: 51%">');
});

// The slot writes the clock text into [data-clock] every second, on a timer of the window the app lives in now;
// the observer that follows it runs as a microtask.
const tick = async (el, text) => { el.querySelector('[data-clock]').textContent = text; await Promise.resolve(); };

test("B follows the slot's clock, not a timer of the tab, so it keeps up in Pop out while the tab is throttled", async () => {
  // The tab's timers never fire, as in a hidden tab behind a fullscreen call.
  vi.useFakeTimers();
  let now = '22:58';
  const el = mount(ctx('header', { clock: () => now }));
  now = '23:00';
  await tick(el, now);
  expect([el.querySelector('.cockpit-clock-value').textContent, el.querySelector('.cockpit-cue').textContent]).toEqual(['23:00', 'Deep dive · 20 min left']);
});

test('the clock ticks every second from ctx.clock, and a phase change is announced once', async () => {
  let now = '22:58';
  const el = mount(ctx('header', { clock: () => now }));
  const read = () => [el.querySelector('.cockpit-clock-value').textContent, el.querySelector('.cockpit-cue').textContent, el.querySelector('.cockpit-announce').textContent];
  const seen = [read()];
  for (const next of ['22:59', '23:00', '23:01']) {
    now = next;
    await tick(el, now);
    seen.push(read());
  }
  expect(seen).toEqual([
    ['22:58', 'Deep dive at 23 min · in 1 min', ''],
    ['22:59', 'Deep dive at 23 min · in 1 min', ''],
    ['23:00', 'Deep dive · 20 min left', 'Deep dive now'],
    ['23:01', 'Deep dive · 20 min left', 'Deep dive now'],
  ]);
});

test('the cue and the track follow the live deep dive minutes, read again on the next tick', async () => {
  const el = mount(ctx('header', { clock: () => '30:00' }));
  const read = () => [el.querySelector('.cockpit-cue').textContent, el.querySelector('.cockpit-bar').getAttribute('aria-valuemax')];
  const before = read();
  dd.minutes = 30;
  await tick(el, '30:00');
  const after = read();
  dd.minutes = 20;
  expect([before, after]).toEqual([['Deep dive · 13 min left', '45'], ['Deep dive · 23 min left', '55']]);
});

test('plan() changes when the deep dive minutes change', () => {
  const ends = [20, 35].map((minutes) => { dd.minutes = minutes; return plan().map((p) => p.start); });
  dd.minutes = 20;
  expect(ends).toEqual([[0, 3, 23, 43], [0, 3, 23, 58]]);
});
