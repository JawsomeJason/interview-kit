// @vitest-environment happy-dom
import { expect, test, vi } from 'vitest';
import c from '../src/components/header-variants/c.js';

const popOut = vi.fn();
const ctx = (spot, extra = {}) => ({
  spot,
  round: { id: 'pair', name: 'Pair programming', minutes: 60, deepDiveMinutes: 30 },
  candidate: 'Ada',
  startedAt: 1,
  clock: () => '12:40',
  schemeToggle: '<span class="scheme-toggle"></span>',
  links: '<a href="#/whats-new" class="whats-new-link">What\'s new <span class="whats-new-dot" role="img" aria-label="New">●</span></a><a href="#/help" class="help-link">Help</a>',
  buttons: [{ label: 'Pop out', onClick: popOut }],
  newInterview: vi.fn(),
  ...extra,
});
const mount = (spot, extra) => {
  const x = ctx(spot, extra);
  document.body.innerHTML = c.render(x);
  const el = document.body.firstElementChild;
  c.bind(el, x);
  return { el, x };
};

test.each([['header', 'app-header'], ['drawer', 'sidebar-round']])('%s renders its whole element with the candidate, round, clock, links and buttons', (spot, cls) => {
  const { el } = mount(spot);
  expect([
    el.className,
    !!el.querySelector('.candidate-field'),
    el.querySelector('.hc-round').textContent,
    el.querySelector('.hc-clock').textContent,
    [...el.querySelectorAll('a.hc-btn')].map((a) => [a.textContent.replace(/\s+/g, ' ').trim(), a.getAttribute('href')]),
    [...el.querySelectorAll('button.header-button')].map((b) => b.textContent.trim()),
  ]).toEqual([cls, true, 'Pair programming · 60 min', '12:40', [["What's new ●", '#/whats-new'], ['Help', '#/help']], ['Pop out']]);
});

test('the clock is filled by the slot through data-clock, and absent before a start', () => {
  expect(mount('header').el.querySelector('.hc-clock').hasAttribute('data-clock')).toBe(true);
  expect(mount('header', { startedAt: 0 }).el.querySelector('.hc-clock')).toBe(null);
});

test('plugin buttons call their handler', () => {
  mount('header').el.querySelector('.hc-plugin').click();
  expect(popOut).toHaveBeenCalledTimes(1);
});

test('New interview comes last in the toolbar and calls ctx.newInterview', () => {
  const { el, x } = mount('header');
  const all = [...el.querySelectorAll('.hc-btn')];
  expect(all.at(-1).textContent.trim()).toBe('New interview');
  all.at(-1).click();
  expect(x.newInterview).toHaveBeenCalledTimes(1);
});

test('the scheme toggle sits in the toolbar with a label', () => {
  const { el } = mount('header');
  expect([!!el.querySelector('.hc-scheme .scheme-toggle'), el.querySelector('.hc-scheme-label').textContent]).toEqual([true, 'Scheme']);
});
