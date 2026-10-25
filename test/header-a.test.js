// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import a from '../src/components/header-variants/a.js';

const fakeCtx = (over = {}) => ({
  spot: 'header',
  round: { id: 'pair', name: 'Pair programming', minutes: 60, deepDiveMinutes: 30 },
  candidate: 'Ada',
  startedAt: 0,
  clock: () => '12:40',
  schemeToggle: '<span class="scheme-toggle" role="group" aria-label="Color scheme"></span>',
  links: '<a href="#/whats-new" class="whats-new-link">What\'s new <span class="whats-new-dot" role="img" aria-label="New">●</span></a>'
    + '<a href="#/help" class="help-link">Help</a>',
  buttons: [{ label: 'Pop out', onClick: vi.fn() }],
  newInterview: vi.fn(),
  ...over,
});

const mount = (ctx) => {
  document.body.innerHTML = a.render(ctx);
  const el = document.body.firstElementChild;
  a.bind(el, ctx);
  return el;
};

const flat = (node) => node.textContent.replace(/\s+/g, ' ').trim();
// The slot writes the clock text into [data-clock] every second; the observer that follows it runs as a microtask.
const tick = async (el, text) => { el.querySelector('[data-clock]').textContent = text; await Promise.resolve(); };

afterEach(() => { document.body.replaceChildren(); });

test('A is labelled Quiet bar', () => {
  expect(a.label).toBe('Quiet bar');
});

test.each([['header', 'app-header'], ['drawer', 'sidebar-round']])('the %s spot holds the name, round, clock, links, plugin buttons and both resets', (spot, root) => {
  const el = mount(fakeCtx({ spot }));
  expect([
    el.className,
    el.querySelector('.candidate-field').value,
    el.querySelector('.header-a-round').textContent,
    el.querySelector('[data-clock]').textContent,
    [...el.querySelectorAll('.header-a-menu :is(a, .header-a-item)')].map(flat),
    el.querySelectorAll('.header-a-menu .scheme-toggle').length,
  ]).toEqual([root, 'Ada', 'Pair programming', '12:40', ["What's new ●", 'Help', 'Pop out', 'New interview'], 1]);
});

test('More toggles its menu, a popover the browser opens and closes, and says whether it is open', () => {
  const el = mount(fakeCtx());
  const more = el.querySelector('.header-a-more');
  const menu = el.querySelector('.header-a-menu');
  const expanded = [more.getAttribute('aria-expanded')];
  for (const newState of ['open', 'closed']) {
    menu.dispatchEvent(Object.assign(new Event('toggle'), { newState }));
    expanded.push(more.getAttribute('aria-expanded'));
  }
  expect([more.textContent.replace(/[●▾\s]+/g, ' ').trim(), more.getAttribute('command'), more.getAttribute('commandfor'), menu.id, menu.getAttribute('popover'), expanded])
    .toEqual(['More (new)', 'toggle-popover', 'header-a-menu-header', 'header-a-menu-header', 'auto', ['false', 'true', 'false']]);
});

test('with nothing new, More has no dot', () => {
  const el = mount(fakeCtx({ links: '<a href="#/whats-new" class="whats-new-link">What\'s new</a><a href="#/help" class="help-link">Help</a>' }));
  expect(flat(el.querySelector('.header-a-more')).replace(/[▾\s]+/g, ' ').trim()).toBe('More');
});

test('New interview closes the menu, then calls newInterview', () => {
  const ctx = fakeCtx();
  const el = mount(ctx);
  const calls = [];
  el.querySelector('.header-a-menu').hidePopover = () => calls.push('close');
  ctx.newInterview = () => calls.push('newInterview');
  el.querySelector('.header-a-reset').click();
  expect(calls).toEqual(['close', 'newInterview']);
});

test('a plugin button in the menu is a .header-button that runs its onClick', () => {
  const ctx = fakeCtx();
  const el = mount(ctx);
  el.querySelector('.header-a-menu').hidePopover = () => {};
  el.querySelector('.header-a-menu .header-button').click();
  expect(ctx.buttons[0].onClick.mock.calls.length).toBe(1);
});

test('the words by the clock follow it: to start, of the round length, and a warning past it', async () => {
  const el = mount(fakeCtx({ clock: () => '−4:12' }));
  const clock = el.querySelector('.header-a-clock');
  const seen = [[flat(clock), clock.classList.contains('is-over')]];
  for (const text of ['12:40', '1:00:01']) {
    await tick(el, text);
    seen.push([flat(clock), clock.classList.contains('is-over')]);
  }
  expect(seen).toEqual([['−4:12 to start', false], ['12:40 of 60 min', false], ['1:00:01 of 60 min', true]]);
});

test('with no start time the clock shows only the round length', () => {
  const el = mount(fakeCtx({ clock: () => '' }));
  expect(flat(el.querySelector('.header-a-clock'))).toBe('60 min');
});

test('in the phone drawer, closing the menu while focus is inside it (Escape) puts focus back on More', () => {
  const el = mount(fakeCtx({ spot: 'drawer' }));
  const menu = el.querySelector('.header-a-menu');
  menu.querySelector('.help-link').focus();
  menu.dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'closed' }));
  expect(document.activeElement).toBe(el.querySelector('.header-a-more'));
});

test('closing the menu while focus is elsewhere leaves focus where it is', () => {
  const el = mount(fakeCtx({ spot: 'drawer' }));
  el.querySelector('.candidate-field').focus();
  el.querySelector('.header-a-menu').dispatchEvent(Object.assign(new Event('beforetoggle'), { newState: 'closed' }));
  expect(document.activeElement).toBe(el.querySelector('.candidate-field'));
});
