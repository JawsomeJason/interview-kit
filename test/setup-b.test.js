// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import b from '../src/components/setup-variants/b.js';

afterEach(() => vi.useRealTimers());

const rounds = [{ id: 'pair', name: 'Pair programming', minutes: 50, deepDiveMinutes: 20 }, { id: 'live', name: 'Live coding', minutes: 45, deepDiveMinutes: 20 }];
const startOptions = [{ label: 'Now', value: null }, { label: '2:15 PM', value: 1_700_000_000_000 }];

function mount(candidate = '', round = null) {
  const start = vi.fn();
  const ctx = { rounds, round, candidate, startOptions, start };
  document.body.innerHTML = b.render(ctx);
  const el = document.body.firstElementChild;
  const refresh = b.bind(el, ctx);
  return { el, start, refresh };
}
const type = (el, name) => { const f = el.querySelector('.candidate-field'); f.value = name; f.dispatchEvent(new Event('input', { bubbles: true })); };

beforeEach(() => { document.body.innerHTML = ''; });

test('it renders the name field and a button for each round, on step 1 of 3', () => {
  const { el } = mount();
  expect([el.querySelector('.candidate-field').getAttribute('aria-label'), [...el.querySelectorAll('[data-round]')].map((x) => x.dataset.round),
    el.querySelector('.setup-b-count').textContent]).toEqual(['Candidate name', ['pair', 'live'], 'Step 1 of 3']);
});

test('a start and a round call start with that round, the candidate and the chosen start', () => {
  const { el, start } = mount();
  type(el, 'Ada');
  el.querySelector('.setup-b-next').click();
  const select = el.querySelector('.setup-start-select');
  select.value = '1700000000000';
  select.dispatchEvent(new Event('change'));
  el.querySelector('.setup-b-next').click();
  el.querySelector('[data-round="live"]').click();
  expect(start).toHaveBeenCalledWith({ roundId: 'live', candidate: 'Ada', startedAt: 1_700_000_000_000 });
});

test('choosing Now passes no start time', () => {
  const { el, start } = mount('Grace');
  el.querySelector('.setup-b-next').click();
  el.querySelector('.setup-b-next').click();
  el.querySelector('[data-round="pair"]').click();
  expect(start).toHaveBeenCalledWith({ roundId: 'pair', candidate: 'Grace', startedAt: undefined });
});

test('without a name the round buttons are off, Next is off and start is not called', () => {
  const { el, start } = mount();
  el.querySelector('[data-round]').click();
  el.querySelector('.setup-b-next').click();
  expect([el.querySelector('[data-round]').disabled, el.querySelector('.setup-b-next').disabled, start.mock.calls.length,
    el.querySelector('.setup-b-count').textContent]).toEqual([true, true, 0, 'Step 1 of 3']);
});

test('Other time with no usable date keeps Next off and says why; Enter hint returns once it is set', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 23, 14, 7));
  const { el } = mount('Ada');
  el.querySelector('.setup-b-next').click();
  const select = el.querySelector('.setup-start-select');
  select.value = 'other';
  select.dispatchEvent(new Event('change'));
  const other = el.querySelector('.setup-start-other');
  const hint = el.querySelector('.setup-b-hint');
  const empty = [el.querySelector('.setup-b-next').disabled, hint.textContent];
  other.value = '2026-10-24T09:00';
  other.dispatchEvent(new Event('input'));
  const ok = [el.querySelector('.setup-b-next').disabled, hint.textContent, other.min, other.max];
  select.value = '';
  select.dispatchEvent(new Event('change'));
  expect([empty, ok]).toEqual([[true, 'Pick a start time from a day ago to a week ahead.'],
    [false, 'Press Enter to go on.', '2026-10-22T14:07', '2026-10-30T14:07']]);
});

test('the hint says why Next is off without a name, and is gone on the round step, where Enter does nothing', () => {
  const { el } = mount();
  const hint = el.querySelector('.setup-b-hint');
  const blank = [hint.hidden, hint.textContent];
  type(el, 'Ada');
  el.querySelector('.setup-b-next').click();
  el.querySelector('.setup-b-next').click();
  const last = hint.hidden;
  el.querySelector('.setup-b-back').click();
  el.querySelector('.setup-b-back').click();
  expect([blank, last]).toEqual([[false, 'Add a name to start.'], true]);
});

test('after New interview the round from last time says so and gets focus on the round step', () => {
  const { el } = mount('Ada', 'live');
  el.querySelector('.setup-b-next').click();
  el.querySelector('.setup-b-next').click();
  const marked = [...el.querySelectorAll('.setup-b-last')].map((tag) => [tag.closest('[data-round]').dataset.round, tag.textContent]);
  const focused = document.activeElement.dataset.round;
  document.activeElement.click();
  expect([marked, focused]).toEqual([[['live', 'Last time']], 'live']);
});

test('with no round from last time nothing is marked and the first round gets focus', () => {
  const { el } = mount('Ada');
  el.querySelector('.setup-b-next').click();
  el.querySelector('.setup-b-next').click();
  const seen = [el.querySelectorAll('.setup-b-last').length, document.activeElement.dataset.round];
  document.activeElement.click();
  expect(seen).toEqual([0, 'pair']);
});

test('a re-render (a layout switch) keeps the picked start in the recap, not Now', () => {
  const first = mount('Ada');
  first.el.querySelector('.setup-b-next').click();
  const select = first.el.querySelector('.setup-start-select');
  select.value = '1700000000000';
  select.dispatchEvent(new Event('change'));
  first.el.querySelector('.setup-b-next').click();
  const { el } = mount('Ada');
  const recap = [...el.querySelectorAll('.setup-b-edit')].map((b) => b.firstChild.textContent);
  el.querySelector('[data-round="pair"]').click();
  expect(recap).toEqual(['Ada', '2:15 PM']);
});

test('the half-minute refresh relabels the start choices and keeps the picked one in the select and the recap', () => {
  const { el, refresh } = mount('Ada');
  el.querySelector('.setup-b-next').click();
  const select = el.querySelector('.setup-start-select');
  select.value = '1700000000000';
  select.dispatchEvent(new Event('change'));
  el.querySelector('.setup-b-next').click();
  refresh(1_700_000_000_000 + 5 * 60_000);
  const seen = [select.value, select.selectedOptions[0].textContent.endsWith('(5 min ago)'), select.options.length,
    el.querySelectorAll('.setup-b-edit')[1].firstChild.textContent.endsWith('(5 min ago)')];
  el.querySelector('[data-round="pair"]').click();
  expect(seen).toEqual(['1700000000000', true, 13, true]);
});
